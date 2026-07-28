const test = require('node:test');
const assert = require('node:assert/strict');

const {createFood99Functions} = require('./food99');
const {extractFood99AppIdFromRawBody, signFood99Params, signFood99Webhook} = require('./food99-core');

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const platformPath = 'integrations/food99/environments/development';
const storeConfigPath = 'lojas/store-1/food99/config_development';
const authorizationPath = 'lojas/store-1/food99/authorization__development__app';
const authorizationSearchPath = 'lojas/store-1/food99/authorization_search__development__app';
const healthPath = 'lojas/store-1/food99Health/status_development';
const authorizationRatePath = 'integrations/food99/rateLimits/shop_list__development__app';
const storeTwoConfigPath = 'lojas/store-2/food99/config_development';
const storeTwoAuthorizationPath = 'lojas/store-2/food99/authorization__development__app';
const appIdVersion = 'projects/test-project/secrets/food99_development_platform_app_id/versions/1';
const appSecretVersion = 'projects/test-project/secrets/food99_development_platform_app_secret/versions/1';

const initialPlatformConfig = () => ({
  provider: 'food99',
  environment: 'development',
  apiBaseUrl: 'https://openapi.99food.com',
  authUrl: 'https://openapi.99food.com',
  webhookUrl: 'https://food99webhook-6i65vyioiq-uc.a.run.app',
  webhookEnabled: true,
  inventoryEndpointTemplate: '',
  inventoryMethod: 'POST',
  clientIdSecretVersion: appIdVersion,
  clientSecretSecretVersion: appSecretVersion,
});

const makeHarness = ({
  appIdValue = 'real-app-id',
  fetchHandler = null,
  secretAddError = null,
  secretAddVersion = '',
  secretValues = {},
  transactionError = null,
  transactionErrorAt = 0,
  transactionErrorAfterCommitAt = 0,
  transactionHook = null,
  withStore = false,
} = {}) => {
  const documents = new Map([[platformPath, initialPlatformConfig()]]);
  if (withStore) {
    documents.set(storeConfigPath, {
      provider: 'food99',
      environment: 'development',
      merchantId: '5764610361924520465',
      merchantName: 'Ana Guimaraes Doceria - Garavelo',
      enabled: true,
      pollingEnabled: true,
      ordersSyncEnabled: true,
      stockSyncEnabled: true,
      catalogSyncEnabled: true,
    });
  }
  const writes = [];
  const transactions = [];
  const logs = [];
  const secretAccesses = [];
  const secretAdds = [];
  const secretDestroys = [];
  let generatedId = 0;
  let transactionCount = 0;

  const snapshot = (path) => {
    const data = documents.get(path);
    const segments = path.split('/');
    return {
      id: segments.at(-1),
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : {...data}),
      get: (field) => data?.[field],
      ref: {
        path,
        id: segments.at(-1),
        parent: {parent: {id: segments.at(-3)}},
      },
    };
  };

  const createRef = (path) => ({
    path,
    id: path.split('/').pop(),
    get: async () => snapshot(path),
    set: async (data, options = {}) => {
      writes.push({type: 'set', path, data, options});
      documents.set(path, options.merge ? {...(documents.get(path) || {}), ...data} : {...data});
    },
    collection: (name) => createCollection(`${path}/${name}`),
  });

  const createCollection = (path) => {
    const collection = {
      path,
      doc: (id = `generated-${++generatedId}`) => createRef(`${path}/${id}`),
      add: async (data) => {
        const ref = createRef(`${path}/generated-${++generatedId}`);
        await ref.set(data);
        return ref;
      },
      where: () => collection,
      limit: () => collection,
      get: async () => ({docs: []}),
    };
    return collection;
  };

  const db = {
    collection: (name) => createCollection(name),
    collectionGroup: (name) => {
      const createQuery = (filters = []) => ({
        where: (field, operator, value) => createQuery([...filters, {field, operator, value}]),
        get: async () => ({
          docs: [...documents.entries()]
            .filter(([path, data]) => {
              const segments = path.split('/');
              if (segments.at(-2) !== name) return false;
              return filters.every(({field, operator, value}) => (
                operator === '==' && data?.[field] === value
              ));
            })
            .map(([path]) => snapshot(path)),
        }),
      });
      return createQuery();
    },
    batch: () => ({
      update: (ref, data) => writes.push({type: 'update', path: ref.path, data}),
      set: (ref, data, options = {}) => writes.push({type: 'set', path: ref.path, data, options}),
      commit: async () => {},
    }),
    runTransaction: async (operation) => {
      transactionCount += 1;
      if (transactionHook) transactionHook({documents, transactionCount});
      const pending = [];
      const result = await operation({
        get: async (ref) => snapshot(ref.path),
        set: (ref, data, options = {}) => pending.push({type: 'set', path: ref.path, data, options}),
      });
      if (transactionError
        && !transactionErrorAfterCommitAt
        && (!transactionErrorAt || transactionCount === transactionErrorAt)) {
        throw transactionError;
      }
      transactions.push(pending.map((write) => ({...write})));
      pending.forEach((write) => {
        writes.push(write);
        documents.set(
          write.path,
          write.options.merge ? {...(documents.get(write.path) || {}), ...write.data} : {...write.data}
        );
      });
      if (transactionError && transactionCount === transactionErrorAfterCommitAt) {
        throw transactionError;
      }
      return result;
    },
  };

  const wrapHandler = (first, second) => (typeof first === 'function' ? first : second);
  const functions = createFood99Functions({
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => 'server-timestamp',
          delete: () => 'field-delete',
          increment: (value) => ({increment: value}),
        },
      },
    },
    db,
    onCall: wrapHandler,
    onRequest: wrapHandler,
    onSchedule: wrapHandler,
    onDocumentWritten: wrapHandler,
    HttpsError: FakeHttpsError,
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
    },
    verifyManagementAccess: async (uid) => (
      uid === 'owner'
        ? {role: 'dono', stores: [], allStores: true}
        : {role: 'gerente', stores: ['store-1'], allStores: false}
    ),
    userHasAccessToStores: (requesterStores, targetStores) => targetStores.every((id) => requesterStores.includes(id)),
    STORE_ALL_KEY: '__all__',
    food99SecretAccess: async (versionName) => {
      secretAccesses.push(versionName);
      if (versionName === appIdVersion) return appIdValue;
      if (versionName === appSecretVersion) return 'real-app-secret';
      if (Object.prototype.hasOwnProperty.call(secretValues, versionName)) return secretValues[versionName];
      return '';
    },
    food99SecretEnsure: async (_projectId, secretId) => `projects/test-project/secrets/${secretId}`,
    food99SecretAddVersion: async (resourceName, value) => {
      secretAdds.push({resourceName, value});
      if (secretAddError) throw secretAddError;
      return secretAddVersion || `${resourceName}/versions/2`;
    },
    food99SecretDestroyVersion: async (versionName) => {
      secretDestroys.push(versionName);
    },
    ...(fetchHandler ? {food99Fetch: fetchHandler} : {}),
  });

  const request = (uid, data = {}) => {
    const headers = {};
    return {
      auth: uid ? {uid, token: {email: `${uid}@example.test`}} : null,
      data: {environment: 'development', ...data},
      rawRequest: {
        method: 'POST',
        headers: {},
        res: {setHeader: (name, value) => { headers[name] = value; }},
      },
      headers,
    };
  };

  return {
    documents,
    functions,
    logs,
    request,
    secretAccesses,
    secretAdds,
    secretDestroys,
    transactions,
    writes,
  };
};

