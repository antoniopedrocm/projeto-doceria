const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CURRENT_FOOD99_HOST,
  FOOD99_ENVIRONMENTS,
  LEGACY_FOOD99_HOST,
  alertFingerprint,
  canRunAuthorizedOperation,
  catalogQueueKey,
  classifyFood99Failure,
  constantTimeEqual,
  dedupeIds,
  environmentDocId,
  extractFood99AppIdFromRawBody,
  findBoundFood99Shop,
  food99SignatureInput,
  friendlyFood99Error,
  isAllowedFood99ApiUrl,
  isCatalogUploadRateLimit,
  isLocalOrMetadataHostname,
  jitteredBackoffMs,
  lockKey,
  mappingDocId,
  nextCatalogAttemptAt,
  nonEmptyParams,
  normalizeFood99Environment,
  parseFood99JsonPreservingLargeIntegers,
  resolveFood99BaseUrl,
  safeKeyPart,
  sanitizeLogContext,
  secretSafePublicConfig,
  shouldRefreshToken,
  signFood99Params,
  signFood99Webhook,
  tokenCacheKey,
  validateAuthorizationUrl,
  validateFood99ApiBaseUrl,
  validatePublicWebhookUrl,
} = require('./food99-core');

test('normalizes development aliases', () => {
  ['development', 'dev', 'sandbox', 'test', 'teste', 'homologacao'].forEach((value) => {
    assert.equal(normalizeFood99Environment(value), FOOD99_ENVIRONMENTS.DEVELOPMENT);
  });
});

test('normalizes production aliases', () => {
  ['production', 'prod', 'producao', 'produção'].forEach((value) => {
    assert.equal(normalizeFood99Environment(value), FOOD99_ENVIRONMENTS.PRODUCTION);
  });
});

test('uses the supplied fallback for an unknown environment', () => {
  assert.equal(normalizeFood99Environment('unknown', 'development'), 'development');
});

test('fails safe to development when an internal caller omits the environment', () => {
  assert.equal(normalizeFood99Environment(''), FOOD99_ENVIRONMENTS.DEVELOPMENT);
  assert.equal(normalizeFood99Environment('unknown'), FOOD99_ENVIRONMENTS.DEVELOPMENT);
});

test('resolves the official host for development regardless of saved URL', () => {
  assert.equal(resolveFood99BaseUrl({environment: 'development', savedUrl: 'https://attacker.test'}), CURRENT_FOOD99_HOST);
});

test('resolves the official host for production and ignores the retired host', () => {
  assert.equal(resolveFood99BaseUrl({environment: 'production', savedUrl: LEGACY_FOOD99_HOST}), CURRENT_FOOD99_HOST);
});

test('allows only the exact current OpenAPI host', () => {
  assert.equal(isAllowedFood99ApiUrl(CURRENT_FOOD99_HOST, 'development'), true);
  assert.equal(isAllowedFood99ApiUrl(`${CURRENT_FOOD99_HOST}/`, 'production'), true);
  assert.equal(isAllowedFood99ApiUrl(`${CURRENT_FOOD99_HOST}/v1/auth`, 'production'), false);
});

test('rejects the retired host in every environment', () => {
  assert.equal(isAllowedFood99ApiUrl(LEGACY_FOOD99_HOST, 'development'), false);
  assert.equal(isAllowedFood99ApiUrl(LEGACY_FOOD99_HOST, 'production'), false);
});

test('rejects non-HTTPS and lookalike API hosts', () => {
  assert.equal(isAllowedFood99ApiUrl('http://openapi.99food.com'), false);
  assert.equal(isAllowedFood99ApiUrl('https://openapi.99food.com.evil.test'), false);
});

test('normalizes only the approved API origin', () => {
  assert.equal(validateFood99ApiBaseUrl(' https://openapi.99food.com/ '), CURRENT_FOOD99_HOST);
  assert.equal(validateFood99ApiBaseUrl('https://user:pass@openapi.99food.com'), '');
  assert.equal(validateFood99ApiBaseUrl('https://openapi.99food.com#fragment'), '');
});

test('accepts a public HTTPS webhook and preserves path and query', () => {
  assert.equal(
    validatePublicWebhookUrl(' https://food99webhook-6i65vyioiq-uc.a.run.app/events?source=99food '),
    'https://food99webhook-6i65vyioiq-uc.a.run.app/events?source=99food'
  );
});

