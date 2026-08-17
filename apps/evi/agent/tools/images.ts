import { getToken } from '@vercel/connect'
import { defineDynamic, defineTool, toolOutput, toolOutputPart } from 'eve/tools'
import { z } from 'zod'
import { classifyImageUrl, fetchImage } from '../lib/images'
import { canAccessAdminTools } from '../lib/trust'

// Available in every session: screenshots in community bug reports are the
// main reason this tool exists. Only the Linear host needs a credential, and
// only admin sessions get it. Keep executes inline in the resolver, in a
// block-bodied handler: eve's bundler transform only registers step functions
// it finds in a resolver body, and an implicit arrow return defeats it
// (docs/notes.md).
export default defineDynamic({
  events: {
    'turn.started': () => {
      return {
        images__view: defineTool({
          description: 'Fetch an image referenced by URL and look at it: the pixels come back as visual content. Use it for image URLs in issue or PR bodies, comments, and Linear documents that are not already attached to the conversation. Supported hosts: GitHub attachments (github.com/user-attachments, *.githubusercontent.com) and Linear uploads (uploads.linear.app); anything else is refused. png/jpg/webp/gif, 2 MB max. When the fetch fails, report the returned reason instead of describing an image you have not seen.',
          inputSchema: z.object({
            url: z.string().min(1).describe('The image URL exactly as it appears in the markdown'),
          }),
          async execute(input, toolCtx) {
            const classified = classifyImageUrl(input.url)
            if ('error' in classified) return { success: false as const, error: classified.error }
            let authorization: string | undefined
            if (classified.host === 'linear') {
              if (!canAccessAdminTools(toolCtx.session.auth.current)) {
                return { success: false as const, error: 'Linear-hosted images are not available in this session.' }
              }
              authorization = `Bearer ${await getToken('linear/evi', { subject: { type: 'app' } })}`
            }
            const fetched = await fetchImage(classified.url, { authorization })
            if ('error' in fetched) return { success: false as const, error: fetched.error }
            return { success: true as const, url: input.url, ...fetched }
          },
          toModelOutput(output) {
            if (!output.success) return toolOutput.text(`Could not read the image: ${output.error}`)
            return toolOutput.content([
              toolOutputPart.text(`Image at ${output.url} (${output.mediaType}, ${output.bytes} bytes):`),
              toolOutputPart.file(output.base64, { mediaType: output.mediaType }),
            ])
          },
        }),
      }
    },
  },
})