const invokeSignedWebhook = async (harness, rawJson, functionName = 'food99Webhook') => {
  const rawBody = Buffer.from(rawJson, 'utf8');
  let statusCode = 0;
  let responseBody;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
  };
  await harness.functions[functionName]({
    method: 'POST',
    path: functionName === 'food99HubApi' ? '/webhook' : '/',
    url: functionName === 'food99HubApi' ? '/webhook?environment=development' : '/?environment=development',
    query: {environment: 'development'},
    body: JSON.parse(rawJson),
    rawBody,
    get: (name) => (
      String(name).toLowerCase() === 'didi-header-sign'
        ? signFood99Webhook(rawBody, 'real-app-secret')
        : ''
    ),
  }, response);
  return {responseBody, statusCode};
};

test('food99 Hub API exposes a secret-free health endpoint with no-store headers', async () => {
  const harness = makeHarness();
  let statusCode = 0;
  let responseBody;
  const headers = {};
  const response = {
    set(name, value) {
      headers[name] = value;
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
  };

  await harness.functions.food99HubApi({method: 'GET', path: '/health', url: '/health'}, response);

  assert.equal(statusCode, 200);
  assert.equal(responseBody.ok, true);
  assert.equal(responseBody.service, 'food99-hub-api');
  assert.equal(responseBody.provider, 'food99');
  assert.match(responseBody.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(headers['Cache-Control'], 'no-store, no-cache, must-revalidate');
  assert.equal(headers.Pragma, 'no-cache');
  assert.deepEqual(harness.secretAccesses, []);
  assert.doesNotMatch(JSON.stringify(responseBody), /secret|token|credential/i);
});

test('food99 Hub API delegates its webhook route to the signed webhook handler', async () => {
  const exactAppId = '5764607601352902593';
  const exactShopId = '5764610361924520465';
  const harness = makeHarness({appIdValue: exactAppId, withStore: true});
  const rawJson = `{"app_id":${exactAppId},"type":"shopBindStatus","timestamp":1760678329,"data":{"appShopIDList":["${exactShopId}"],"bindStatus":"bind"}}`;

  const result = await invokeSignedWebhook(harness, rawJson, 'food99HubApi');

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.responseBody, {errno: 0});
  assert.equal(harness.documents.get(authorizationPath)?.status, 'authorized');
});

test('owner receives the real App ID without loading the App Secret', async () => {
  const harness = makeHarness();
  const req = harness.request('owner', {lojaId: 'store-1'});
  const result = await harness.functions.food99GetPlatformConfiguration(req);

  assert.equal(result.appId, 'real-app-id');
  assert.deepEqual(harness.secretAccesses, [appIdVersion]);
  assert.equal(req.headers['Cache-Control'], 'no-store, no-cache, must-revalidate');
  assert.equal(req.headers.Pragma, 'no-cache');
  assert.doesNotMatch(JSON.stringify(result.platform), /real-app-(?:id|secret)/);
});

test('non-owner receives no App ID or App Secret in the regular configuration response', async () => {
  const harness = makeHarness();
  const result = await harness.functions.food99GetConfiguration(harness.request('manager', {lojaId: 'store-1'}));

  assert.equal(result.permissions.canManagePlatform, false);
  assert.equal(result.platform.apiBaseUrl, 'https://openapi.99food.com');
  assert.equal(result.platform.webhookUrl, 'https://food99webhook-6i65vyioiq-uc.a.run.app');
  assert.doesNotMatch(JSON.stringify(result), /real-app-(?:id|secret)|\*{4}.*\d/);
  assert.deepEqual(harness.secretAccesses, []);
});

test('non-owner gets permission-denied even when forging role in the payload', async () => {
  const harness = makeHarness();
  const attempts = [
    () => harness.functions.food99GetPlatformConfiguration(harness.request('manager', {role: 'dono'})),
    () => harness.functions.food99RevealPlatformAppSecret(harness.request('manager', {role: 'dono'})),
    () => harness.functions.food99SavePlatformConfiguration(harness.request('manager', {
      role: 'dono',
      apiBaseUrl: 'https://openapi.99food.com',
      authUrl: 'https://openapi.99food.com',
      webhookUrl: 'https://hooks.example.com/99food',
    })),
  ];
  for (const attempt of attempts) {
    await assert.rejects(attempt, (error) => error.code === 'permission-denied');
  }
  assert.deepEqual(harness.secretAccesses, []);
  assert.deepEqual(harness.writes, []);
});

test('App Secret reveal is explicit, no-store and audited without its value', async () => {
  const harness = makeHarness();
  const req = harness.request('owner', {lojaId: 'store-1'});
  const result = await harness.functions.food99RevealPlatformAppSecret(req);

  assert.equal(result.appSecret, 'real-app-secret');
  assert.deepEqual(harness.secretAccesses, [appSecretVersion]);
  assert.equal(req.headers['Cache-Control'], 'no-store, no-cache, must-revalidate');
  assert.equal(req.headers.Pragma, 'no-cache');
  const persisted = JSON.stringify(harness.writes);
  assert.match(persisted, /platform\.app_secret\.revealed/);
  assert.doesNotMatch(persisted, /real-app-secret/);
  assert.doesNotMatch(JSON.stringify(harness.logs), /real-app-secret/);
});

test('unchanged global configuration performs no write', async () => {
  const harness = makeHarness();
  const result = await harness.functions.food99SavePlatformConfiguration(harness.request('owner', {
    lojaId: 'store-1',
    apiBaseUrl: 'https://openapi.99food.com/',
    authUrl: 'https://openapi.99food.com',
    webhookUrl: 'https://food99webhook-6i65vyioiq-uc.a.run.app',
    webhookEnabled: true,
    inventoryMethod: 'POST',
  }));

  assert.equal(result.changed, false);
  assert.deepEqual(harness.writes, []);
});

test('URL changes and their audit record are committed atomically', async () => {
  const harness = makeHarness();
  const result = await harness.functions.food99SavePlatformConfiguration(harness.request('owner', {
    lojaId: 'store-1',
    apiBaseUrl: 'https://openapi.99food.com',
    authUrl: 'https://openapi.99food.com',
    webhookUrl: 'https://hooks.example.com/99food?source=crm',
    webhookEnabled: true,
    inventoryMethod: 'POST',
  }));

  assert.equal(result.changed, true);
  assert.equal(harness.writes.length, 2);
  assert.equal(harness.documents.get(platformPath).webhookUrl, 'https://hooks.example.com/99food?source=crm');
  assert.match(JSON.stringify(harness.writes), /platform\.configuration\.saved/);
});

test('unapproved API hosts are rejected before any configuration write', async () => {
  const harness = makeHarness();
  await assert.rejects(
    () => harness.functions.food99SavePlatformConfiguration(harness.request('owner', {
      apiBaseUrl: 'https://openapi.99food.com.evil.test',
      authUrl: 'https://openapi.99food.com',
      webhookUrl: 'https://hooks.example.com/99food',
    })),
    (error) => error.code === 'invalid-argument'
      && error.message === 'URL não autorizada para a integração 99Food.'
  );
  assert.deepEqual(harness.writes, []);
});

test('a failed configuration transaction preserves every previous value', async () => {
  const harness = makeHarness({transactionError: Object.assign(new Error('firestore unavailable'), {code: 14})});
  await assert.rejects(
    () => harness.functions.food99SavePlatformConfiguration(harness.request('owner', {
      apiBaseUrl: 'https://openapi.99food.com',
      authUrl: 'https://openapi.99food.com',
      webhookUrl: 'https://hooks.example.com/new-path',
    })),
    (error) => error.code === 'internal'
  );
  assert.deepEqual(harness.documents.get(platformPath), initialPlatformConfig());
  assert.deepEqual(harness.writes, []);
});

test('equal secret replacement creates no version and performs no write', async () => {
  const harness = makeHarness();
  const result = await harness.functions.food99ReplacePlatformSecret(harness.request('owner', {
    kind: 'app_secret',
    value: 'real-app-secret',
    confirmed: true,
  }));

  assert.equal(result.changed, false);
  assert.deepEqual(harness.secretAdds, []);
  assert.deepEqual(harness.writes, []);
});

test('failed secret creation keeps the previous pointer and never echoes the submitted value', async () => {
  const harness = makeHarness({secretAddError: Object.assign(new Error('provider failure'), {code: 7})});
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  try {
    await assert.rejects(
      () => harness.functions.food99ReplacePlatformSecret(harness.request('owner', {
        kind: 'app_secret',
        value: 'new-secret-never-log',
        confirmed: true,
      })),
      (error) => error.code === 'permission-denied' && !error.message.includes('new-secret-never-log')
    );
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(harness.documents.get(platformPath).clientSecretSecretVersion, appSecretVersion);
  assert.deepEqual(harness.writes, []);
  assert.doesNotMatch(JSON.stringify(harness.logs), /new-secret-never-log/);
});

test('successful App Secret replacement writes only its pointer and safe audit metadata', async () => {
  const harness = makeHarness();
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  let result;
  try {
    result = await harness.functions.food99ReplacePlatformSecret(harness.request('owner', {
      lojaId: 'store-1',
      kind: 'app_secret',
      value: 'new-secret-never-persist',
      confirmed: true,
    }));
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(result.changed, true);
  assert.equal(result.version, '2');
  assert.equal(harness.writes.length, 2);
  const persisted = JSON.stringify(harness.writes);
  assert.match(persisted, /platform\.secret\.replaced/);
  assert.match(persisted, /food99_development_platform_app_secret/);
  assert.doesNotMatch(persisted, /new-secret-never-persist/);
  assert.doesNotMatch(persisted, /suffix|length/i);
});

test('reconciles a previously authorized store through the official bound-store list', async () => {
  const requests = [];
  let harness;
  let authorizationBeforeDetail;
  let protectedTokensBeforeDetail;
  const fetchHandler = async (url, options = {}) => {
    requests.push({url, options});
    const path = new URL(url).pathname;
    if (path === '/v1/shop/shop/list') {
      return {
        ok: true,
        status: 200,
        text: async () => '{"errno":0,"data":{"page_no":1,"total_page":1,"shops":[{"app_shop_id":5764610361924520465,"shop_name":"Ana Guimaraes Doceria - Garavelo","bound_flag":1}]}}',
      };
    }
    if (path === '/v1/auth/authtoken/get') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {auth_token: 'protected-auth-token', token_expiration_time: 2000000000},
        }),
      };
    }
    if (path === '/v1/shop/shop/detail') {
      authorizationBeforeDetail = harness.documents.get(authorizationPath);
      protectedTokensBeforeDetail = harness.secretAdds.length;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {
            app_shop_id: '5764610361924520465',
            name: 'Garavelo',
          },
        }),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  harness = makeHarness({
    appIdValue: '5764607601352902593',
    fetchHandler,
    withStore: true,
  });
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  let result;
  try {
    result = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(result.authorized, true);
  assert.equal(result.authorizationStatus, 'authorized');
  assert.equal(result.source, 'shop_list');
  assert.equal(authorizationBeforeDetail, undefined);
  assert.equal(protectedTokensBeforeDetail, 0);
  assert.equal(harness.documents.get(authorizationPath).status, 'authorized');
  assert.equal(harness.documents.get(authorizationPath).authorizationSource, 'shop_list_reconciliation');
  assert.equal(harness.documents.get(healthPath).status, 'authorized');
  assert.equal(harness.secretAdds.length, 1);
  assert.equal(harness.secretAdds[0].value, 'protected-auth-token');

  const listRequest = requests.find(({url}) => new URL(url).pathname === '/v1/shop/shop/list');
  assert.equal(extractFood99AppIdFromRawBody(listRequest.options.body), '5764607601352902593');
  const listBody = JSON.parse(listRequest.options.body.replace('5764607601352902593', '"5764607601352902593"'));
  const {sign, ...unsignedBody} = listBody;
  assert.equal(sign, signFood99Params(unsignedBody, 'real-app-secret'));
  assert.equal(listBody.app_id, '5764607601352902593');
  assert.equal(listBody.page_size, 100);
  assert.doesNotMatch(JSON.stringify(harness.writes), /real-app-secret|protected-auth-token|"sign"/);
  assert.doesNotMatch(JSON.stringify(harness.logs), /real-app-secret|protected-auth-token/);
});

