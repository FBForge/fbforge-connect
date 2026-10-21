<script setup>
import AppIcon from '../AppIcon.vue';
import appLogo from '../assets/test-client.png';
import { productBrand, productEdition } from '../product.js';
import { navigationGroups } from './navigation.js';
defineProps({
  apiVersion: String,
  busy: Boolean,
  activeSession: Object,
  theme: String,
  section: String,
  version: String,
});
const emit = defineEmits(['api', 'connection', 'theme', 'navigate']);
</script>
<template>
  <header class="app-topbar">
    <div class="app-brand">
      <img class="app-mark" :src="appLogo" alt="" width="34" height="34" />
      <div>
        <strong>{{ productBrand }}</strong>
        <span>{{ productEdition }}</span>
      </div>
    </div>
    <div class="topbar-context">
      <span class="environment-tag">TEST</span>
      <span class="build-tag">{{ version }}</span>
    </div>
    <div class="topbar-actions">
      <label class="api-picker" for="session-api">
        <span>API</span>
        <select
          id="session-api"
          :value="apiVersion"
          :disabled="busy"
          aria-label="API-Version"
          @change="emit('api', $event)"
        >
          <option value="v3">v3</option>
          <option value="v2">v2</option>
        </select>
      </label>
      <button class="connection-button" type="button" @click="emit('connection')">
        <span class="connection-dot" :class="{ connected: activeSession }" aria-hidden="true"></span>
        {{ activeSession ? 'Verbunden' : 'Verbinden' }}
        <AppIcon name="connection" />
      </button>
      <button
        class="icon-button"
        type="button"
        :aria-label="theme === 'dark' ? 'Helles Design verwenden' : 'Dunkles Design verwenden'"
        @click="emit('theme')"
      >
        <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
      </button>
    </div>
  </header>
  <aside class="app-sidebar" aria-label="Bereichsauswahl">
    <nav class="app-navigation" aria-label="Hauptnavigation">
      <div
        v-for="(group, index) in navigationGroups"
        :key="group.name"
        :class="{ 'nav-utilities': index > 0 }"
        role="group"
        :aria-label="group.name"
      >
        <p class="nav-caption">{{ group.name }}</p>
        <button
          v-for="item in group.items"
          :key="item.name"
          type="button"
          class="nav-item"
          :title="item.name"
          :aria-current="section === item.name ? 'page' : undefined"
          @click="emit('navigate', item.name)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.name }}</span>
        </button>
      </div>
    </nav>
    <div class="sidebar-note">
      <span class="environment-tag">TEST</span>
      <p>Integrationstests für Verwaltung und Integratoren</p>
    </div>
  </aside>
</template>
