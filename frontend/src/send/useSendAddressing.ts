import { computed, ref, shallowRef } from 'vue';
import type { ApiVersion, ProcessMessage, RecipientOptions, SchemaChoice } from '../contracts.d.ts';

/** Addressing changes reconcile their dependent fields in one synchronous transition. */
export function useSendAddressing() {
  const targetValue = ref(''),
    serviceValue = ref('');
  const mode = ref<'service' | 'process'>('service');
  const offer = shallowRef<RecipientOptions | null>(null);
  const schemaIndex = ref(0),
    processIndex = ref(0);
  const replySchemaValue = ref(''),
    replyMimeValue = ref('application/json');
  const serviceName = ref('Testantrag'),
    region = ref('DE000000000000');
  const schema = ref(''),
    mime = ref('application/json'),
    modelId = ref(''),
    messageId = ref('');
  const exampleNotice = ref(''),
    offerReplies = ref(false);
  const offeredProcessMessages = ref<ProcessMessage[]>([]);
  const selectedService = computed(() =>
    offer.value?.services.find((row) => row.identifier === serviceValue.value),
  );
  const selectedProcess = computed(() => offer.value?.processes[processIndex.value]);
  const schemaOptions = computed<readonly SchemaChoice[]>(
    () => (mode.value === 'process' ? selectedProcess.value?.schemas : selectedService.value?.schemas) || [],
  );
  const replyOptions = computed(() => selectedService.value?.replySchemas || []);

  function selectSchema() {
    const choice = schemaOptions.value[schemaIndex.value];
    schema.value = choice?.schemaUri || '';
    mime.value = choice?.mimeType || 'application/json';
    exampleNotice.value = '';
  }
  function resetSchema() {
    schemaIndex.value = 0;
    selectSchema();
  }
  function serviceDefaults() {
    const service = selectedService.value;
    serviceName.value = service?.name || '';
    region.value = service?.regions[0] || 'DE000000000000';
    offerReplies.value = false;
    offeredProcessMessages.value = [];
    replySchemaValue.value = service?.replySchemas[0]?.schemaUri || '';
    replyMimeValue.value = service?.replySchemas[0]?.mimeType || 'application/json';
  }
  function processDefaults() {
    modelId.value = selectedProcess.value?.processModelId || '';
    messageId.value = selectedProcess.value?.messageId || '';
  }
  function replaceOffer(value: RecipientOptions | null) {
    if (offer.value === value) return;
    const previousService = selectedService.value,
      previousProcess = selectedProcess.value;
    offer.value = value;
    if (selectedService.value !== previousService) serviceDefaults();
    if (selectedProcess.value !== previousProcess) processDefaults();
    resetSchema();
  }
  const recipient = computed({ get: () => offer.value, set: replaceOffer });
  const service = computed({
    get: () => serviceValue.value,
    set: (value: string) => {
      if (serviceValue.value === value) return;
      const previous = selectedService.value;
      serviceValue.value = value;
      if (selectedService.value !== previous) serviceDefaults();
      if (mode.value === 'service') resetSchema();
    },
  });
  const target = computed({
    get: () => targetValue.value,
    set: (value: string) => {
      if (targetValue.value === value) return;
      targetValue.value = value;
      replaceOffer(null);
      service.value = '';
      schema.value = '';
      exampleNotice.value = '';
    },
  });
  const addressing = computed({
    get: () => mode.value,
    set: (value: 'service' | 'process') => {
      if (mode.value === value) return;
      mode.value = value;
      resetSchema();
    },
  });
  const processChoice = computed({
    get: () => processIndex.value,
    set: (value: number) => {
      if (processIndex.value === value) return;
      processIndex.value = value;
      processDefaults();
      if (mode.value === 'process') resetSchema();
    },
  });
  const schemaChoice = computed({
    get: () => schemaIndex.value,
    set: (value: number) => {
      if (schemaIndex.value === value) return;
      schemaIndex.value = value;
      selectSchema();
    },
  });
  const replySchema = computed({
    get: () => replySchemaValue.value,
    set: (value: string) => {
      if (replySchemaValue.value === value) return;
      replySchemaValue.value = value;
      offeredProcessMessages.value = [];
    },
  });
  const replyMime = computed({
    get: () => replyMimeValue.value,
    set: (value: string) => {
      if (replyMimeValue.value === value) return;
      replyMimeValue.value = value;
      offeredProcessMessages.value = [];
    },
  });
  function resetSession(api?: ApiVersion) {
    replaceOffer(null);
    service.value = '';
    schema.value = '';
    exampleNotice.value = '';
    if (api !== 'v3') addressing.value = 'service';
  }
  function applyServiceNames(names: Readonly<Record<string, string>>) {
    if (!offer.value) return;
    if (
      Object.hasOwn(names, serviceValue.value) &&
      (!serviceName.value || serviceName.value === serviceValue.value)
    )
      serviceName.value = names[serviceValue.value];
    // Catalogue labels do not change authoritative schemas or edited draft fields.
    offer.value = {
      ...offer.value,
      services: offer.value.services.map((item) =>
        Object.hasOwn(names, item.identifier) ? { ...item, name: names[item.identifier] } : item,
      ),
    };
  }
  return {
    target,
    service,
    serviceName,
    region,
    schema,
    mime,
    addressing,
    modelId,
    messageId,
    recipient,
    schemaChoice,
    processChoice,
    replySchema,
    replyMime,
    offerReplies,
    offeredProcessMessages,
    selectedService,
    selectedProcess,
    schemaOptions,
    replyOptions,
    exampleNotice,
    selectSchema,
    resetSession,
    applyServiceNames,
  };
}
