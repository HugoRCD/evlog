import { getAdapter } from './adapters/index'
import { runChecks } from './checks/index'
import { classifySensitivity } from './sensitivity'
import { classifyRouteObservability, gradeFromScore, scoreGlobal, scoreRoute } from './score'
import type { MapFile, RouteEntry, ScanContext, ScanResult } from './types'
import { routeId } from './utils'

/** Extract routes for `ctx.framework`, run observability checks, and score them. */
export async function scan(ctx: ScanContext): Promise<ScanResult> {
  const adapter = getAdapter(ctx.framework)
  const rawRoutes = await adapter.extractRoutes(ctx)

  const routes: RouteEntry[] = rawRoutes.map((raw) => {
    const sensitivity = classifySensitivity(raw, ctx.projectRoot)
    const checks = runChecks(ctx, raw, sensitivity.level)
    const score = scoreRoute(checks)

    return {
      ...raw,
      id: routeId(raw),
      checks,
      sensitivity,
      score,
    }
  })

  const globalScore = scoreGlobal(routes)
  const grade = gradeFromScore(globalScore)

  let instrumented = 0
  let partial = 0
  let dark = 0
  let exempt = 0
  for (const route of routes) {
    const cls = classifyRouteObservability(route)
    if (cls === 'instrumented') instrumented++
    else if (cls === 'partial') partial++
    else if (cls === 'exempt') exempt++
    else dark++
  }

  const map: MapFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    framework: ctx.framework,
    projectName: ctx.projectName,
    score: globalScore,
    routes,
  }

  return {
    map,
    grade,
    summary: { instrumented, partial, dark, exempt },
  }
}
