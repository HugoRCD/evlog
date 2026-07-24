<script setup lang="ts">
try {
  await $fetch('/api/orders/1')
}
catch (e) {
  console.error(e)
}
</script>

<template>
  <div>Orders</div>
</template>
