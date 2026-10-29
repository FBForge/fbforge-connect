import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { createUpdateController } from '../application-updates.js';

export function useApplicationUpdates({ busy, receiveBrowser, sessions, fatal }) {
  const state = shallowRef(null);
  const installing = ref(false);
  const controller = createUpdateController(invoke, {
    changed: (value) => {
      state.value = value;
    },
    installing: (value) => {
      installing.value = value;
    },
    disconnected: () => {
      sessions.value = {};
      fatal('session_missing');
    },
  });
  state.value = controller.state;
  let timer;
  onMounted(() => {
    void controller.initialize();
    timer = setInterval(() => {
      void controller.poll();
    }, 500);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    controller.dispose();
  });
  async function install() {
    if (busy.value || installing.value || (await receiveBrowser.value?.confirmLeave()) === false) return;
    busy.value = true;
    try {
      await controller.install();
    } finally {
      busy.value = false;
    }
  }
  return { state, installing, controller, install };
}
