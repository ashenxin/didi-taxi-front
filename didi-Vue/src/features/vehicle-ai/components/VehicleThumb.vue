<template>
  <svg class="vehicle-thumb" viewBox="0 0 80 48" role="img" aria-label="车型示意图">
    <rect width="80" height="48" fill="#f3f4f6" />
    <template v-if="variant === 'suv'">
      <path
        d="M8 33 L11 26 L25 24 L31 16 L51 16 L59 24 L71 26 L73 33 Z"
        :fill="color"
      />
      <path d="M32 18 L38 18 L38 24 L30 24 Z" fill="#1f2937" opacity=".6" />
      <path d="M41 18 L50 18 L56 24 L41 24 Z" fill="#1f2937" opacity=".6" />
    </template>
    <template v-else-if="variant === 'mpv'">
      <path
        d="M8 33 L11 27 L22 24 L27 17 L54 17 L62 24 L71 26 L73 33 Z"
        :fill="color"
      />
      <path d="M29 19 L36 19 L36 24 L27 24 Z" fill="#1f2937" opacity=".6" />
      <path d="M39 19 L53 19 L59 24 L39 24 Z" fill="#1f2937" opacity=".6" />
    </template>
    <template v-else>
      <path
        d="M8 33 L11 27 L26 25 L33 18 L52 18 L60 25 L71 27 L73 33 Z"
        :fill="color"
      />
      <path d="M34 20 L40 20 L40 25 L31 25 Z" fill="#1f2937" opacity=".6" />
      <path d="M43 20 L51 20 L56 25 L43 25 Z" fill="#1f2937" opacity=".6" />
    </template>
    <circle cx="24" cy="33" r="5" fill="#111827" />
    <circle cx="24" cy="33" r="2" fill="#e5e7eb" />
    <circle cx="59" cy="33" r="5" fill="#111827" />
    <circle cx="59" cy="33" r="2" fill="#e5e7eb" />
  </svg>
</template>

<script setup>
defineProps({
  variant: { type: String, default: 'sedan' },
  color: { type: String, default: '#1f5fd6' }
})
</script>

<style scoped>
.vehicle-thumb {
  width: 72px;
  height: 42px;
  display: block;
  border-radius: 6px;
  overflow: hidden;
}
</style>
