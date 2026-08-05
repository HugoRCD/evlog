<script setup lang="ts">
/**
 * The `flags` / `custom` jsonb columns, broken down by key and value. The
 * error share per value is the point of the card: a flag that shows up on a
 * disproportionate number of failed runs is the fastest way to spot a broken
 * code path from aggregate data alone.
 */
const props = withDefaults(defineProps<{
  title: string
  subtitle: string
  fields: FieldStat[]
  emptyLabel: string
  /**
   * Render keys and values as the command line they came from — `--min-score`
   * over `minScore`, `--no-write` over `false`. Flags only: a `telemetry.set()`
   * field is an identifier its author chose and has no argv spelling.
   */
  asFlags?: boolean
  /**
   * Bucket rows under the command that reports them.
   *
   * Custom fields only: forty `map*` counters in one flat list is a wall, and
   * the keys already carry the structure that breaks it up. Flags are few and
   * share no namespace, so grouping them would add a heading per row.
   */
  grouped?: boolean
  /**
   * Cap the list and scroll inside it past this height, in pixels.
   *
   * A reference list is unbounded by nature — thirty custom keys is a normal
   * amount to report — and letting it set the height of a column makes every
   * other panel beside it sit above a hole. Bounding it here keeps that cost
   * inside the one card that earns it.
   */
  maxBodyHeight?: number
}>(), { asFlags: false, grouped: false })

/** One unnamed group when grouping is off, so the template has a single shape. */
const groups = computed(() =>
  props.grouped
    ? groupFieldStats(props.fields)
    : [{ group: '', fields: props.fields, count: 0 }],
)

const openKey = ref<string | null>(null)

// The first key opens by default, but only until the viewer picks another one
// (or collapses it) — after that their choice sticks across live refreshes.
const touched = ref(false)

watch(() => props.fields, (fields) => {
  if (!touched.value) openKey.value = fields.find(field => field.values.length > 1)?.key ?? null
}, { immediate: true })

function toggle(key: string) {
  touched.value = true
  openKey.value = openKey.value === key ? null : key
}

function errorShare(stat: { count: number, errors: number }) {
  return Math.round(percentageOf(stat.errors, stat.count))
}

const busiest = computed(() => Math.max(0, ...props.fields.map(field => field.count)))

function keyLabel(key: string) {
  return props.asFlags ? flagName(key) : key
}

/**
 * `flags`/`custom` are jsonb, so the breakdown reads values back as strings —
 * `'true'`, `'90'`. Flag rendering wants the original shape back to decide
 * between `--all` and `--no-all`, and only `true`/`false` are ambiguous.
 */
function valueLabel(key: string, value: string) {
  if (!props.asFlags) return value
  if (value === 'true' || value === 'false') return flagLabel(key, value === 'true')
  return flagLabel(key, value)
}

/**
 * A key with one observed value has nothing to expand into — the child row
 * repeats the parent's label and its exact count, which is what made every
 * boolean flag read as a duplicate of itself.
 *
 * The single value is folded into the parent row instead, so `--min-score`
 * still shows that it carried one, rather than losing the distinction.
 */
function isExpandable(field: FieldStat) {
  return field.values.length > 1
}

function rowLabel(field: FieldStat) {
  const [only] = field.values
  if (isExpandable(field) || !only) return keyLabel(field.key)
  return props.asFlags ? valueLabel(field.key, only.value) : keyLabel(field.key)
}

/** The lone value of a non-expandable custom field, shown inline. */
function inlineValue(field: FieldStat) {
  if (props.asFlags || isExpandable(field)) return null
  return field.values[0]?.value ?? null
}

</script>

<template>
  <PanelCard :title :subtitle flush>
    <EmptyState
      v-if="fields.length === 0"
      :message="emptyLabel"
      hint="Values reported via flags or `telemetry.set()` show up here."
    />

    <div
      v-else
      class="flex flex-col"
      :class="maxBodyHeight ? 'overflow-y-auto' : ''"
      :style="maxBodyHeight ? { maxHeight: `${maxBodyHeight}px` } : undefined"
    >
      <div v-for="section in groups" :key="section.group || 'all'" class="flex flex-col">
        <!--
          The command that reports these keys — a heading rather than a separate
          card, because they are one list with structure, not four lists. Sticky
          so the command a row belongs to stays visible as the list scrolls past
          it, which is the whole point of the grouping.

          `pl-9` rather than `px-4`: the rows below indent past a chevron, and a
          heading on the card edge sits to the left of everything it labels.
          It has to line up with the keys, not with the card.
        -->
        <div
          v-if="section.group"
          class="sticky top-0 z-10 flex items-baseline gap-1.5 bg-muted pb-1 pl-9 pr-4 pt-2.5 text-[10px] uppercase tracking-wide text-dimmed"
        >
          <span class="font-mono">{{ section.group }}</span>
          <span class="tabular-nums opacity-60">{{ section.fields.length }}</span>
        </div>

        <div v-for="field in section.fields" :key="field.key">
          <component
            :is="isExpandable(field) ? 'button' : 'div'"
            :type="isExpandable(field) ? 'button' : undefined"
            class="flex w-full items-center gap-3 px-4 py-1.5 text-left"
            :class="isExpandable(field) ? 'transition-colors duration-[--duration-fast] hover:bg-elevated/60' : ''"
            @click="isExpandable(field) && toggle(field.key)"
          >
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <UIcon
                v-if="isExpandable(field)"
                name="i-nucleo-chevron-down"
                class="size-3 shrink-0 text-dimmed transition-transform duration-[--duration-fast]"
                :class="openKey === field.key ? '' : '-rotate-90'"
              />
              <span v-else class="size-3 shrink-0" />
              <span class="truncate font-mono text-xs text-toned">{{ rowLabel(field) }}</span>
              <span v-if="inlineValue(field)" class="shrink-0 font-mono text-[11px] text-dimmed">{{ inlineValue(field) }}</span>
            </span>
            <ProportionBar :value="field.count" :max="busiest" />

            <span class="flex w-24 shrink-0 items-center justify-end gap-2 text-[11px] tabular-nums">
              <span v-if="field.errors > 0" class="text-error">{{ errorShare(field) }}% err</span>
              <span class="text-dimmed">{{ field.count.toLocaleString() }}</span>
            </span>
          </component>

          <div v-if="isExpandable(field) && openKey === field.key" class="flex flex-col pb-1.5">
            <div
              v-for="value in field.values"
              :key="value.value"
              class="flex items-center gap-3 py-1 pl-9 pr-4 text-[11px]"
            >
              <span class="min-w-0 flex-1 truncate font-mono text-muted">{{ valueLabel(field.key, value.value) }}</span>

              <ProportionBar :value="value.count" :max="field.values[0]?.count ?? 0" />

              <span class="flex w-24 shrink-0 items-center justify-end gap-2 tabular-nums">
                <span v-if="value.errors > 0" class="text-error">{{ errorShare(value) }}% err</span>
                <span class="text-dimmed">{{ value.count.toLocaleString() }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PanelCard>
</template>
