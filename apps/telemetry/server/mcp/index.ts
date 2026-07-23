/**
 * Overrides the default `/mcp` handler with soft Bearer auth — tools/resources
 * under `server/mcp/tools/` still auto-attach via the folder convention.
 *
 * Never throws 401: most MCP clients treat a 401 on the MCP route as "this
 * server requires OAuth" and stop the regular flow. Return 403 for a hard
 * rejection instead, and let `isMcpRequestAuthorized()` fall through
 * unauthenticated when `ANALYTICS_PASSWORD` isn't set — same ergonomics as
 * the rest of the dashboard.
 */
export default defineMcpHandler({
  middleware: (event) => {
    if (!isMcpRequestAuthorized(getHeader(event, 'authorization'))) {
      throw telemetryErrors.MCP_UNAUTHORIZED()
    }
  },
})
