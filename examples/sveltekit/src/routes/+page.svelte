<script lang="ts">
  interface Route {
    method: string
    path: string
    description: string
  }

  const routes: Route[] = [
    { method: 'GET', path: '/health', description: 'Health check with basic log.set()' },
    { method: 'GET', path: '/users/42', description: 'Context accumulation + useLogger() + email masking' },
    { method: 'GET', path: '/checkout', description: 'Throws EvlogError → structured JSON response' },
    { method: 'GET', path: '/crash', description: 'Unexpected error → handleError + 500' },
    { method: 'GET', path: '/slow', description: 'Slow request (600ms) → tail sampling keep' },
  ]

  let response = $state<{ status: number; data: unknown; timing: number } | null>(null)
  let loading = $state(false)
  let lastRequest = $state('')

  async function sendRequest(method: string, path: string) {
    loading = true
    lastRequest = `${method} ${path}`
    const start = performance.now()

    try {
      const res = await fetch(path)
      const data = await res.json()
      response = { status: res.status, data, timing: Math.round(performance.now() - start) }
    } catch (err) {
      response = { status: 0, data: { error: (err as Error).message }, timing: Math.round(performance.now() - start) }
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>evlog — SvelteKit Example</title>
</svelte:head>

<div class="container">
  <header>
    <h1>evlog</h1>
    <span class="badge">sveltekit-example</span>
  </header>

  <h2>Routes</h2>
  <div class="routes">
    {#each routes as route}
      <button class="route" onclick={() => sendRequest(route.method, route.path)}>
        <span class="method method-{route.method.toLowerCase()}">{route.method}</span>
        <span class="path">{route.path}</span>
        <span class="desc">{route.description}</span>
      </button>
    {/each}
  </div>

  <h2>Response</h2>
  <div class="response-panel">
    {#if response}
      <div class="response-header">
        <span class="status status-{response.status < 300 ? '2xx' : response.status < 500 ? '4xx' : '5xx'}">
          {response.status}
        </span>
        <span>{lastRequest}</span>
        <span class="timing">{response.timing}ms</span>
      </div>
      <pre class="response-body" class:loading>{JSON.stringify(response.data, null, 2)}</pre>
    {:else}
      <div class="empty-state">Click a route to test</div>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
    background: #0a0a0a;
    color: #e5e5e5;
    margin: 0;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 16px;
  }

  .container { width: 100%; max-width: 640px; }
  header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 32px; }
  h1 { font-size: 20px; font-weight: 600; color: #fafafa; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: #1a1a2e; color: #818cf8; border: 1px solid #2d2d5e; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #525252; margin-bottom: 12px; }
  .routes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 32px; }
  .route { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #141414; border: 1px solid #262626; border-radius: 8px; cursor: pointer; text-align: left; color: inherit; font-family: inherit; font-size: 13px; }
  .route:hover { border-color: #404040; background: #1a1a1a; }
  .method { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.05em; }
  .method-get { background: #052e16; color: #4ade80; }
  .method-post { background: #172554; color: #60a5fa; }
  .path { color: #d4d4d4; }
  .desc { color: #525252; font-size: 12px; margin-left: auto; text-align: right; }
  .response-panel { background: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden; }
  .response-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #262626; font-size: 12px; }
  .status { font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .status-2xx { background: #052e16; color: #4ade80; }
  .status-4xx { background: #422006; color: #fb923c; }
  .status-5xx { background: #450a0a; color: #f87171; }
  .timing { color: #525252; margin-left: auto; }
  .response-body { padding: 14px; font-size: 13px; line-height: 1.6; max-height: 400px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; }
  .empty-state { padding: 48px 14px; text-align: center; color: #404040; font-size: 13px; }
  .loading { opacity: 0.5; }
</style>
