import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

/* `evlog/nitro/v3` may resolve a different `nitro` version than this example's
 * `nitro-nightly`. Runtime behavior matches; align the module slot for tsc. */
type NitroUserConfig = Parameters<typeof defineConfig>[0]
type NitroModuleSlot = NonNullable<NitroUserConfig['modules']>[number]

export default defineConfig({
  experimental: {
    asyncContext: true,
  },
  modules: [
    evlog({
      env: { service: 'tanstack-start-example' },
    }) as NitroModuleSlot,
  ],
})
