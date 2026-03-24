# Benchmark results

> Generated on 2026-03-15

## Bundle size

| Entry | Raw | Gzip |
|-------|----:|-----:|
| framework/nitro | 17.44 kB | 6.85 kB |
| logger | 11.70 kB | 3.78 kB |
| framework/next | 8.93 kB | 3.02 kB |
| framework/vite | 7.11 kB | 2.38 kB |
| adapter/sentry | 6.05 kB | 2.34 kB |
| adapter/otlp | 5.76 kB | 2.10 kB |
| framework/ai | 6.43 kB | 1.98 kB |
| enrichers | 6.15 kB | 1.92 kB |
| framework/sveltekit | 4.84 kB | 1.54 kB |
| adapter/posthog | 4.85 kB | 1.50 kB |
| adapter/fs | 3.38 kB | 1.41 kB |
| utils | 3.28 kB | 1.41 kB |
| pipeline | 4.17 kB | 1.35 kB |
| adapter/axiom | 3.28 kB | 1.32 kB |
| browser | 2.93 kB | 1.21 kB |
| error | 3.06 kB | 1.21 kB |
| framework/nestjs | 2.80 kB | 1.21 kB |
| adapter/better-stack | 2.67 kB | 1.09 kB |
| framework/elysia | 2.51 kB | 1.07 kB |
| framework/fastify | 2.29 kB | 1009 B |
| workers | 2.08 kB | 960 B |
| framework/express | 1.29 kB | 701 B |
| framework/hono | 1.07 kB | 594 B |
| toolkit | 486 B | 242 B |
| core (index) | 497 B | 205 B |
| client | 166 B | 118 B |
| types | 11 B | 31 B |
| **Total** | **115.20 kB** | **42.45 kB** |

## Comparison vs alternatives

> All loggers configured for JSON output to no-op destinations.
> See `bench/comparison/vs-alternatives.bench.ts` for methodology.

### simple string log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| consola | **2.67M** | 375ns | **fastest** |
| evlog | **1.96M** | 511ns | 1.36x slower |
| pino | **1.06M** | 939ns | 2.50x slower |
| winston | **977.6K** | 1.02µs | 2.73x slower |

### structured log (5 fields)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| consola | **1.75M** | 571ns | **fastest** |
| evlog | **1.74M** | 574ns | 1.00x slower |
| pino | **705.6K** | 1.42µs | 2.48x slower |
| winston | **440.6K** | 2.27µs | 3.97x slower |

### deep nested log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **1.75M** | 570ns | **fastest** |
| consola | **1.04M** | 958ns | 1.68x slower |
| pino | **507.8K** | 1.97µs | 3.46x slower |
| winston | **202.5K** | 4.94µs | 8.67x slower |

### child / scoped logger

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **1.85M** | 540ns | **fastest** |
| pino | **871.0K** | 1.15µs | 2.13x slower |
| winston | **568.5K** | 1.76µs | 3.26x slower |
| consola | **272.2K** | 3.67µs | 6.81x slower |

### wide event lifecycle (evlog-native pattern)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **1.68M** | 594ns | **fastest** |
| pino | **209.0K** | 4.78µs | 8.06x slower |
| winston | **114.6K** | 8.73µs | 14.69x slower |

### burst — 100 sequential logs

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| consola | **40.8K** | 24.49µs | **fastest** |
| evlog | **19.1K** | 52.42µs | 2.14x slower |
| pino | **10.0K** | 99.93µs | 4.08x slower |
| winston | **7.6K** | 131.90µs | 5.39x slower |

### logger creation cost

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **20.52M** | 49ns | **fastest** |
| pino | **7.36M** | 136ns | 2.79x slower |
| winston | **5.43M** | 184ns | 3.78x slower |
| consola | **299.3K** | 3.34µs | 68.57x slower |

## Core benchmarks

### client log serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| JSON.stringify — minimal log | **5.66M** | 177ns | 250ns | 5,664,649 |
| JSON.stringify — rich log | **2.01M** | 498ns | 708ns | 2,007,128 |
| JSON.stringify — batch of 10 | **261.5K** | 3.82µs | 10.42µs | 261,511 |
| JSON.stringify — batch of 50 | **55.4K** | 18.05µs | 44.75µs | 55,401 |

### client log formatting

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| build formatted log object (minimal) | **2.38M** | 420ns | 583ns | 2,382,899 |
| build formatted log object (with identity spread) | **2.11M** | 474ns | 666ns | 2,109,267 |
| build + serialize (rich log) | **1.32M** | 755ns | 1.08µs | 1,324,411 |

### pipeline — push throughput

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1 event (no flush) | **1.38M** | 723ns | 1.37µs | 1,382,313 |
| push 100 events (no flush) | **34.9K** | 28.62µs | 128.37µs | 34,943 |
| push 1000 events (no flush) | **5.3K** | 189.62µs | 567.42µs | 5,273 |

### pipeline — push + batch trigger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 200 events (triggers 4 batch flushes) | **15.7K** | 63.70µs | 324.42µs | 15,698 |
| push 50 events (triggers 1 batch flush) | **8.1K** | 124.13µs | 5.041ms | 8,056 |

### pipeline — buffer overflow

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1100 events (100 dropped, buffer=1000) | **3.5K** | 286.89µs | 1.375ms | 3,485 |

### pipeline — serialization in drain

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 + JSON.stringify batch in drain | **430** | 2.327ms | 10.149ms | 429 |

### createUserAgentEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no user-agent header | **32.74M** | 31ns | 42ns | 32,735,269 |
| Googlebot | **4.68M** | 214ns | 292ns | 4,680,844 |
| Firefox Linux | **4.25M** | 235ns | 417ns | 4,250,587 |
| Chrome desktop | **2.57M** | 389ns | 625ns | 2,570,457 |

### createGeoEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| Vercel headers (full) | **5.32M** | 188ns | 292ns | 5,324,151 |
| no geo headers | **2.05M** | 487ns | 1.13µs | 2,054,392 |
| Cloudflare headers (country only) | **1.05M** | 953ns | 1.37µs | 1,049,298 |

### createRequestSizeEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with content-length | **24.16M** | 41ns | 84ns | 24,161,040 |
| no content-length | **20.39M** | 49ns | 84ns | 20,390,081 |

### createTraceContextEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no trace headers | **14.68M** | 68ns | 166ns | 14,675,312 |
| with traceparent + tracestate | **7.03M** | 142ns | 209ns | 7,026,773 |
| with traceparent | **4.86M** | 206ns | 292ns | 4,861,922 |

### full enricher pipeline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| all enrichers (no headers) | **1.95M** | 513ns | 667ns | 1,948,247 |
| all enrichers (all headers present) | **487.2K** | 2.05µs | 2.83µs | 487,188 |

### createError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with status | **226.9K** | 4.41µs | 7.50µs | 226,882 |
| string message | **221.5K** | 4.51µs | 11.67µs | 221,521 |
| full options | **213.4K** | 4.69µs | 11.33µs | 213,417 |
| with cause | **152.4K** | 6.56µs | 20.42µs | 152,447 |

### parseError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| parse plain Error | **43.92M** | 23ns | 42ns | 43,916,889 |
| parse fetch-like error | **42.43M** | 24ns | 42ns | 42,429,233 |
| parse string | **42.10M** | 24ns | 42ns | 42,101,732 |
| parse EvlogError | **15.80M** | 63ns | 84ns | 15,799,405 |

### createError + parseError round-trip

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| create + parse (simple) | **227.6K** | 4.39µs | 7.00µs | 227,619 |
| create + parse (full) | **164.3K** | 6.09µs | 12.67µs | 164,293 |

### EvlogError serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| toJSON() | **12.58M** | 80ns | 167ns | 12,577,136 |
| toString() | **3.72M** | 269ns | 417ns | 3,716,693 |
| JSON.stringify() | **2.32M** | 432ns | 542ns | 2,317,199 |

### JSON serialization (production mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + JSON.stringify | **1.98M** | 506ns | 667ns | 1,976,638 |

### pretty print (development mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + pretty print | **1.99M** | 504ns | 667ns | 1,985,229 |

### silent mode (no output)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit silent (event build only) | **1.99M** | 503ns | 667ns | 1,988,045 |

### JSON.stringify baseline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| raw JSON.stringify (same payload) | **2.27M** | 441ns | 583ns | 2,267,048 |

### createLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with shallow context | **20.38M** | 49ns | 84ns | 20,375,768 |
| no initial context | **19.35M** | 52ns | 84ns | 19,352,066 |
| with nested context | **19.10M** | 52ns | 84ns | 19,099,495 |

### createRequestLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with method + path | **19.27M** | 52ns | 84ns | 19,270,863 |
| with method + path + requestId | **13.01M** | 77ns | 166ns | 13,007,508 |

### log.set()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| shallow merge (3 fields) | **9.54M** | 105ns | 208ns | 9,535,124 |
| deep nested merge | **8.40M** | 119ns | 209ns | 8,403,150 |
| multiple sequential sets | **7.53M** | 133ns | 250ns | 7,525,455 |
| shallow merge (10 fields) | **4.78M** | 209ns | 334ns | 4,778,905 |

### log.emit()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit with context | **1.76M** | 569ns | 750ns | 1,757,416 |
| emit minimal event | **1.75M** | 570ns | 667ns | 1,754,481 |
| full lifecycle (create + set + emit) | **1.69M** | 592ns | 792ns | 1,689,404 |
| emit with error | **66.1K** | 15.13µs | 36.00µs | 66,105 |

### log.set() payload sizes

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| small payload (2 fields) | **1.76M** | 567ns | 750ns | 1,762,472 |
| medium payload (50 fields) | **555.5K** | 1.80µs | 2.42µs | 555,516 |
| large payload (200 nested fields) | **115.7K** | 8.65µs | 30.17µs | 115,662 |

### head sampling

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with sampling rates | **584.7K** | 1.71µs | 2.54µs | 584,733 |
| no sampling configured | **465.0K** | 2.15µs | 3.21µs | 464,990 |

### tail sampling (shouldKeep)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| path glob match | **43.76M** | 23ns | 42ns | 43,763,290 |
| status match | **43.60M** | 23ns | 42ns | 43,604,101 |
| duration match | **43.42M** | 23ns | 42ns | 43,418,153 |
| no match (fast path) | **43.17M** | 23ns | 42ns | 43,171,349 |

### head + tail sampling combined

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| full emit with sampling (likely sampled out) | **7.57M** | 132ns | 542ns | 7,568,713 |
| full emit with force-keep (tail sampling hit) | **7.01M** | 143ns | 583ns | 7,005,909 |
