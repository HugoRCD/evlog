<script setup lang="ts">
const props = defineProps<{
  run: RunDetail | null
  loading: boolean
}>()

const flagEntries = computed(() => props.run ? Object.entries(props.run.flags) : [])
const customEntries = computed(() => props.run ? Object.entries(props.run.custom) : [])

/** Mirrors the icons `StatCard` uses for success/error rate, so the same
 * outcome reads the same way everywhere in the dashboard. */
const outcomeIcon = computed(() => props.run?.outcome === 'success' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle')

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
}

function formatFieldValue(value: boolean | number | string) {
  return typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
}
</script>

<template>
  <div v-if="loading" class="flex justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
  </div>

  <div v-else-if="!run" class="py-12 text-center text-sm text-muted">
    Run not found.
  </div>

  <div v-else class="flex flex-col divide-y divide-default [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
    <section>
      <div class="mb-3 flex items-center gap-1.5">
        <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
          Overview
        </h4>
      </div>

      <!-- The two most "at a glance" useful facts — surfaced above the rest
           of the details grid instead of buried as two more <dl> rows. -->
      <div class="flex flex-wrap items-center gap-3 border border-default bg-elevated/40 px-4 py-3">
        <UBadge size="lg" :icon="outcomeIcon" :color="run.outcome === 'success' ? 'success' : 'error'" variant="subtle">
          {{ run.outcome }}
          <span v-if="run.errorCode" class="ml-1 opacity-70">({{ run.errorCode }})</span>
        </UBadge>
        <div aria-hidden="true" class="h-6 w-px bg-border" />
        <div class="flex items-baseline gap-1">
          <span class="text-xl font-semibold text-highlighted">{{ run.durationMs }}</span>
          <span class="text-xs text-muted">ms</span>
        </div>
        <code class="ml-auto max-w-[50%] truncate text-xs text-muted">{{ run.command }}</code>
      </div>

      <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-xs text-muted">
            Tool
          </dt>
          <dd class="mt-0.5">
            {{ run.tool }} <span class="text-muted">@{{ run.version }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted">
            Environment
          </dt>
          <dd class="mt-0.5 capitalize">
            {{ run.environment }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted">
            Machine
          </dt>
          <dd class="mt-0.5 font-mono text-xs">
            {{ run.machineId ?? '—' }}
          </dd>
        </div>
      </dl>

      <!-- Timing grouped together and de-emphasized — useful for debugging,
           but secondary to outcome/duration/environment above. -->
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-calendar-clock" class="size-3" />
          Occurred {{ formatDateTime(run.timestamp) }}
        </span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-inbox" class="size-3" />
          Received {{ formatDateTime(run.receivedAt) }}
        </span>
      </div>
    </section>

    <section>
      <div class="mb-3 flex items-center gap-1.5">
        <UIcon name="i-lucide-server" class="size-3.5 text-muted" />
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
          Environment
        </h4>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-xs text-muted">
            Node
          </dt>
          <dd class="mt-0.5 font-mono">
            {{ run.env.node }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted">
            CI
          </dt>
          <dd class="mt-0.5">
            {{ run.env.ci ? 'yes' : 'no' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted">
            Provider
          </dt>
          <dd class="mt-0.5">
            {{ run.env.provider ?? '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted">
            TTY
          </dt>
          <dd class="mt-0.5">
            {{ run.env.tty ? 'yes' : 'no' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-muted">
            Agent
          </dt>
          <dd class="mt-0.5">
            {{ run.env.agent ?? '—' }}
          </dd>
        </div>
      </dl>
    </section>

    <section>
      <div class="mb-3 flex items-center gap-1.5">
        <UIcon name="i-lucide-flag" class="size-3.5 text-muted" />
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
          Flags
        </h4>
      </div>
      <p v-if="flagEntries.length === 0" class="text-sm text-muted">
        No flags recorded.
      </p>
      <div v-else class="flex flex-wrap gap-2">
        <span v-for="[key, value] in flagEntries" :key class="inline-flex items-stretch overflow-hidden border border-default text-xs">
          <span class="bg-elevated px-2 py-1 text-muted">{{ key }}</span>
          <span class="border-l border-default px-2 py-1 font-mono text-highlighted">{{ formatFieldValue(value) }}</span>
        </span>
      </div>
    </section>

    <section>
      <div class="mb-3 flex items-center gap-1.5">
        <UIcon name="i-lucide-tags" class="size-3.5 text-muted" />
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
          Custom fields
        </h4>
      </div>
      <p v-if="customEntries.length === 0" class="text-sm text-muted">
        No custom fields recorded.
      </p>
      <div v-else class="flex flex-wrap gap-2">
        <span v-for="[key, value] in customEntries" :key class="inline-flex items-stretch overflow-hidden border border-primary/30 text-xs">
          <span class="bg-primary/10 px-2 py-1 text-primary">{{ key }}</span>
          <span class="border-l border-primary/30 px-2 py-1 font-mono text-highlighted">{{ formatFieldValue(value) }}</span>
        </span>
      </div>
    </section>

    <section>
      <div class="mb-2 flex items-center gap-1.5">
        <UIcon name="i-lucide-key" class="size-3 text-dimmed" />
        <h4 class="text-[10px] font-medium uppercase tracking-wide text-dimmed">
          Idempotency key
        </h4>
      </div>
      <code class="block break-all bg-elevated/40 px-2 py-1 text-[11px] text-dimmed">{{ run.idempotencyKey }}</code>
    </section>
  </div>
</template>
