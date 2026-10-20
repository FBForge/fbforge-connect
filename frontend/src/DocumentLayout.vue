<template>
  <div class="document-layout">
    <div class="document-main"><slot name="data" /></div>
    <aside class="document-aside" aria-label="Anlagen und Aktionen"><slot name="aside" /></aside>
  </div>
</template>
