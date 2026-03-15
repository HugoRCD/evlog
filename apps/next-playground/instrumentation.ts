export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { register } = await import('./lib/evlog')
    register()
  }
}

export async function onRequestError(
  error: { digest?: string } & Error,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { onRequestError } = await import('./lib/evlog')
    onRequestError(error, request, context)
  }
}
