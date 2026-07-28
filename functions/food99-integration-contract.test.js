const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const functionsDir = __dirname;
const repositoryRoot = path.resolve(functionsDir, '..');
const food99Path = path.join(functionsDir, 'food99.js');
const food99CorePath = path.join(functionsDir, 'food99-core.js');
const ifoodBackendPath = path.join(functionsDir, 'ifood.js');
const ifoodFrontendPath = path.join(repositoryRoot, 'crm', 'src', 'components', 'ifood', 'IfoodHub.js');
const food99FrontendPath = path.join(repositoryRoot, 'crm', 'src', 'components', 'food99', 'Food99Hub.js');

const food99Source = fs.readFileSync(food99Path, 'utf8');
const coreSource = fs.readFileSync(food99CorePath, 'utf8');
const ifoodBackendSource = fs.readFileSync(ifoodBackendPath, 'utf8');
const ifoodFrontendSource = fs.readFileSync(ifoodFrontendPath, 'utf8');
const food99FrontendSource = fs.readFileSync(food99FrontendPath, 'utf8');
const core = require(food99CorePath);

const section = (source, start, end) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
};

const occurrences = (source, needle) => source.split(needle).length - 1;

test('uses the current official 99Food OpenAPI host', () => {
  assert.match(coreSource, /CURRENT_FOOD99_HOST\s*=\s*['"]https:\/\/openapi\.99food\.com['"]/);
  assert.match(food99Source, /DEFAULT_API_URL\s*=\s*CURRENT_FOOD99_HOST/);
  assert.match(food99Source, /DEFAULT_AUTH_URL\s*=\s*CURRENT_FOOD99_HOST/);
});

test('does not wire the retired didi-food host into the integration runtime', () => {
  assert.doesNotMatch(food99Source, /openapi\.didi-food\.com/i);
  assert.equal(core.resolveFood99BaseUrl({savedUrl: 'https://openapi.didi-food.com'}), 'https://openapi.99food.com');
});

test('rejects API destinations outside the current host allowlist', () => {
  const buildUrl = section(food99Source, 'const buildUrl =', 'const fetchWithTimeout =');
  assert.match(buildUrl, /url\.origin\s*!==\s*CURRENT_FOOD99_HOST/);
  assert.match(buildUrl, /Host 99Food fora da allowlist/);
});

test('network failures cannot echo credential-bearing request URLs', () => {
  const fetchWithTimeout = section(food99Source, 'const fetchWithTimeout =', 'const credentialsForConfig =');
  assert.match(fetchWithTimeout, /new HttpsError\('unavailable', 'Falha de rede ao acessar a 99Food\.'/);
  assert.doesNotMatch(fetchWithTimeout, /throw error/);
});

test('requires an explicit environment on every callable', () => {
  const callableCount = (food99Source.match(/^\s{4}food99\w+:\s+onCall/gm) || []).length;
  const environmentGuardCount = (food99Source.match(/^\s{6}(?:const environment = )?requestEnvironment\(request\);/gm) || []).length;
  assert.ok(callableCount >= 18, `expected the complete callable surface, found ${callableCount}`);
  assert.equal(environmentGuardCount, callableCount);
});

test('environment guard fails closed for omitted or invalid values', () => {
  const requestEnvironment = section(food99Source, 'const requestEnvironment =', 'const dateMillis =');
  assert.match(requestEnvironment, /strictEnvironment\(request\.data\?\.environment\)/);
  assert.match(requestEnvironment, /if \(!environment\)/);
  assert.match(requestEnvironment, /HttpsError\('invalid-argument'/);
});

test('stores configuration, health, authorization and mappings with environment scope', () => {
  assert.match(food99Source, /doc\(`config_\$\{normalizeEnvironment\(environment\)\}`\)/);
  assert.match(food99Source, /doc\(`status_\$\{normalizeEnvironment\(environment\)\}`\)/);
  assert.match(food99Source, /environmentDocId\('authorization', environment, appKey\)/);
  assert.match(food99Source, /mappingDocId\(environment, productId\)/);
});

test('has both local token caching and local single-flight state', () => {
  assert.match(food99Source, /const tokenCache = new Map\(\)/);
  assert.match(food99Source, /const tokenFlights = new Map\(\)/);
});

test('single-flight shares an in-progress token promise and clears it on completion', () => {
  const singleFlight = section(food99Source, 'const runSingleFlight =', 'const normalizePlatformConfig =');
  assert.match(singleFlight, /tokenFlights\.get\(key\)/);
  assert.match(singleFlight, /if \(existing\) return existing/);
  assert.match(singleFlight, /\.finally\(\(\) => tokenFlights\.delete\(key\)\)/);
  assert.match(singleFlight, /tokenFlights\.set\(key, flight\)/);
});

test('loads a valid persisted token before requesting a new provider token', () => {
  const tokenForStore = section(food99Source, 'const tokenForStore =', 'const request99Food =');
  const persistedRead = tokenForStore.indexOf('food99SecretAccess(config.tokenSecretVersion)');
  const providerGet = tokenForStore.indexOf('getTokenPayload(lockedConfig, credentials)');
  assert.ok(persistedRead >= 0);
  assert.ok(providerGet > persistedRead);
  assert.match(tokenForStore, /dateMillis\(config\.tokenExpiresAt\)\s*>\s*Date\.now\(\) \+ 60000/);
});

test('refresh policy is restricted to an authorized persisted token and errno 10102 or expiry', () => {
  assert.equal(core.shouldRefreshToken({
    errno: 10102,
    hasPersistedToken: true,
    authorizationStatus: 'authorized',
  }), true);
  assert.equal(core.shouldRefreshToken({
    errno: 10102,
    hasPersistedToken: false,
    authorizationStatus: 'authorized',
  }), false);
  assert.equal(core.shouldRefreshToken({
    errno: 14106,
    hasPersistedToken: true,
    authorizationStatus: 'authorized',
  }), false);
});

test('does not perform a catch-all token refresh after get failures', () => {
  const tokenForStore = section(food99Source, 'const tokenForStore =', 'const request99Food =');
  assert.equal(occurrences(tokenForStore, 'refreshTokenPayload(lockedConfig, credentials)'), 2);
  assert.match(tokenForStore, /if \(requestedRecoveryMode === 'refresh'\)[\s\S]*?shouldRefreshToken\([\s\S]*?if \(!refreshAllowed\)[\s\S]*?refreshTokenPayload\(lockedConfig, credentials\)/);
  assert.match(tokenForStore, /catch \(error\)[\s\S]*?shouldRefreshToken\([\s\S]*?if \(!refreshAllowed\) throw error;[\s\S]*?refreshTokenPayload\(lockedConfig, credentials\)/);
});

test('handles errno 10101 as missing authorization without refreshing', () => {
  const tokenForStore = section(food99Source, 'const tokenForStore =', 'const request99Food =');
  const missingAuth = tokenForStore.indexOf('Number(error.food99Errno) === 10101');
  const suspension = tokenForStore.indexOf("'awaiting_authorization'", missingAuth);
  const earlyThrow = tokenForStore.indexOf('throw error', suspension);
  assert.ok(missingAuth >= 0 && suspension > missingAuth && earlyThrow > suspension);
  assert.doesNotMatch(tokenForStore.slice(missingAuth, earlyThrow), /refreshTokenPayload/);
});

test('serializes token refresh across instances with a distributed lock', () => {
  const tokenForStore = section(food99Source, 'const tokenForStore =', 'const request99Food =');
  assert.match(tokenForStore, /operation:\s*'auth_token_refresh'/);
  assert.match(tokenForStore, /await acquireDistributedLock\(distributedKey, AUTH_LOCK_TTL_MS\)/);
  assert.match(tokenForStore, /finally\s*{\s*await releaseDistributedLock\(lock\)/s);
  assert.ok(tokenForStore.indexOf('acquireDistributedLock') < tokenForStore.indexOf('getTokenPayload(lockedConfig, credentials)'));
  assert.match(tokenForStore, /latestAuthorizationSnap = await authorizationRef/);
  assert.match(tokenForStore, /anotherWorkerRotatedToken/);
  assert.match(food99Source, /AUTH_LOCK_TTL_MS = 120 \* 1000/);
});

test('recovers an expired business token only once through forced refresh', () => {
  const request = section(food99Source, 'const request99Food =', 'const loadMappings =');
  assert.match(request, /Number\(error\.food99Errno\) === 10102/);
  assert.match(request, /await prepareTokenRecovery\(/);
  assert.match(request, /tokenRecoveryMode = tokenExpired \? 'refresh' : 'reload'/);
  assert.match(request, /!tokenRecoveryAttempted/);
  assert.match(request, /forceRefresh: tokenRecoveryMode === 'refresh'/);
  const recovery = section(food99Source, 'const prepareTokenRecovery =', 'const getTokenPayload =');
  assert.match(recovery, /tokenCache\.delete\(cacheKey\)/);
  assert.match(recovery, /tokenRecoveryRequired:\s*true/);
  assert.match(recovery, /tokenExpiresAt:\s*new Date\(0\)/);
  assert.match(recovery, /if \(recoveryAttempts >= 3\) return false/);
  assert.match(food99Source, /const clearTokenRecoveryHistory =/);
});

test('TestConnection reports pending authorization without fetching or refreshing a token', () => {
  const testConnection = section(food99Source, 'food99TestConnection: onCall', 'food99LoadMerchants: onCall');
  const pendingCheck = testConnection.indexOf("config.authorizationStatus !== 'authorized'");
  const pendingReturn = testConnection.indexOf("authorizationStatus: 'awaiting_authorization'", pendingCheck);
  const firstProviderRequest = testConnection.indexOf('validateStoreConnection(', pendingCheck);
  assert.ok(pendingCheck >= 0 && pendingReturn > pendingCheck);
  assert.ok(firstProviderRequest > pendingReturn);
  assert.doesNotMatch(testConnection.slice(pendingCheck, firstProviderRequest), /refreshTokenPayload|tokenForStore/);
});

test('polling is gated by enabled, credentials, merchant and authorized state', () => {
  const polling = section(food99Source, 'const runPoll =', 'food99GetConfiguration: onCall');
  assert.match(polling, /if \(!canRunAuthorizedOperation\(config\) \|\| !config\.pollingEnabled \|\| config\.ordersSyncEnabled === false\)/);
  assert.equal(core.canRunAuthorizedOperation({
    enabled: true,
    credentialsReady: true,
    merchantId: 'shop',
    authorizationStatus: 'authorized',
  }), true);
  assert.equal(core.canRunAuthorizedOperation({
    enabled: true,
    credentialsReady: true,
    merchantId: 'shop',
    authorizationStatus: 'awaiting_authorization',
  }), false);
});

test('polling turns errno 10101 into a skipped awaiting-authorization result before alert creation', () => {
  const polling = section(food99Source, 'const runPoll =', 'food99GetConfiguration: onCall');
  assert.match(polling, /Number\(error\.food99Errno\) === 10101\s*\?\s*'awaiting_authorization'/s);
  const skip = polling.indexOf("if (['awaiting_authorization', 'credentials_invalid'].includes(status))");
  const alert = polling.indexOf("createAlert(lojaId, 'api_poll_failure'", skip);
  assert.ok(skip >= 0 && alert > skip);
  assert.match(polling.slice(skip, alert), /return \{skipped: true, reason: status\}/);
});

test('scheduled polling only visits enabled environment-scoped config documents', () => {
  const scheduler = section(food99Source, 'food99ScheduledPoll: onSchedule', 'food99ProductStockChanged:');
  assert.match(scheduler, /where\('pollingEnabled', '==', true\)/);
  assert.match(scheduler, /\^config\(_development\|_production\)\?\$/);
  assert.match(scheduler, /doc\.get\('enabled'\) === true/);
  assert.match(scheduler, /FOOD99_ENVIRONMENTS\.DEVELOPMENT/);
  assert.match(scheduler, /FOOD99_ENVIRONMENTS\.PRODUCTION/);
});

test('persists catalog queues below the platform integration document', () => {
  assert.match(food99Source, /platformConfigRef\(\)\.collection\('catalogQueues'\)/);
  assert.match(food99Source, /\.doc\(catalogQueueKey\(\{environment, appKey\}\)\)/);
  const enqueue = section(food99Source, 'const enqueueCatalogPublish =', 'const processCatalogQueue =');
  assert.match(enqueue, /db\.runTransaction/);
  assert.match(enqueue, /productIds:\s*dedupeIds\(\[\.\.\.\(job\.productIds \|\| \[\]\), \.\.\.requestedIds\]\)/);
  assert.match(enqueue, /generation:\s*asNumber\(job\.generation\) \+ 1/);
  assert.doesNotMatch(enqueue, /processCatalogQueue\(/);
  assert.match(enqueue, /return \{queued: true, \.\.\.queued\}/);
});

test('catalog upload lock is global per environment, application and endpoint', () => {
  const dispatcher = section(food99Source, 'const processCatalogQueue =', 'const reconcileFailedAvailability =');
  const lockCall = section(dispatcher, 'const lock = await acquireDistributedLock(lockKey({', '}), CATALOG_LOCK_TTL_MS);');
  assert.match(lockCall, /\benvironment\b/);
  assert.match(lockCall, /\bappKey\b/);
  assert.match(lockCall, /operation:\s*CATALOG_UPLOAD_PATH/);
  assert.doesNotMatch(lockCall, /\blojaId\b/);
  assert.equal(core.lockKey({
    environment: 'development',
    appKey: 'app-a',
    operation: '/v3/item/item/upload',
  }), core.lockKey({
    environment: 'development',
    appKey: 'app-a',
    lojaId: 'global',
    operation: '/v3/item/item/upload',
  }));
});

test('catalog publishing performs one consolidated upload for the prepared menu', () => {
  const publish = section(food99Source, 'const publishConsolidatedCatalog =', 'const enqueueCatalogPublish =');
  assert.equal(occurrences(publish, 'request99Food('), 1);
  assert.equal(occurrences(publish, 'CATALOG_UPLOAD_PATH'), 1);
  assert.match(publish, /body:\s*{\s*menus:\s*menuState\.menus,\s*categories:\s*menuState\.categories,\s*items:\s*menuState\.items,/s);
});

test('catalog upload makes exactly one HTTP attempt per queue execution', () => {
  const publish = section(food99Source, 'const publishConsolidatedCatalog =', 'const enqueueCatalogPublish =');
  assert.match(publish, /CATALOG_UPLOAD_PATH,\s*{\s*method:\s*'POST',\s*attempts:\s*1,/s);
});

test('queue records each execution attempt atomically', () => {
  const dispatcher = section(food99Source, 'const processCatalogQueue =', 'const reconcileFailedAvailability =');
  assert.match(dispatcher, /status:\s*'running'/);
  assert.match(dispatcher, /attempt:\s*FieldValue\.increment\(1\)/);
  assert.match(dispatcher, /changedWhileRunning/);
});

test('treats errno 10005 as rate limiting only for the upload frequency response', () => {
  assert.equal(core.classifyFood99Failure({
    errno: 10005,
    endpoint: '/v3/item/item/upload',
    errmsg: 'calling frequency exceeds',
  }).cause, 'rate_limited');
  assert.equal(core.classifyFood99Failure({
    errno: 10005,
    endpoint: '/v3/item/item/upload',
    errmsg: 'item missing',
  }).cause, 'provider_failure');
  assert.equal(core.classifyFood99Failure({
    errno: 10005,
    endpoint: '/v3/item/task/query',
    errmsg: 'calling frequency exceeds',
  }).cause, 'provider_failure');
});

test('rate-limited catalog work is rescheduled beyond the one-minute window', () => {
  const dispatcher = section(food99Source, 'const processCatalogQueue =', 'const reconcileFailedAvailability =');
  assert.match(dispatcher, /classification\.cause === 'rate_limited' \|\| classification\.retryable \|\| error\.food99TokenRecoveryPrepared/);
  assert.match(dispatcher, /const nextAllowedAt = new Date\(nextCatalogAttemptAt\(\)\)/);
  assert.match(dispatcher, /status:\s*'queued',\s*scheduledAt:\s*nextAllowedAt/s);
  assert.ok(core.nextCatalogAttemptAt(1_000, () => 0) >= 66_000);
});

test('deduplicates alerts transactionally and preserves first-seen metadata', () => {
  const alerts = section(food99Source, 'const createAlert =', 'const catalogCacheFromSnap =');
  assert.match(alerts, /alertFingerprint/);
  assert.match(alerts, /db\.runTransaction\(async \(transaction\)/);
  assert.match(alerts, /count:\s*Math\.max\(0, asNumber\(previous\.count\)\) \+ 1/);
  assert.match(alerts, /firstSeenAt:\s*previous\.firstSeenAt \|\| FieldValue\.serverTimestamp\(\)/);
  assert.match(alerts, /lastSeenAt:\s*FieldValue\.serverTimestamp\(\)/);
  assert.match(alerts, /createdAt:\s*previous\.createdAt \|\| FieldValue\.serverTimestamp\(\)/);
  assert.match(alerts, /cause,\s*}\);/);
  assert.doesNotMatch(alerts, /cause:\s*context\.(?:orderId|productId|eventId)/);
});

test('authorization URL request follows the endpoint-specific app_id-only contract', () => {
  const authorization = section(food99Source, 'food99StartAuthorization: onCall', 'food99CheckAuthorization: onCall');
  assert.match(authorization, /body:\s*JSON\.stringify\(\{app_id: clientId\}\)/);
  assert.doesNotMatch(authorization, /signFood99Params|JSON\.stringify\(\{[^}]*\b(?:timestamp|sign)\b/);
});

test('authorization check reconciles missed webhooks through the official signed list or token fallback', () => {
  const reconciliation = section(food99Source, 'const claimBoundShopsRateWindow =', 'const buildPlatformSettings =');
  assert.match(reconciliation, /BOUND_SHOPS_LIST_PATH/);
  assert.match(reconciliation, /authorizationSearchRef\(lojaId, config\.environment, config\.appKey\)/);
  assert.match(reconciliation, /page_no:\s*pageNo/);
  assert.match(reconciliation, /page_size:\s*100/);
  assert.match(reconciliation, /sign:\s*signFood99Params\(unsignedBody, credentials\.clientSecret\)/);
  assert.match(reconciliation, /findBoundFood99Shop\(shops, config\.merchantId\)/);
  assert.match(reconciliation, /reconciliationAuthorizationSource\s*=\s*reconciliationMode === 'auth_token_fallback'/);
  assert.match(reconciliation, /\? 'auth_token_reconciliation'\s*:\s*'shop_list_reconciliation'/);
  assert.match(reconciliation, /Number\(error\.food99Errno\) === 10002/);
  assert.match(reconciliation, /tokenPayload = await getTokenPayload\(config, credentials\)/);
  assert.match(reconciliation, /authorization\.reconciled/);
  assert.ok(
    reconciliation.indexOf('validateStoreToken(config, tokenData.auth_token)')
      < reconciliation.indexOf('persistAuthToken(lojaId, config, tokenData'),
    'shop detail must be validated before persisting an authorized token'
  );
  assert.doesNotMatch(reconciliation, /logger\.(?:info|warn|error)\([^;]*(?:body|payload|credentials|sign)/s);

  const callable = section(food99Source, 'food99CheckAuthorization: onCall', 'food99TestConnection: onCall');
  assert.match(callable, /return reconcileStoreAuthorization\(lojaId, config, environment, uid\)/);
});

test('legacy production mappings are read but updates use an additive scoped document', () => {
  const reader = section(food99Source, 'const readProductMapping =', 'const requestEnvironment =');
  assert.match(reader, /mappingCollection\(lojaId\)\.doc\(productId\)\.get\(\)/);
  assert.match(reader, /return \{snapshot: legacySnap, writeRef, legacy: legacySnap\.exists\}/);
  const stockSync = section(food99Source, 'const syncProductAvailability =', 'const externalCodeForProduct =');
  assert.match(stockSync, /mappingRecord\.writeRef\.set/);
  assert.doesNotMatch(stockSync, /mappingSnap\.ref\.set/);
  assert.match(food99Source, /const dedupeMappingDocs =/);
  const retry = section(food99Source, 'const reconcileFailedAvailability =', 'const runPoll =');
  assert.match(retry, /if \(scopedSnap\.exists\) continue/);
  const manual = section(food99Source, 'food99SyncStockNow: onCall', 'food99ScheduledPoll: onSchedule');
  assert.match(manual, /dedupeMappingDocs\(mappings\.docs, environment\)/);
});

test('resolves matching alerts without deleting their occurrence history', () => {
  const resolver = section(food99Source, 'const resolveAlertsByType =', 'const setHealth =');
  assert.match(resolver, /data\.status !== 'resolved'/);
  assert.match(resolver, /status:\s*'resolved'/);
  assert.match(resolver, /resolvedAt:\s*FieldValue\.serverTimestamp\(\)/);
  assert.doesNotMatch(resolver, /transaction\.delete|batch\.delete|\.delete\(\)/);
});

test('persists auth tokens as rotated Secret Manager versions and stores only the version pointer', () => {
  const persistence = section(food99Source, 'const persistAuthToken =', 'const suspendAuthorization =');
  assert.match(persistence, /food99SecretEnsure\(projectId, secretId/);
  assert.match(persistence, /const tokenSecretVersion = await food99SecretAddVersion\(resourceName, token\)/);
  assert.match(persistence, /tokenSecretVersion,\s*tokenExpiresAt:\s*expiresAt/s);
  assert.doesNotMatch(persistence, /authorizationRef[\s\S]*\bauth_token\s*:/);
});

test('verifies webhooks against rawBody MD5 and the official didi-header-sign header', () => {
  const webhook = food99Source.slice(food99Source.indexOf('food99Webhook: onRequest'));
  assert.match(webhook, /Buffer\.isBuffer\(request\.rawBody\)/);
  assert.match(webhook, /request\.get\('didi-header-sign'\)/);
  assert.match(webhook, /signFood99Webhook\(request\.rawBody, appSecret\)/);
  assert.match(webhook, /extractFood99AppIdFromRawBody\(request\.rawBody\)/);
  assert.match(webhook, /secretValuesEqual\(payloadAppId, configuredAppId\)/);
  assert.doesNotMatch(webhook, /cleanText\(\s*request\.body\?\.app_id/);
  assert.match(coreSource, /crypto\.createHash\('md5'\)\.update\(raw\)\.update\(String\(appSecret \|\| ''\), 'utf8'\)/);
});

test('exposes a dedicated Cloud Run API with health and signed webhook routes', () => {
  const api = food99Source.slice(food99Source.indexOf('exportedFunctions.food99HubApi = onRequest'));
  assert.match(api, /pathname === '\/health'/);
  assert.match(api, /service:\s*'food99-hub-api'/);
  assert.match(api, /response\.set\('Cache-Control', 'no-store, no-cache, must-revalidate'\)/);
  assert.match(api, /pathname === '\/webhook'/);
  assert.match(api, /await exportedFunctions\.food99Webhook\(request, response\)/);
  assert.doesNotMatch(api, /appSecret|auth_token|clientSecret/);
});

test('contains no legacy HMAC webhook verification or x-99Food-signature header', () => {
  assert.doesNotMatch(`${food99Source}\n${coreSource}`, /createHmac|x-99Food-signature/i);
});

test('sanitizes sensitive values recursively, including nested arrays', () => {
  const sanitized = core.sanitizeLogContext({
    merchantId: 'shop',
    nested: {
      clientSecret: 'never',
      records: [{auth_token: 'never'}, {safe: true}],
    },
    headers: {authorization: 'never'},
  });
  assert.deepEqual(sanitized, {
    merchantId: 'shop',
    nested: {
      records: [{}, {safe: true}],
    },
  });
  assert.match(coreSource, /Array\.isArray\(input\).*sanitizeObject\(value, blockedKeys, seen\)/);
});

test('sanitizes public configuration and audit/log payloads at their boundaries', () => {
  assert.match(food99Source, /const publicConfig = .*secretSafePublicConfig\(/);
  assert.match(food99Source, /details:\s*sanitizeLogContext\(/);
  assert.match(food99Source, /logger\.(?:warn|error)\([^;]*sanitizeLogContext\(/s);
});

test('protects platform credential endpoints with owner checks and no-store responses', () => {
  const appIdRead = section(food99Source, 'food99GetPlatformConfiguration: onCall', 'food99RevealPlatformAppSecret: onCall');
  const secretReveal = section(food99Source, 'food99RevealPlatformAppSecret: onCall', 'food99AuditPlatformAppSecretCopy: onCall');
  assert.match(appIdRead, /setNoStoreHeaders\(request\)/);
  assert.match(appIdRead, /requirePlatformAdmin\(request\)/);
  assert.match(appIdRead, /food99SecretAccess\(platformConfig\.clientIdSecretVersion\)/);
  assert.doesNotMatch(appIdRead, /clientSecretSecretVersion/);
  assert.match(secretReveal, /setNoStoreHeaders\(request\)/);
  assert.match(secretReveal, /requirePlatformAdmin\(request\)/);
  assert.match(secretReveal, /food99SecretAccess\(platformConfig\.clientSecretSecretVersion\)/);
  assert.match(food99Source, /Cache-Control', 'no-store, no-cache, must-revalidate'/);
  assert.match(food99Source, /Pragma', 'no-cache'/);
});

test('frontend reveals App Secret only on explicit owner action and clears it from memory', () => {
  const load = section(food99FrontendSource, 'const loadConfiguration = useCallback', 'useEffect(() => {');
  const secretActions = section(food99FrontendSource, 'const revealPlatformAppSecret =', 'const loadMerchants =');
  assert.match(load, /food99GetPlatformConfiguration/);
  assert.doesNotMatch(load, /food99RevealPlatformAppSecret/);
  assert.match(secretActions, /food99RevealPlatformAppSecret/);
  assert.match(secretActions, /clearRevealedAppSecret\(\)/);
  assert.doesNotMatch(secretActions, /localStorage|sessionStorage|indexedDB/i);
  assert.match(food99FrontendSource, /tab !== 'configuracao'.*clearRevealedAppSecret\(\)/);
  assert.match(food99FrontendSource, /revealedAppSecretRef\.current = ''/);
});

test('frontend gates protected controls and global save on backend permission', () => {
  assert.match(food99FrontendSource, /const isPlatformAdmin = canManagePlatform/);
  assert.match(food99FrontendSource, /result\.permissions\?\.canManagePlatform/);
  assert.match(food99FrontendSource, /readOnly=\{!isPlatformAdmin\}/);
  assert.match(food99FrontendSource, /isPlatformAdmin && appSecretRevealed/);
  assert.match(food99FrontendSource, /isPlatformAdmin \? \([\s\S]*?Salvar configuracao global/);
  assert.match(food99FrontendSource, /PROTECTED_INFO_MESSAGE/);
});

test('has no 99Food coupling in the iFood backend or frontend sources', () => {
  assert.doesNotMatch(ifoodBackendSource, /food99|99Food/);
  assert.doesNotMatch(ifoodFrontendSource, /food99|99Food/);
  assert.doesNotMatch(food99Source, /require\(['"].*ifood/i);
});

test('iFood source files are unchanged relative to HEAD', (context) => {
  const result = spawnSync('git', [
    'diff',
    '--quiet',
    'HEAD',
    '--',
    'functions/ifood.js',
    'crm/src/components/ifood/IfoodHub.js',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    context.skip(`git diff is unavailable in this runtime: ${result.error.code || result.error.message}`);
    return;
  }
  assert.equal(result.status, 0, result.stderr || 'iFood source differs from HEAD');
});
