export default function HomePage() {
  return (
    <main>
      <h1>Next.js + evlog</h1>
      <p>
        This example shows a clean integration with route handlers and one wide event per request.
      </p>

      <section>
        <h2>Try the endpoints</h2>
        <pre><code>curl http://localhost:3000/api/hello</code></pre>
      </section>

      <section>
        <h2>Checkout success</h2>
        <pre><code>{`curl -X POST http://localhost:3000/api/checkout \\
  -H "content-type: application/json" \\
  -d '{"productId":"sku_pro","quantity":2}'`}</code></pre>
      </section>

      <section>
        <h2>Checkout error (structured)</h2>
        <pre><code>{`curl -X POST http://localhost:3000/api/checkout \\
  -H "content-type: application/json" \\
  -d '{"productId":"sku_pro","failPayment":true}'`}</code></pre>
      </section>
    </main>
  )
}
