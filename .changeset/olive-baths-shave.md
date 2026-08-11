---
"evlog": patch
---

Qualify the eve turn `requestId` with its session id.

eve numbers turns within a session, so `turn_0` is the first turn of every session. Recording it as `requestId` made the field non-unique — every single-turn session produced the same value, which is unusable as a correlation key in a drain. The wide event now reports `<sessionId>:<turnId>`, and `evlogRuntimeContext` stamps the same value on the model-call spans so a trace still joins to the event it belongs to. `eve.sessionId` and `eve.turnId` are unchanged.
