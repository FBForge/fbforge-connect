// Explicitly synthetic native bridge. The actual destination components and policy clients stay unchanged.
export function installBackupBridge({ empty = false } = {}) {
  const previous = window.__TAURI_INTERNALS__.invoke;
  const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
  const source = '11111111-1111-4111-8111-111111111111';
  const config = {
    name: 'Bauamt Teststadt',
    type: 'A',
    contactInformation: {
      legalName: 'Teststadt',
      address: 'Testweg 1\n12345 Teststadt',
      phone: '+49 30 000000',
      email: 'bauamt@example.invalid',
      unit: 'Bauverwaltung',
      cc: ['post@example.invalid'],
    },
    metadataVersions: ['2.0.0', '3.0.0'],
    publicServices: [1, 2].map((n) => ({
      identifier: `urn:de:fim:leika:leistung:9900800101400${n}`,
      regions: ['DE'],
      submissionSchemas: [{ schemaUri: `urn:test:antrag:${n}`, mimeType: 'application/json' }],
      replyChannels: { fitConnect: { processStandards: ['urn:test:antwort'] } },
    })),
    processMessages: [
      {
        processModelId: 'urn:test:prozess',
        messageId: 'urn:test:nachforderung',
        regions: ['DE'],
        schemas: [{ schemaUri: 'urn:test:nachforderung:schema', mimeType: 'application/json' }],
      },
    ],
    senderAccessRestricted: { enabled: true, allowedSenders: [], allowedSenderDestinations: [id(12)] },
    publicForRouting: true,
    callback: { url: 'https://fachverfahren.example.invalid/callback' },
  };
  const summary = {
    id: id(1),
    name: 'Bauamt vor Konfigurationsänderung',
    environment: 'TEST',
    sourceDestinationId: source,
    capturedAt: Date.parse('2026-11-12T11:00:00Z'),
    destinationName: config.name,
    type: 'A',
    registeredKeyCount: 2,
    callbackSecretMissing: true,
  };
  const state = (window.__backupFixture = {
    items: empty ? [] : [summary],
    configuration: config,
    actions: [],
    generated: 0,
    restored: 0,
    exported: 0,
    deny: false,
    bundles: [],
    creation: {
      attemptId: null,
      status: 'idle',
      bundleId: null,
      configurationJson: null,
      destinationId: null,
      error: null,
      httpStatus: null,
    },
  });
  const envelope = (data, args) => ({
    apiVersion: args.apiVersion,
    sessionId: args.sessionId,
    environment: 'TEST',
    data,
  });
  const key = (purpose, n) => ({
    kid: id(n),
    purpose,
    fingerprint: 'a'.repeat(64),
    expiresAt: '2027-11-12T00:00:00Z',
  });
  const bundle = () => ({
    bundleId: id(2),
    destinationId: null,
    status: 'ready',
    encryption: key('decrypt', 3),
    signing: key('sign', 4),
  });
  const publicKey = (purpose, n) => ({
    kty: 'RSA',
    key_ops: [purpose === 'decrypt' ? 'wrapKey' : 'verify'],
    alg: purpose === 'decrypt' ? 'RSA-OAEP-256' : 'PS512',
    kid: id(n),
    n: 'A'.repeat(683),
    e: 'AQAB',
    x5c: ['AQID'],
  });
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === 'destination_backups') {
      const a = args.action;
      state.actions.push(a.action);
      if (state.deny) throw 'resource_denied';
      switch (a.action) {
        case 'list':
          return { items: structuredClone(state.items) };
        case 'capture': {
          const row = {
            ...summary,
            id: crypto.randomUUID(),
            name: a.name,
            sourceDestinationId: a.destinationId,
          };
          state.items.unshift(row);
          return structuredClone(row);
        }
        case 'inspect':
          return {
            summary: structuredClone(state.items.find((r) => r.id === a.id)),
            configuration: structuredClone(state.configuration),
            snapshot: {
              ...structuredClone(state.configuration),
              destinationId: source,
              status: 'active',
              encryptionKid: 'synthetic-encryption',
            },
          };
        case 'delete':
          state.items = state.items.filter((r) => r.id !== a.id);
          return { deleted: true };
        case 'export':
          state.exported++;
          return { saved: true };
        case 'import': {
          const row = { ...summary, id: crypto.randomUUID(), name: 'Importierte Sicherung' };
          state.items.push(row);
          return structuredClone(row);
        }
        default:
          throw 'invalid_input';
      }
    }
    if (command === 'profile_workspace') return { templates: [], history: [], favorites: [], recent: [] };
    if (command === 'destination_creation_state') return envelope(state.creation, args);
    if (command === 'list_generated_keys') return envelope({ bundles: state.bundles }, args);
    if (command === 'generate_test_keys') {
      state.generated++;
      state.bundles = [bundle()];
      return envelope(state.bundles[0], args);
    }
    if (command === 'prepare_destination_creation') {
      const draft = JSON.parse(args.destinationDocument);
      state.lastDraft = draft;
      const configuration = {
        ...draft.configuration,
        status: 'created',
        publicForRouting: draft.configuration.publicForRouting ?? false,
      };
      if (configuration.type === 'A')
        Object.assign(configuration, {
          encryptionKid: id(3),
          encryptionPublicKey: publicKey('decrypt', 3),
          signingPublicKey: publicKey('sign', 4),
        });
      state.creation = {
        attemptId: id(5),
        status: 'prepared',
        bundleId: draft.bundleId,
        configurationJson: JSON.stringify(configuration),
        destinationId: null,
        error: null,
        httpStatus: null,
      };
      if (state.bundles[0]) state.bundles[0].status = 'reserved';
      return envelope(state.creation, args);
    }
    if (command === 'cancel_destination_creation') {
      state.creation.status = 'cancelled';
      if (state.bundles[0]) state.bundles[0].status = 'ready';
      return envelope(state.creation, args);
    }
    if (command === 'execute_destination_creation') {
      window.__destinationFixture.writes++;
      state.creation.status = 'confirmed';
      state.creation.destinationId = id(6);
      if (state.bundles[0]) state.bundles[0].status = 'bound';
      return envelope(state.creation, args);
    }
    if (command === 'prepare_destination_update') {
      const result = await previous(command, args);
      for (const row of result.data.changes) {
        const before = JSON.parse(row.beforeJson),
          after = JSON.parse(row.afterJson);
        for (const field of Object.keys(after)) if (!Object.hasOwn(before, field)) before[field] = null;
        row.beforeJson = JSON.stringify(before);
      }
      return result;
    }
    return previous(command, args);
  };
}