test('does not persist a token or authorized state when shop detail validation fails', async () => {
  const requests = [];
  const fetchHandler = async (url, options = {}) => {
    requests.push({url, options});
    const path = new URL(url).pathname;
    if (path === '/v1/shop/shop/list') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {
            page_no: 1,
            total_page: 1,
            shops: [{
              app_shop_id: '5764610361924520465',
              shop_name: 'Ana Guimaraes Doceria - Garavelo',
              bound_flag: 1,
            }],
          },
        }),
      };
    }
    if (path === '/v1/auth/authtoken/get') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {auth_token: 'must-not-be-persisted', token_expiration_time: 2000000000},
        }),
      };
    }
    if (path === '/v1/shop/shop/detail') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({errno: 10101, errmsg: 'shop is not authorized'}),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    fetchHandler,
    withStore: true,
  });
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  let result;
  let caught;
  try {
    try {
      result = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
    } catch (error) {
      caught = error;
    }
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.ok(caught || result?.authorized === false);
  assert.equal(requests.some(({url}) => new URL(url).pathname === '/v1/shop/shop/detail'), true);
  const authorization = harness.documents.get(authorizationPath) || {};
  assert.notEqual(authorization.status, 'authorized');
  assert.notEqual(authorization.authorizationSource, 'shop_list_reconciliation');
  assert.equal(authorization.authorizationConfirmedAt, undefined);
  assert.deepEqual(harness.secretAdds, []);
  assert.notEqual(harness.documents.get(healthPath)?.status, 'authorized');
  assert.doesNotMatch(JSON.stringify(harness.writes), /authorization\.reconciled/);
  assert.doesNotMatch(JSON.stringify(harness.writes), /must-not-be-persisted/);
});

