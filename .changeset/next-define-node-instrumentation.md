---
"evlog": patch
---

Add `defineNodeInstrumentation()` for Next.js root `instrumentation.ts`: gate on `NEXT_RUNTIME === 'nodejs'`, cache the dynamic `import()` of `lib/evlog` between `register` and `onRequestError`, and export `NextInstrumentationRequest` / `NextInstrumentationErrorContext` types.
