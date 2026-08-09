import { put } from '@vercel/blob'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { imageContentType, MAX_IMAGE_BYTES, screenshotKey } from '../lib/blob'
import { canAccessAdminTools } from '../lib/trust'

function blobTools() {
  return {
    upload_image: defineTool({
      description: 'Upload an image file from the sandbox to the evlog Vercel Blob store and return its public URL. Use it to share screenshots (before/after comparisons, visual evidence) in pull requests and conversations. png/jpg/webp/gif, 8 MB max. The URL is public: upload only captures of evlog surfaces.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Sandbox path of the image, e.g. /workspace/screenshots/after.png'),
      }),
      async execute(input, ctx) {
        const contentType = imageContentType(input.path)
        if (!contentType) {
          return { success: false as const, error: `"${input.path}" is not a supported image (png/jpg/webp/gif).` }
        }
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return { success: false as const, error: 'BLOB_READ_WRITE_TOKEN is not configured. Locally, run `vercel env pull` in apps/evi.' }
        }
        const sandbox = await ctx.getSandbox()
        const bytes = await sandbox.readBinaryFile({ path: input.path })
        if (bytes === null) {
          return { success: false as const, error: `No file at "${input.path}".` }
        }
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          return { success: false as const, error: `Image is ${bytes.byteLength} bytes; the limit is ${MAX_IMAGE_BYTES}.` }
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
}

/** The URL is public the instant it exists, so autonomous turns never see this tool. */
export default defineDynamic({
  events: {
    'session.started': (_event, ctx) => (canAccessAdminTools(ctx.session.auth.current) ? blobTools() : null),
  },
})
