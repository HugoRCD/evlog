import { getRequestURL, setResponseHeader, setResponseStatus } from 'h3'

/**
 * Short-circuit common bot/scanner probe paths with a plain 404.
 *
 * These URLs do not exist on the docs site. Without this middleware, Docus SSR
 * runs a full content query + Vue render for each probe hit.
 */
const PROBE_PATHS = new Set([
  'about',
  'about-us',
  'company',
  'contact',
  'contact-us',
  'contacto',
  'contactus',
  'contato',
  'contatti',
  'en/contact',
  'es/contacto',
  'get-in-touch',
  'help',
  'impressum',
  'kontakt',
  'legal',
  'nosotros',
  'pricing',
  'privacy',
  'reach-us',
  'sobre-nosotros',
  'support',
  'team',
  'terms',
])

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  const normalized = pathname.replace(/\/$/, '').slice(1).toLowerCase()

  if (!normalized || !PROBE_PATHS.has(normalized)) {
    return
  }

  setResponseStatus(event, 404, 'Not Found')
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return 'Not Found'
})
