<script setup lang="ts">
/**
 * The `flags` / `custom` jsonb columns, broken down by key and value. The
 * error share per value is the point of the card: a flag that shows up on a
 * disproportionate number of failed runs is the fastest way to spot a broken
 * code path from aggregate data alone.
 */
const props = defineProps<{
  title: string
  subtitle: string
  fields: FieldStat[]
  emptyLabel: string
}>()

const openKey = ref<string | null>(null)

// The first key opens by default, but only until the viewer picks another one
// (or collapses it) — after that their choice sticks across live refreshes.
const touched = ref(false)

watch(() => props.fields, (fields) => {
  if (!touched.value) openKey.value = fields[0]?.key ?? null
}, { immediate: true })

function toggle(key: string) {
  touched.value = true
  openKey.value = openKey.value === key ? null : key
}

function errorShare(stat: { count: number, errors: number }) {
  return Math.round(percentageOf(stat.errors, stat.count))
}
</script>

<template>
  <PanelCard :title :subtitle flush>
    <EmptyState
      v-if="fields.length === 0"
      :message="emptyLabel"
      hint="Values reported via flags or `telemetry.set()` show up here."
    />

    <div v-else class="flex flex-col">
      <div v-for="field in fields" :key="field.key">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left transition-colors duration-[--duration-fast] hover:bg-elevated/60"
          @click="toggle(field.key)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <UIcon
              name="i-nucleo-chevron-down"
              class="size-3 shrink-0 text-dimmed transition-transform duration-[--duration-fast]"
              :class="openKey === field.key ? '' : '-rotate-90'"
            />
            <span class="truncate font-mono text-xs text-toned">{{ field.key }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
            <span v-if="field.errors > 0" class="text-error">{{ errorShare(field) }}% err</span>
            <span class="text-dimmed">{{ field.count.toLocaleString() }}</span>
          </span>
        </button>

        <div v-if="openKey === field.key" class="flex flex-col pb-1.5">
          <div
            v-for="value in field.values"
            :key="value.value"
            class="relative overflow-hidden px-4 py-1 pl-9"
          >
            <div
              class="breakdown-bar absolute inset-y-0 left-0 w-full bg-primary/[0.045]"
              :style="{ transform: `scaleX(${field.count > 0 ? value.count / field.count : 0})` }"
            />
            <div class="relative flex items-center justify-between gap-3 text-[11px]">
              <span class="truncate font-mono text-muted">{{ value.value }}</span>
              <span class="flex shrink-0 items-center gap-2 tabular-nums">
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
