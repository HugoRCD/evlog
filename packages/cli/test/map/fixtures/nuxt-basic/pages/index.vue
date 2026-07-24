<script setup lang="ts">
const { data } = await useFetch('/api/health')
</script>

<template>
  <div>{{ data }}</div>
</template>
