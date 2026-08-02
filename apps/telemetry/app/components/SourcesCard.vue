<script setup lang="ts">
/**
 * Where the runs came from. This replaces the old "Agents" and "CI vs local"
 * cards, which split one question across two panels and left the answer
 * incomplete — neither could tell you what share of runs were plain scripts.
 *
 * The composition bar answers the shape question (is this a CI-heavy tool or a
 * desktop one?); the list underneath answers the identity question, and each
 * row filters the whole dashboard down to that source.
 *
 * Colour appears in exactly two places: the four segments of the bar, and the
 * 6px dot that ties each row back to its segment. Identity in the list is
 * carried by the provider's own icon and its name, so the rows themselves stay
 * neutral instead of turning the panel into a stack of coloured bands.
 */
const props = defineProps<{
  sources: SourceCount[]
  /** Currently filtered source, so the active row can read as selected. */
  active?: SourceRef
}>()

const emit = defineEmits<{ select: [source: SourceRef | undefined] }>()

const KIND_COLORS: Record<SourceKind, string> = {
  ci: 'var(--chart-source-ci)',
  agent: 'var(--chart-source-agent)',
  terminal: 'var(--chart-source-terminal)',
  automation: 'var(--chart-source-automation)',
}

const total = computed(() => props.sources.reduce((sum, source) => sum + source.count, 0))

/** Kind totals in `SOURCE_KINDS` order — the order the palette was validated in. */
const kinds = computed(() =>
  SOURCE_KINDS
    .map(kind => ({
      kind,
      color: KIND_COLORS[kind],
      count: props.sources.filter(source => source.kind === kind).reduce((sum, source) => sum + source.count, 0),
    }))
    .filter(entry => entry.count > 0),
)

const rows = computed(() => props.sources.map(source => ({
  source,
  token: sourceToken(source),
  label: sourceLabel(source),
  icon: sourceIcon(source),
  color: KIND_COLORS[source.kind],
  count: source.count,
  share: total.value > 0 ? source.count / total.value : 0,
})))

const activeToken = computed(() => (props.active ? sourceToken(props.active) : undefined))

function onSelect(source: SourceRef) {
  // Clicking the active row clears the filter, so a row is a toggle rather
  // than a one-way trip that needs the toolbar to undo.
  emit('select', sourceToken(source) === activeToken.value ? undefined : source)
}

function shareLabel(share: number) {
  const percent = share * 100
  // Anything that rounds to 0% still happened — say so rather than showing "0%".
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`
}
</script>

<template>
  <PanelCard title="Sources" subtitle="Where these runs came from" flush>
    <template v-if="active" #actions>
      <UButton variant="ghost" color="neutral" size="xs" @click="emit('select', undefined)">
        Clear
      </UButton>
    </template>

    <EmptyState
      v-if="total === 0"
      message="No runs in this range."
      hint="Anything reporting to evlog lands here — a CLI, a CI job, an agent, a scheduled script."
    />

    <template v-else>
      <div class="px-4 pb-4">
        <!-- 2px gaps, so adjacent fills never blend into one band. -->
        <div class="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-[2px]">
          <div
            v-for="entry in kinds"
            :key="entry.kind"
            class="breakdown-bar h-full rounded-[2px]"
            :style="{ width: `${(entry.count / total) * 100}%`, backgroundColor: entry.color }"
          />
        </div>

        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          <span
            v-for="entry in kinds"
            :key="entry.kind"
            class="flex items-center gap-1.5 text-[11px]"
            :title="sourceKindHint(entry.kind)"
          >
            <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: entry.color }" />
            <span class="text-toned">{{ sourceKindLabel(entry.kind) }}</span>
            <span class="text-dimmed tabular-nums">{{ shareLabel(entry.count / total) }}</span>
          </span>
        </div>
      </div>

      <div class="divider-y-top flex flex-col">
        <button
          v-for="row in rows"
          :key="row.token"
          type="button"
          class="relative overflow-hidden px-4 py-1.5 text-left transition-colors duration-[--duration-fast]"
          :class="row.token === activeToken ? 'bg-elevated ring-tinted' : 'hover:bg-elevated/60'"
          :style="{ '--tint': row.color }"
          :aria-pressed="row.token === activeToken"
          @click="onSelect(row.source)"
        >
          <!-- Ranking is already implied by the ordering, but a rail makes the
               *gap* between ranks visible: two rows can both say 14% and still
               sit very differently against the leader. Kept in the source's own
               hue at a low alpha so it reads as measure, not decoration. -->
          <span
            class="breakdown-bar absolute inset-y-0 left-0 w-full opacity-[0.09]"
            :style="{ transform: `scaleX(${row.share})`, backgroundColor: row.color }"
          />
          <span class="relative flex items-center justify-between gap-3">
            <span class="flex min-w-0 items-center gap-2">
              <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
              <UIcon :name="row.icon" class="size-3.5 shrink-0 text-dimmed" />
              <span class="truncate text-[13px] text-toned">{{ row.label }}</span>
            </span>
            <span class="shrink-0 text-[11px] text-dimmed tabular-nums">
              {{ row.count.toLocaleString() }} · {{ shareLabel(row.share) }}
            </span>
          </span>
        </button>
      </div>
    </template>
  </PanelCard>
</template>
