<script setup lang="ts">
/**
 * How `evlog map` scores land in the wild, by grade band.
 *
 * The bands are thresholds someone picked (90 / 70 / 50); until real projects
 * pile up against them there is no way to tell whether they mean anything. A
 * distribution where every project is "excellent" is a scoring bug, not good
 * news — which is why this reads as a health gradient rather than four
 * interchangeable bars.
 */
const props = defineProps<{
  dimensions: FieldStat[]
}>()

const grades = computed(() => props.dimensions.find(dimension => dimension.key === GRADE_FIELD_KEY))

/** Report order, not count order — a distribution is only readable along its own axis. */
const bands = computed(() => {
  const stat = grades.value
  if (!stat) return []

  return GRADE_ORDER.map(grade => ({
    grade,
    label: gradeLabel(grade),
    range: gradeRange(grade),
    color: gradeColor(grade),
    count: stat.values.find(value => value.value === grade)?.count ?? 0,
  }))
})

const total = computed(() => bands.value.reduce((sum, band) => sum + band.count, 0))

function shareOf(count: number) {
  return total.value > 0 ? Math.round(percentageOf(count, total.value)) : 0
}

/**
 * Where inside a band the scores actually sit.
 *
 * A band tells you which side of a threshold a project landed on; the spread
 * tells you whether it is at 71 or 89 — the difference between "nearly the
 * next band up" and "barely held this one". Coloured by the band each bin
 * belongs to, so the histogram and the rows below read as one scale.
 */
const histogram = computed(() => {
  const stat = props.dimensions.find(dimension => dimension.key === SCORE_FIELD_KEY)
  if (!stat) return []

  return toScoreHistogram(stat.values).map(bin => ({
    ...bin,
    color: gradeColor(gradeForScore(bin.bin)),
  }))
})

const tallestBin = computed(() => Math.max(1, ...histogram.value.map(bin => bin.count)))
const scoredRuns = computed(() => histogram.value.reduce((sum, bin) => sum + bin.count, 0))
</script>

<template>
  <PanelCard
    title="Map scores"
    :subtitle="total > 0
      ? `How well projects meet evlog's requirement checks · ${total.toLocaleString()} map runs`
      : `How well projects meet evlog's requirement checks`"
    flush
  >
    <EmptyState
      v-if="total === 0"
      message="No map runs in this range."
      hint="`evlog map` reports the grade band it scored."
    />

    <div v-else class="flex flex-col">
      <!--
        Ten-point bins across the full 0–100 axis, so the shape is read against
        the scale rather than against itself.

        Both axes are named: an unlabelled bar says nothing about whether its
        height is runs, projects or score, and one lone bar says it least of
        all. Score runs along the bottom, run count up the side.
      -->
      <div v-if="scoredRuns > 0" class="px-4 pb-2 pt-1">
        <div class="flex items-stretch gap-2">
          <div class="flex w-6 shrink-0 flex-col justify-between py-px text-right font-mono text-[10px] text-dimmed tabular-nums">
            <span>{{ tallestBin }}</span>
            <span>0</span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex h-16 items-end gap-0.5">
              <span
                v-for="bin in histogram"
                :key="bin.bin"
                class="flex-1 rounded-t-[3px] transition-[height] duration-[--duration-slow]"
                :style="{
                  height: `${Math.max(bin.count > 0 ? 6 : 2, (bin.count / tallestBin) * 100)}%`,
                  backgroundColor: bin.count > 0 ? bin.color : 'var(--chart-grid)',
                }"
                :title="`Score ${bin.label} — ${bin.count} run${bin.count === 1 ? '' : 's'}`"
              />
            </div>
            <div class="flex justify-between pt-1 font-mono text-[10px] text-dimmed tabular-nums">
              <span>0</span><span>50</span><span>100</span>
            </div>
          </div>
        </div>

        <p class="pt-1.5 text-[10px] text-dimmed">
          Runs per 10-point score band
        </p>
      </div>

      <!-- One stacked rail above the rows: the shape of the distribution is the
           point, and four separate bars make you reassemble it by eye. -->
      <div class="flex h-1.5 gap-0.5 overflow-hidden px-4 pb-3 pt-2">
        <span
          v-for="band in bands"
          :key="band.grade"
          class="rounded-full transition-[flex-grow] duration-[--duration-slow]"
          :style="{ flexGrow: band.count, backgroundColor: band.color, minWidth: band.count > 0 ? '2px' : '0' }"
        />
      </div>

      <div
        v-for="band in bands"
        :key="band.grade"
        class="flex items-center gap-3 px-4 py-1.5 text-[13px]"
      >
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: band.color }" />
          <span class="truncate text-toned">{{ band.label }}</span>
          <span class="shrink-0 font-mono text-[11px] text-dimmed">{{ band.range }}</span>
        </span>

        <ProportionBar :value="band.count" :max="total" :color="band.color" />

        <span class="w-20 shrink-0 text-right text-[11px] text-dimmed tabular-nums">
          {{ band.count.toLocaleString() }} · {{ shareOf(band.count) }}%
        </span>
      </div>
    </div>
  </PanelCard>
</template>
