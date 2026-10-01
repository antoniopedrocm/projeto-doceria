const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createWhatsAppService} = require('./whatsapp');
const {DEV_PROJECT_ID, getRuntimeProjectId, parseConfiguration} = require('./whatsapp-config');
const {sendCloudTemplate} = require('./whatsapp-client');

const recipient = '5562999990000';
const input = {storeId: 'loja-teste', recipient, bodyParameters: ['Pedido teste', '10,00']};
// Synthetic fixture only; no real credential is used in tests.
const fixtureToken = 'synthetic-test-credential';
const cloudConfig = {
  enabled: true, mode: 'cloud', apiVersion: 'v25.0', phoneNumberId: '123456789',
  templateName: 'confirmacao_teste', templateLanguage: 'pt_BR',
  allowedRecipients: [recipient], timeoutMs: 1000,
};
const accepted = () => new Response(JSON.stringify({
  messaging_product: 'whatsapp', messages: [{id: 'wamid.test123'}],
}), {status: 200});

const setup = ({config = cloudConfig, projectId = DEV_PROJECT_ID, fetchImpl = accepted,
  secretError = false, configError = false, token = fixtureToken} = {}) => {
  const calls = {config: 0, secret: 0, http: 0};
  const service = createWhatsAppService({
    getProjectId: () => projectId,
    db: {doc: (path) => {
      assert.equal(path, 'integrations/whatsapp/stores/loja-teste');
      return {get: async () => {
        calls.config++;
        if (configError) throw new Error(fixtureToken);
        return {exists: config !== null, data: () => config};
      }};
    }},
    createSecretClient: () => ({accessSecretVersion: async ({name}) => {
      calls.secret++;
      assert.equal(name,
          'projects/crmdoceria-9959e/secrets/whatsapp-dev-loja-teste-access-token/versions/latest');
      if (secretError) throw new Error(fixtureToken);
      return [{payload: {data: Buffer.from(token)}}];
    }}),
    fetchImpl: async (...args) => {
      calls.http++;
      return fetchImpl(...args);
    },
  });
  return {service, calls};
};

test('correlação opaca chega à Meta; valor arbitrário é rejeitado antes do envio', async () => {
  const correlationId = '11111111-1111-4111-8111-111111111111';
  const f = setup({fetchImpl: async (_, options) => {
    assert.equal(JSON.parse(options.body).biz_opaque_callback_data, correlationId);
    return accepted();
  }});
  assert.equal((await f.service.sendTemplate({...input, correlationId})).status, 'accepted');
  assert.equal((await f.service.sendTemplate({...input, correlationId: 'customer phone'})).code, 'invalid_message');
  assert.equal(f.calls.http, 1);
});

test('identidade de runtime falha fechada sem projeto ou com projetos conflitantes', () => {
  assert.equal(getRuntimeProjectId({}), '');
  assert.equal(getRuntimeProjectId({GCLOUD_PROJECT: DEV_PROJECT_ID}), DEV_PROJECT_ID);
  assert.equal(getRuntimeProjectId({FIREBASE_CONFIG: JSON.stringify({projectId: DEV_PROJECT_ID})}), DEV_PROJECT_ID);
  assert.equal(getRuntimeProjectId({GCLOUD_PROJECT: DEV_PROJECT_ID, GCP_PROJECT: 'ana-guimaraes'}), '');
  assert.equal(getRuntimeProjectId({GCLOUD_PROJECT: DEV_PROJECT_ID, FIREBASE_CONFIG: '{'}), '');
});

test('produção e ambiente desconhecido são bloqueados antes de ler configuração ou secret', async () => {
  for (const projectId of ['ana-guimaraes', '', 'outro-projeto']) {
    const {service, calls} = setup({projectId});
    assert.equal((await service.sendTemplate(input)).code, 'environment_blocked');
    assert.deepEqual(calls, {config: 0, secret: 0, http: 0});
  }
});

test('configuração ausente/desabilitada não acessa secret nem rede', async () => {
  for (const config of [null, {}, {enabled: false, mode: 'cloud'}]) {
    const {service, calls} = setup({config});
    assert.equal((await service.sendTemplate(input)).status, 'skipped');
    assert.equal(calls.secret + calls.http, 0);
  }
});

