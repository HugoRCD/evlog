import type { RequestLogger } from 'evlog'

declare global {
  namespace App {
    interface Locals {
      log: RequestLogger
    }
  }
}

export {}
