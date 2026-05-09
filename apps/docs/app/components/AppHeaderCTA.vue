<template>
  <UButton
    v-if="$route.path === '/'"
    label="Get Started"
    to="/start/introduction"
    size="sm"
    variant="solid"
    trailing-icon="i-lucide-arrow-right"
    class="hidden text-white sm:inline-flex"
  />
</template>
