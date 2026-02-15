import { defineEventHandler } from 'h3'

const html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>evlog - Nitro v2 Playground</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: #737373; font-size: 0.8rem; margin-bottom: 2rem; }
    .endpoints { display: flex; flex-direction: column; gap: 0.5rem; max-width: 40rem; }
    .endpoint { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.875rem; background: #171717; border: 1px solid #262626; border-radius: 0.5rem; cursor: pointer; transition: border-color 0.15s; }
    .endpoint:hover { border-color: #404040; }
    .method { font-size: 0.7rem; font-weight: 600; padding: 0.125rem 0.375rem; border-radius: 0.25rem; min-width: 3.5rem; text-align: center; }
    .method.get { background: #052e16; color: #4ade80; }
    .path { flex: 1; font-size: 0.8rem; }
    .desc { color: #737373; font-size: 0.7rem; }
    .status { font-size: 0.7rem; padding: 0.125rem 0.375rem; border-radius: 0.25rem; opacity: 0; transition: opacity 0.15s; }
    .status.visible { opacity: 1; }
    .status.ok { background: #052e16; color: #4ade80; }
    .status.err { background: #450a0a; color: #f87171; }
    .status.loading { background: #1c1917; color: #a8a29e; }
    .result { margin-top: 1.5rem; max-width: 40rem; }
    .result pre { background: #171717; border: 1px solid #262626; border-radius: 0.5rem; padding: 1rem; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
    .result-header { font-size: 0.75rem; color: #737373; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>evlog Nitro v2 Playground</h1>
  <p class="subtitle">Click an endpoint to test it. Check your terminal for wide event logs.</p>

  <div class="endpoints" id="endpoints"></div>
  <div class="result" id="result" style="display:none">
    <div class="result-header" id="result-header"></div>
    <pre><code id="result-body"></code></pre>
  </div>

  <script>
    const endpoints = [
      { method: 'GET', path: '/api/test/success', desc: 'Document upload with multi-step processing' },
      { method: 'GET', path: '/api/test/error', desc: 'Payment failure with structured error' },
      { method: 'GET', path: '/api/test/wide-event', desc: 'Rich wide event with many fields' },
    ]

    const container = document.getElementById('endpoints')
    endpoints.forEach((ep, i) => {
      const div = document.createElement('div')
      div.className = 'endpoint'
      div.innerHTML = \`
        <span class="method \${ep.method.toLowerCase()}">\${ep.method}</span>
        <span class="path">\${ep.path}</span>
        <span class="desc">\${ep.desc}</span>
        <span class="status" id="status-\${i}"></span>
      \`
      div.onclick = () => fire(ep, i)
      container.appendChild(div)
    })

    async function fire(ep, i) {
      const status = document.getElementById('status-' + i)
      status.textContent = '...'
      status.className = 'status visible loading'

      const result = document.getElementById('result')
      const header = document.getElementById('result-header')
      const body = document.getElementById('result-body')

      try {
        const res = await fetch(ep.path, { method: ep.method })
        const json = await res.json()

        status.textContent = res.status
        status.className = 'status visible ' + (res.ok ? 'ok' : 'err')

        header.textContent = ep.method + ' ' + ep.path + ' — ' + res.status
        body.textContent = JSON.stringify(json, null, 2)
        result.style.display = 'block'
      } catch (err) {
        status.textContent = 'ERR'
        status.className = 'status visible err'
        header.textContent = ep.method + ' ' + ep.path + ' — Error'
        body.textContent = String(err)
        result.style.display = 'block'
      }
    }
  </script>
</body>
</html>`

export default defineEventHandler(() => {
  return html
})
