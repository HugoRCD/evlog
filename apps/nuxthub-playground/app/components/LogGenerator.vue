<script setup lang="ts">
const lastResult = ref('')

async function fire(url: string) {
  try {
    const res = await $fetch(url)
    lastResult.value = `${url} → ${JSON.stringify(res)}`
  } catch (err: any) {
    lastResult.value = `${url} → Error: ${err.statusCode || err.message}`
  }
}

async function fireAll() {
  await Promise.allSettled([
    fire('/api/test/success'),
    fire('/api/test/error'),
    fire('/api/test/warn'),
  ])
}
</script>

<template>
  <section>
    <h2>Generate Logs</h2>
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <button @click="fire('/api/test/success')">
        Success
      </button>
      <button @click="fire('/api/test/error')">
        Error (500)
      </button>
      <button @click="fire('/api/test/warn')">
        Slow Request
      </button>
      <button @click="fireAll">
        Fire All (x3)
      </button>
    </div>
    <p v-if="lastResult" style="margin-top: 0.5rem; color: #666; font-size: 0.85rem;">
      {{ lastResult }}
    </p>
  </section>
</template>
