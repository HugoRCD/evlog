import { initLogger, log } from 'evlog'
import { createBrowserLogDrain } from 'evlog/browser'

// Visual feedback
const logList = document.getElementById('log-list')!

function notify(action: string, level: 'info' | 'error' = 'info') {
  const el = document.createElement('div')
  el.className = `log-entry ${level}`
  el.textContent = `${level.toUpperCase()} ${action}`
  logList.prepend(el)
  setTimeout(() => el.remove(), 4000)
}

// Initialize once at app startup
const drain = createBrowserLogDrain({
  drain: { endpoint: '/v1/ingest' },
})
initLogger({ drain })

// Log page view on load
log.info({ action: 'page_view', path: location.pathname, referrer: document.referrer || null })
notify('page_view')

// User clicks "Add to cart"
document.getElementById('add-to-cart')!.addEventListener('click', () => {
  log.info({ action: 'add_to_cart', product: 'T-Shirt', price: 29.99, currency: 'EUR' })
  notify('add_to_cart')
})

// User submits checkout form
document.getElementById('checkout-form')!.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = (document.getElementById('email') as HTMLInputElement).value

  log.info({ action: 'checkout_started', email_provided: !!email })
  notify('checkout_started')

  // Simulate payment failure
  log.error({ action: 'payment_failed', reason: 'card_declined', retry: true })
  notify('payment_failed', 'error')

  await drain.flush()
})
