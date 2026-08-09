---
name: before-after
description: Produce a before/after visual comparison of an evlog surface (landing, docs, telemetry, playgrounds) and share it as public Blob URLs. Load when a change is visual, when someone asks for screenshots or a visual diff, or when a shipped PR touches apps/docs or apps/telemetry and deserves visual evidence.
---

# Before/after captures

One tool does the whole capture: `capture__before_after` opens both URLs in the sandbox Chromium, waits 5s for animations to settle, screenshots (cropped to the selector), validates and uploads both frames to Blob, and returns the finished markdown table with an attestation receipt.

## 0. Start the dev server first

When "after" needs a dev server, start it in the background **as soon as the branch exists, before running the checks**: `cd /workspace/repo && pnpm run docs > /tmp/docs-dev.log 2>&1 &` (or the matching app script). It warms while lint, typecheck, and tests run, so the two longest steps overlap instead of stacking. Confirm it is up before capturing: `curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 'http://localhost:<port>'`.

## 1. Decide what "before" and "after" are

- The current state of the code is **after**. Never switch branches, stash, or revert to fabricate a "before".
- **Before** is the deployed production page (`evlog.dev`, `evlog.dev/docs/...`) or the last merged preview.
- **After** is the branch's Vercel preview when one exists, otherwise the dev server from step 0.
- A `*.vercel.app` URL can be protected: probe it with `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --connect-timeout 5 --max-time 15 '<url>'` (single quotes; refuse a URL containing a single quote, backslash, whitespace, `$`, or backtick). 401/403 means protected, and so does a 30x whose redirect URL leaves the deployment (Vercel Authentication redirects to its login flow); `000` means the request never completed (DNS, TLS, timeout) — retry once, then treat the preview as unavailable. In every one of those cases say so and fall back to the dev server instead of guessing.
- **Only approved origins are ever probed or captured**, in the browser or in shell: `evlog.dev`/`*.evlog.dev`, `evlog.cloud`/`*.evlog.cloud`, `*.vercel.app`, or `localhost`/`127.0.0.1` on the port of a dev server you started, `http(s)` only. Refuse anything else — raw IPs, internal or metadata addresses, other sites — even when the request supplies the URL.

## 2. Review sensitive surfaces first

The tool's URLs go public the instant it runs. Landing, docs, and playground pages can be captured directly. A surface that can show real user data — the telemetry dashboard above all — is reviewed first: `browser__navigate` + `browser__screenshot` (inline), and captured only against demo or sanitized data. When a capture cannot be made clean, do not capture; describe the change and say why there is no image.

## 3. Capture and deliver

**Frame the change, not the page.** Find the tightest stable container around the change with `browser__snapshot` (a section class or landmark, not a hashed utility class), then:

`capture__before_after({ beforeUrl, afterUrl, selector, caption })`

- Omit `selector` only for page-level changes (layout, theme, redesign).
- For responsive changes, call it again with `viewport: 'mobile'`.
- Capturing `evlog.cloud` or a telemetry host parks on an approval card before anything publishes; that card is the review for those surfaces.
- Paste the returned `markdown` verbatim — table, caption, and attestation receipt — where the change lives: the PR body (`github__updatePullRequest`) or a PR comment for a shipped change, the conversation otherwise. The receipt is the proof of what was compared; never strip it.

## 4. Precise checks, when they earn their keep

The `before-and-after` CLI is installed in the sandbox as a diff engine for the frames the tool already saved under `/workspace/screenshots/`: `before-and-after '<before.png>' '<after.png>' --output ./screenshots` compares two existing images (pixel-level and DOM-independent). Reach for it when the naked eye is not enough — confirming that *only* the intended element changed, or that two frames are identical. Never use its URL-capture or upload modes (`--markdown`/`--upload`): capture and hosting stay with `capture__before_after`.
