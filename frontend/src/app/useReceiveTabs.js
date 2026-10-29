import { ref, watch, nextTick } from 'vue';

/** Keep the inbox's keyboard navigation and leave confirmation together. */
export function useReceiveTabs({ activeSession, busy, receiveBrowser }) {
  const receiveTab = ref('submissions');
  watch(
    () => activeSession.value?.sessionId,
    () => {
      receiveTab.value = 'submissions';
    },
  );
  async function selectReceiveTab(value) {
    if (busy.value || receiveTab.value === value) return;
    if (receiveTab.value === 'submissions' && !(await receiveBrowser.value?.confirmLeave())) return;
    receiveTab.value = value;
  }
  async function receiveTabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === 'Home'
        ? 'submissions'
        : event.key === 'End'
          ? 'replies'
          : receiveTab.value === 'submissions'
            ? 'replies'
            : 'submissions';
    await selectReceiveTab(target);
    await nextTick();
    document.getElementById(`receive-tab-${receiveTab.value}`)?.focus();
  }
  return { receiveTab, selectReceiveTab, receiveTabKey };
}
