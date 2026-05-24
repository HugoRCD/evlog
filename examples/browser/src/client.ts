import { initLogger, log } from 'evlog'
import { createHttpLogDrain } from 'evlog/http'

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el
}

function requireInput(id: string): HTMLInputElement {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement)) throw new Error(`Missing input #${id}`)
  return el
}

// Visual feedback
const logList = requireElement('log-list')

function notify(action: string, level: 'info' | 'error' = 'info') {
  const el = document.createElement('div')
  el.className = `log-entry ${level}`
  el.textContent = `${level.toUpperCase()} ${action}`
  logList.prepend(el)
  setTimeout(() => el.remove(), 4000)
}

// Initialize once at app startup
const drain = createHttpLogDrain({
  drain: { endpoint: '/v1/ingest' },
})
initLogger({ drain })

// Log page view on load
log.info({ action: 'page_view', path: location.pathname, referrer: document.referrer || null })
notify('page_view')

// User clicks "Add to cart"
requireElement('add-to-cart').addEventListener('click', () => {
  log.info({ action: 'add_to_cart', product: 'T-Shirt', price: 29.99, currency: 'EUR' })
  notify('add_to_cart')
})

// User submits checkout form
requireElement('checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = requireInput('email').value

  log.info({ action: 'checkout_started', email_provided: !!email })
  notify('checkout_started')

  // Simulate payment failure
  log.error({ action: 'payment_failed', reason: 'card_declined', retry: true })
  notify('payment_failed', 'error')

  await drain.flush()
})