test('persists the bound-store cursor and advances one page per check after the 20-second window', async () => {
  const exactAppId = '5764607601352902593';
  const exactShopId = '5764610361924520465';
  const listPages = [];
  const requests = [];
  const fetchHandler = async (url, options = {}) => {
    requests.push({url, options});
    const path = new URL(url).pathname;
    if (path === '/v1/shop/shop/list') {
      const body = JSON.parse(options.body.replace(exactAppId, `"${exactAppId}"`));
      listPages.push(body.page_no);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {
            page_no: body.page_no,
            total_page: 2,
            shops: body.page_no === 2
              ? [{app_shop_id: exactShopId, shop_name: 'Garavelo', bound_flag: 1}]
              : Array.from({length: 100}, (_, index) => ({
                app_shop_id: `page-one-${index}`,
                shop_name: `Loja ${index}`,
                bound_flag: 1,
              })),
          },
        }),
      };
    }
    if (path === '/v1/auth/authtoken/get') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {auth_token: 'page-two-token', token_expiration_time: 2000000000},
        }),
      };
    }
    if (path === '/v1/shop/shop/detail') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {app_shop_id: exactShopId, name: 'Garavelo'},
        }),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const harness = makeHarness({appIdValue: exactAppId, fetchHandler, withStore: true});
  const previousProject = process.env.GCLOUD_PROJECT;
  const originalNow = Date.now;
  const startedAt = 1800000000000;
  let now = startedAt;
  process.env.GCLOUD_PROJECT = 'test-project';
  Date.now = () => now;
  try {
    const first = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
    assert.equal(first.authorized, false);
    assert.deepEqual(listPages, [1]);
    assert.equal(harness.documents.has(authorizationRatePath), true);

    now = startedAt + 19999;
    const limited = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
    assert.equal(limited.authorized, false);
    assert.ok(limited.retryAfterSeconds >= 1);
    assert.deepEqual(listPages, [1]);

    now = startedAt + 20001;
    const reconciled = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
    assert.equal(reconciled.authorized, true);
    assert.equal(reconciled.authorizationStatus, 'authorized');
    assert.deepEqual(listPages, [1, 2]);
  } finally {
    Date.now = originalNow;
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  const listRequests = requests.filter(({url}) => new URL(url).pathname === '/v1/shop/shop/list');
  assert.equal(listRequests.length, 2);
  for (const [index, listRequest] of listRequests.entries()) {
    assert.equal(extractFood99AppIdFromRawBody(listRequest.options.body), exactAppId);
    const body = JSON.parse(listRequest.options.body.replace(exactAppId, `"${exactAppId}"`));
    const {sign, ...unsignedBody} = body;
    assert.equal(body.page_no, index + 1);
    assert.equal(body.page_size, 100);
    assert.equal(sign, signFood99Params(unsignedBody, 'real-app-secret'));
  }
});

