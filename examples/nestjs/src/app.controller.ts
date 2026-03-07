import { Catch, Controller, Get, Header, Param, UseFilters } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { createError, parseError } from 'evlog'
import { useLogger } from 'evlog/nestjs'
import { testUI } from './ui'

function findUserWithOrders(userId: string) {
  const log = useLogger()

  log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  return { user, orders }
}

@Catch()
class EvlogExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()
    const error = exception instanceof Error ? exception : new Error(String(exception))

    try {
      useLogger().error(error)
    }
    catch {}

    const parsed = parseError(error)
    response.status(parsed.status).json({
      message: parsed.message,
      why: parsed.why,
      fix: parsed.fix,
      link: parsed.link,
    })
  }
}

@Controller()
@UseFilters(new EvlogExceptionFilter())
export class AppController {
  @Get()
  @Header('Content-Type', 'text/html')
  root() {
    return testUI()
  }

  @Get('health')
  health() {
    const log = useLogger()
    log.set({ route: 'health' })
    return { ok: true }
  }

  @Get('users/:id')
  findUser(@Param('id') id: string) {
    return findUserWithOrders(id)
  }

  @Get('checkout')
  checkout() {
    throw createError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined by issuer',
      fix: 'Try a different card or payment method',
      link: 'https://docs.example.com/payments/declined',
    })
  }
}