test('rejects insecure, credential-bearing and fragmented webhook URLs', () => {
  assert.equal(validatePublicWebhookUrl('http://hooks.example.com/99food'), '');
  assert.equal(validatePublicWebhookUrl('https://user:pass@hooks.example.com/99food'), '');
  assert.equal(validatePublicWebhookUrl('https://hooks.example.com/99food#token'), '');
  assert.equal(validatePublicWebhookUrl(['java', 'script:alert(1)'].join('')), '');
  assert.equal(validatePublicWebhookUrl('data:text/plain,secret'), '');
  assert.equal(validatePublicWebhookUrl('file:///tmp/hook'), '');
});

test('rejects localhost, metadata and private webhook destinations', () => {
  [
    'localhost',
    'api.localhost',
    'metadata.google.internal',
    '169.254.169.254',
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
  ].forEach((hostname) => {
    const renderedHost = hostname.includes(':') ? `[${hostname}]` : hostname;
    assert.equal(validatePublicWebhookUrl(`https://${renderedHost}/hook`), '', hostname);
    assert.equal(isLocalOrMetadataHostname(hostname), true, hostname);
  });
});

test('filters blank parameters and sign before sorting ASCII keys', () => {
  assert.deepEqual(nonEmptyParams({z: 2, A: 1, blank: ' ', nil: null, sign: 'ignored'}), [
    ['A', 1],
    ['z', 2],
  ]);
});

test('builds the documented app signature input in ASCII key order', () => {
  assert.equal(food99SignatureInput({timestamp: 2, app_id: 'abc'}, 'secret'), 'app_id=abc&timestamp=2secret');
});

test('serializes array signature values as literal Array', () => {
  assert.equal(food99SignatureInput({ids: ['a', 'b']}, 'secret'), 'ids=Arraysecret');
  assert.equal(food99SignatureInput({ids: []}, 'secret'), 'ids=Arraysecret');
});

test('serializes object signature values as literal Array', () => {
  assert.equal(food99SignatureInput({filters: {active: true}}, 'secret'), 'filters=Arraysecret');
});

test('hashes app signatures as lowercase MD5 over UTF-8', () => {
  const input = 'app_id=ação&timestamp=2segredo';
  const expected = crypto.createHash('md5').update(input, 'utf8').digest('hex');
  assert.equal(signFood99Params({timestamp: 2, app_id: 'ação'}, 'segredo'), expected);
});

test('matches the official List Bind Stores signature fixture', () => {
  assert.equal(signFood99Params({
    app_id: '3458764573578035295',
    page_no: 1,
    page_size: 30,
    timestamp: 1623814795,
  }, '87b69bab1a1548c1516189a5fb75e705'), 'd471c1f850ab312a703ac9611bdee25a');
});

test('extracts an unquoted 64-bit app_id from webhook raw bytes without rounding', () => {
  const raw = Buffer.from('{"app_id":5764607601352902593,"type":"shopBindStatus"}');
  assert.equal(extractFood99AppIdFromRawBody(raw), '5764607601352902593');
});

test('extracts a quoted nested appId and rejects conflicting duplicate IDs', () => {
  assert.equal(extractFood99AppIdFromRawBody('{"data":{"appId":"5764607601352902593"}}'), '5764607601352902593');
  assert.equal(extractFood99AppIdFromRawBody('{"app_id":1,"data":{"appId":"2"}}'), '');
});

test('parses authenticated webhook JSON without rounding unsafe integer IDs', () => {
  const payload = parseFood99JsonPreservingLargeIntegers(Buffer.from(
    '{"app_id":5764607601352902593,"timestamp":1760678329,"data":{"order_id":5764610361924520465}}'
  ));
  assert.equal(payload.app_id, '5764607601352902593');
  assert.equal(payload.data.order_id, '5764610361924520465');
  assert.equal(payload.timestamp, 1760678329);
});

test('preserves JSON strings and rejects malformed webhook JSON', () => {
  const payload = parseFood99JsonPreservingLargeIntegers('{"message":"id 5764607601352902593","value":1.5}');
  assert.deepEqual(payload, {message: 'id 5764607601352902593', value: 1.5});
  assert.throws(() => parseFood99JsonPreservingLargeIntegers('{"app_id":'));
});

