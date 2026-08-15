# OpenTelemetry

Checked: 2026-08-14 · Source: https://opentelemetry.io/docs/

Not a competitor, and the page that treats it as one loses the reader who runs a collector. evlog ships an OTLP drain, so the true relationship is "evlog speaks this".

## What it does

- Three signals: traces, metrics, logs. A span carries a name, a duration, a status, and attributes.
- Semantic conventions fix attribute names (`http.request.method`, `server.address`, `error.type`). Fields that follow them are queryable everywhere; fields that do not are yours alone.
- SDKs instrument the runtime; the Collector receives, processes, and exports. OTLP is the wire protocol, over gRPC or HTTP.
- Sampling is head-based at the SDK or tail-based in the Collector.
- Context propagation carries `traceparent` across services.

## Where evlog sits

- A wide event and a span with rich attributes are close relatives. The difference is where the field is written and what it costs, not what it is.
- `evlog/otlp` exports to any OTLP endpoint, so an evlog event lands next to spans the rest of the stack already emits.
- The `TraceContext` enricher reads the incoming `traceparent`, which is what makes an evlog event joinable to a trace someone else started.

## What we must never say

- That OpenTelemetry is heavy, complicated, or overkill. That is a positioning line, not a claim, and the reader running a collector reads it as ignorance.
- That evlog replaces it. It exports to it.
- That attribute naming is arbitrary. Semantic conventions exist and a page inventing field names next to them is teaching the reader a habit their vendor will punish.
