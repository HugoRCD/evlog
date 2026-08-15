import { isDbConfigured } from '../db'

/**
 * Memory ships dark. The flag is what turns it on once the first rows have been
 * looked at, and flipping it off is the whole rollback.
 */
export function memoryEnabled(): boolean {
  return process.env.EVI_MEMORY_ENABLED === '1'
}

export function memoryAvailable(): boolean {
  return memoryEnabled() && isDbConfigured()
}
