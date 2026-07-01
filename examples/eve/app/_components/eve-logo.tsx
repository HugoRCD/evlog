import { cn } from '@/lib/utils'

type EveLogoProps = {
  readonly className?: string
  readonly size?: number
}

/** eve mark — vector paths from vercel/eve, transparent background, currentColor fill. */
export function EveLogo({ className, size = 32 }: EveLogoProps) {
  return (
    <svg
      aria-label="eve"
      className={cn('shrink-0', className)}
      fill="none"
      height={size}
      role="img"
      viewBox="0 0 102 102"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M49.2811 66.9377L75.0311 34.9622H68.1393L47.9096 60.1058L42.4236 66.9377H49.2811Z" fill="currentColor" />
      <path d="M0 34.9622H42.4048V40.0704H0V34.9622Z" fill="currentColor" />
      <rect fill="currentColor" height="5.10824" width="27.6587" y="48.2844" />
      <rect fill="currentColor" height="5.10824" width="27.6588" y="61.816" />
      <rect fill="currentColor" height="5.10824" transform="matrix(-1 0 0 1 101.9 34.9622)" width="32.2696" />
      <rect fill="currentColor" height="5.10824" transform="matrix(-1 0 0 1 101.9 48.2844)" width="27.6587" />
      <rect fill="currentColor" height="5.10824" transform="matrix(-1 0 0 1 101.9 61.816)" width="27.6588" />
    </svg>
  )
}
