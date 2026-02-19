export async function POST(request: Request) {
  const body = await request.json()

  if (Array.isArray(body)) {
    for (const entry of body) {
      console.log('[BROWSER DRAIN]', JSON.stringify(entry))
    }
  }

  return new Response(null, { status: 204 })
}
