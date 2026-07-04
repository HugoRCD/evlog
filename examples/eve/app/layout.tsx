import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import './globals.css'

const sans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
})

const mono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Clearbill Support — evlog × eve',
  description: 'Support refund demo: one evlog wide event per agent turn with customer, order, and audit context.',
  icons: { icon: '/eve-logo.svg', apple: '/eve-logo.svg' },
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html className={cn(sans.variable, mono.variable, "dark")} lang="en">
      <body className="bg-[#0c0c0c] antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
