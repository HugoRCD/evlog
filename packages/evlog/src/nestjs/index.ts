import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common'
import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext } from '../types'
import { createMiddlewareLogger } from '../shared/middleware'
import { extractSafeNodeHeaders } from '../shared/headers'

const storage = new AsyncLocalStorage<RequestLogger>()

export interface EvlogNestJSOptions {
  /** Route patterns to include in logging (glob). If not set, all routes are logged */
  include?: string[]
  /** Route patterns to exclude from logging. Exclusions take precedence over inclusions */
  exclude?: string[]
  /** Route-specific service configuration */
  routes?: Record<string, RouteConfig>
  /**
   * Drain callback called with every emitted event.
   * Use with drain adapters (Axiom, OTLP, Sentry, etc.) or custom endpoints.
   */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /**
   * Enrich callback called after emit, before drain.
   * Use to add derived context (geo, deployment info, user agent, etc.).
   */
  enrich?: (ctx: EnrichContext) => void | Promise<void>
  /**
   * Custom tail sampling callback.
   * Set `ctx.shouldKeep = true` to force-keep the log regardless of head sampling.
   */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
}

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
    log: RequestLogger
  }
}

/**
 * Get the request-scoped logger from anywhere in the call stack.
 * Must be called inside a request handled by the `EvlogModule` middleware.
 *
 * @example
 * ```ts
 * import { Injectable } from '@nestjs/common'
 * import { useLogger } from 'evlog/nestjs'
 *
 * @Injectable()
 * export class UsersService {
 *   findUser(id: string) {
 *     const log = useLogger()
 *     log.set({ user: { id } })
 *   }
 * }
 * ```
 */
export function useLogger<T extends object = Record<string, unknown>>(): RequestLogger<T> {
  const logger = storage.getStore()
  if (!logger) {
    throw new Error(
      '[evlog] useLogger() was called outside of an evlog middleware context. '
      + 'Make sure EvlogModule.forRoot() is imported in your AppModule.',
    )
  }
  return logger as RequestLogger<T>
}

function createEvlogMiddleware(options: EvlogNestJSOptions) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const headers = extractSafeNodeHeaders(req.headers)
    const url = new URL(req.url || '/', 'http://localhost')

    const { logger, finish, skipped } = createMiddlewareLogger({
      method: req.method || 'GET',
      path: url.pathname,
      requestId: headers['x-request-id'] || crypto.randomUUID(),
      headers,
      ...options,
    })

    if (skipped) {
      next()
      return
    }

    req.log = logger

    res.on('finish', () => {
      finish({ status: res.statusCode }).catch(() => {})
    })

    storage.run(logger, () => next())
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
      .apply(createEvlogMiddleware(EvlogModule.options))
      .forRoutes('*')
  }

}
