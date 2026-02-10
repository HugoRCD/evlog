<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface LogLine {
  id: number
  text: string
  type: 'info' | 'warn' | 'error' | 'debug' | 'wide'
  opacity: number
  x: number
  y: number
  speed: number
}

const lines = ref<LogLine[]>([])
let animationFrame: number
let lineId = 0

const logMessages = [
  { text: '[INFO] Request started', type: 'info' as const },
  { text: '[DEBUG] Fetching user...', type: 'debug' as const },
  { text: '[INFO] User authenticated', type: 'info' as const },
  { text: '[DEBUG] Loading cart...', type: 'debug' as const },
  { text: '[WARN] Rate limit approaching', type: 'warn' as const },
  { text: '[INFO] Cart loaded: 3 items', type: 'info' as const },
  { text: '[DEBUG] Validating payment...', type: 'debug' as const },
  { text: '[ERROR] Card declined', type: 'error' as const },
  { text: '[INFO] Retrying payment...', type: 'info' as const },
  { text: '[INFO] Payment successful', type: 'info' as const },
  { text: '[DEBUG] Updating inventory...', type: 'debug' as const },
  { text: '[INFO] Order created: #12847', type: 'info' as const },
  { text: '[DEBUG] Sending confirmation...', type: 'debug' as const },
  { text: '[INFO] Email sent', type: 'info' as const },
  { text: '[INFO] Request completed', type: 'info' as const },
  { text: 'user: { id: 1, plan: "pro" }', type: 'wide' as const },
  { text: 'cart: { items: 3, total: 9999 }', type: 'wide' as const },
  { text: 'POST /api/checkout 200 (234ms)', type: 'wide' as const },
]

function createLine() {
  const msg = logMessages[Math.floor(Math.random() * logMessages.length)]

  const line: LogLine = {
    id: lineId++,
    text: msg.text,
    type: msg.type,
    opacity: 0.08 + Math.random() * 0.12,
    x: Math.random() * 100,
    y: -5,
    speed: 0.015 + Math.random() * 0.025,
  }

  lines.value.push(line)
}

function animate() {
  lines.value = lines.value
    .map(line => ({
      ...line,
      y: line.y + line.speed,
      opacity: line.y > 80 ? line.opacity * 0.97 : line.opacity,
    }))
    .filter(line => line.y < 110)

  if (Math.random() > 0.94) {
    createLine()
  }

  animationFrame = requestAnimationFrame(animate)
}

onMounted(() => {
  for (let i = 0; i < 15; i++) {
    setTimeout(() => createLine(), i * 150)
  }
  animate()
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div
      v-for="line in lines"
      :key="line.id"
      class="log-line absolute whitespace-nowrap font-mono text-[10px] md:text-xs"
      :data-type="line.type"
      :style="{
        left: `${line.x}%`,
        top: `${line.y}%`,
        opacity: line.opacity,
        transform: `translateX(-50%)`,
      }"
    >
      {{ line.text }}
    </div>
  </div>
</template>

<style scoped>
.log-line {
  color: var(--color-zinc-400);
}

.log-line[data-type="info"] {
  color: var(--color-emerald-600);
}

.log-line[data-type="warn"] {
  color: var(--color-amber-600);
}

.log-line[data-type="error"] {
  color: var(--color-red-600);
}

.log-line[data-type="debug"] {
  color: var(--color-zinc-500);
}

.log-line[data-type="wide"] {
  color: var(--color-primary);
}

:root.dark .log-line {
  color: var(--color-zinc-600);
}

:root.dark .log-line[data-type="info"] {
  color: var(--color-emerald-500);
}

:root.dark .log-line[data-type="warn"] {
  color: var(--color-amber-500);
}

:root.dark .log-line[data-type="error"] {
  color: var(--color-red-500);
}

:root.dark .log-line[data-type="debug"] {
  color: var(--color-zinc-600);
}

:root.dark .log-line[data-type="wide"] {
  color: var(--color-primary);
}
</style>
