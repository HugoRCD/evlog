<script setup lang="ts">
import type { FooterColumn } from '@nuxt/ui'

const route = useRoute()
const isLanding = computed(() => route.path === '/')

const columns: FooterColumn[] = [
  {
    label: 'Resources',
    children: [
      {
        label: 'Documentation',
        to: '/getting-started/introduction'
      },
      {
        label: 'Releases',
        to: 'https://github.com/hugorcd/evlog/releases',
        target: '_blank'
      },
      {
        label: 'LLMs.txt',
        to: '/llms.txt',
        target: '_blank'
      }
    ]
  },
  {
    label: 'Community',
    children: [
      {
        label: 'GitHub',
        to: 'https://github.com/hugorcd/evlog',
        target: '_blank'
      },
      {
        label: 'Contributing',
        to: 'https://github.com/hugorcd/evlog/blob/main/CONTRIBUTING.md',
        target: '_blank'
      }
    ]
  }
]
</script>

<template>
  <UFooter v-if="!isLanding" :ui="{ top: 'border-b border-default', root: 'bg-default z-10' }">
    <template #top>
      <UContainer>
        <UFooterColumns :columns />
      </UContainer>
    </template>

    <template #left>
      <div class="text-xs font-mono italic tracking-tight">
        <span class="text-muted">&copy; {{ new Date().getFullYear() }} - Made by </span>
        <ULink to="https://hrcd.fr/" target="_blank" class="hover:underline">
          HugoRCD
        </ULink>
      </div>
    </template>

    <template #right>
      <UButton
        color="neutral"
        variant="ghost"
        to="https://x.com/hugorcd"
        target="_blank"
        icon="i-simple-icons-x"
        size="sm"
        aria-label="X"
      />
      <UButton
        color="neutral"
        variant="ghost"
        to="https://github.com/hugorcd/evlog"
        target="_blank"
        icon="i-simple-icons-github"
        size="sm"
        aria-label="GitHub"
      />
    </template>
  </UFooter>
</template>
