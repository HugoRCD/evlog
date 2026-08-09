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
- A `*.vercel.app` URL can be protected: `curl -s -o /dev/null -w "%{http_code}" "<url>"` — 401/403 means protected; say so and fall back to the local dev server instead of guessing.

## 2. Capture

```bash
before-and-after "<before-url>" "<after-url>" --output ./screenshots
```

- Target a component with a CSS selector: `before-and-after url1 url2 ".hero"` (or two selectors when the markup changed: `".old" ".new"`).
- Viewports: `--mobile` (375×812), `--tablet` (768×1024), `--size 1920x1080`. Add mobile when the change affects responsive layout.
- `--full` only when explicitly asked for the full scrollable page.
- **Never use `--markdown` or `--upload`**: their default upload target is a public third-party host. Hosting goes through Blob, below.

## 3. Host

Upload each capture with `blob__upload_image` (path under `./screenshots/`). The returned URLs are public and stable.

## 4. Deliver

Compose the table yourself with the Blob URLs:

```markdown
| Before | After |
| --- | --- |
| ![before](<blob-url>) | ![after](<blob-url>) |
```

Put it where the change lives: the PR body (`github__updatePullRequest`) or a PR comment for a shipped change, the conversation otherwise. One table per surface; caption it with the page and viewport when several are captured.
