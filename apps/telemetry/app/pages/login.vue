<script setup lang="ts">
const { fetch: refreshSession } = useUserSession()

const password = ref('')
const error = ref<string | null>(null)
const pending = ref(false)

useHead({ title: 'Sign in — evlog telemetry' })

async function onSubmit() {
  error.value = null
  pending.value = true
  try {
    await $fetch('/api/login', { method: 'POST', body: { password: password.value } })
    await refreshSession()
    await navigateTo('/')
  } catch (err) {
    const data = (err as { data?: { message?: string } })?.data
    error.value = data?.message ?? 'Invalid password'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-nucleo-chart-line" class="size-5 text-primary" />
          <span class="font-semibold">evlog telemetry</span>
        </div>
      </template>

      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <UFormField label="Dashboard password" :error="error ?? undefined">
          <UInput
            v-model="password"
            type="password"
            placeholder="••••••••"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" block :loading="pending">
          Sign in
        </UButton>
      </form>
    </UCard>
  </div>
</template>