test('finds only the exact bound app_shop_id and keeps it as a string', () => {
  const shops = [
    {app_shop_id: '5764610361924520465', shop_name: 'Garavelo', bound_flag: 1},
    {app_shop_id: 'other', shop_name: 'Outra', bound_flag: 0},
  ];
  assert.deepEqual(findBoundFood99Shop(shops, '5764610361924520465'), {
    appShopId: '5764610361924520465',
    name: 'Garavelo',
  });
  assert.equal(findBoundFood99Shop(shops, '5764610361924520466'), null);
  assert.equal(findBoundFood99Shop([{...shops[0], bound_flag: 0}], '5764610361924520465'), null);
});

test('hashes webhook strings as MD5 rawBody plus app secret', () => {
  const expected = crypto.createHash('md5').update('{"ok":true}secret', 'utf8').digest('hex');
  assert.equal(signFood99Webhook('{"ok":true}', 'secret'), expected);
});

test('hashes webhook Buffer bytes without JSON reserialization', () => {
  const raw = Buffer.from([0, 1, 2, 255]);
  const expected = crypto.createHash('md5').update(raw).update('secret', 'utf8').digest('hex');
  assert.equal(signFood99Webhook(raw, 'secret'), expected);
});

test('compares equal hexadecimal signatures in constant time', () => {
  assert.equal(constantTimeEqual('AABB', 'aabb'), true);
});

test('rejects unequal or differently sized signatures', () => {
  assert.equal(constantTimeEqual('aabb', 'aabc'), false);
  assert.equal(constantTimeEqual('aa', 'aaaa'), false);
});

test('accepts an HTTPS authorization URL on an approved domain', () => {
  const url = 'https://auth.99food.com/authorize?ticket=abc';
  assert.equal(validateAuthorizationUrl(url), url);
});

test('rejects authorization URL host suffix attacks', () => {
  assert.equal(validateAuthorizationUrl('https://99food.com.evil.test/authorize'), '');
  assert.equal(validateAuthorizationUrl('https://evil99food.com/authorize'), '');
});

test('rejects insecure or credential-bearing authorization URLs', () => {
  assert.equal(validateAuthorizationUrl('http://auth.99food.com/authorize'), '');
  assert.equal(validateAuthorizationUrl('https://user:pass@auth.99food.com/authorize'), '');
});

test('classifies missing authorization errno 10101 as suspended awaiting authorization', () => {
  assert.deepEqual(classifyFood99Failure({errno: 10101}), {
    cause: 'authorization_missing',
    status: 'awaiting_authorization',
    retryable: false,
    suspend: true,
    errno: 10101,
  });
});

test('classifies expired token errno 10102 as retryable', () => {
  assert.equal(classifyFood99Failure({errno: 10102}).cause, 'token_expired');
  assert.equal(classifyFood99Failure({errno: 10102}).retryable, true);
});

test('classifies incompatible credentials errno 14106 as non-retryable', () => {
  const result = classifyFood99Failure({errno: 14106});
  assert.equal(result.cause, 'credentials_invalid');
  assert.equal(result.retryable, false);
  assert.equal(result.suspend, true);
});

test('recognizes errno 10005 only for the documented catalog upload frequency error', () => {
  const input = {
    errno: 10005,
    endpoint: '/v3/item/item/upload',
    errmsg: 'calling frequency exceeds the limit',
  };
  assert.equal(isCatalogUploadRateLimit(input), true);
  assert.equal(classifyFood99Failure(input).cause, 'rate_limited');
});

test('recognizes a method-prefixed or absolute catalog endpoint', () => {
  assert.equal(isCatalogUploadRateLimit({
    errno: 10005,
    endpoint: 'POST https://openapi.99food.com/v3/item/item/upload?locale=pt_BR',
    errmsg: 'Calling Frequency Exceeds',
  }), true);
});

test('does not treat errno 10005 on another endpoint as a rate limit', () => {
  const result = classifyFood99Failure({
    errno: 10005,
    endpoint: '/v1/order/order/detail',
    errmsg: 'calling frequency exceeds',
  });
  assert.equal(result.cause, 'provider_failure');
  assert.equal(result.retryable, false);
});

test('does not treat errno 10005 with another message as a rate limit', () => {
  const result = classifyFood99Failure({
    errno: 10005,
    endpoint: '/v3/item/item/upload',
    errmsg: 'invalid request',
  });
  assert.equal(result.cause, 'provider_failure');
});

