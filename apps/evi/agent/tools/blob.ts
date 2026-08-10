import { put } from '@vercel/blob'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { imageContentType, MAX_IMAGE_BYTES, screenshotKey, sniffImageContentType } from '../lib/blob'
import { canAccessAdminTools } from '../lib/trust'

/**
 * The URL is public the instant it exists, so autonomous turns never see this
 * tool. Resolved at turn.started with the tool defined inline: eve's bundler
 * registers `execute` as a step function only when it sits inline in the
 * handler body, and a factory-built map breaks tool execution on resumed
 * sessions.
 */
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (!canAccessAdminTools(ctx.session.auth.current)) return null
      return {
        blob__upload_image: defineTool({
          description: 'Upload an image file from the sandbox to the evlog Vercel Blob store and return its public URL. Use it to share screenshots (before/after comparisons, visual evidence) in pull requests and conversations. png/jpg/webp/gif, 8 MB max. The URL is public: upload only captures of evlog surfaces.',
          inputSchema: z.object({
            path: z.string().min(1).describe('Sandbox path of the image, e.g. /workspace/screenshots/after.png'),
          }),
          async execute(input, toolCtx) {
            const contentType = imageContentType(input.path)
            if (!contentType) {
              return { success: false as const, error: `"${input.path}" is not a supported image (png/jpg/webp/gif).` }
            }
            if (!process.env.BLOB_READ_WRITE_TOKEN) {
              return { success: false as const, error: 'BLOB_READ_WRITE_TOKEN is not configured. Locally, run `vercel env pull` in apps/evi.' }
            }
            const sandbox = await toolCtx.getSandbox()
            const bytes = await sandbox.readBinaryFile({ path: input.path })
            if (bytes === null) {
              return { success: false as const, error: `No file at "${input.path}".` }
            }
            if (bytes.byteLength > MAX_IMAGE_BYTES) {
              return { success: false as const, error: `Image is ${bytes.byteLength} bytes; the limit is ${MAX_IMAGE_BYTES}.` }
            }
            // The upload is public: the bytes must actually be the image the
            // extension claims, not arbitrary data renamed to .png.
            if (sniffImageContentType(bytes) !== contentType) {
              return { success: false as const, error: `The content of "${input.path}" does not match its extension; only real image files are uploaded.` }
            }
            const blob = await put(screenshotKey(input.path), Buffer.from(bytes), {
              access: 'public',
              addRandomSuffix: true,
              contentType,
            })
            return { success: true as const, url: blob.url, bytes: bytes.byteLength }
          },
        }),
      }
    },
  },
})
