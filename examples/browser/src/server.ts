import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { DrainContext } from 'evlog'

const app = new Hono()

// Ingest endpoint — receives DrainContext[] batches from the browser drain
app.post('/v1/ingest', async (c) => {
  const batch = await c.req.json<DrainContext[]>()

  for (const ctx of batch) {
    console.log('[BROWSER]', JSON.stringify(ctx.event))
  }

  return c.body(null, 204)
})

// Serve bundled client JS
app.use('/dist/*', serveStatic({ root: './' }))

// Demo page — mini store
app.get('/', (c) => {
  return c.html(/* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mini Store — evlog Browser Drain</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 3rem; max-width: 480px; margin: 0 auto; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .subtitle { color: #737373; font-size: 0.75rem; margin-bottom: 2rem; }
    .product { padding: 1.25rem; background: #171717; border: 1px solid #262626; border-radius: 0.5rem; margin-bottom: 1.5rem; }
    .product h2 { font-size: 1rem; margin-bottom: 0.25rem; }
    .product .price { color: #a3a3a3; font-size: 0.875rem; margin-bottom: 1rem; }
    button {
      padding: 0.5rem 1rem; background: #e5e5e5; color: #0a0a0a; border: none;
      border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500; cursor: pointer;
    }
    button:hover { background: #d4d4d4; }
    form { margin-top: 1.5rem; }
    label { display: block; font-size: 0.8125rem; color: #a3a3a3; margin-bottom: 0.375rem; }
    input {
      width: 100%; padding: 0.5rem 0.75rem; background: #171717; border: 1px solid #262626;
      border-radius: 0.375rem; color: #e5e5e5; font-size: 0.875rem; margin-bottom: 1rem;
    }
    input:focus { outline: none; border-color: #404040; }
    .hint { color: #525252; font-size: 0.6875rem; margin-top: 1.5rem; }
    #log-list { position: fixed; bottom: 1rem; right: 1rem; display: flex; flex-direction: column; gap: 0.375rem; z-index: 10; }
    .log-entry {
      padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.6875rem; font-family: monospace;
      animation: fade-in 0.15s ease-out;
    }
    .log-entry.info { background: #052e16; color: #4ade80; border: 1px solid #166534; }
    .log-entry.error { background: #450a0a; color: #f87171; border: 1px solid #991b1b; }
    @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <h1>Mini Store</h1>
  <p class="subtitle">evlog/browser demo — check your terminal for [BROWSER] logs</p>

  <div class="product">
    <h2>T-Shirt</h2>
    <p class="price">29.99 EUR</p>
    <button id="add-to-cart">Add to cart</button>
  </div>

  <form id="checkout-form">
    <label for="email">Email</label>
    <input id="email" type="email" placeholder="you@example.com" required>
    <button type="submit">Checkout</button>
  </form>

  <p class="hint">A page_view event is logged on load. Each interaction logs to your server via evlog/browser.</p>

  <div id="log-list"></div>
  <script type="module" src="/dist/client.js"></script>
</body>
</html>`)
})

serve({
  fetch: app.fetch,
  port: 3000,
})

console.log('Mini store started on http://localhost:3000')
