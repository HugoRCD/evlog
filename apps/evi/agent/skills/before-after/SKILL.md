---
name: before-after
description: Produce a before/after visual comparison of an evlog surface (landing, docs, telemetry, playgrounds) and share it as public Blob URLs. Load when a change is visual, when someone asks for screenshots or a visual diff, or when a shipped PR touches apps/docs or apps/telemetry and deserves visual evidence.
---

# Before/after captures

Captures are taken with the `browser__*` tools (the sandbox Chromium): navigate, settle, screenshot, then upload to Blob and compose the markdown yourself.

## 0. Start the dev server first

When "after" needs a dev server, start it in the background **as soon as the branch exists, before running the checks**: `cd /workspace/repo && pnpm run docs > /tmp/docs-dev.log 2>&1 &` (or the matching app script). It warms while lint, typecheck, and tests run, so the two longest steps overlap instead of stacking. Confirm it is up before capturing: `curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 'http://localhost:<port>'`.

## 1. Decide what "before" and "after" are

- The current state of the code is **after**. Never switch branches, stash, or revert to fabricate a "before".
- **Before** is the deployed production page (`evlog.dev`, `evlog.dev/docs/...`) or the last merged preview.
- **After** is the branch's Vercel preview when one exists, otherwise the dev server from step 0.
- A `*.vercel.app` URL can be protected: probe it with `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --connect-timeout 5 --max-time 15 '<url>'` (single quotes; refuse a URL containing a single quote, backslash, whitespace, `$`, or backtick). 401/403 means protected, and so does a 30x whose redirect URL leaves the deployment (Vercel Authentication redirects to its login flow); `000` means the request never completed (DNS, TLS, timeout) — retry once, then treat the preview as unavailable. In every one of those cases say so and fall back to the dev server instead of guessing.
- **Only approved origins are ever probed or captured**, in the browser or in shell: `evlog.dev`/`*.evlog.dev`, `evlog.cloud`/`*.evlog.cloud`, `*.vercel.app`, or `localhost`/`127.0.0.1` on the port of a dev server you started, `http(s)` only. Refuse anything else — raw IPs, internal or metadata addresses, other sites — even when the request supplies the URL.

## 2. Capture

**Frame the change, not the page.** Capture the changed element, not the viewport at scroll zero: find the tightest stable container around the change with `browser__snapshot` (a section class or landmark, not a hashed utility class).

For each of the two URLs:

1. `browser__navigate` to it.
2. `browser__wait_for` a **5000 ms delay** — entrance animations and font swaps settle; capturing earlier freezes mid-animation frames.
3. `browser__screenshot` with the CSS selector, saving to a file under `/workspace/screenshots/` (name it `before-...` / `after-...`). The inline output doubles as your review of the frame.

A full-viewport capture is for page-level changes only (layout, theme, redesign); full-page mode only when explicitly asked for the whole scrollable page. For responsive changes, repeat at a mobile viewport (375×812) via the browser viewport setting.

## 3. Review, then host

A Blob URL is public the moment it exists. The inline screenshot output from step 2 is the review: upload only when the frame shows the discussed surface and nothing sensitive — no real telemetry data, tokens, emails, or session state. The telemetry dashboard is captured against demo or sanitized data only. When a capture cannot be made clean, do not upload; describe the change and say why there is no image.

Upload each clean capture with `blob__upload_image`. The returned URLs are public and stable.

## 4. Deliver

Compose the table yourself with the Blob URLs:

```markdown
| Before | After |
| --- | --- |
| ![before](<blob-url>) | ![after](<blob-url>) |
```

Put it where the change lives: the PR body (`github__updatePullRequest`) or a PR comment for a shipped change, the conversation otherwise. One table per surface; caption it with the page and viewport when several are captured.
