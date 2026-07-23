<script setup lang="ts">
/**
 * Lets a user quickly wire an MCP client up to this dashboard's `/mcp`
 * endpoint. Primary action is `@nuxtjs/mcp-toolkit`'s `<InstallButton>` —
 * real one-click IDE deeplinks for Cursor/VS Code, no copy-paste needed.
 * Keeps a manual fallback (endpoint URL + a full `mcpServers` config
 * snippet, each with its own copy button) underneath for clients the
 * deeplinks don't cover, e.g. Claude Desktop.
 */
const authRequired = useAuthRequired()

const mcpUrl = ref('')
onMounted(() => {
  mcpUrl.value = `${window.location.origin}/mcp`
})

const configSnippet = computed(() => {
  const server: Record<string, unknown> = { url: mcpUrl.value || '<your-deployment>/mcp' }
  if (authRequired.value) {
    server.headers = { Authorization: 'Bearer <ANALYTICS_PASSWORD>' }
  }
  return JSON.stringify({ mcpServers: { 'evlog-telemetry': server } }, null, 2)
})

const copiedUrl = ref(false)
const copiedConfig = ref(false)
let copiedUrlTimeout: ReturnType<typeof setTimeout> | undefined
let copiedConfigTimeout: ReturnType<typeof setTimeout> | undefined

async function copyUrl() {
  await navigator.clipboard.writeText(mcpUrl.value)
  copiedUrl.value = true
  clearTimeout(copiedUrlTimeout)
  copiedUrlTimeout = setTimeout(() => {
    copiedUrl.value = false
  }, 2000)
}

async function copyConfig() {
  await navigator.clipboard.writeText(configSnippet.value)
  copiedConfig.value = true
  clearTimeout(copiedConfigTimeout)
  copiedConfigTimeout = setTimeout(() => {
    copiedConfig.value = false
  }, 2000)
}
</script>

<template>
  <UPopover>
    <UButton variant="ghost" color="neutral" icon="i-lucide-plug">
      Connect MCP
    </UButton>

    <template #content>
      <div class="flex w-80 flex-col gap-3 p-4">
        <div>
          <p class="text-sm font-medium">
            Connect an MCP client
          </p>
          <p class="text-xs text-muted">
            One click wires Cursor or VS Code up to this dashboard's telemetry data.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <InstallButton :url="mcpUrl" ide="cursor" target="_blank" rel="noopener" class="w-full justify-center" />
          <InstallButton :url="mcpUrl" ide="vscode" target="_blank" rel="noopener" class="w-full justify-center" />
        </div>

        <div class="flex flex-col gap-2 border-t border-default pt-3">
          <span class="text-xs text-muted">Other clients — copy manually</span>

          <div class="flex flex-col gap-1">
            <code class="block break-all rounded bg-elevated px-2 py-1 text-xs">{{ mcpUrl }}</code>
            <UButton
              size="sm"
              :color="copiedUrl ? 'success' : 'neutral'"
              variant="subtle"
              :icon="copiedUrl ? 'i-lucide-check' : 'i-lucide-copy'"
              block
              @click="copyUrl"
            >
              {{ copiedUrl ? 'Copied!' : 'Copy endpoint URL' }}
            </UButton>
          </div>

          <p v-if="authRequired" class="text-xs text-muted">
            The dashboard password gate is active — clients must send <code class="rounded bg-elevated px-1 py-0.5">Authorization: Bearer &lt;ANALYTICS_PASSWORD&gt;</code>.
          </p>

          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted">Config (e.g. Claude Desktop)</span>
            <pre class="overflow-x-auto rounded bg-elevated px-2 py-2 text-xs"><code>{{ configSnippet }}</code></pre>
            <UButton
              size="sm"
              :color="copiedConfig ? 'success' : 'neutral'"
              variant="subtle"
              :icon="copiedConfig ? 'i-lucide-check' : 'i-lucide-copy'"
              block
              @click="copyConfig"
            >
              {{ copiedConfig ? 'Copied!' : 'Copy config' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