test('classifies transient HTTP statuses with retry enabled', () => {
  const result = classifyFood99Failure({httpStatus: 503});
  assert.equal(result.cause, 'transient_http');
  assert.equal(result.retryable, true);
});

test('classifies unknown provider errors as non-retryable provider failures', () => {
  assert.deepEqual(classifyFood99Failure({errno: 90001}), {
    cause: 'provider_failure',
    status: 'offline',
    retryable: false,
    suspend: false,
    errno: 90001,
  });
});

test('returns a friendly credential error with safe correlation fields', () => {
  const message = friendlyFood99Error({
    errno: 14106,
    requestId: 'req-1',
    endpoint: '/v1/auth/authtoken/get',
    errmsg: 'app_secret=never-show-this',
  });
  assert.match(message, /App ID\/App Secret inválidos/);
  assert.match(message, /errno 14106/);
  assert.match(message, /requestId req-1/);
  assert.doesNotMatch(message, /never-show-this/);
});

test('uses the rate-limit friendly message only for the exact catalog condition', () => {
  const matching = friendlyFood99Error({
    errno: 10005,
    endpoint: '/v3/item/item/upload',
    errmsg: 'calling frequency exceeds',
  });
  const nonMatching = friendlyFood99Error({
    errno: 10005,
    endpoint: '/v1/order/order/detail',
    errmsg: 'calling frequency exceeds',
  });
  assert.match(matching, /limitou temporariamente/);
  assert.doesNotMatch(nonMatching, /limitou temporariamente/);
});

test('isolates token cache keys by environment', () => {
  const base = {lojaId: 'store-1', appKey: 'app-1', merchantId: 'shop-1'};
  assert.notEqual(
    tokenCacheKey({...base, environment: 'development'}),
    tokenCacheKey({...base, environment: 'production'})
  );
});

test('isolates token cache keys by store, app, and merchant', () => {
  const base = {environment: 'development', lojaId: 'store', appKey: 'app', merchantId: 'shop'};
  assert.notEqual(tokenCacheKey(base), tokenCacheKey({...base, lojaId: 'store-2'}));
  assert.notEqual(tokenCacheKey(base), tokenCacheKey({...base, appKey: 'app-2'}));
  assert.notEqual(tokenCacheKey(base), tokenCacheKey({...base, merchantId: 'shop-2'}));
});

test('builds bounded environment-scoped Firestore document IDs', () => {
  const value = environmentDocId('cache', 'development', 'Store A', 'App/B');
  assert.equal(value, 'cache__development__store_a__app_b');
  assert.ok(value.length <= 240);
});

test('isolates mapping IDs by environment and product', () => {
  assert.notEqual(mappingDocId('development', 'p1'), mappingDocId('production', 'p1'));
  assert.notEqual(mappingDocId('development', 'p1'), mappingDocId('development', 'p2'));
});

test('isolates catalog queue keys globally by environment and app', () => {
  const base = {environment: 'development', appKey: 'app-a'};
  assert.notEqual(catalogQueueKey(base), catalogQueueKey({...base, environment: 'production'}));
  assert.notEqual(catalogQueueKey(base), catalogQueueKey({...base, appKey: 'app-b'}));
});

test('isolates distributed lock keys by environment, app, store, and operation', () => {
  const base = {environment: 'development', appKey: 'app', lojaId: 'store', operation: 'token'};
  assert.notEqual(lockKey(base), lockKey({...base, environment: 'production'}));
  assert.notEqual(lockKey(base), lockKey({...base, appKey: 'other'}));
  assert.notEqual(lockKey(base), lockKey({...base, lojaId: 'other'}));
  assert.notEqual(lockKey(base), lockKey({...base, operation: 'catalog'}));
});

test('creates deterministic alert fingerprints', () => {
  const input = {
    integration: 'food99',
    lojaId: 'store',
    environment: 'development',
    endpoint: '/v1/test',
    errno: 10101,
    cause: 'authorization_missing',
  };
  assert.equal(alertFingerprint(input), alertFingerprint({...input}));
  assert.equal(alertFingerprint(input).length, 32);
});

test('isolates alert fingerprints by environment and cause', () => {
  const input = {lojaId: 'store', environment: 'development', endpoint: '/v1/test', errno: 1, cause: 'a'};
  assert.notEqual(alertFingerprint(input), alertFingerprint({...input, environment: 'production'}));
  assert.notEqual(alertFingerprint(input), alertFingerprint({...input, cause: 'b'}));
});

