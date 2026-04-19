interface Endpoint {
  name: string
  description: string
  code: string
}

const endpoints: Endpoint[] = [
  {
    name: 'Health Check',
    description: 'Basic health check with logging',
    code: `fetch('/trpc/health.check', { method: 'GET' }).then(r => r.json())`
  },
  {
    name: 'Get User',
    description: 'User lookup with context accumulation',
    code: `fetch('/trpc/user.getById?id=42', { method: 'GET' }).then(r => r.json())`
  },
  {
    name: 'Create Post',
    description: 'Create post with mutation logging',
    code: `fetch('/trpc/post.create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Hello', body: 'World' })
}).then(r => r.json())`
  },
  {
    name: 'Batch Request',
    description: 'Multiple requests in parallel',
    code: `Promise.all([
  fetch('/trpc/user.getById?id=99', { method: 'GET' }).then(r => r.json()),
  fetch('/trpc/health.check', { method: 'GET' }).then(r => r.json()),
  fetch('/trpc/post.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Batch', body: 'Test' })
  }).then(r => r.json())
])`
  },
  {
    name: 'Error Example',
    description: 'Trigger error with stack trace',
    code: `fetch('/trpc/user.getById?id=error', { method: 'GET' }).then(r => r.json())`
  }
]

export function testUI(): string {
  const endpointButtons = endpoints.map(e => `
    <button
      onclick="runEndpoint(${JSON.stringify(e.code).replace(/"/g, '&quot;')}, '${e.name}')"
      class="endpoint"
    >
      <div class="name">${e.name}</div>
      <div class="desc">${e.description}</div>
      <code class="code">${e.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>
    </button>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>evlog — tRPC Example</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 16px;
    }

    .container { width: 100%; max-width: 800px; }

    header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 32px;
    }

    h1 { font-size: 20px; font-weight: 600; color: #fafafa; }

    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      background: #1a1a2e;
      color: #818cf8;
      border: 1px solid #2d2d5e;
    }

    h2 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #525252;
      margin-bottom: 12px;
    }

    .endpoints { display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; }

    .endpoint {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px;
      background: #141414;
      border: 1px solid #262626;
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      text-align: left;
      color: inherit;
      font-family: inherit;
    }

    .endpoint:hover { border-color: #404040; background: #1a1a1a; }
    .endpoint:active { background: #1f1f1f; }

    .name {
      font-size: 14px;
      font-weight: 600;
      color: #fafafa;
    }

    .desc {
      font-size: 12px;
      color: #a3a3a3;
    }

    .code {
      font-size: 11px;
      background: #0f0f0f;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #1f1f1f;
      color: #10b981;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .result {
      background: #141414;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 16px;
      font-size: 12px;
      color: #a3a3a3;
      margin-top: 16px;
    }

    .success { color: #10b981; }
    .error { color: #ef4444; }

    .footer {
      margin-top: 32px;
      font-size: 11px;
      color: #525252;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>evlog — tRPC Example</h1>
      <span class="badge">HTTP Drain</span>
    </header>

    <h2>Test Endpoints</h2>
    <div class="endpoints">
      ${endpointButtons}
    </div>

    <div id="result" class="result" style="display: none;"></div>

    <div class="footer">
      Check your server logs and the HTTP drain endpoint for structured logging with procedure context.
    </div>
  </div>

  <script>
    window.runEndpoint = async function(code, name) {
      const resultDiv = document.getElementById('result')
      resultDiv.style.display = 'block'
      resultDiv.className = 'result'
      resultDiv.textContent = 'Running...'

      try {
        const result = await eval("(async () => { return " + code + " })()")
        resultDiv.className = 'result success'
        resultDiv.textContent = name + ' succeeded:\\n' + JSON.stringify(result, null, 2)
      } catch (error) {
        resultDiv.className = 'result error'
        resultDiv.textContent = name + ' failed:\\n' + error.message
      }
    }
  </script>
</body>
</html>`
}