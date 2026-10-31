/** Reopen an archived submission in the live receiver, with a fresh target identity. */
export function useCaseReopening({ receiveTab, selectedDestination, receiveTarget, navigate }) {
  return (record) => {
    receiveTab.value = 'submissions';
    selectedDestination.value = record.destinationId;
    receiveTarget.value = { ...record, requestId: crypto.randomUUID() };
    void navigate('Empfangen');
  };
}
