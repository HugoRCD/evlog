'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type DemoUser = {
  id: string
  name: string
  email: string
  tier: 'free' | 'pro'
}

type DemoProduct = {
  id: string
  name: string
  category: string
  description: string
  priceCents: number
}

type CartResponse = {
  items: Array<{
    productId: string
    quantity: number
    lineTotal: string
    lineTotalCents: number
    product: DemoProduct
  }>
  total: string
  totalCents: number
}

type OrdersResponse = {
  orders: Array<{
    id: string
    total: string
    paymentMethod: string
    createdAt: string
  }>
}

type SessionResponse = {
  authenticated: boolean
  user: DemoUser | null
  users: DemoUser[]
}

function price(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`
}

export function ShopClient() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Ready')
  const [users, setUsers] = useState<DemoUser[]>([])
  const [user, setUser] = useState<DemoUser | null>(null)
  const [products, setProducts] = useState<DemoProduct[]>([])
  const [cart, setCart] = useState<CartResponse>({ items: [], total: '0.00 EUR', totalCents: 0 })
  const [orders, setOrders] = useState<OrdersResponse['orders']>([])
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'declined-card'>('card')

  const authenticated = !!user

  const loadProducts = useCallback(async () => {
    const response = await fetch('/api/products')
    const data = await response.json() as { products: DemoProduct[] }
    setProducts(data.products)
  }, [])

  const loadSession = useCallback(async () => {
    const response = await fetch('/api/me')
    const data = await response.json() as SessionResponse
    setUsers(data.users)
    setUser(data.user)
    return data
  }, [])

  const loadUserData = useCallback(async () => {
    if (!authenticated) {
      setCart({ items: [], total: '0.00 EUR', totalCents: 0 })
      setOrders([])
      return
    }

    const [cartResponse, ordersResponse] = await Promise.all([
      fetch('/api/cart'),
      fetch('/api/orders'),
    ])
    const cartData = await cartResponse.json() as CartResponse
    const ordersData = await ordersResponse.json() as OrdersResponse
    setCart(cartData)
    setOrders(ordersData.orders)
  }, [authenticated])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await loadProducts()
      const session = await loadSession()
      if (session.authenticated) {
        const [cartResponse, ordersResponse] = await Promise.all([
          fetch('/api/cart'),
          fetch('/api/orders'),
        ])
        setCart(await cartResponse.json() as CartResponse)
        setOrders((await ordersResponse.json() as OrdersResponse).orders)
      } else {
        setCart({ items: [], total: '0.00 EUR', totalCents: 0 })
        setOrders([])
      }
      setMessage('Demo data loaded')
    } catch (error) {
      setMessage(`Failed to load demo: ${String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [loadProducts, loadSession])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!loading) {
      void loadUserData()
    }
  }, [authenticated, loading, loadUserData])

  async function login(userId: string) {
    setBusy(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message ?? 'Login failed')
      }
      const data = await response.json() as { user: DemoUser }
      setUser(data.user)
      setMessage(`Logged in as ${data.user.name}`)
      await loadUserData()
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setCart({ items: [], total: '0.00 EUR', totalCents: 0 })
      setOrders([])
      setMessage('Logged out')
    } finally {
      setBusy(false)
    }
  }

  async function addProduct(productId: string) {
    if (!authenticated) {
      setMessage('Login first to add products')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, quantity: 1 }),
      })
      const data = await response.json() as CartResponse & { message?: string }
      if (!response.ok) {
        throw new Error(data.message ?? 'Cannot add product')
      }
      setCart(data)
      setMessage('Product added to cart')
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  async function checkout() {
    if (!authenticated) {
      setMessage('Login first to checkout')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      })
      const data = await response.json() as {
        orderId?: string
        total?: string
        message?: string
        why?: string
      }

      if (!response.ok) {
        const reason = data.why ? ` (${data.why})` : ''
        throw new Error(`${data.message ?? 'Checkout failed'}${reason}`)
      }

      setMessage(`Order ${data.orderId} created for ${data.total}`)
      await loadUserData()
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const cartCount = useMemo(
    () => cart.items.reduce((sum, item) => sum + item.quantity, 0),
    [cart.items],
  )

  return (
    <main>
      <header className="panel">
        <h1>evlog Shop (Next.js)</h1>
        <p>
          Interactive demo: login as a user, add products, checkout, and inspect logs in terminal.
        </p>
        <div className="status-row">
          <span className="pill">{loading ? 'Loading...' : 'Ready'}</span>
          <span className="pill">Cart: {cartCount} item(s)</span>
          <span className="pill">Total: {price(cart.totalCents)}</span>
        </div>
        <p className="message">{message}</p>
      </header>

      <section className="panel">
        <h2>1. Session</h2>
        {authenticated && user
          ? (
              <div className="session-card">
                <div>
                  <strong>{user.name}</strong>
                  <p>{user.email} - {user.tier}</p>
                </div>
                <button disabled={busy} onClick={() => void logout()} type="button">
                  Logout
                </button>
              </div>
            )
          : (
              <div className="button-grid">
                {users.map(candidate => (
                  <button
                    key={candidate.id}
                    disabled={busy}
                    onClick={() => void login(candidate.id)}
                    type="button"
                  >
                    Login as {candidate.name}
                  </button>
                ))}
              </div>
            )}
      </section>

      <section className="panel">
        <h2>2. Product Catalog</h2>
        <div className="product-grid">
          {products.map(product => (
            <article className="product-card" key={product.id}>
              <p className="product-category">{product.category}</p>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="product-footer">
                <strong>{price(product.priceCents)}</strong>
                <button
                  disabled={busy || !authenticated}
                  onClick={() => void addProduct(product.id)}
                  type="button"
                >
                  Add to cart
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel two-columns">
        <div>
          <h2>3. Cart</h2>
          {cart.items.length === 0
            ? <p>No items yet.</p>
            : (
                <ul className="line-list">
                  {cart.items.map(item => (
                    <li key={item.productId}>
                      <span>{item.product.name} x{item.quantity}</span>
                      <strong>{item.lineTotal}</strong>
                    </li>
                  ))}
                </ul>
              )}
          <p className="totals">Total: {cart.total}</p>
        </div>

        <div>
          <h2>4. Checkout</h2>
          <label htmlFor="payment-method">Payment scenario</label>
          <select
            id="payment-method"
            onChange={event => setPaymentMethod(event.target.value as 'card' | 'declined-card')}
            value={paymentMethod}
          >
            <option value="card">Card (success)</option>
            <option value="declined-card">Declined card (error path)</option>
          </select>

          <button disabled={busy || !authenticated} onClick={() => void checkout()} type="button">
            Run checkout
          </button>
          <p className="hint">
            Use the declined-card mode to see structured error behavior in a real UI flow.
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>Recent Orders</h2>
        {orders.length === 0
          ? <p>No orders yet.</p>
          : (
              <ul className="line-list">
                {orders.map(order => (
                  <li key={order.id}>
                    <span>{order.id} - {new Date(order.createdAt).toLocaleTimeString()}</span>
                    <strong>{order.total}</strong>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </main>
  )
}
