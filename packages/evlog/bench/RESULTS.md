# Benchmark results

> Generated on 2026-03-14

## Bundle size

| Entry | Raw | Gzip |
|-------|----:|-----:|
| framework/nitro | 17.44 kB | 6.85 kB |
| logger | 11.60 kB | 3.70 kB |
| framework/next | 8.93 kB | 3.02 kB |
| adapter/sentry | 6.00 kB | 2.33 kB |
| adapter/otlp | 5.71 kB | 2.09 kB |
| enrichers | 6.15 kB | 1.92 kB |
| framework/sveltekit | 4.84 kB | 1.54 kB |
| adapter/posthog | 4.78 kB | 1.48 kB |
| adapter/fs | 3.38 kB | 1.42 kB |
| utils | 3.28 kB | 1.41 kB |
| pipeline | 4.17 kB | 1.35 kB |
| adapter/axiom | 3.24 kB | 1.30 kB |
| browser | 2.93 kB | 1.21 kB |
| error | 3.06 kB | 1.21 kB |
| framework/nestjs | 2.80 kB | 1.21 kB |
| adapter/better-stack | 2.62 kB | 1.08 kB |
| framework/elysia | 2.51 kB | 1.06 kB |
| framework/fastify | 2.29 kB | 1010 B |
| workers | 2.08 kB | 960 B |
| framework/express | 1.29 kB | 702 B |
| framework/hono | 1.07 kB | 593 B |
| toolkit | 486 B | 243 B |
| core (index) | 497 B | 205 B |
| types | 11 B | 31 B |
| **Total** | **101.13 kB** | **37.83 kB** |

## Comparison vs alternatives

> All loggers configured for JSON output to no-op destinations.
> See `bench/comparison/vs-alternatives.bench.ts` for methodology.

### simple string log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **927.5K** | 1.08µs | **fastest** |
| pino | **696.9K** | 1.44µs | 1.33x slower |
| consola | **625.5K** | 1.60µs | 1.48x slower |
| winston | **322.4K** | 3.10µs | 2.88x slower |

### structured log (5 fields)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **756.8K** | 1.32µs | **fastest** |
| consola | **433.9K** | 2.30µs | 1.74x slower |
| pino | **332.1K** | 3.01µs | 2.28x slower |
| winston | **122.0K** | 8.20µs | 6.20x slower |

### deep nested log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **781.7K** | 1.28µs | **fastest** |
| consola | **281.4K** | 3.55µs | 2.78x slower |
| pino | **200.1K** | 5.00µs | 3.91x slower |
| winston | **70.1K** | 14.27µs | 11.15x slower |

### child / scoped logger

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| pino | **492.0K** | 2.03µs | **fastest** |
| winston | **139.4K** | 7.18µs | 3.53x slower |
| evlog | **106.0K** | 9.43µs | 4.64x slower |
| consola | **99.7K** | 10.03µs | 4.93x slower |

### wide event lifecycle (evlog-native pattern)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| pino | **113.0K** | 8.85µs | **fastest** |
| evlog | **84.9K** | 11.78µs | 1.33x slower |
| winston | **37.2K** | 26.88µs | 3.04x slower |

### burst — 100 sequential logs

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| consola | **8.7K** | 115.43µs | **fastest** |
| evlog | **7.7K** | 129.49µs | 1.12x slower |
| pino | **6.6K** | 150.60µs | 1.30x slower |
| winston | **2.2K** | 457.98µs | 3.97x slower |

### logger creation cost

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **7.71M** | 130ns | **fastest** |
| pino | **2.56M** | 391ns | 3.01x slower |
| winston | **1.89M** | 529ns | 4.08x slower |
| consola | **115.5K** | 8.66µs | 66.78x slower |

## Core benchmarks

### client log serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| JSON.stringify — minimal log | **1.34M** | 745ns | 1.48µs | 1,342,705 |
| JSON.stringify — rich log | **628.6K** | 1.59µs | 2.74µs | 628,606 |
| JSON.stringify — batch of 10 | **89.0K** | 11.24µs | 17.57µs | 88,981 |
| JSON.stringify — batch of 50 | **19.5K** | 51.27µs | 60.50µs | 19,504 |

### client log formatting

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| build formatted log object (minimal) | **1.36M** | 735ns | 1.05µs | 1,360,230 |
| build formatted log object (with identity spread) | **1.17M** | 858ns | 1.22µs | 1,165,768 |
| build + serialize (rich log) | **513.8K** | 1.95µs | 3.04µs | 513,813 |

### pipeline — push throughput

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1 event (no flush) | **368.2K** | 2.72µs | 3.79µs | 368,216 |
| push 100 events (no flush) | **32.1K** | 31.18µs | 46.68µs | 32,066 |
| push 1000 events (no flush) | **941** | 1.063ms | 5.871ms | 940 |

### pipeline — push + batch trigger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 events (triggers 1 batch flush) | **23.7K** | 42.20µs | 160.17µs | 23,693 |
| push 200 events (triggers 4 batch flushes) | **19.5K** | 51.31µs | 69.33µs | 19,489 |

### pipeline — buffer overflow

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1100 events (100 dropped, buffer=1000) | **3.2K** | 316.77µs | 360.19µs | 3,156 |

### pipeline — serialization in drain

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 + JSON.stringify batch in drain | **20.0K** | 50.03µs | 67.38µs | 19,988 |

### createUserAgentEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no user-agent header | **11.01M** | 91ns | 226ns | 11,011,755 |
| Googlebot | **1.52M** | 660ns | 1.24µs | 1,516,172 |
| Firefox Linux | **1.26M** | 797ns | 1.43µs | 1,255,015 |
| Chrome desktop | **907.4K** | 1.10µs | 2.12µs | 907,370 |

### createGeoEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| Vercel headers (full) | **1.66M** | 601ns | 914ns | 1,662,532 |
| no geo headers | **1.08M** | 927ns | 1.59µs | 1,078,904 |
| Cloudflare headers (country only) | **393.9K** | 2.54µs | 3.54µs | 393,900 |

### createRequestSizeEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with content-length | **8.17M** | 122ns | 277ns | 8,167,286 |
| no content-length | **7.22M** | 138ns | 366ns | 7,224,812 |

### createTraceContextEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no trace headers | **5.71M** | 175ns | 393ns | 5,709,397 |
| with traceparent + tracestate | **3.21M** | 311ns | 559ns | 3,212,629 |
| with traceparent | **1.59M** | 629ns | 945ns | 1,589,195 |

### full enricher pipeline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| all enrichers (no headers) | **893.3K** | 1.12µs | 1.77µs | 893,263 |
| all enrichers (all headers present) | **181.7K** | 5.50µs | 7.37µs | 181,655 |

### createError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| string message | **110.5K** | 9.05µs | 14.74µs | 110,502 |
| with status | **109.6K** | 9.13µs | 13.86µs | 109,568 |
| full options | **108.9K** | 9.18µs | 13.95µs | 108,873 |
| with cause | **82.2K** | 12.16µs | 17.97µs | 82,232 |

### parseError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| parse plain Error | **15.30M** | 65ns | 222ns | 15,301,675 |
| parse fetch-like error | **14.81M** | 68ns | 220ns | 14,813,279 |
| parse string | **14.57M** | 69ns | 218ns | 14,566,542 |
| parse EvlogError | **6.22M** | 161ns | 293ns | 6,220,646 |

### createError + parseError round-trip

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| create + parse (simple) | **111.0K** | 9.01µs | 14.24µs | 110,961 |
| create + parse (full) | **80.5K** | 12.43µs | 18.12µs | 80,453 |

### EvlogError serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| toJSON() | **4.46M** | 224ns | 443ns | 4,456,701 |
| toString() | **1.40M** | 713ns | 1.28µs | 1,402,428 |
| JSON.stringify() | **724.2K** | 1.38µs | 1.92µs | 724,230 |

### JSON serialization (production mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + JSON.stringify | **109.4K** | 9.14µs | 17.20µs | 109,360 |

### pretty print (development mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + pretty print | **110.2K** | 9.08µs | 17.25µs | 110,181 |

### silent mode (no output)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit silent (event build only) | **111.1K** | 9.00µs | 16.68µs | 111,062 |

### JSON.stringify baseline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| raw JSON.stringify (same payload) | **675.9K** | 1.48µs | 2.19µs | 675,919 |

### createLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with shallow context | **8.14M** | 123ns | 234ns | 8,141,395 |
| no initial context | **7.85M** | 127ns | 318ns | 7,846,065 |
| with nested context | **7.21M** | 139ns | 305ns | 7,211,302 |

### createRequestLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with method + path | **7.54M** | 133ns | 319ns | 7,537,611 |
| with method + path + requestId | **5.18M** | 193ns | 397ns | 5,178,119 |

### log.set()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| shallow merge (3 fields) | **2.94M** | 340ns | 754ns | 2,944,556 |
| deep nested merge | **2.43M** | 412ns | 846ns | 2,429,686 |
| multiple sequential sets | **2.40M** | 416ns | 810ns | 2,402,519 |
| shallow merge (10 fields) | **1.75M** | 571ns | 1.02µs | 1,751,968 |

### log.emit()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit minimal event | **996.2K** | 1.00µs | 1.57µs | 996,212 |
| emit with context | **808.8K** | 1.24µs | 1.76µs | 808,829 |
| full lifecycle (create + set + emit) | **752.9K** | 1.33µs | 1.82µs | 752,936 |
| emit with error | **24.4K** | 41.02µs | 72.92µs | 24,381 |

### log.set() payload sizes

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| small payload (2 fields) | **743.2K** | 1.35µs | 2.40µs | 743,177 |
| medium payload (50 fields) | **265.6K** | 3.76µs | 4.63µs | 265,619 |
| large payload (200 nested fields) | **55.4K** | 18.06µs | 27.43µs | 55,363 |

### head sampling

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with sampling rates | **248.1K** | 4.03µs | 10.96µs | 248,149 |
| no sampling configured | **94.1K** | 10.63µs | 20.00µs | 94,091 |

### tail sampling (shouldKeep)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no match (fast path) | **15.01M** | 67ns | 210ns | 15,009,204 |
| path glob match | **14.94M** | 67ns | 214ns | 14,943,815 |
| status match | **14.87M** | 67ns | 209ns | 14,873,093 |
| duration match | **14.69M** | 68ns | 216ns | 14,693,683 |

### head + tail sampling combined

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| full emit with sampling (likely sampled out) | **989.6K** | 1.01µs | 8.00µs | 989,587 |
| full emit with force-keep (tail sampling hit) | **456.6K** | 2.19µs | 9.17µs | 456,557 |
