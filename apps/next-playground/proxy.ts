import { evlogMiddleware } from 'evlog/next'

export const proxy = evlogMiddleware()

export const config = {
  matcher: ['/api/:path*'],
}
