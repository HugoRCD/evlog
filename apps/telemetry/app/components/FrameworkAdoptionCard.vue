<script setup lang="ts">
/**
 * Which framework people install, and which one they keep scanning.
 *
 * Two commands report a framework and they answer different questions: `init`
 * is what somebody set up, `map` is what they still run afterwards. Merging
 * them into one number hides the interesting case — a framework people install
 * and never come back to — so both are shown per row, and the total only
 * decides the ordering.
 */
const props = defineProps<{
  dimensions: FieldStat[]
  frameworks: string[]
  points: VersionAdoptionPoint[]
  granularity: TimelineGranularity
}>()

function statFor(key: string) {
  return props.dimensions.find(dimension => dimension.key === key)
}

function countIn(key: string, framework: string) {
  return statFor(key)?.values.find(value => value.value === framework)?.count ?? 0
}

/** Every framework either command saw, ordered by combined volume. */
const rows = computed(() => {
  const ids = new Set(
    FRAMEWORK_FIELD_KEYS.flatMap(key => statFor(key)?.values.map(value => value.value) ?? []),
  )

  return [...ids]
    .map(id => ({
      id,
      label: frameworkLabel(id),
      icon: frameworkIcon(id),
      color: frameworkColor(id),
      installed: countIn('initFramework', id),
      scanned: countIn('mapFramework', id),
    }))
    .map(row => ({ ...row, total: row.installed + row.scanned }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
})

const busiest = computed(() => Math.max(0, ...rows.value.map(row => row.total)))
const totalRuns = computed(() => rows.value.reduce((sum, row) => sum + row.total, 0))

function shareOf(count: number) {
  return totalRuns.value > 0 ? Math.round(percentageOf(count, totalRuns.value)) : 0
}

const categories = computed<Record<string, BulletLegendItemInterface>>(() =>
  Object.fromEntries(props.frameworks.map(framework => [
    framework,
    { name: frameworkLabel(framework), color: frameworkColor(framework) },
  ])),
)

interface FrameworkRow {
  label: string
  [framework: string]: string | number
}

const data = computed<FrameworkRow[]>(() => props.points.map(point => ({
  label: formatBucket(point.bucket, props.granularity),
  ...point.counts,
})))

const chartLabels = computed(() => data.value.map(point => point.label))
const xNumTicks = computed(() => bucketTickCount(data.value.length))

function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.label ?? ''
}

const hasTimeline = computed(() =>
  props.frameworks.length > 0
  && props.points.some(point => Object.values(point.counts).some(count => count > 0)),
)
</script>

<template>
  <PanelCard
    title="Frameworks"
    :subtitle="totalRuns > 0
      ? `What people set up, and what they keep scanning · ${totalRuns.toLocaleString()} runs`
      : 'What people set up, and what they keep scanning'"
    flush
  >
    <EmptyState
      v-if="rows.length === 0"
      message="No framework reported in this range."
      hint="`evlog init` and `evlog map` report the framework they detected."
    />

    <template v-else>
      <ChartFrame v-if="hasTimeline" legend :labels="chartLabels" :height="160">
        <AreaChart
          :data
          :height="160"
          :categories
          :stacked="true"
          :line-width="1"
          :y-grid-line="true"
          :y-num-ticks="3"
          :x-formatter
          :x-num-ticks
          :legend-position="LegendPosition.TopRight"
        >
          <template #tooltip="{ values }">
            <ChartTooltip :title="values?.label">
              <div v-for="framework in frameworks" :key="framework" class="flex items-center justify-between gap-4">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: frameworkColor(framework) }" />
                  <span class="truncate text-[11px] text-muted">{{ frameworkLabel(framework) }}</span>
                </span>
                <span class="shrink-0 text-[11px] font-medium text-highlighted tabular-nums">{{ values?.[framework] ?? 0 }}</span>
              </div>
            </ChartTooltip>
          </template>
        </AreaChart>
      </ChartFrame>

      <div class="flex flex-col">
        <div class="flex items-center gap-3 px-4 pb-1 pt-2 text-[10px] uppercase tracking-wide text-dimmed">
          <span class="flex-1">Framework</span>
          <span class="w-14 text-right">Set up</span>
          <span class="w-14 text-right">Scanned</span>
          <span class="w-16 text-right">Share</span>
        </div>

        <div
          v-for="row in rows"
          :key="row.id"
          class="flex items-center gap-3 px-4 py-1.5 text-[13px]"
        >
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <UIcon :name="row.icon" class="size-3.5 shrink-0" :style="{ color: row.color }" />
            <span class="truncate text-toned">{{ row.label }}</span>
          </span>

          <!-- The two commands as their own columns rather than one merged bar:
               "installed once, never scanned again" is the finding worth having,
               and a single total is exactly what hides it. -->
          <span class="w-14 shrink-0 text-right text-[11px] tabular-nums" :class="row.installed > 0 ? 'text-toned' : 'text-dimmed'">
            {{ row.installed > 0 ? row.installed.toLocaleString() : '—' }}
          </span>
          <span class="w-14 shrink-0 text-right text-[11px] tabular-nums" :class="row.scanned > 0 ? 'text-toned' : 'text-dimmed'">
            {{ row.scanned > 0 ? row.scanned.toLocaleString() : '—' }}
          </span>

          <span class="flex w-16 shrink-0 items-center justify-end gap-2">
            <ProportionBar :value="row.total" :max="busiest" :color="row.color" />
            <span class="w-8 text-right text-[11px] text-dimmed tabular-nums">{{ shareOf(row.total) }}%</span>
          </span>
        </div>
      </div>
    </template>
  </PanelCard>
</template>
