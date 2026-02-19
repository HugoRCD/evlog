import type { Metadata } from 'next'
import { EvlogProvider } from 'evlog/next/client'

export const metadata: Metadata = {
  title: 'evlog Next.js Example',
  description: 'evlog with Next.js App Router',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <EvlogProvider
          service="nextjs-example"
          transport={{ enabled: true, endpoint: '/api/evlog/ingest' }}
        >
          {children}
        </EvlogProvider>
      </body>
    </html>
  )
}
