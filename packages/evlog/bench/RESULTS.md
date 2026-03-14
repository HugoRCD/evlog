# Benchmark results

> Generated on 2026-03-14

## Bundle size

| Entry | Raw | Gzip |
|-------|----:|-----:|
| framework/nitro | 17.44 kB | 6.85 kB |
| logger | 11.88 kB | 3.64 kB |
| framework/next | 8.93 kB | 3.02 kB |
| adapter/sentry | 6.00 kB | 2.33 kB |
| adapter/otlp | 5.71 kB | 2.09 kB |
| enrichers | 6.15 kB | 1.92 kB |
| framework/sveltekit | 4.84 kB | 1.54 kB |
| adapter/posthog | 4.78 kB | 1.48 kB |
| adapter/fs | 3.38 kB | 1.42 kB |
| pipeline | 4.17 kB | 1.35 kB |
| utils | 3.20 kB | 1.34 kB |
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
| **Total** | **101.33 kB** | **37.71 kB** |

## Comparison vs alternatives

> All loggers configured for JSON output to no-op destinations.
> See `bench/comparison/vs-alternatives.bench.ts` for methodology.

### simple string log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| consola | **682.9K** | 1.46µs | **fastest** |
| evlog | **540.9K** | 1.85µs | 1.26x slower |
| pino | **469.9K** | 2.13µs | 1.45x slower |
| winston | **329.9K** | 3.03µs | 2.07x slower |

### structured log (5 fields)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **490.5K** | 2.04µs | **fastest** |
| consola | **461.7K** | 2.17µs | 1.06x slower |
| pino | **289.6K** | 3.45µs | 1.69x slower |
| winston | **128.3K** | 7.79µs | 3.82x slower |

### deep nested log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **497.4K** | 2.01µs | **fastest** |
| consola | **281.5K** | 3.55µs | 1.77x slower |
| pino | **178.7K** | 5.60µs | 2.78x slower |
| winston | **72.5K** | 13.79µs | 6.86x slower |

### child / scoped logger

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| pino | **382.3K** | 2.62µs | **fastest** |
| evlog | **249.9K** | 4.00µs | 1.53x slower |
| winston | **143.5K** | 6.97µs | 2.66x slower |
| consola | **105.9K** | 9.44µs | 3.61x slower |

### wide event lifecycle (evlog-native pattern)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **419.7K** | 2.38µs | **fastest** |
| pino | **89.4K** | 11.18µs | 4.69x slower |
| winston | **34.2K** | 29.27µs | 12.29x slower |

### burst — 100 sequential logs

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| consola | **8.9K** | 111.95µs | **fastest** |
| evlog | **6.8K** | 148.04µs | 1.32x slower |
| pino | **4.6K** | 217.40µs | 1.94x slower |
| winston | **2.4K** | 423.90µs | 3.79x slower |

### logger creation cost

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **7.41M** | 135ns | **fastest** |
| pino | **2.43M** | 411ns | 3.04x slower |
| winston | **1.67M** | 598ns | 4.43x slower |
| consola | **123.5K** | 8.10µs | 60.02x slower |

## Core benchmarks

### client log serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| JSON.stringify — minimal log | **1.35M** | 739ns | 1.15µs | 1,352,575 |
| JSON.stringify — rich log | **557.2K** | 1.79µs | 2.93µs | 557,178 |
| JSON.stringify — batch of 10 | **77.3K** | 12.94µs | 22.08µs | 77,289 |
| JSON.stringify — batch of 50 | **17.0K** | 58.78µs | 95.53µs | 17,013 |

### client log formatting

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| build formatted log object (minimal) | **1.35M** | 743ns | 1.39µs | 1,346,587 |
| build formatted log object (with identity spread) | **1.19M** | 839ns | 1.41µs | 1,191,865 |
| build + serialize (rich log) | **504.6K** | 1.98µs | 3.91µs | 504,611 |

### pipeline — push throughput

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1 event (no flush) | **368.5K** | 2.71µs | 4.21µs | 368,525 |
| push 100 events (no flush) | **28.5K** | 35.09µs | 151.84µs | 28,495 |
| push 1000 events (no flush) | **1.7K** | 588.96µs | 3.362ms | 1,697 |

### pipeline — push + batch trigger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 events (triggers 1 batch flush) | **61.2K** | 16.33µs | 36.69µs | 61,219 |
| push 200 events (triggers 4 batch flushes) | **17.9K** | 55.93µs | 80.97µs | 17,878 |

### pipeline — buffer overflow

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1100 events (100 dropped, buffer=1000) | **2.2K** | 462.61µs | 13.339ms | 2,161 |

### pipeline — serialization in drain

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 + JSON.stringify batch in drain | **1.8K** | 542.90µs | 8.026ms | 1,841 |

### createUserAgentEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no user-agent header | **11.02M** | 91ns | 120ns | 11,023,995 |
| Googlebot | **1.56M** | 641ns | 772ns | 1,561,084 |
| Firefox Linux | **1.33M** | 754ns | 1.13µs | 1,325,963 |
| Chrome desktop | **885.9K** | 1.13µs | 2.25µs | 885,904 |

### createGeoEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| Vercel headers (full) | **1.90M** | 525ns | 591ns | 1,903,578 |
| no geo headers | **1.19M** | 837ns | 922ns | 1,194,983 |
| Cloudflare headers (country only) | **451.5K** | 2.21µs | 2.50µs | 451,537 |

### createRequestSizeEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with content-length | **8.05M** | 124ns | 150ns | 8,050,685 |
| no content-length | **6.99M** | 143ns | 190ns | 6,987,376 |

### createTraceContextEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no trace headers | **6.00M** | 167ns | 211ns | 6,002,678 |
| with traceparent + tracestate | **2.98M** | 336ns | 410ns | 2,976,883 |
| with traceparent | **1.82M** | 549ns | 872ns | 1,820,663 |

### full enricher pipeline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| all enrichers (no headers) | **925.3K** | 1.08µs | 1.18µs | 925,263 |
| all enrichers (all headers present) | **194.2K** | 5.15µs | 7.95µs | 194,217 |

### createError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with status | **109.5K** | 9.13µs | 17.54µs | 109,508 |
| string message | **107.9K** | 9.27µs | 18.37µs | 107,851 |
| full options | **107.7K** | 9.29µs | 18.09µs | 107,691 |
| with cause | **81.4K** | 12.28µs | 21.21µs | 81,416 |

### parseError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| parse plain Error | **14.69M** | 68ns | 80ns | 14,693,597 |
| parse fetch-like error | **14.42M** | 69ns | 90ns | 14,421,395 |
| parse string | **13.87M** | 72ns | 100ns | 13,873,696 |
| parse EvlogError | **5.82M** | 172ns | 191ns | 5,819,915 |

### createError + parseError round-trip

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| create + parse (simple) | **107.9K** | 9.26µs | 17.83µs | 107,940 |
| create + parse (full) | **77.8K** | 12.86µs | 22.06µs | 77,754 |

### EvlogError serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| toJSON() | **4.51M** | 222ns | 411ns | 4,510,963 |
| toString() | **1.41M** | 707ns | 871ns | 1,414,841 |
| JSON.stringify() | **702.2K** | 1.42µs | 1.57µs | 702,178 |

### JSON serialization (production mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + JSON.stringify | **266.8K** | 3.75µs | 7.23µs | 266,806 |

### pretty print (development mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + pretty print | **270.4K** | 3.70µs | 7.31µs | 270,435 |

### silent mode (no output)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit silent (event build only) | **272.4K** | 3.67µs | 7.09µs | 272,424 |

### JSON.stringify baseline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| raw JSON.stringify (same payload) | **666.6K** | 1.50µs | 1.64µs | 666,605 |

### createLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with shallow context | **7.77M** | 129ns | 190ns | 7,769,830 |
| no initial context | **7.68M** | 130ns | 210ns | 7,680,810 |
| with nested context | **7.26M** | 138ns | 161ns | 7,256,828 |

### createRequestLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with method + path | **7.55M** | 133ns | 170ns | 7,545,467 |
| with method + path + requestId | **5.15M** | 194ns | 231ns | 5,147,589 |

### log.set()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| shallow merge (3 fields) | **5.75M** | 174ns | 260ns | 5,750,390 |
| shallow merge (10 fields) | **5.13M** | 195ns | 321ns | 5,128,913 |
| deep nested merge | **5.05M** | 198ns | 271ns | 5,049,215 |
| multiple sequential sets | **1.98M** | 506ns | 672ns | 1,976,191 |

### log.emit()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit minimal event | **857.3K** | 1.17µs | 1.44µs | 857,270 |
| full lifecycle (create + set + emit) | **254.3K** | 3.93µs | 8.03µs | 254,253 |
| emit with context | **252.0K** | 3.97µs | 8.19µs | 251,980 |
| emit with error | **20.9K** | 47.82µs | 95.73µs | 20,910 |

### log.set() payload sizes

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| small payload (2 fields) | **620.5K** | 1.61µs | 2.99µs | 620,463 |
| medium payload (50 fields) | **146.8K** | 6.81µs | 13.36µs | 146,818 |
| large payload (200 nested fields) | **21.8K** | 45.87µs | 142.97µs | 21,802 |

### head sampling

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with sampling rates | **231.5K** | 4.32µs | 8.14µs | 231,495 |
| no sampling configured | **158.8K** | 6.30µs | 12.44µs | 158,771 |

### tail sampling (shouldKeep)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| status match | **14.17M** | 71ns | 81ns | 14,174,924 |
| no match (fast path) | **14.17M** | 71ns | 110ns | 14,169,615 |
| path glob match | **14.08M** | 71ns | 101ns | 14,084,486 |
| duration match | **14.04M** | 71ns | 110ns | 14,040,248 |

### head + tail sampling combined

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| full emit with sampling (likely sampled out) | **840.2K** | 1.19µs | 3.37µs | 840,235 |
| full emit with force-keep (tail sampling hit) | **381.1K** | 2.62µs | 5.63µs | 381,078 |
