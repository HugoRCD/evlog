import type { SamplingConfig } from '../../types'
import { initLog } from './log'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'

interface EvlogPublicConfig {
  pretty?: boolean
  sampling?: SamplingConfig
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const evlogConfig = config.public?.evlog as EvlogPublicConfig | undefined

  initLog({
    pretty: evlogConfig?.pretty ?? import.meta.dev,
    service: 'client',
    sampling: evlogConfig?.sampling,
  })
})