test('processes mixed bind and unbind webhook events independently with exact 64-bit IDs', async () => {
  const exactAppId = '5764607601352902593';
  const boundShopId = '5764610361924520465';
  const unboundShopId = '5764610361924530465';
  const harness = makeHarness({appIdValue: exactAppId, withStore: true});
  harness.documents.set(storeTwoConfigPath, {
    provider: 'food99',
    environment: 'development',
    merchantId: unboundShopId,
    merchantName: 'Segunda loja',
    enabled: true,
  });
  harness.documents.set(storeTwoAuthorizationPath, {
    provider: 'food99',
    environment: 'development',
    merchantId: unboundShopId,
    status: 'authorized',
    tokenSecretVersion: 'projects/test-project/secrets/old-token/versions/1',
    tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  });

  const rawJson = [
    `{"app_id":${exactAppId},"timestamp":1760678329,"events":[`,
    `{"type":"shopBindStatus","data":{"appShopIDList":[${boundShopId}],"bindStatus":"bind"}},`,
    `{"type":"shopBindStatus","data":{"appShopIDList":[${unboundShopId}],"bindStatus":"unbind"}}`,
    ']}'
  ].join('');
  const rawBody = Buffer.from(rawJson, 'utf8');
  const parsedBody = JSON.parse(rawJson);
  assert.notEqual(String(parsedBody.events[0].data.appShopIDList[0]), boundShopId);
  assert.notEqual(String(parsedBody.events[1].data.appShopIDList[0]), unboundShopId);

  let statusCode = 0;
  let responseBody;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
  };
  await harness.functions.food99Webhook({
    method: 'POST',
    query: {environment: 'development'},
    body: parsedBody,
    rawBody,
    get: (name) => (
      String(name).toLowerCase() === 'didi-header-sign'
        ? signFood99Webhook(rawBody, 'real-app-secret')
        : ''
    ),
  }, response);

  assert.equal(statusCode, 200);
  assert.deepEqual(responseBody, {errno: 0});
  assert.equal(harness.documents.get(authorizationPath)?.status, 'authorized');
  assert.equal(harness.documents.get(authorizationPath)?.merchantId, boundShopId);
  assert.equal(harness.documents.get(storeTwoAuthorizationPath)?.status, 'awaiting_authorization');
  assert.equal(harness.documents.get(storeTwoAuthorizationPath)?.merchantId, unboundShopId);
  assert.equal(harness.documents.get(storeTwoAuthorizationPath)?.tokenSecretVersion, 'field-delete');

  const auditWrites = harness.writes
    .filter(({path}) => path.includes('/food99Audit/'))
    .map(({data}) => ({action: data.action, appShopId: data.details?.appShopId}));
  assert.deepEqual(auditWrites, [
    {action: 'authorization.confirmed', appShopId: boundShopId},
    {action: 'authorization.revoked', appShopId: unboundShopId},
  ]);
  const persisted = JSON.stringify(harness.writes);
  assert.match(persisted, new RegExp(boundShopId));
  assert.match(persisted, new RegExp(unboundShopId));
});

test('ignores a timestamp-less bind, unbind, bind cycle without mutating authorization', async () => {
  const exactAppId = '5764607601352902593';
  const exactShopId = '5764610361924520465';
  const harness = makeHarness({appIdValue: exactAppId, withStore: true});
  const originalAuthorization = {
    provider: 'food99',
    environment: 'development',
    merchantId: exactShopId,
    status: 'authorized',
    tokenSecretVersion: 'projects/test-project/secrets/existing-token/versions/7',
  };
  const originalHealth = {
    provider: 'food99',
    environment: 'development',
    status: 'authorized',
    authorizationStatus: 'authorized',
  };
  harness.documents.set(authorizationPath, originalAuthorization);
  harness.documents.set(healthPath, originalHealth);
  const rawJson = [
    `{"app_id":${exactAppId},"events":[`,
    `{"type":"shopBindStatus","data":{"appShopIDList":["${exactShopId}"],"bindStatus":"bind"}},`,
    `{"type":"shopBindStatus","data":{"appShopIDList":["${exactShopId}"],"bindStatus":"unbind"}},`,
    `{"type":"shopBindStatus","data":{"appShopIDList":["${exactShopId}"],"bindStatus":"bind"}}`,
    ']}'
  ].join('');

  const result = await invokeSignedWebhook(harness, rawJson);

  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.responseBody, {errno: 0});
  assert.deepEqual(harness.documents.get(authorizationPath), originalAuthorization);
  assert.deepEqual(harness.documents.get(healthPath), originalHealth);
  assert.equal(harness.writes.some(({path}) => path.includes('/food99Audit/')), false);
  const eventPaths = [...harness.documents.keys()]
    .filter((path) => path.startsWith('lojas/store-1/food99WebhookEvents/'));
  assert.deepEqual(eventPaths, []);
});

test('applies opposite bind events with the same timestamp in received order', async () => {
  const exactAppId = '5764607601352902593';
  const exactShopId = '5764610361924520465';
  const timestamp = 1760678329;
  const scenarios = [
    {
      statuses: ['bind', 'unbind'],
      expectedActions: ['authorization.confirmed', 'authorization.revoked'],
      expectedStatus: 'awaiting_authorization',
    },
    {
      statuses: ['unbind', 'bind'],
      expectedActions: ['authorization.revoked', 'authorization.confirmed'],
      expectedStatus: 'authorized',
    },
  ];

  for (const scenario of scenarios) {
    const harness = makeHarness({appIdValue: exactAppId, withStore: true});
    const events = scenario.statuses.map((bindStatus) => (
      `{"type":"shopBindStatus","timestamp":${timestamp},"data":{"appShopIDList":["${exactShopId}"],"bindStatus":"${bindStatus}"}}`
    ));
    const rawJson = `{"app_id":${exactAppId},"events":[${events.join(',')}]}`;

    const result = await invokeSignedWebhook(harness, rawJson);

    assert.equal(result.statusCode, 200);
    assert.equal(harness.documents.get(authorizationPath)?.status, scenario.expectedStatus);
    assert.equal(harness.documents.get(authorizationPath)?.lastBindEventTimestampMs, timestamp * 1000);
    const actions = harness.writes
      .filter(({path}) => path.includes('/food99Audit/'))
      .map(({data}) => data.action);
    assert.deepEqual(actions, scenario.expectedActions);
  }
});

