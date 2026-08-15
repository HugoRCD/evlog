import { isDbConfigured } from '../db'

/** Ships dark; flipping the flag off is the whole rollback. */
export function memoryEnabled(): boolean {
  return process.env.EVI_MEMORY_ENABLED === '1'
}

export function memoryAvailable(): boolean {
  return memoryEnabled() && isDbConfigured()
}
