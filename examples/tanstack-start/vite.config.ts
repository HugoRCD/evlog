import { defineConfig, type UserConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/* Plugins come from packages that bundle their own Vite typings (TanStack devtools,
 * nitro/rolldown, etc.). In a workspace, those are nominally different from this
 * app's `vite` — assert once here instead of drowning in TS2769 chains. */
const plugins = [
  devtools(),
  nitro({ rollupConfig: { external: [/^@sentry\//] } }),
  tsconfigPaths({ projects: ['./tsconfig.json'] }),
  tailwindcss(),
  tanstackStart(),
  viteReact(),
] as UserConfig['plugins']

export default defineConfig({ plugins })
