import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { uploadSandboxImage } from '../lib/blob'
import { canAccessAdminTools } from '../lib/trust'

// Public URLs the instant they exist: autonomous turns never see this tool.
// Keep executes inline in the resolver (docs/notes.md).
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
            if (!canAccessAdminTools(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'Image upload is not available in this session.' }
            }
            const uploaded = await uploadSandboxImage(await toolCtx.getSandbox(), input.path)
            if ('error' in uploaded) return { success: false as const, error: uploaded.error }
            return { success: true as const, ...uploaded }
          },
        }),
      }
    },
  },
})
