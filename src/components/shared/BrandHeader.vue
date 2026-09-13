<script setup>
defineProps({ subtitle: { type: String, default: null } })
</script>

<template>
  <header class="bg-navy text-white">
    <div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-light-pink">
          DC State of the Stack
        </p>
        <h1 class="text-lg font-extrabold leading-tight">Open Spaces</h1>
      </div>
      <p v-if="subtitle" class="text-right text-xs text-white/70">{{ subtitle }}</p>
    </div>
    <div class="h-1 bg-gradient-to-r from-teal to-pink" />
  </header>
</template>