test('restarts the bound-store search at page one when the merchant ID changes', async () => {
  const exactAppId = '5764607601352902593';
  const previousShopId = '5764610361924520001';
  const currentShopId = '5764610361924520465';
  const requestedPages = [];
  const harness = makeHarness({
    appIdValue: exactAppId,
    withStore: true,
    fetchHandler: async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path !== '/v1/shop/shop/list') throw new Error(`Unexpected URL: ${url}`);
      const body = JSON.parse(options.body.replace(exactAppId, `"${exactAppId}"`));
      requestedPages.push(body.page_no);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {page_no: body.page_no, total_page: 8, shops: []},
        }),
      };
    },
  });
  harness.documents.set(storeConfigPath, {
    ...harness.documents.get(storeConfigPath),
    merchantId: currentShopId,
  });
  harness.documents.set(authorizationSearchPath, {
    provider: 'food99',
    environment: 'development',
    merchantId: previousShopId,
    lastPage: 6,
    nextPage: 7,
    totalPages: 8,
    searchComplete: false,
  });

  const result = await harness.functions.food99CheckAuthorization(
    harness.request('owner', {lojaId: 'store-1'})
  );

  assert.equal(result.authorized, false);
  assert.deepEqual(requestedPages, [1]);
  assert.equal(harness.documents.get(authorizationSearchPath)?.merchantId, currentShopId);
  assert.equal(harness.documents.get(authorizationSearchPath)?.lastPage, 1);
  assert.equal(harness.documents.get(authorizationSearchPath)?.nextPage, 2);
});

test('resets a stale page cursor when the official total page count shrinks', async () => {
  const existingTokenVersion = 'projects/test-project/secrets/existing-token/versions/1';
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async (_url, options = {}) => {
      const body = JSON.parse(options.body.replace('5764607601352902593', '"5764607601352902593"'));
      assert.equal(body.page_no, 2);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {page_no: 2, total_page: 1, shops: []},
        }),
      };
    },
  });
  harness.documents.set(authorizationPath, {
    provider: 'food99',
    environment: 'development',
    merchantId: '5764610361924520465',
    status: 'authorized',
    tokenSecretVersion: existingTokenVersion,
    tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  });
  harness.documents.set(authorizationSearchPath, {
    provider: 'food99',
    environment: 'development',
    appKey: 'app',
    merchantId: '5764610361924520465',
    nextPage: 2,
    totalPages: 2,
  });

  const result = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
  assert.equal(result.authorized, true);
  assert.match(result.message, /cursor voltou à página 1/);
  assert.equal(harness.documents.get(authorizationSearchPath)?.nextPage, 1);
  assert.equal(harness.documents.get(authorizationSearchPath)?.cursorInvalidated, true);
  assert.equal(harness.documents.get(authorizationPath)?.status, 'authorized');
  assert.equal(harness.documents.has(healthPath), false);
});

test('atomically revokes local authorization when a complete official scan does not contain the store', async () => {
  const exactAppId = '5764607601352902593';
  const exactShopId = '5764610361924520465';
  const requestedPaths = [];
  const harness = makeHarness({
    appIdValue: exactAppId,
    withStore: true,
    fetchHandler: async (url) => {
      const path = new URL(url).pathname;
      requestedPaths.push(path);
      if (path !== '/v1/shop/shop/list') throw new Error(`Unexpected URL: ${url}`);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {page_no: 1, total_page: 1, shops: []},
        }),
      };
    },
  });
  harness.documents.set(authorizationPath, {
    provider: 'food99',
    recordType: 'authorization',
    lojaId: 'store-1',
    environment: 'development',
    appKey: 'app',
    merchantId: exactShopId,
    status: 'authorized',
    tokenSecretVersion: 'projects/test-project/secrets/existing-token/versions/4',
    tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  });
  harness.documents.set(healthPath, {
    provider: 'food99',
    lojaId: 'store-1',
    environment: 'development',
    status: 'authorized',
    authorizationStatus: 'authorized',
  });

  const result = await harness.functions.food99CheckAuthorization(
    harness.request('owner', {lojaId: 'store-1'})
  );

  assert.equal(result.authorized, false);
  assert.equal(result.authorizationStatus, 'awaiting_authorization');
  assert.deepEqual(requestedPaths, ['/v1/shop/shop/list']);
  const authorization = harness.documents.get(authorizationPath);
  assert.equal(authorization.status, 'awaiting_authorization');
  assert.equal(authorization.suspendReason, 'shop_not_bound');
  assert.equal(authorization.tokenSecretVersion, 'field-delete');
  assert.equal(authorization.tokenExpiresAt, 'field-delete');
  assert.equal(harness.documents.get(healthPath)?.status, 'awaiting_authorization');
  assert.equal(harness.documents.get(healthPath)?.authorizationStatus, 'awaiting_authorization');

  const revocationTransaction = harness.transactions.find((transaction) => (
    transaction.some(({path, data}) => path === authorizationPath && data.status === 'awaiting_authorization')
  ));
  assert.ok(revocationTransaction);
  assert.equal(revocationTransaction.some(({path}) => path === healthPath), true);
  const auditWrite = revocationTransaction.find(({path}) => path.includes('/food99Audit/'));
  assert.equal(auditWrite?.data?.action, 'authorization.reconciliation_pending');
  assert.equal(auditWrite?.data?.details?.reason, 'shop_not_bound');
  assert.deepEqual(harness.secretAdds, []);
});

test('keeps authorization pending and rate-limits repeated official checks when the store is absent', async () => {
  let requestCount = 0;
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({errno: 0, data: {page_no: 1, total_page: 1, shops: []}}),
      };
    },
  });

  const first = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
  const second = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));

  assert.equal(first.authorized, false);
  assert.equal(first.authorizationStatus, 'awaiting_authorization');
  assert.match(first.message, /app_shop_id/);
  assert.equal(second.authorized, false);
  assert.ok(second.retryAfterSeconds > 0);
  assert.equal(requestCount, 1);
  assert.equal(harness.documents.get(authorizationPath)?.status, 'awaiting_authorization');
  assert.equal(harness.documents.get(authorizationPath)?.tokenSecretVersion, 'field-delete');
  assert.deepEqual(harness.secretAdds, []);
});

