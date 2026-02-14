export default defineEventHandler(async (event) => {
  const body = await readBody<unknown[]>(event)

  if (Array.isArray(body)) {
    for (const entry of body) {
      console.log('[BROWSER DRAIN]', JSON.stringify(entry))
    }
  }

  setResponseStatus(event, 204)
  return null
})