test('applies deterministic half-to-full jitter to exponential backoff', () => {
  assert.equal(jitteredBackoffMs(0, {baseMs: 1000, random: () => 0}), 500);
  assert.equal(jitteredBackoffMs(0, {baseMs: 1000, random: () => 1}), 1000);
  assert.equal(jitteredBackoffMs(2, {baseMs: 1000, random: () => 0.5}), 3000);
});

test('caps exponential backoff before applying jitter', () => {
  assert.equal(jitteredBackoffMs(20, {baseMs: 1000, capMs: 30000, random: () => 1}), 30000);
});

test('schedules the next catalog attempt after the 60-second window plus safety', () => {
  assert.equal(nextCatalogAttemptAt(1000, () => 0), 66000);
  assert.equal(nextCatalogAttemptAt(1000, () => 1), 76000);
});

test('refreshes only an authorized persisted token for errno 10102', () => {
  assert.equal(shouldRefreshToken({
    errno: 10102,
    hasPersistedToken: true,
    authorizationStatus: 'authorized',
  }), true);
  assert.equal(shouldRefreshToken({
    errno: 10102,
    hasPersistedToken: false,
    authorizationStatus: 'authorized',
  }), false);
});

test('does not refresh an awaiting-authorization token', () => {
  assert.equal(shouldRefreshToken({
    errno: 10102,
    hasPersistedToken: true,
    authorizationStatus: 'awaiting_authorization',
  }), false);
});

test('refreshes a known-expired persisted authorized token', () => {
  assert.equal(shouldRefreshToken({
    expiresAtMs: Date.now() - 1000,
    hasPersistedToken: true,
    authorizationStatus: 'authorized',
  }), true);
});

test('allows authorized operations only with every required readiness flag', () => {
  const ready = {
    enabled: true,
    credentialsReady: true,
    merchantId: 'shop',
    authorizationStatus: 'authorized',
  };
  assert.equal(canRunAuthorizedOperation(ready), true);
  assert.equal(canRunAuthorizedOperation({...ready, enabled: false}), false);
  assert.equal(canRunAuthorizedOperation({...ready, credentialsReady: false}), false);
  assert.equal(canRunAuthorizedOperation({...ready, merchantId: ''}), false);
  assert.equal(canRunAuthorizedOperation({...ready, authorizationStatus: 'awaiting_authorization'}), false);
});

test('deduplicates and trims non-empty IDs while retaining input order', () => {
  assert.deepEqual(dedupeIds([' a ', '', 'b', 'a', null, 'b']), ['a', 'b']);
});

test('normalizes unsafe key fragments and bounds their length', () => {
  assert.equal(safeKeyPart(' Store / A '), 'store_a');
  assert.ok(safeKeyPart('x'.repeat(200)).length <= 80);
  assert.equal(safeKeyPart('***', 'fallback'), 'fallback');
});

test('removes secrets and signatures recursively from public configuration', () => {
  const safe = secretSafePublicConfig({
    environment: 'development',
    clientId: 'app-id',
    app_id: 'app-id',
    clientIdSuffix: '1234',
    clientSecret: 'secret',
    app_secret: 'secret',
    nested: {
      auth_token: 'token',
      access_token: 'token',
      refresh_token: 'token',
      authorization: 'Bearer token',
      'didi-header-sign': 'signature',
      sign: 'signature',
      merchantId: 'shop',
    },
  });
  assert.deepEqual(safe, {
    environment: 'development',
    nested: {merchantId: 'shop'},
  });
});

test('removes request and response content recursively from log context', () => {
  const safe = sanitizeLogContext({
    lojaId: 'store',
    payload: {auth_token: 'token'},
    nested: [{headers: {authorization: 'secret'}, requestId: 'req-1'}],
  });
  assert.deepEqual(safe, {lojaId: 'store', nested: [{requestId: 'req-1'}]});
});

test('preserves non-plain timestamp-like objects while sanitizing context', () => {
  const date = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(sanitizeLogContext({at: date}).at, date);
});

test('handles circular plain objects without leaking or throwing', () => {
  const input = {requestId: 'req'};
  input.self = input;
  assert.deepEqual(sanitizeLogContext(input), {requestId: 'req', self: '[circular]'});
});
