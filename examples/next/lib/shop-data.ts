export type DemoUser = {
  id: string
  name: string
  email: string
  tier: 'free' | 'pro'
}

export type DemoProduct = {
  id: string
  name: string
  category: string
  description: string
  priceCents: number
}

export type CartLine = {
  productId: string
  quantity: number
}

export type Order = {
  id: string
  userId: string
  lines: CartLine[]
  totalCents: number
  paymentMethod: 'card' | 'declined-card'
  createdAt: string
}

const users: DemoUser[] = [
  { id: 'usr_alice', name: 'Alice Martin', email: 'alice@demo.dev', tier: 'pro' },
  { id: 'usr_bob', name: 'Bob Leroy', email: 'bob@demo.dev', tier: 'free' },
]

const products: DemoProduct[] = [
  {
    id: 'sku_hoodie',
    name: 'evlog Hoodie',
    category: 'Apparel',
    description: 'Heavy cotton hoodie with embroidered evlog mark.',
    priceCents: 6900,
  },
  {
    id: 'sku_mug',
    name: 'Observability Mug',
    category: 'Accessories',
    description: 'Ceramic mug for long debugging sessions.',
    priceCents: 2400,
  },
  {
    id: 'sku_notebook',
    name: 'Wide Events Notebook',
    category: 'Stationery',
    description: 'Hardcover notebook for incident notes.',
    priceCents: 1800,
  },
]

const carts = new Map<string, CartLine[]>()
const orders = new Map<string, Order[]>()

export function listUsers(): DemoUser[] {
  return users
}

export function getUserById(id: string): DemoUser | undefined {
  return users.find((user) => user.id === id)
}

export function listProducts(): DemoProduct[] {
  return products
}

export function getProductById(id: string): DemoProduct | undefined {
  return products.find((product) => product.id === id)
}

export function getCart(userId: string): CartLine[] {
  return carts.get(userId) ?? []
}

export function setCart(userId: string, lines: CartLine[]): void {
  carts.set(userId, lines)
}

export function addToCart(userId: string, productId: string, quantity: number): CartLine[] {
  const lines = [...getCart(userId)]
  const existing = lines.find((line) => line.productId === productId)

  if (existing) {
    existing.quantity += quantity
  } else {
    lines.push({ productId, quantity })
  }

  setCart(userId, lines)
  return lines
}

export function clearCart(userId: string): void {
  carts.delete(userId)
}

export function listOrders(userId: string): Order[] {
  return orders.get(userId) ?? []
}

export function createOrder(input: {
  userId: string
  lines: CartLine[]
  paymentMethod: 'card' | 'declined-card'
}): Order {
  const totalCents = input.lines.reduce((total, line) => {
    const product = getProductById(line.productId)
    return total + (product ? product.priceCents * line.quantity : 0)
  }, 0)

  const order: Order = {
    id: `ord_${Math.random().toString(36).slice(2, 10)}`,
    userId: input.userId,
    lines: input.lines,
    totalCents,
    paymentMethod: input.paymentMethod,
    createdAt: new Date().toISOString(),
  }

  const userOrders = listOrders(input.userId)
  orders.set(input.userId, [order, ...userOrders])
  return order
}

export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`
}
