/** Fake support CRM data for the evlog × eve demo — no external API. */

export interface SupportCustomer {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly plan: 'starter' | 'pro' | 'enterprise'
  readonly mrr: number
  readonly status: 'active' | 'past_due'
}

export interface SupportOrder {
  readonly id: string
  readonly customerSlug: string
  readonly amount: number
  readonly currency: 'USD'
  readonly status: 'paid' | 'refunded' | 'disputed'
  readonly product: string
  readonly paidAt: string
}

export const CUSTOMERS: Record<string, SupportCustomer> = {
  'acme-corp': {
    id: 'cust_8f2a',
    slug: 'acme-corp',
    name: 'Acme Corp',
    plan: 'enterprise',
    mrr: 2400,
    status: 'active',
  },
  'startup-inc': {
    id: 'cust_3b91',
    slug: 'startup-inc',
    name: 'Startup Inc',
    plan: 'pro',
    mrr: 49,
    status: 'active',
  },
}

export const ORDERS: Record<string, SupportOrder> = {
  '4821': {
    id: '4821',
    customerSlug: 'acme-corp',
    amount: 890,
    currency: 'USD',
    status: 'paid',
    product: 'Enterprise — annual add-on (5 seats)',
    paidAt: '2026-06-18T14:22:00Z',
  },
  '1102': {
    id: '1102',
    customerSlug: 'startup-inc',
    amount: 49,
    currency: 'USD',
    status: 'paid',
    product: 'Pro — monthly',
    paidAt: '2026-06-01T09:05:00Z',
  },
}

export function findCustomer(input: string): SupportCustomer | undefined {
  const normalized = input.trim().toLowerCase()
  return CUSTOMERS[normalized]
    ?? Object.values(CUSTOMERS).find(
      c => c.id === normalized || c.name.toLowerCase() === normalized,
    )
}

export function findOrder(orderId: string): SupportOrder | undefined {
  return ORDERS[orderId.trim()]
}
