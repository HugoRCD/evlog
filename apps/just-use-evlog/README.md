# Just fucking use evlog

Small marketing / showcase site for evlog. Deploy separately from the documentation app.

Uses **Nuxt UI** (`UApp` in `app.vue`) and **`@vercel/analytics/nuxt`**: page views are recorded automatically on Vercel production (no extra config in code). Enable **Web Analytics** on the Vercel project if you have not already.

## Content

- **Nuxt Content** ([docs](https://content.nuxt.com/)): editable copy lives in [`content/landing.md`](content/landing.md) (front matter + Markdown).
- **Comark** ([Nuxt integration](https://comark.dev/integrations/nuxt)): [`LandingComark`](app/components/LandingComark.ts) wraps `defineComarkComponent` with the **Shiki** [`highlight` plugin](https://comark.dev) (same idea as [nuxt-ui-templates/chat](https://github.com/nuxt-ui-templates/chat)) so fenced blocks get proper syntax highlighting. Custom blocks `::landing-demo-resize`, `::landing-demo-buttons`, and `::landing-ctas` are registered there.

The home page is a single **content-first** column: no separate marketing hero or sticky nav — the story, demos, and CTAs all live in Markdown and Comark. The app loads the parsed document from the `landing` collection, turns the minimark body back into Markdown with `minimark/stringify`, then Comark parses and renders it so custom blocks and prose stay aligned with the Comark toolchain.

## Environment

| Variable | Purpose |
|----------|---------|
| `NUXT_PUBLIC_SITE_URL` | Public URL of this deployment (required for correct OG / site config in production; avoid localhost). |
| `NUXT_PUBLIC_DOCS_URL` | Optional override for documentation links (defaults to `https://www.evlog.dev`). |

## Documentation site

On **evlog-docs**, set `NUXT_PUBLIC_JUST_USE_EVLOG_URL` to this app’s production URL so the landing CTA and footer can link to this site (**Just fucking use evlog**).

## Develop

From the monorepo root:

```bash
pnpm run dev:just-use-evlog
```

Or from this directory:

```bash
pnpm run dev
```
