# Benchmark results

> Generated on 2026-03-14

## Bundle size

| Entry | Raw | Gzip |
|-------|----:|-----:|
| framework/nitro | 17.44 kB | 6.85 kB |
| logger | 12.40 kB | 3.74 kB |
| framework/next | 8.93 kB | 3.02 kB |
| adapter/sentry | 6.00 kB | 2.33 kB |
| adapter/otlp | 5.71 kB | 2.09 kB |
| enrichers | 6.15 kB | 1.92 kB |
| framework/sveltekit | 4.84 kB | 1.54 kB |
| adapter/posthog | 4.78 kB | 1.48 kB |
| adapter/fs | 3.38 kB | 1.42 kB |
| utils | 3.36 kB | 1.41 kB |
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
| **Total** | **102.01 kB** | **37.88 kB** |

## Comparison vs alternatives

> All loggers configured for JSON output to no-op destinations.
> See `bench/comparison/vs-alternatives.bench.ts` for methodology.

### simple string log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **1.02M** | 981ns | **fastest** |
| consola | **689.7K** | 1.45µs | 1.48x slower |
| pino | **472.8K** | 2.11µs | 2.16x slower |
| winston | **373.3K** | 2.68µs | 2.73x slower |

### structured log (5 fields)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **818.5K** | 1.22µs | **fastest** |
| consola | **476.5K** | 2.10µs | 1.72x slower |
| pino | **283.4K** | 3.53µs | 2.89x slower |
| winston | **131.9K** | 7.58µs | 6.20x slower |

### deep nested log

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **854.9K** | 1.17µs | **fastest** |
| consola | **287.5K** | 3.48µs | 2.97x slower |
| pino | **171.3K** | 5.84µs | 4.99x slower |
| winston | **62.2K** | 16.07µs | 13.74x slower |

### child / scoped logger

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| pino | **381.3K** | 2.62µs | **fastest** |
| winston | **159.1K** | 6.29µs | 2.40x slower |
| evlog | **106.8K** | 9.37µs | 3.57x slower |
| consola | **101.8K** | 9.82µs | 3.75x slower |

### wide event lifecycle (evlog-native pattern)

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| pino | **88.4K** | 11.31µs | **fastest** |
| evlog | **86.2K** | 11.60µs | 1.03x slower |
| winston | **34.9K** | 28.64µs | 2.53x slower |

### burst — 100 sequential logs

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **9.0K** | 110.89µs | **fastest** |
| consola | **8.9K** | 112.32µs | 1.01x slower |
| pino | **4.6K** | 215.96µs | 1.95x slower |
| winston | **2.2K** | 459.01µs | 4.14x slower |

### logger creation cost

| Library | ops/sec | Mean | Relative |
|---------|--------:|-----:|---------:|
| evlog | **7.60M** | 132ns | **fastest** |
| pino | **2.41M** | 416ns | 3.16x slower |
| winston | **1.76M** | 568ns | 4.32x slower |
| consola | **121.5K** | 8.23µs | 62.56x slower |

## Core benchmarks

### client log serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| JSON.stringify — minimal log | **1.32M** | 757ns | 1.25µs | 1,321,237 |
| JSON.stringify — rich log | **621.9K** | 1.61µs | 2.42µs | 621,927 |
| JSON.stringify — batch of 10 | **81.3K** | 12.30µs | 20.45µs | 81,314 |
| JSON.stringify — batch of 50 | **17.4K** | 57.57µs | 73.58µs | 17,370 |

### client log formatting

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| build formatted log object (minimal) | **1.42M** | 702ns | 762ns | 1,423,936 |
| build formatted log object (with identity spread) | **1.18M** | 849ns | 901ns | 1,178,154 |
| build + serialize (rich log) | **519.7K** | 1.92µs | 2.33µs | 519,656 |

### pipeline — push throughput

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1 event (no flush) | **319.8K** | 3.13µs | 3.22µs | 319,809 |
| push 100 events (no flush) | **33.0K** | 30.28µs | 47.11µs | 33,023 |
| push 1000 events (no flush) | **2.1K** | 482.67µs | 3.818ms | 2,071 |

### pipeline — push + batch trigger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 events (triggers 1 batch flush) | **18.9K** | 52.85µs | 181.28µs | 18,921 |
| push 200 events (triggers 4 batch flushes) | **16.4K** | 61.04µs | 82.17µs | 16,382 |

### pipeline — buffer overflow

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 1100 events (100 dropped, buffer=1000) | **2.9K** | 349.05µs | 418.18µs | 2,864 |

### pipeline — serialization in drain

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| push 50 + JSON.stringify batch in drain | **18.7K** | 53.41µs | 76.96µs | 18,722 |

### createUserAgentEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no user-agent header | **11.03M** | 91ns | 121ns | 11,028,890 |
| Googlebot | **1.54M** | 651ns | 1.01µs | 1,536,541 |
| Firefox Linux | **1.31M** | 763ns | 1.14µs | 1,310,166 |
| Chrome desktop | **922.1K** | 1.08µs | 2.14µs | 922,120 |

### createGeoEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| Vercel headers (full) | **1.88M** | 531ns | 982ns | 1,882,624 |
| no geo headers | **1.20M** | 835ns | 982ns | 1,198,143 |
| Cloudflare headers (country only) | **450.6K** | 2.22µs | 2.61µs | 450,633 |

### createRequestSizeEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with content-length | **8.46M** | 118ns | 210ns | 8,463,970 |
| no content-length | **7.25M** | 138ns | 180ns | 7,245,286 |

### createTraceContextEnricher

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no trace headers | **6.13M** | 163ns | 210ns | 6,133,803 |
| with traceparent + tracestate | **3.12M** | 321ns | 381ns | 3,117,908 |
| with traceparent | **1.82M** | 548ns | 601ns | 1,823,956 |

### full enricher pipeline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| all enrichers (no headers) | **923.5K** | 1.08µs | 1.26µs | 923,493 |
| all enrichers (all headers present) | **192.4K** | 5.20µs | 9.27µs | 192,424 |

### createError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| string message | **109.5K** | 9.14µs | 17.67µs | 109,454 |
| with status | **108.0K** | 9.26µs | 17.80µs | 107,967 |
| full options | **107.0K** | 9.34µs | 17.70µs | 107,016 |
| with cause | **81.8K** | 12.22µs | 21.28µs | 81,800 |

### parseError

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| parse plain Error | **14.71M** | 68ns | 80ns | 14,714,373 |
| parse fetch-like error | **14.46M** | 69ns | 81ns | 14,458,376 |
| parse string | **13.90M** | 72ns | 90ns | 13,898,559 |
| parse EvlogError | **5.84M** | 171ns | 300ns | 5,838,405 |

### createError + parseError round-trip

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| create + parse (simple) | **109.1K** | 9.17µs | 18.35µs | 109,087 |
| create + parse (full) | **79.1K** | 12.63µs | 21.92µs | 79,145 |

### EvlogError serialization

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| toJSON() | **4.63M** | 216ns | 351ns | 4,634,805 |
| toString() | **1.40M** | 712ns | 841ns | 1,403,610 |
| JSON.stringify() | **683.9K** | 1.46µs | 1.60µs | 683,918 |

### JSON serialization (production mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + JSON.stringify | **111.3K** | 8.99µs | 18.60µs | 111,259 |

### pretty print (development mode)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit + pretty print | **114.1K** | 8.76µs | 18.60µs | 114,115 |

### silent mode (no output)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit silent (event build only) | **113.6K** | 8.80µs | 18.78µs | 113,581 |

### JSON.stringify baseline

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| raw JSON.stringify (same payload) | **676.0K** | 1.48µs | 1.66µs | 676,043 |

### createLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with shallow context | **7.47M** | 134ns | 171ns | 7,474,545 |
| no initial context | **7.28M** | 137ns | 180ns | 7,281,349 |
| with nested context | **6.93M** | 144ns | 170ns | 6,926,380 |

### createRequestLogger

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with method + path | **7.44M** | 134ns | 200ns | 7,440,438 |
| with method + path + requestId | **5.07M** | 197ns | 230ns | 5,073,216 |

### log.set()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| shallow merge (3 fields) | **3.56M** | 281ns | 501ns | 3,560,724 |
| deep nested merge | **2.91M** | 343ns | 501ns | 2,913,898 |
| multiple sequential sets | **2.77M** | 361ns | 481ns | 2,772,384 |
| shallow merge (10 fields) | **2.10M** | 476ns | 591ns | 2,100,597 |

### log.emit()

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| emit minimal event | **1.05M** | 950ns | 1.71µs | 1,053,088 |
| emit with context | **806.8K** | 1.24µs | 1.49µs | 806,838 |
| full lifecycle (create + set + emit) | **773.2K** | 1.29µs | 2.24µs | 773,216 |
| emit with error | **24.1K** | 41.47µs | 85.36µs | 24,115 |

### log.set() payload sizes

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| small payload (2 fields) | **787.8K** | 1.27µs | 2.44µs | 787,759 |
| medium payload (50 fields) | **265.2K** | 3.77µs | 5.17µs | 265,197 |
| large payload (200 nested fields) | **48.5K** | 20.64µs | 32.90µs | 48,457 |

### head sampling

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| with sampling rates | **246.8K** | 4.05µs | 11.68µs | 246,763 |
| no sampling configured | **90.9K** | 11.00µs | 23.54µs | 90,943 |

### tail sampling (shouldKeep)

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| no match (fast path) | **14.54M** | 69ns | 81ns | 14,536,428 |
| status match | **14.51M** | 69ns | 81ns | 14,514,669 |
| path glob match | **14.48M** | 69ns | 100ns | 14,476,636 |
| duration match | **14.45M** | 69ns | 100ns | 14,452,734 |

### head + tail sampling combined

| Benchmark | ops/sec | Mean | p99 | Samples |
|-----------|--------:|-----:|----:|--------:|
| full emit with sampling (likely sampled out) | **1.01M** | 988ns | 8.25µs | 1,012,330 |
| full emit with force-keep (tail sampling hit) | **475.8K** | 2.10µs | 9.42µs | 475,781 |
