/** Simulate CRM / billing API latency for the demo UI. */
export function fakeLatency(minMs: number, maxMs: number): Promise<void> {
  const span = Math.max(0, maxMs - minMs)
  const ms = minMs + Math.floor(Math.random() * (span + 1))
  return new Promise(resolve => setTimeout(resolve, ms))
}
