import { runAgentBrowser, type EveToolContext } from '@agent-browser/eve/sandbox'
import { useLogger } from 'evlog/eve'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { missingBlobTokenError, uploadSandboxImage } from '../lib/blob'
import { CAPTURE_MARK, CAPTURE_SETTLE_MS, CAPTURE_VIEWPORTS, captureMarkdown, describeTarget, readTargetProbe, resolveTargetExpression, sensitiveCaptureReason, unresolvedTargetMessage, validateCaptureUrl, type CaptureTarget, type CaptureViewport } from '../lib/capture'
import { canAccessAdminTools } from '../lib/trust'

const SCREENSHOT_DIR = '/workspace/screenshots'

interface FrameRequest {
  readonly side: 'before' | 'after'
  readonly target: CaptureTarget | null
  readonly url: string
  readonly viewport: CaptureViewport
}

async function captureFrame(
  ctx: EveToolContext,
  { side, target, url, viewport }: FrameRequest,
): Promise<{ path: string, how: 'selector' | 'text' | null }> {
  const { width, height } = CAPTURE_VIEWPORTS[viewport]
  const path = `${SCREENSHOT_DIR}/${side}-${Date.now()}.png`
  await runAgentBrowser(ctx, ['set', 'viewport', String(width), String(height)])
  await runAgentBrowser(ctx, ['open', url])
  await runAgentBrowser(ctx, ['wait', String(CAPTURE_SETTLE_MS)])
  if (target === null) {
    await runAgentBrowser(ctx, ['screenshot', path])
    return { path, how: null }
  }
  const probe = readTargetProbe((await runAgentBrowser(ctx, ['eval', resolveTargetExpression(target)])).json)
  if (!probe.found) throw new Error(unresolvedTargetMessage(target, probe))
  await runAgentBrowser(ctx, ['scrollintoview', `[${CAPTURE_MARK}]`])
  await runAgentBrowser(ctx, ['wait', '500'])
  await runAgentBrowser(ctx, ['screenshot', path])
  return { path, how: probe.how }
}

// Frames publish to public URLs the moment the tool runs: autonomous turns
// never see it. Keep executes inline in the resolver (docs/notes.md).
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (!canAccessAdminTools(ctx.session.auth.current)) return null
      return {
        capture__before_after: defineTool({
          description: 'Capture a before/after comparison of an evlog surface in one call: for each URL, open it in the sandbox browser, wait 5s for animations to settle, scroll the change into view, screenshot the viewport, validate and upload both frames to the Blob store, and return the finished markdown table with an attestation receipt. Point it at the change with selector, or with text when the page has no stable selector: text finds the visible copy and widens to its section, so the sentence you just wrote is enough. Give both and text is the fallback. When neither resolves the call fails, listing the hooks and headings the page does offer, rather than silently framing the top of the page. Origins are restricted to evlog domains, Vercel previews, and sandbox dev servers. For surfaces that can show real user data (telemetry), review the pages with browser__screenshot before calling this: the returned URLs are public immediately.',
          inputSchema: z.object({
            beforeUrl: z.string().min(1).describe('URL of the before state, e.g. https://evlog.dev'),
            afterUrl: z.string().min(1).describe('URL of the after state, e.g. http://localhost:3000'),
            selector: z.string().trim().min(1).max(200).optional().describe('CSS selector framing the change, e.g. [data-section="landing-faq"]'),
            text: z.string().trim().min(1).max(200).optional().describe('Visible copy inside the change, used when no selector matches. The capture widens it to the nearest section.'),
            viewport: z.enum(['desktop', 'mobile', 'tablet']).optional().describe('Defaults to desktop (1280×800)'),
            caption: z.string().trim().min(1).max(200).describe('One line naming the surface and viewport, e.g. "Landing hero, desktop viewport."'),
          }),
          // A capture of a surface that can show real user data parks on an
          // approval card before anything publishes; the skill's "review
          // sensitive surfaces first" is not an enforceable control.
          approval(approvalCtx) {
            for (const raw of [approvalCtx.toolInput?.beforeUrl, approvalCtx.toolInput?.afterUrl]) {
              if (typeof raw !== 'string') continue
              let reason: string | null
              try {
                reason = sensitiveCaptureReason(raw)
              } catch {
                continue // invalid URL: execute() refuses it with a clear error
              }
              if (reason) return 'user-approval'
            }
            return 'not-applicable'
          },
          async execute(input, toolCtx) {
            if (!canAccessAdminTools(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'Captures are not available in this session.' }
            }
            const log = useLogger(toolCtx)
            for (const url of [input.beforeUrl, input.afterUrl]) {
              const refusal = validateCaptureUrl(url)
              if (refusal) {
                log.set({ capture: { published: false, reason: 'origin_refused' } })
                return { success: false as const, error: refusal }
              }
            }
            const missingToken = missingBlobTokenError()
            if (missingToken) {
              log.set({ capture: { published: false, reason: 'missing_token' } })
              return { success: false as const, error: missingToken }
            }
            const viewport = input.viewport ?? 'desktop'
            const target: CaptureTarget | null = input.selector || input.text
              ? { selector: input.selector, text: input.text }
              : null
            const sandbox = await toolCtx.getSandbox()
            await sandbox.run({ command: `mkdir -p ${SCREENSHOT_DIR}` })
            const before = await captureFrame(toolCtx, { side: 'before', url: input.beforeUrl, target, viewport })
            const after = await captureFrame(toolCtx, { side: 'after', url: input.afterUrl, target, viewport })
            const beforeUpload = await uploadSandboxImage(sandbox, before.path)
            if ('error' in beforeUpload) {
              log.set({ capture: { published: false, reason: 'upload_failed' } })
              return { success: false as const, error: beforeUpload.error }
            }
            const afterUpload = await uploadSandboxImage(sandbox, after.path)
            if ('error' in afterUpload) {
              log.set({ capture: { published: false, reason: 'upload_failed' } })
              return { success: false as const, error: afterUpload.error }
            }
            log.set({
              capture: {
                published: true,
                viewport,
                target: after.how ?? 'viewport',
                beforeHost: new URL(input.beforeUrl).hostname,
                afterHost: new URL(input.afterUrl).hostname,
              },
            })
            // Only the composed block is returned: handing back the bare image URLs
            // invites a hand-assembled table that drops the attestation receipt.
            return {
              success: true as const,
              markdown: captureMarkdown({
                beforeUrl: input.beforeUrl,
                afterUrl: input.afterUrl,
                beforeImageUrl: beforeUpload.url,
                afterImageUrl: afterUpload.url,
                caption: input.caption,
                frame: target === null ? 'full viewport' : describeTarget(target, after.how),
                viewport,
                capturedAt: new Date().toISOString(),
              }),
            }
          },
        }),
      }
    },
  },
})
