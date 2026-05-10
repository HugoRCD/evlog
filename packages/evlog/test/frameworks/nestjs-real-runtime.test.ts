import { Controller, Get } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initLogger } from '../../src/logger'
import { EvlogModule, useLogger } from '../../src/nestjs/index'
import {
  assertHttpEventEmitted,
  createPipelineSpies,
  findEventViaDrain,
  waitForDrainCalls,
} from '../helpers/framework'

/**
 * Stress test: boot a real NestJS app with NestFactory's Express adapter,
 * register `EvlogModule.forRoot()`, fire HTTP requests through supertest, and
 * assert the drain pipeline runs end-to-end. Catches DI/middleware-pipeline
 * regressions that the mock `consumer.apply()` test cannot.
 *
 * Kept separate from `nestjs.test.ts` because booting a real Nest app is ~5x
 * slower than driving the middleware directly.
 */
@Controller()
class TestController {

  @Get('/api/users')
  users() {
    return { users: [] }
  }

  @Get('/api/me')
  me() {
    useLogger().set({ user: { id: 'u-1' } })
    return { ok: true }
  }

  @Get('/api/fail')
  fail() {
    throw new Error('boom from nestjs handler')
  }

}

async function bootApp(options: Parameters<typeof EvlogModule.forRoot>[0] = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [EvlogModule.forRoot(options)],
    controllers: [TestController],
  }).compile()

  const app = moduleRef.createNestApplication()
  await app.init()
  return app
}

describe('evlog/nestjs (real NestJS runtime)', () => {
  let app: INestApplication | undefined

  beforeEach(() => {
    initLogger({ env: { service: 'nestjs-real-test' }, pretty: false })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
    vi.restoreAllMocks()
  })

  it('runs the middleware through NestFactory and emits a wide event', async () => {
    const { drain } = createPipelineSpies()
    app = await bootApp({ drain })

    const res = await request(app.getHttpServer()).get('/api/users')
    expect(res.status).toBe(200)
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, {
      path: '/api/users',
      method: 'GET',
      status: 200,
      level: 'info',
    })
  })

  it('uses NestJS DI: useLogger() inside a controller resolves the request logger', async () => {
    const { drain } = createPipelineSpies()
    app = await bootApp({ drain })

    const res = await request(app.getHttpServer()).get('/api/me')
    expect(res.status).toBe(200)
    await waitForDrainCalls(drain)

    const event = findEventViaDrain(drain, e => e.path === '/api/me')
    expect(event).toBeDefined()
    expect((event!.user as { id: string }).id).toBe('u-1')
  })

  it('drains the wide event with status 500 when a controller throws', async () => {
    // Realism note: NestJS's exception filter intercepts the throw before
    // evlog's middleware sees a `req.log.error()` call, so the wide event
    // carries status=500 but level stays 'info' (evlog does not auto-promote
    // level from status alone). Apps that want level='error' should call
    // `req.log.error(err)` from a NestJS exception filter.
    const { drain } = createPipelineSpies()
    app = await bootApp({ drain })

    const res = await request(app.getHttpServer()).get('/api/fail')
    expect(res.status).toBe(500)
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, { path: '/api/fail', status: 500 })
  })

  it('respects NestJS x-request-id pass-through', async () => {
    const { drain } = createPipelineSpies()
    app = await bootApp({ drain })

    await request(app.getHttpServer())
      .get('/api/users')
      .set('x-request-id', 'real-nest-req')
    await waitForDrainCalls(drain)

    const event = findEventViaDrain(drain, e => e.path === '/api/users')
    expect(event).toBeDefined()
    expect(event!.requestId).toBe('real-nest-req')
  })
})
