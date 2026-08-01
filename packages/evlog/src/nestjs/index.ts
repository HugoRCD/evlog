import type { ServerResponse } from 'node:http'
import type { Request } from 'express'
import type { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common'
import type { AuditableLogger } from '../audit'
import { defineFrameworkIntegration } from '../shared/integration'
import type { BaseEvlogOptions } from '../shared/middleware'
import { bindNodeResponseLifecycle } from '../shared/nodeResponse'
import { createLoggerStorage } from '../shared/storage'

const { storage, useLogger } = createLoggerStorage(
  'middleware context. Make sure EvlogModule.forRoot() is imported in your AppModule.',
  'evlog:nestjs',
)

export type EvlogNestJSOptions = BaseEvlogOptions

export { useLogger }

export interface EvlogModuleAsyncOptions {
  /** Modules to import (for dependency injection into the factory) */
  imports?: any[]
  /** Factory function that returns evlog options. Can be async. */
  useFactory: (...args: any[]) => EvlogNestJSOptions | Promise<EvlogNestJSOptions>
  /** Injection tokens to resolve and pass to the factory */
  inject?: any[]
}

declare module 'http' {
  interface IncomingMessage {
    log?: AuditableLogger
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    log?: AuditableLogger
  }
}

const integration = defineFrameworkIntegration<Request>({
  name: 'nestjs',
  extractRequest: (req) => ({
    method: req.method || 'GET',
    path: new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname,
    headers: req.headers,
    requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
  }),
  attachLogger: (req, logger) => {
    req.log = logger
  },
  storage,
})

function createEvlogMiddleware(getOptions: () => EvlogNestJSOptions) {
  return (req: Request, res: ServerResponse, next: () => void) => {
    const { logger, finish, skipped, runWith } = integration.start(req, getOptions())

    if (skipped) {
      next()
      return
    }

    bindNodeResponseLifecycle(res, logger, finish)

    void runWith(() => next())
  }
}

/**
 * NestJS module for evlog wide event logging.
 *
 * Registers a global middleware that creates a request-scoped logger
 * for every incoming request. Use `useLogger()` to access it anywhere
 * in the call stack, or `req.log` directly in controllers.
 *
 * @example
 * ```ts
 * import { Module } from '@nestjs/common'
 * import { EvlogModule } from 'evlog/nestjs'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * @Module({
 *   imports: [
 *     EvlogModule.forRoot({
 *       drain: createAxiomDrain(),
 *       exclude: ['/health'],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export class EvlogModule implements NestModule {

  private static options: EvlogNestJSOptions = {}

  /**
   * Register evlog with static configuration.
   *
   * @example
   * ```ts
   * EvlogModule.forRoot({
   *   drain: createAxiomDrain(),
   *   enrich: (ctx) => { ctx.event.region = process.env.FLY_REGION },
   * })
   * ```
   */
  static forRoot(options: EvlogNestJSOptions = {}): DynamicModule {
    EvlogModule.options = options
    return {
      module: EvlogModule,
      global: true,
    }
  }

  /**
   * Register evlog with async configuration (e.g. from `ConfigService`).
   *
   * @example
   * ```ts
   * EvlogModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     drain: createAxiomDrain({ token: config.get('AXIOM_TOKEN') }),
   *   }),
   * })
   * ```
   */
  static forRootAsync(asyncOptions: EvlogModuleAsyncOptions): DynamicModule {
    return {
      module: EvlogModule,
      imports: asyncOptions.imports || [],
      providers: [
        {
          provide: 'EVLOG_OPTIONS',
          useFactory: async (...args: any[]) => {
            EvlogModule.options = await asyncOptions.useFactory(...args)
            return EvlogModule.options
          },
          inject: asyncOptions.inject || [],
        },
      ],
      global: true,
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(createEvlogMiddleware(() => EvlogModule.options))
      .forRoutes('*')
  }

}
