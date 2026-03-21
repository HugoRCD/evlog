import { testUI } from '../ui'

export function loader() {
  return new Response(testUI(), {
    headers: { 'Content-Type': 'text/html' },
  })
}
