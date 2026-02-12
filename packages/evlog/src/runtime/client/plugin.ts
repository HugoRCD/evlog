import type { TransportConfig } from '../../types'
import { initLog } from './log'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'

interface EvlogPublicConfig {
  enabled?: boolean
  pretty?: boolean
  transport?: TransportConfig
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const evlogConfig = config.public?.evlog as EvlogPublicConfig | undefined

  initLog({
    enabled: evlogConfig?.enabled,
    pretty: evlogConfig?.pretty ?? import.meta.dev,
    service: 'client',
    transport: evlogConfig?.transport,
  })
})