test('configuração malformada não ativa envio', async () => {
  for (const update of [
    {enabled: 'true'}, {mode: 'live'}, {apiVersion: '../v25.0'}, {phoneNumberId: 'https://evil.test'},
    {allowedRecipients: []}, {allowedRecipients: ['+5562999990000']},
    {timeoutMs: 0}, {timeoutMs: 30001}, {templateName: ''}, {templateLanguage: '../pt_BR'},
    {templateName: ['confirmacao_teste']}, {phoneNumberId: 123456789},
  ]) {
    const {service, calls} = setup({config: {...cloudConfig, ...update}});
    assert.equal((await service.sendTemplate(input)).code, 'configuration_unavailable');
    assert.equal(calls.secret + calls.http, 0);
  }
});

test('mock declara simulação sem ler credenciais ou chamar API', async () => {
  const {service, calls} = setup({config: {
    enabled: true, mode: 'mock', templateName: 'confirmacao_teste', templateLanguage: 'pt_BR',
  }});
  assert.deepEqual(await service.sendTemplate(input), {
    status: 'simulated', code: 'mock_only', retryable: false,
  });
  assert.equal(calls.secret + calls.http, 0);
});

test('IDs de loja não podem navegar para outros documentos/secrets', async () => {
  const {service, calls} = setup();
  for (const storeId of ['', '../outra', 'loja/tokens', 123]) {
    assert.equal((await service.sendTemplate({...input, storeId})).code, 'invalid_store');
  }
  assert.equal(calls.config, 0);
});

test('destinatário fora da lista DEV é bloqueado antes de buscar token', async () => {
  const {service, calls} = setup();
  assert.equal((await service.sendTemplate({...input, recipient: '5562999990001'})).code, 'recipient_not_allowed');
  assert.equal(calls.secret + calls.http, 0);
});

test('mensagem inválida não chama Meta', async () => {
  const {service, calls} = setup();
  for (const change of [
    {recipient: '+5562999990000'}, {recipient: '123'}, {bodyParameters: ['']},
    {bodyParameters: ['a\nb']}, {bodyParameters: [{text: 'teste'}]},
    {bodyParameters: ['x'.repeat(1025)]}, {bodyParameters: Array(31).fill('x')},
  ]) assert.equal((await service.sendTemplate({...input, ...change})).code, 'invalid_message');
  assert.equal(calls.secret + calls.http, 0);
});

