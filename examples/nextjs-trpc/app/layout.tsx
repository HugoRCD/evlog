import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'evlog Next.js tRPC Example',
  description: 'evlog with Next.js App Router + tRPC',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
