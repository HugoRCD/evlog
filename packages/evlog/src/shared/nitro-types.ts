/**
 * Context passed to Nitro custom error handlers (v2 and v3).
 * @internal
 */
export interface NitroErrorHandlerContext {
  defaultHandler: (
    error: Error,
    event: unknown,
    opts?: { silent?: boolean; json?: boolean },
  ) => Promise<unknown> | unknown
}
