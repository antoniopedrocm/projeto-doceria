import {
  canRunFood99Operations,
  filterFood99RecordsByEnvironment,
  food99AuthorizationStatusMeta,
  isFood99PlatformConfigDirty,
  isFood99PublishQueued,
  isValidFood99PlatformDraft,
  normalizeFood99AuthorizationStatus,
  normalizeFood99Environment,
  resolveFood99AuthorizationStatus,
  sanitizeFood99PlatformConfig,
  selectFood99HealthRecord,
} from './food99UiCore';

describe('ambientes 99Food no frontend', () => {
  test('normaliza aliases oficiais de desenvolvimento e produção', () => {
    expect(normalizeFood99Environment('sandbox')).toBe('development');
    expect(normalizeFood99Environment('test')).toBe('development');
    expect(normalizeFood99Environment('prod')).toBe('production');
  });

  test('desenvolvimento recebe somente registros explicitamente DEV', () => {
    const records = [
      {id: 'dev', environment: 'development'},
      {id: 'sandbox', environment: 'sandbox'},
      {id: 'prod', environment: 'production'},
      {id: 'legacy'},
    ];
    expect(filterFood99RecordsByEnvironment(records, 'development').map(({id}) => id)).toEqual(['dev', 'sandbox']);
  });

  test('registros legacy sem environment aparecem somente em produção', () => {
    const records = [{id: 'legacy'}, {id: 'prod', environment: 'production'}, {id: 'dev', environment: 'development'}];
    expect(filterFood99RecordsByEnvironment(records, 'production').map(({id}) => id)).toEqual(['legacy', 'prod']);
  });

  test('health de produção por ambiente prevalece sobre Offline legado', () => {
    const health = selectFood99HealthRecord([
      {id: 'status', status: 'offline', updatedAt: '2026-07-27T12:00:00.000Z'},
      {id: 'status_production', environment: 'production', status: 'authorized', updatedAt: '2026-07-27T11:00:00.000Z'},
    ], 'production');
    expect(health.status).toBe('authorized');
  });

  test('produção usa health legado somente quando não existe registro scoped', () => {
    const legacy = {id: 'status', status: 'offline'};
    expect(selectFood99HealthRecord([legacy], 'production')).toBe(legacy);
    expect(selectFood99HealthRecord([legacy], 'development')).toBeNull();
  });

  test('seleciona o health scoped mais recente entre listener e resposta remota', () => {
    const listener = {
      id: 'status_production',
      environment: 'production',
      status: 'connecting',
      updatedAt: '2026-07-27T11:00:00.000Z',
    };
    const remote = {
      environment: 'production',
      status: 'authorized',
      updatedAt: '2026-07-27T11:01:00.000Z',
    };
    expect(selectFood99HealthRecord([listener], 'production', remote)).toBe(remote);
  });
});

describe('status e elegibilidade operacional 99Food', () => {
  test.each([
    ['not_configured', 'Não configurada'],
    ['configuration_incomplete', 'Configuração incompleta'],
    ['awaiting_authorization', 'Aguardando autorização'],
    ['connecting', 'Conectando'],
    ['authorized', 'Conectada'],
    ['credentials_invalid', 'Credenciais inválidas'],
    ['degraded', 'Degradada'],
    ['offline', 'Offline'],
  ])('%s possui rótulo amigável', (status, label) => {
    expect(food99AuthorizationStatusMeta(status).label).toBe(label);
  });

  test('online legado é tratado como autorizado', () => {
    expect(normalizeFood99AuthorizationStatus('online')).toBe('authorized');
    expect(resolveFood99AuthorizationStatus({}, {status: 'online'})).toBe('authorized');
  });

  test('health degradado ou offline prevalece sobre autorização persistida', () => {
    expect(resolveFood99AuthorizationStatus(
      {authorizationStatus: 'authorized'},
      {status: 'degraded'}
    )).toBe('degraded');
    expect(resolveFood99AuthorizationStatus(
      {authorizationStatus: 'authorized'},
      {status: 'offline'}
    )).toBe('offline');
  });

  test('somente autorização confirmada libera operações', () => {
    expect(canRunFood99Operations('authorized')).toBe(true);
    expect(canRunFood99Operations('awaiting_authorization')).toBe(false);
    expect(canRunFood99Operations('credentials_invalid')).toBe(false);
    expect(canRunFood99Operations('offline')).toBe(false);
  });
});

describe('segredos e fila', () => {
  test('configuração sanitizada não mantém máscara com sufixo real', () => {
    const safe = sanitizeFood99PlatformConfig({
      environment: 'development',
      clientIdReady: true,
      clientSecretReady: true,
      clientSecretMasked: '****1234',
      webhookSecretMasked: '****9876',
    });
    expect(safe).not.toHaveProperty('clientSecretMasked');
    expect(safe).not.toHaveProperty('webhookSecretMasked');
    expect(JSON.stringify(safe)).not.toContain('1234');
    expect(JSON.stringify(safe)).not.toContain('9876');
  });

  test('detecta alterações reais somente nos campos globais persistidos', () => {
    const baseline = {
      effectiveApiBaseUrl: 'https://openapi.99food.com',
      effectiveAuthUrl: 'https://openapi.99food.com',
      webhookUrl: 'https://hooks.example.com/99food',
      webhookEnabled: true,
      inventoryEndpointTemplate: '',
      inventoryMethod: 'POST',
    };
    expect(isFood99PlatformConfigDirty({...baseline}, baseline)).toBe(false);
    expect(isFood99PlatformConfigDirty({...baseline, webhookUrl: 'https://hooks.example.com/v2'}, baseline)).toBe(true);
    expect(isFood99PlatformConfigDirty({...baseline, clientSecret: 'never'}, baseline)).toBe(false);
  });

  test('habilita o rascunho somente com as três URLs HTTPS válidas', () => {
    const valid = {
      effectiveApiBaseUrl: 'https://openapi.99food.com',
      effectiveAuthUrl: 'https://openapi.99food.com',
      webhookUrl: 'https://food99webhook-6i65vyioiq-uc.a.run.app/events?source=99food',
    };
    expect(isValidFood99PlatformDraft(valid)).toBe(true);
    expect(isValidFood99PlatformDraft({...valid, webhookUrl: 'http://localhost/hook'})).toBe(false);
    expect(isValidFood99PlatformDraft({...valid, effectiveAuthUrl: ''})).toBe(false);
  });

  test('reconhece respostas enfileiradas ou agendadas', () => {
    expect(isFood99PublishQueued({queued: true})).toBe(true);
    expect(isFood99PublishQueued({status: 'scheduled'})).toBe(true);
    expect(isFood99PublishQueued({status: 'submitted'})).toBe(true);
    expect(isFood99PublishQueued({published: 1})).toBe(false);
  });
});
