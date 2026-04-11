import type { LogLevel, TransportConfig } from '../../types'
import { initLog } from './log'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'

interface EvlogPublicConfig {
  enabled?: boolean
  console?: boolean
  pretty?: boolean
  minLevel?: LogLevel
  transport?: TransportConfig
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const evlogConfig = config.public?.evlog as EvlogPublicConfig | undefined

  initLog({
    enabled: evlogConfig?.enabled,
    console: evlogConfig?.console,
    pretty: evlogConfig?.pretty ?? import.meta.dev,
    minLevel: evlogConfig?.minLevel,
    service: 'client',
    transport: evlogConfig?.transport,
  })
})
