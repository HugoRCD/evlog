import { log } from 'evlog'

export function chargeUser(userId: string, amount: number) {
  log.info({ action: 'charge', userId, amount })
  log.debug({ step: 'card_validation', userId })
  return { success: true, transactionId: 'txn_abc123' }
}
