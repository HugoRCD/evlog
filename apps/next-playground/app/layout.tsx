import type { Metadata } from 'next'
import { EvlogProvider } from 'evlog/next/client'

export const metadata: Metadata = {
  title: 'evlog Next.js Playground',
  description: 'Demonstrating evlog with Next.js App Router',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#09090b', color: '#fafafa' }}>
        <EvlogProvider
          service="next-playground"
          transport={{ enabled: true, endpoint: '/api/evlog/ingest' }}
        >
          {children}
        </EvlogProvider>
      </body>
    </html>
  )
}
