import { runAgentBrowser, type EveToolContext } from '@agent-browser/eve/sandbox'
import { put } from '@vercel/blob'
import { defineDynamic, defineTool } from 'eve/tools'
import type { SandboxSession } from 'eve/sandbox'
import { z } from 'zod'
import { imageContentType, MAX_IMAGE_BYTES, screenshotKey, sniffImageContentType } from '../lib/blob'
import { CAPTURE_SETTLE_MS, CAPTURE_VIEWPORTS, captureMarkdown, sensitiveCaptureReason, validateCaptureUrl, type CaptureViewport } from '../lib/capture'
import { canAccessAdminTools } from '../lib/trust'

const SCREENSHOT_DIR = '/workspace/screenshots'

async function captureFrame(
  ctx: EveToolContext,
  side: 'before' | 'after',
  url: string,
  selector: string | null,
  viewport: CaptureViewport,
): Promise<string> {
  const { width, height } = CAPTURE_VIEWPORTS[viewport]
  const path = `${SCREENSHOT_DIR}/${side}-${Date.now()}.png`
  await runAgentBrowser(ctx, ['set', 'viewport', String(width), String(height)])
  await runAgentBrowser(ctx, ['open', url])
  await runAgentBrowser(ctx, ['wait', String(CAPTURE_SETTLE_MS)])
  if (selector !== null) {
    await runAgentBrowser(ctx, ['scrollintoview', selector])
    await runAgentBrowser(ctx, ['wait', '500'])
  }
  await runAgentBrowser(ctx, ['screenshot', path])
  return path
}

async function hostFrame(sandbox: SandboxSession, path: string): Promise<string> {
  const bytes = await sandbox.readBinaryFile({ path })
  if (bytes === null) throw new Error(`The capture at "${path}" was not written.`)
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`Capture is ${bytes.byteLength} bytes; the limit is ${MAX_IMAGE_BYTES}.`)
  const contentType = sniffImageContentType(bytes)
  if (contentType === null || contentType !== imageContentType(path)) {
    throw new Error(`The capture at "${path}" is not a valid image.`)
  }
  const blob = await put(screenshotKey(path), Buffer.from(bytes), {
    access: 'public',
    addRandomSuffix: true,
    contentType,
  })
  return blob.url
}

/**
 * The frames publish to public URLs the moment the tool runs, so autonomous
 * turns never see it. Resolved at turn.started with the tool defined inline:
 * eve's bundler registers `execute` as a step function only when it sits
 * inline in the handler body, and a factory-built map breaks tool execution
 * on resumed sessions.
 */
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (!canAccessAdminTools(ctx.session.auth.current)) return null
      return {
        capture__before_after: defineTool({
      description: 'Capture a before/after comparison of an evlog surface in one call: for each URL, open it in the sandbox browser, wait 5s for animations to settle, screenshot (cropped to the selector when given), validate and upload both frames to the Blob store, and return the finished markdown table with an attestation receipt. Origins are restricted to evlog domains, Vercel previews, and sandbox dev servers. For surfaces that can show real user data (telemetry), review the pages with browser__screenshot before calling this: the returned URLs are public immediately.',
      inputSchema: z.object({
        beforeUrl: z.string().min(1).describe('URL of the before state, e.g. https://evlog.dev'),
        afterUrl: z.string().min(1).describe('URL of the after state, e.g. http://localhost:3000'),
        selector: z.string().trim().min(1).max(200).optional().describe('CSS selector framing the change; omit only for page-level changes'),
        viewport: z.enum(['desktop', 'mobile', 'tablet']).optional().describe('Defaults to desktop (1280×800)'),
        caption: z.string().trim().min(1).max(200).describe('One line naming the surface and viewport, e.g. "Landing hero, desktop viewport."'),
      }),
      // Skill-level "review sensitive surfaces first" is not an enforceable
      // control; a capture of a surface that can show real user data parks on
      // an approval card before anything publishes.
      approval(approvalCtx) {
        for (const raw of [approvalCtx.toolInput?.beforeUrl, approvalCtx.toolInput?.afterUrl]) {
          if (typeof raw !== 'string') continue
          let reason: string | null
          try {
            reason = sensitiveCaptureReason(raw)
          }
          catch {
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
        for (const url of [input.beforeUrl, input.afterUrl]) {
          const refusal = validateCaptureUrl(url)
          if (refusal) return { success: false as const, error: refusal }
        }
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return { success: false as const, error: 'BLOB_READ_WRITE_TOKEN is not configured. Locally, run `vercel env pull` in apps/evi.' }
        }
        const viewport = input.viewport ?? 'desktop'
        const selector = input.selector ?? null
        const sandbox = await toolCtx.getSandbox()
        await sandbox.run({ command: `mkdir -p ${SCREENSHOT_DIR}` })
        const beforePath = await captureFrame(toolCtx, 'before', input.beforeUrl, selector, viewport)
        const afterPath = await captureFrame(toolCtx, 'after', input.afterUrl, selector, viewport)
        const beforeImageUrl = await hostFrame(sandbox, beforePath)
        const afterImageUrl = await hostFrame(sandbox, afterPath)
        const capturedAt = new Date().toISOString()
        return {
          success: true as const,
          markdown: captureMarkdown({
            beforeUrl: input.beforeUrl,
            afterUrl: input.afterUrl,
            beforeImageUrl,
            afterImageUrl,
            caption: input.caption,
            selector,
            viewport,
            capturedAt,
          }),
          before: { sourceUrl: input.beforeUrl, imageUrl: beforeImageUrl },
          after: { sourceUrl: input.afterUrl, imageUrl: afterImageUrl },
        }
      },
    }),
      }
    },
  },
})
