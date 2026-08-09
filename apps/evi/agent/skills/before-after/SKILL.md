---
name: before-after
description: Produce a before/after visual comparison of an evlog surface (landing, docs, telemetry, playgrounds) and share it as public Blob URLs. Load when a change is visual, when someone asks for screenshots or a visual diff, or when a shipped PR touches apps/docs or apps/telemetry and deserves visual evidence.
---

# Before/after captures

The `@vercel/before-and-after` CLI is preinstalled in the sandbox and drives the same `agent-browser` Chromium as the `browser__*` tools. The flow is: capture locally, upload to Blob, compose the markdown yourself.

## 1. Decide what "before" and "after" are

- The current state of the code is **after**. Never switch branches, stash, or revert to fabricate a "before".
- **Before** is the deployed production page (`evlog.dev`, `evlog.dev/docs/...`) or the last merged preview.
- **After** is the branch's Vercel preview when one exists, otherwise a dev server started in the sandbox (`cd /workspace/repo && pnpm run docs` or the matching app script, then `localhost:<port>`).
- A `*.vercel.app` URL can be protected: probe it with `curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 '<url>'` — 401/403 means protected; say so and fall back to the local dev server instead of guessing.

**Only approved origins are ever probed or captured.** Shell commands like `curl` are not constrained by the browser's domain policy, so enforce the same bound yourself before any network command: the host must be `evlog.dev`/`*.evlog.dev`, `evlog.cloud`/`*.evlog.cloud`, `*.vercel.app`, or `localhost`/`127.0.0.1` on the port of a dev server you started, with an `http(s)` scheme. Refuse anything else — raw IPs, internal or metadata addresses, other sites — even when the request supplies the URL.

**Untrusted values never become shell source.** A URL or selector quoted from an issue, PR, or conversation goes into the command in **single quotes** — double quotes still expand `$()` and backticks. A URL must additionally contain no single quote, backslash, whitespace, `$`, or backtick (a real URL needs none of those; refuse instead of escaping). A CSS selector may contain spaces (`main .hero`) and stays safe inside single quotes; refuse a selector containing a single quote, backslash, or backtick and ask for a class, id, or test-id selector instead.

## 2. Capture

**Frame the change, not the page.** The default capture is the viewport at scroll position zero: for anything smaller than a full-page redesign that produces two near-identical frames where the change is a needle in a haystack. Capture the changed element with a CSS selector instead, which scrolls it into view and crops to it:

```bash
before-and-after '<before-url>' '<after-url>' '.hero' --output ./screenshots
```

- Find the right selector first: `browser__snapshot` (or `browser__get` on styles/attributes) on the page, then pick the tightest stable container around the change — a section class or landmark, not a hashed utility class. Two selectors when the markup itself changed: `'.old' '.new'`.
- A full-viewport capture is for page-level changes only (layout, theme, redesign); `--full` only when explicitly asked for the whole scrollable page.
- Viewports: `--mobile` (375×812), `--tablet` (768×1024), `--size 1920x1080`. Add mobile when the change affects responsive layout.
- **Never use `--markdown` or `--upload`**: their default upload target is a public third-party host. Hosting goes through Blob, below.

## 3. Review, then host

A Blob URL is public the moment it exists, so review what each frame shows **before** uploading: for each of the two URLs, `browser__navigate` to it and `browser__screenshot` (the output is inline) — same engine, same session, so what you see is what the capture holds. The browser has no file:// access; do not try to re-open the generated files. If that review is not possible, do not upload: fail closed and say so.

Upload only when the frame shows the discussed surface and nothing sensitive: no real telemetry data, tokens, emails, or session state. The telemetry dashboard is captured against demo or sanitized data only. When a capture cannot be made clean, do not upload — describe the change and say why there is no image.

Then upload each clean capture with `blob__upload_image` (path under `./screenshots/`). The returned URLs are public and stable.

## 4. Deliver

Compose the table yourself with the Blob URLs:

```markdown
| Before | After |
| --- | --- |
| ![before](<blob-url>) | ![after](<blob-url>) |
```

Put it where the change lives: the PR body (`github__updatePullRequest`) or a PR comment for a shipped change, the conversation otherwise. One table per surface; caption it with the page and viewport when several are captured.
