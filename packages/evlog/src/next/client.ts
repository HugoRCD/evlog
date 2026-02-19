'use client'

import { useEffect } from 'react'
import type { TransportConfig } from '../types'
import { initLog, log, setIdentity, clearIdentity } from '../runtime/client/log'

export { log, setIdentity, clearIdentity } from '../runtime/client/log'

export interface EvlogProviderProps {
  /**
   * Service name for client-side logs.
   * @default 'client'
   */
  service?: string

  /**
   * Enable pretty printing in the browser console.
   * @default true
   */
  pretty?: boolean

  /**
   * Transport configuration for sending client logs to the server.
   */
  transport?: TransportConfig

  /**
   * Enable or disable client-side logging.
   * @default true
   */
  enabled?: boolean

  children: React.ReactNode
}

/**
 * React provider that initializes evlog client-side logging.
 * Place this in your root layout to enable client logging throughout your app.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { EvlogProvider } from 'evlog/next/client'
 *
 * export default function Layout({ children }) {
 *   return (
 *     <EvlogProvider service="my-app" transport={{ enabled: true }}>
 *       {children}
 *     </EvlogProvider>
 *   )
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function EvlogProvider({ service, pretty, transport, enabled, children }: EvlogProviderProps) {
  useEffect(() => {
    initLog({
      enabled,
      pretty,
      service,
      transport,
    })
  }, [enabled, pretty, service, transport])

  return children
}
