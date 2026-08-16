# Vision

How Evi sees images. The base model (`EVI_MODEL`, DeepSeek V4 Flash) is
text-only, so vision is not a model swap: the dynamic model resolver in
`agent/agent.ts` re-evaluates at every step and selects the vision fallback
(`EVI_VISION_MODEL`, Qwen 3.7 Flash) while the session history carries image
parts. Detection lives in `agent/lib/model.ts` (`hasVisualParts`). When
compaction drops the image payloads, the session returns to the base model on
its own. Sessions that never see an image never pay for one.

The fallback must be a model that can run the whole session, tools included,
not just caption a picture: while an image sits in history, every step runs on
it. Qwen 3.7 Flash is vision-native, agentic, and at or below the base model's
rate card.

## Per channel

| Channel | How an image reaches Evi |
| --- | --- |
| Linear (agent session) | eve fetches `uploads.linear.app` markdown images from the session prompt with the Linear token and attaches them as image parts. Nothing to do in the app. |
| Linear (documents, issue bodies read over MCP) | MCP tools return markdown with `uploads.linear.app` URLs. `images__view` fetches them with the app token; admin sessions only, matching the Linear connection itself. |
| GitHub (issues, PRs, comments) | The channel has no inbound attachments; images are markdown URLs in the body. `images__view` fetches `github.com/user-attachments` and `*.githubusercontent.com`, in community first-responder turns too. |
| iMessage (Photon) | Delivered by `patches/eve@0.34.0.patch`. The Photon webhook ships attachment metadata without bytes or a URL, and the adapter keeps only name/mimeType/size, so stock eve drops the attachment (and drops an image-only message entirely). When a message announces image attachments, the patched `photonInboundContent` re-resolves it through the adapter's spectrum client (`fetchMessage`), whose parsed content nodes carry an authenticated `read()`, and delivers the bytes as file parts. Drop the patch once eve consumes the chat-sdk `data`/`fetchData` attachment contract. |
| Browser (sandbox) | The `@agent-browser` extension has `inlineScreenshots: true`; screenshots come back as tool content parts. |

## Limits, on purpose

- `images__view` fetches only the attachment hosts above, https only. The
  URLs come out of untrusted markdown; an allowlist beats an open fetcher.
- 2 MB raw cap (`MAX_INLINE_IMAGE_BYTES`), so the base64 content part stays
  under eve's 3 MiB session-history warning: image parts are re-sent on every
  later model call.
- The bytes must sniff as a complete png/jpg/webp/gif (same check as blob
  uploads); the server's content-type header is never trusted. No svg.
- Failures are explicit, never silent: the tool returns what went wrong
  (unsupported host, HTTP status, too large, not an image), and the
  instructions require reporting that instead of describing an unseen image.
- Compacted images are gone: eve replaces the payload with a text stub. An
  image the session may need again belongs in the sandbox, not in history.