test('falls back to official token verification when the bound-store list rejects its parameters', async () => {
  const requestedPaths = [];
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async (url) => {
      const path = new URL(url).pathname;
      requestedPaths.push(path);
      if (path === '/v1/shop/shop/list') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 10002,
            errmsg: 'Parameter error.',
            requestId: 'list-parameter-request',
          }),
        };
      }
      if (path === '/v1/auth/authtoken/get') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 0,
            data: {
              app_shop_id: '5764610361924520465',
              auth_token: 'fallback-protected-token',
              token_expiration_time: 2000000000,
            },
          }),
        };
      }
      if (path === '/v1/shop/shop/detail') {
        assert.equal(new URL(url).searchParams.get('auth_token'), 'fallback-protected-token');
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 0,
            data: {app_shop_id: '5764610361924520465', name: 'Garavelo'},
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  let result;
  try {
    result = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(result.authorized, true);
  assert.equal(result.authorizationStatus, 'authorized');
  assert.equal(result.source, 'auth_token_fallback');
  assert.match(result.message, /token oficial/);
  assert.deepEqual(requestedPaths, [
    '/v1/shop/shop/list',
    '/v1/auth/authtoken/get',
    '/v1/shop/shop/detail',
  ]);
  assert.equal(harness.documents.get(authorizationPath)?.status, 'authorized');
  assert.equal(harness.documents.get(authorizationPath)?.authorizationSource, 'auth_token_reconciliation');
  assert.equal(harness.documents.get(authorizationPath)?.reconciliationEndpoint, '/v1/auth/authtoken/get');
  assert.equal(harness.documents.get(healthPath)?.status, 'authorized');
  assert.equal(harness.secretAdds.length, 1);
  assert.doesNotMatch(JSON.stringify(harness.writes), /fallback-protected-token/);
  assert.doesNotMatch(JSON.stringify(harness.logs), /fallback-protected-token|real-app-secret/);
});

test('keeps authorization pending when token fallback confirms that the store has no token', async () => {
  const requestedPaths = [];
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async (url) => {
      const path = new URL(url).pathname;
      requestedPaths.push(path);
      if (path === '/v1/shop/shop/list') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({errno: 10002, errmsg: 'Parameter error.'}),
        };
      }
      if (path === '/v1/auth/authtoken/get') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 10101,
            errmsg: 'This shop does not have auth_token.',
            requestId: 'missing-token-request',
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));

  assert.equal(result.authorized, false);
  assert.equal(result.authorizationStatus, 'awaiting_authorization');
  assert.equal(result.source, 'auth_token_fallback');
  assert.match(result.message, /ainda não autorizou/);
  assert.deepEqual(requestedPaths, ['/v1/shop/shop/list', '/v1/auth/authtoken/get']);
  assert.equal(harness.documents.get(authorizationPath)?.status, 'awaiting_authorization');
  assert.equal(harness.documents.get(authorizationPath)?.lastErrno, 10101);
  assert.equal(harness.documents.get(healthPath)?.authorizationStatus, 'awaiting_authorization');
  assert.deepEqual(harness.secretAdds, []);
});

test('rejects a token fallback response for a different app_shop_id', async () => {
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async (url) => {
      const path = new URL(url).pathname;
      if (path === '/v1/shop/shop/list') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({errno: 10002, errmsg: 'Parameter error.'}),
        };
      }
      if (path === '/v1/auth/authtoken/get') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 0,
            data: {
              app_shop_id: '5764610361924599999',
              auth_token: 'wrong-store-token',
              token_expiration_time: 2000000000,
            },
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  await assert.rejects(
    () => harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'})),
    (error) => error.code === 'failed-precondition' && /token para outra loja/.test(error.message)
  );
  assert.equal(harness.documents.has(authorizationPath), false);
  assert.equal(harness.documents.has(healthPath), false);
  assert.deepEqual(harness.secretAdds, []);
  assert.doesNotMatch(JSON.stringify(harness.logs), /wrong-store-token|real-app-secret/);
});

test('provider failure during reconciliation preserves the previous authorization state', async () => {
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({errno: 10001, errmsg: 'provider unavailable'}),
    }),
  });

  await assert.rejects(
    () => harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'})),
    (error) => error.code === 'failed-precondition'
  );
  assert.equal(harness.documents.has(authorizationPath), false);
  assert.equal(harness.documents.has(healthPath), false);
  assert.deepEqual(harness.secretAdds, []);
});

test('never revokes an authorized store from an incomplete bound-store response', async () => {
  const existingTokenVersion = 'projects/test-project/secrets/existing-token/versions/1';
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    fetchHandler: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        errno: 0,
        data: {page_no: 1, total_page: 1, shops: [{}]},
      }),
    }),
  });
  harness.documents.set(authorizationPath, {
    provider: 'food99',
    environment: 'development',
    merchantId: '5764610361924520465',
    status: 'authorized',
    tokenSecretVersion: existingTokenVersion,
    tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  });

  await assert.rejects(
    () => harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'})),
    (error) => error.code === 'failed-precondition' && /lista de lojas incompleta/.test(error.message)
  );
  assert.equal(harness.documents.get(authorizationPath)?.status, 'authorized');
  assert.equal(harness.documents.get(authorizationPath)?.tokenSecretVersion, existingTokenVersion);
  assert.equal(harness.documents.has(healthPath), false);
  assert.deepEqual(harness.secretAdds, []);
});

