import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('health', 'routes/health.tsx'),
  route('users/:id', 'routes/users.$id.tsx'),
  route('checkout', 'routes/checkout.tsx'),
] satisfies RouteConfig
