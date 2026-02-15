export default function Home() {
  return (
    <main style={{ "font-family": "system-ui, sans-serif", "max-width": "600px", margin: "2rem auto", padding: "0 1rem" }}>
      <h1>evlog + SolidStart</h1>
      <p>Open the terminal to see evlog's pretty-printed wide events.</p>

      <h2>API Routes</h2>
      <ul>
        <li>
          <a href="/api/hello" target="_blank">
            GET /api/hello
          </a>{" "}
          — simple wide event
        </li>
        <li>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/checkout", { method: "POST" })
              const data = await res.json()
              console.log("Response:", data)
              alert(`${res.status}: ${JSON.stringify(data, null, 2)}`)
            }}
          >
            POST /api/checkout
          </button>{" "}
          — structured error example
        </li>
      </ul>
    </main>
  )
}
