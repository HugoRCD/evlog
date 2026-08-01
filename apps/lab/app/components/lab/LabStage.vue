<script setup lang="ts">
/**
 * One clip's stage, as a provider.
 *
 * Renderless on purpose: its whole job is to put the clip's id in scope so that
 * anything mounted underneath — a sequencer reporting how long it runs — can say
 * which clip it belongs to without the page having to track what is currently
 * mounting.
 */

import { LAB_STAGE_LAYER } from '~/utils/lab/sequence'

const props = defineProps<{ layerId: string }>()

provide(LAB_STAGE_LAYER, props.layerId)
</script>

<template>
  <slot />
</template>
