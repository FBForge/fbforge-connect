import { nextTick } from 'vue';

// Reveal and focus the first invalid field across the three send steps.
export function useSendSteps({ disabled, sendStep, sendForm, stepNotice, recipient, recipientButton }) {
  let invalidTarget;
  function revealInvalid(event) {
    event.preventDefault();
    if (invalidTarget) return;
    invalidTarget = event.target;
    event.target.closest('details')?.setAttribute('open', '');
    sendStep.value = Number(event.target.closest('fieldset')?.dataset.sendStep || 0);
    const label = event.target.labels?.[0]?.innerText.split('\n')[0].trim();
    stepNotice.value = label
      ? event.target.validity.valueMissing
        ? `Bitte füllen Sie das Feld „${label}“ aus.`
        : `Bitte prüfen Sie das Feld „${label}“.`
      : 'Bitte vervollständigen Sie die markierten Pflichtfelder in diesem Abschnitt.';
    nextTick(() => {
      invalidTarget?.focus();
      invalidTarget = null;
    });
  }
  async function selectStep(index) {
    if (disabled.value) return;
    if (index > sendStep.value) {
      for (let step = 0; step < index; step++) {
        const controls = sendForm.value?.querySelectorAll(
          `[data-send-step="${step}"] input, [data-send-step="${step}"] select, [data-send-step="${step}"] textarea`,
        );
        const invalid = [...(controls || [])].find(
          (control) => control.willValidate && !control.validity.valid,
        );
        if (invalid) {
          invalid.reportValidity();
          return;
        }
        if (step === 0 && !recipient.value) {
          sendStep.value = 0;
          stepNotice.value = 'Laden Sie zuerst die Leistungen der Empfänger-Destination.';
          await nextTick();
          recipientButton.value?.focus();
          return;
        }
      }
    }
    sendStep.value = index;
    stepNotice.value = '';
    await nextTick();
    sendForm.value?.querySelector(`[data-send-step="${index}"] legend`)?.focus();
  }
  return { revealInvalid, selectStep };
}