test('reuses a valid token when an already authorized store is verified again', async () => {
  const existingTokenVersion = 'projects/test-project/secrets/existing-token/versions/1';
  const requests = [];
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    secretValues: {[existingTokenVersion]: 'existing-valid-token'},
    fetchHandler: async (url) => {
      requests.push(url);
      const path = new URL(url).pathname;
      if (path === '/v1/shop/shop/list') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 0,
            data: {
              page_no: 1,
              total_page: 1,
              shops: [{app_shop_id: '5764610361924520465', bound_flag: 1}],
            },
          }),
        };
      }
      if (path === '/v1/shop/shop/detail') {
        assert.equal(new URL(url).searchParams.get('auth_token'), 'existing-valid-token');
        return {ok: true, status: 200, text: async () => JSON.stringify({errno: 0, data: {name: 'Garavelo'}})};
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  harness.documents.set(authorizationPath, {
    provider: 'food99',
    environment: 'development',
    appKey: 'app',
    merchantId: '5764610361924520465',
    status: 'authorized',
    tokenSecretVersion: existingTokenVersion,
    tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
  });

  const result = await harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'}));
  assert.equal(result.authorized, true);
  assert.equal(harness.documents.get(authorizationPath)?.tokenSecretVersion, existingTokenVersion);
  assert.equal(requests.some((url) => new URL(url).pathname.includes('/v1/auth/authtoken/')), false);
  assert.deepEqual(harness.secretAdds, []);
});

test('aborts a stale reconciliation and destroys its unreferenced token version', async () => {
  let harness;
  const fetchHandler = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/v1/shop/shop/list') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {
            page_no: 1,
            total_page: 1,
            shops: [{app_shop_id: '5764610361924520465', bound_flag: 1}],
          },
        }),
      };
    }
    if (path === '/v1/auth/authtoken/get') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {auth_token: 'stale-reconciliation-token', token_expiration_time: 2000000000},
        }),
      };
    }
    if (path === '/v1/shop/shop/detail') {
      harness.documents.set(storeConfigPath, {
        ...harness.documents.get(storeConfigPath),
        merchantId: '5764610361924599999',
      });
      return {ok: true, status: 200, text: async () => JSON.stringify({errno: 0, data: {name: 'Garavelo'}})};
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  harness = makeHarness({appIdValue: '5764607601352902593', fetchHandler, withStore: true});
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  try {
    await assert.rejects(
      () => harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'})),
      (error) => error.code === 'aborted'
    );
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(harness.secretAdds.length, 1);
  const createdVersion = `${harness.secretAdds[0].resourceName}/versions/2`;
  assert.deepEqual(harness.secretDestroys, [createdVersion]);
  assert.equal(harness.documents.has(authorizationPath), false);
  assert.equal(harness.documents.has(healthPath), false);
  assert.doesNotMatch(JSON.stringify(harness.writes), /stale-reconciliation-token/);
});

test('does not overwrite an authorization event that arrives during reconciliation', async () => {
  let harness;
  const fetchHandler = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/v1/shop/shop/list') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {
            page_no: 1,
            total_page: 1,
            shops: [{app_shop_id: '5764610361924520465', bound_flag: 1}],
          },
        }),
      };
    }
    if (path === '/v1/auth/authtoken/get') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          errno: 0,
          data: {auth_token: 'concurrent-token', token_expiration_time: 2000000000},
        }),
      };
    }
    if (path === '/v1/shop/shop/detail') {
      harness.documents.set(authorizationPath, {
        provider: 'food99',
        environment: 'development',
        merchantId: '5764610361924520465',
        status: 'awaiting_authorization',
        suspendReason: 'shop_unbound',
        lastBindEventTimestampMs: 1760678330000,
        lastBindEventKey: 'newer-unbind-event',
      });
      return {ok: true, status: 200, text: async () => JSON.stringify({errno: 0, data: {name: 'Garavelo'}})};
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  harness = makeHarness({appIdValue: '5764607601352902593', fetchHandler, withStore: true});
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  try {
    await assert.rejects(
      () => harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'})),
      (error) => error.code === 'aborted'
    );
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(harness.documents.get(authorizationPath)?.status, 'awaiting_authorization');
  assert.equal(harness.documents.get(authorizationPath)?.lastBindEventKey, 'newer-unbind-event');
  assert.equal(harness.secretAdds.length, 1);
  assert.equal(harness.secretDestroys.length, 1);
});

test('webhook aborts when the store merchant changes before its transaction', async () => {
  const oldMerchantId = '5764610361924520465';
  const newMerchantId = '5764610361924599999';
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    transactionHook: ({documents, transactionCount}) => {
      if (transactionCount !== 1) return;
      documents.set(storeConfigPath, {
        ...documents.get(storeConfigPath),
        merchantId: newMerchantId,
      });
    },
  });
  const result = await invokeSignedWebhook(
    harness,
    `{"app_id":5764607601352902593,"type":"shopBindStatus","timestamp":1760678329,"data":{"appShopIDList":["${oldMerchantId}"],"bindStatus":"bind"}}`
  );

  assert.notEqual(result.statusCode, 200);
  assert.equal(harness.documents.get(storeConfigPath)?.merchantId, newMerchantId);
  assert.equal(harness.documents.has(authorizationPath), false);
});

test('preserves a token version when a transaction committed before an ambiguous error', async () => {
  const ambiguousError = new Error('UNKNOWN after commit');
  const harness = makeHarness({
    appIdValue: '5764607601352902593',
    withStore: true,
    transactionError: ambiguousError,
    transactionErrorAfterCommitAt: 2,
    fetchHandler: async (url) => {
      const path = new URL(url).pathname;
      if (path === '/v1/shop/shop/list') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 0,
            data: {
              page_no: 1,
              total_page: 1,
              shops: [{app_shop_id: '5764610361924520465', bound_flag: 1}],
            },
          }),
        };
      }
      if (path === '/v1/auth/authtoken/get') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            errno: 0,
            data: {auth_token: 'committed-token', token_expiration_time: 2000000000},
          }),
        };
      }
      if (path === '/v1/shop/shop/detail') {
        return {ok: true, status: 200, text: async () => JSON.stringify({errno: 0, data: {name: 'Garavelo'}})};
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const previousProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = 'test-project';
  try {
    await assert.rejects(
      () => harness.functions.food99CheckAuthorization(harness.request('owner', {lojaId: 'store-1'})),
      (error) => error === ambiguousError
    );
  } finally {
    if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = previousProject;
  }

  assert.equal(harness.documents.get(authorizationPath)?.status, 'authorized');
  assert.match(harness.documents.get(authorizationPath)?.tokenSecretVersion || '', /versions\/2$/);
  assert.deepEqual(harness.secretDestroys, []);
});
