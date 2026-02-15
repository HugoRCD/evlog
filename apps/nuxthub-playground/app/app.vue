<template>
  <div style="margin: 1.5rem; font-family: system-ui, sans-serif;">
    <h1 style="margin-bottom: 1rem;">
      evlog + NuxtHub Playground
    </h1>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;">
      <div>
        <LogGenerator />
        <LogViewer style="margin-top: 1.5rem;" />
      </div>

      <AiChat />
    </div>
  </div>
</template>