test('envia POST oficial uma vez, template configurado e retorna aceitação sem alegar entrega', async () => {
  const {service, calls} = setup({fetchImpl: async (url, options) => {
    assert.equal(url, 'https://graph.facebook.com/v25.0/123456789/messages');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${fixtureToken}`);
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'template',
      template: {name: 'confirmacao_teste', language: {code: 'pt_BR'}, components: [{
        type: 'body', parameters: [{type: 'text', text: 'Pedido teste'}, {type: 'text', text: '10,00'}],
      }]},
    });
    return accepted();
  }});
  assert.deepEqual(await service.sendTemplate(input), {
    status: 'accepted', code: 'meta_accepted', retryable: false, messageId: 'wamid.test123',
  });
  assert.deepEqual(calls, {config: 1, secret: 1, http: 1});
});

test('template sem parâmetros omite components', async () => {
  const {service} = setup({fetchImpl: async (_, options) => {
    assert.equal(JSON.parse(options.body).template.components, undefined);
    return accepted();
  }});
  assert.equal((await service.sendTemplate({...input, bodyParameters: []})).status, 'accepted');
});

test('falhas de configuração e secret são sanitizadas e não chamam rede', async () => {
  for (const options of [{configError: true}, {secretError: true}]) {
    const {service, calls} = setup(options);
    const result = await service.sendTemplate(input);
    assert.equal(result.status, 'failed');
    assert.equal(JSON.stringify(result).includes(fixtureToken), false);
    assert.equal(calls.http, 0);
  }
});

test('token ausente ou com caracteres de cabeçalho inválidos não é enviado', async () => {
  for (const token of ['', 'abc\r\nsecret', 'abc def']) {
    const {service, calls} = setup({token});
    assert.equal((await service.sendTemplate(input)).code, 'credential_invalid');
    assert.equal(calls.http, 0);
  }
});

test('erro 4xx com resposta Meta registra apenas códigos, sem dados sensíveis', async () => {
  for (const status of [400, 401, 403, 404]) {
    const {service, calls} = setup({fetchImpl: async () => new Response(JSON.stringify({
      error: {code: 190, message: `${fixtureToken} ${recipient}`, error_data: {details: 'private'}},
    }), {status})});
    assert.deepEqual(await service.sendTemplate(input), {
      status: 'failed', code: 'provider_rejected', retryable: false, httpStatus: status, metaCode: 190,
    });
    assert.equal(calls.http, 1);
  }
});

test('429 permite retry posterior, respeita Retry-After, sem repetir na mesma chamada', async () => {
  const {service, calls} = setup({fetchImpl: async () => new Response(
      JSON.stringify({error: {code: 130429}}), {status: 429, headers: {'retry-after': '60'}},
  )});
  assert.deepEqual(await service.sendTemplate(input), {
    status: 'failed', code: 'rate_limited', retryable: true, httpStatus: 429,
    metaCode: 130429, retryAfterMs: 60000,
  });
  assert.equal(calls.http, 1);
});

test('5xx/408 são incertos e não provocam retry cego', async () => {
  for (const status of [408, 500, 502, 503]) {
    const {service, calls} = setup({fetchImpl: async () => new Response(
        JSON.stringify({error: {code: 1}}), {status},
    )});
    const result = await service.sendTemplate(input);
    assert.equal(result.status, 'unknown');
    assert.equal(result.retryable, false);
    assert.equal(calls.http, 1);
  }
});

test('resposta ilegível ou sucesso sem ID válido fica indeterminado', async () => {
  for (const body of ['<html>erro</html>', '{}', '{"messages":[{"id":"fake"}]}']) {
    const {service, calls} = setup({fetchImpl: async () => new Response(body, {status: 200})});
    assert.equal((await service.sendTemplate(input)).status, 'unknown');
    assert.equal(calls.http, 1);
  }
});

test('falha de rede é sanitizada e não repetida', async () => {
  const {service, calls} = setup({fetchImpl: async () => {throw new Error(fixtureToken);}});
  assert.deepEqual(await service.sendTemplate(input), {
    status: 'unknown', code: 'network_error', retryable: false,
  });
  assert.equal(calls.http, 1);
});

test('timeout aborta tanto conexão quanto leitura do corpo', async () => {
  for (const bodyTimeout of [false, true]) {
    let signal;
    const result = await sendCloudTemplate({
      config: {...parseConfiguration(cloudConfig), timeoutMs: 10}, payload: {}, token: fixtureToken,
      fetchImpl: async (_, options) => {
        signal = options.signal;
        const pending = () => new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error(fixtureToken)), {once: true});
        });
        return bodyTimeout ? {status: 200, ok: true, json: pending} : pending();
      },
    });
    assert.equal(signal.aborted, true);
    assert.equal(result.status, 'unknown');
    assert.equal(result.code, 'timeout');
    assert.equal(result.retryable, false);
  }
});

test('recarrega configuração e token a cada chamada, permitindo desabilitação e rotação', async () => {
  let enabled = true;
  let version = 0;
  let httpCalls = 0;
  const service = createWhatsAppService({
    getProjectId: () => DEV_PROJECT_ID,
    db: {doc: () => ({get: async () => ({
      exists: true, data: () => ({...cloudConfig, enabled}),
    })})},
    createSecretClient: () => ({accessSecretVersion: async () => {
      version++;
      return [{payload: {data: Buffer.from(`synthetic-version-${version}`)}}];
    }}),
    fetchImpl: async (_, options) => {
      httpCalls++;
      assert.equal(options.headers.Authorization, `Bearer synthetic-version-${httpCalls}`);
      return accepted();
    },
  });
  assert.equal((await service.sendTemplate(input)).status, 'accepted');
  assert.equal((await service.sendTemplate(input)).status, 'accepted');
  enabled = false;
  assert.equal((await service.sendTemplate(input)).status, 'skipped');
  assert.equal(version, 2);
  assert.equal(httpCalls, 2);
});
