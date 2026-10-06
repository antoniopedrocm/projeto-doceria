const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const policy = require('./point-schedule-core');
const {generateBrowserSource} = require('../scripts/sync-point-schedule.cjs');
const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

// Execute the actual production handlers/calculators. Only Firebase I/O and
// unrelated permission helpers are replaced; no SDK/network/real user writes.
const loadBackend = (initialUsers = {}) => {
  const users = clone(initialUsers);
  const writes = [];
  const authUpdates = [];
  const authUsers = Object.fromEntries(Object.entries(users).map(([uid, data]) => [uid, {uid, email: data.email}]));
  class HttpsError extends Error {
    constructor(code, message) { super(message || code); this.code = code; }
  }
  const collection = (name) => ({
    doc: (id) => ({
      set: async (data, options) => {
        writes.push({name, id});
        users[id] = clone(options?.merge ? {...users[id], ...data} : data);
      },
    }),
    get: async () => ({forEach: (callback) => {
      if (name === 'users') Object.entries(users).forEach(([id, data]) => callback({id, data: () => clone(data)}));
    }}),
  });
  const context = vm.createContext({
    ...policy, Date, Intl, console, exports: {}, HttpsError,
    POINT_DEFAULT_EXPECTED_MINUTES: 480, POINT_DAILY_BANK_LIMIT_MINUTES: 15,
    POINT_SATURDAY_BANK_LIMIT_MINUTES: 300, POINT_MISSING_LUNCH_BANK_MINUTES: 60,
    ROLE_OWNER: 'dono', ROLE_MANAGER: 'gerente', ROLE_CLIENT: 'cliente',
    USER_STATUS_ACTIVE: 'Ativo', USER_STATUS_INACTIVE: 'Inativo',
    onCall: (optionsOrHandler, handler) => handler || optionsOrHandler,
    verifyManagementAccess: async () => ({role: 'dono', allStores: true, stores: []}),
    normalizeRole: (role) => role,
    userHasAccessToStores: () => true,
    extractStoreIds: (profile) => profile.lojaIds || [],
    getUserProfile: async (uid) => clone(users[uid] || {}),
    assertNotManagingSelf: () => {}, assertManagerCannotGrantOwnerAccess: () => {},
    assertManagerCannotGrantUserStatusAccess: async () => {},
    assertManagerCannotGrantTransferDestinationAccess: async () => {},
    preparePostClosingCashPermissionDetails: async () => ({}),
    ensureCustomProfile: async () => ({permissions: {}, permissionDetails: {}}),
    getUserPermissions: async () => ({}),
    sanitizePermissions: (value) => value,
    sanitizePermissionDetails: (value) => value,
    isUserActive: () => true,
    rethrowHttpsError: (error) => {throw error;}, logger: {error: () => {}},
    db: {collection},
    admin: {firestore: {FieldValue: {serverTimestamp: () => 'timestamp'}}},
    auth: {
      createUser: async (data) => {authUsers.employee = {uid: 'employee', ...data}; return authUsers.employee;},
      getUser: async (uid) => authUsers[uid],
      updateUser: async (uid, data) => {authUpdates.push(uid); return Object.assign(authUsers[uid], data);},
      listUsers: async () => ({users: Object.values(authUsers)}),
    },
  });
  const calculations = source.slice(source.indexOf('const pointTimeToMinutes ='), source.indexOf('const requireStoreId ='));
  vm.runInContext(calculations + '\nexports.calculate = (record) => ({summary: calculatePointSummary(record), balance: calculatePointBalanceDistribution(record), status: pointStatusPatch(record)});', context);
  const handlers = [
    ['exports.createUser =', '// Atualiza um usuário'],
    ['exports.updateUser =', 'exports.deleteUser ='],
    ['exports.listAllUsers =', 'const assertCanChangeUserStatus ='],
  ];
  handlers.forEach(([start, end]) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `handler boundary ${start}`);
    vm.runInContext(source.slice(from, to), context);
  });
  return {handlers: context.exports, users, writes, authUpdates, context};
};

const hourly = policy.sanitizeEmployeeWorkSchedule({tipoEscala: 'horista'});
const point = (overrides = {}) => ({dia: '2026-10-06', jornadaTrabalho: hourly, ...overrides});
const fiveHours = {horaEntrada: '08:00', horaAlmocoSaida: '11:00', horaAlmocoRetorno: '12:00', horaSaida: '14:00'};
const userPayload = {email: 'horista@example.test', senha: 'only-test', nome: 'Horista', role: 'atendente', lojaId: 'dev', jornadaTrabalho: hourly};

test('canonical policy and generated ESM browser copy cannot diverge', () => {
  const browser = fs.readFileSync(path.join(__dirname, '../crm/src/meuEspaco/pointScheduleCore.js'), 'utf8');
  assert.equal(browser, generateBrowserSource(fs.readFileSync(path.join(__dirname, 'point-schedule-core.js'), 'utf8')));
});

test('createUser → Firestore → listAllUsers → reopen → update → fresh session keeps Horista', async () => {
  const backend = loadBackend();
  const created = await backend.handlers.createUser({auth: {uid: 'manager'}, data: userPayload});
  assert.equal(backend.users[created.uid].jornadaTrabalho.tipoEscala, 'horista');
  const reopened = (await backend.handlers.listAllUsers({auth: {uid: 'manager'}})).users[0];
  assert.equal(reopened.jornadaTrabalho.tipoEscala, 'horista');
  await backend.handlers.updateUser({auth: {uid: 'manager'}, data: {...userPayload, uid: created.uid, nome: 'Novo nome'}});
  const reloaded = loadBackend(backend.users);
  const loggedIn = (await reloaded.handlers.listAllUsers({auth: {uid: 'manager'}})).users[0];
  assert.equal(loggedIn.jornadaTrabalho.tipoEscala, 'horista');
  assert.deepEqual(backend.writes.map((item) => item.name), ['users', 'users']);
});

test('5h real work has no 8h expected load, deficit or automatic lunch credit', () => {
  const {summary, balance} = loadBackend().handlers.calculate(point(fiveHours));
  assert.equal(summary.workedMinutes, 300);
  assert.equal(summary.expectedMinutes, 0);
  assert.equal(summary.irregularityMinutes, null);
  assert.equal(balance.bancoHorasMinutes, 0);
  assert.equal(balance.bancoHoras, '—');
  assert.equal(balance.horaExtraMinutes, 0);
});

test('actual backend: 4h and 10h real work never create bank or automatic overtime', () => {
  const calculate = loadBackend().handlers.calculate;
  for (const [horaSaida, workedMinutes] of [['12:00', 240], ['18:00', 600]]) {
    const {summary, balance} = calculate(point({horaEntrada: '08:00', horaSaida, jornadaEsperadaMinutos: 480}));
    assert.equal(summary.workedMinutes, workedMinutes);
    assert.equal(summary.expectedMinutes, 0);
    assert.equal(balance.bancoHorasMinutes, 0);
    assert.equal(balance.horaExtraMinutes, 0);
  }
});

test('no work, obsolete theoretical fields and weekends never create hourly bank movement', () => {
  const calculate = loadBackend().handlers.calculate;
  for (const dia of ['2026-10-06', '2026-10-10', '2026-10-11']) {
    for (const times of [{}, fiveHours]) {
      const result = calculate(point({dia, jornadaEsperadaMinutos: 480, horasDiarias: 8, ...times}));
      assert.equal(result.balance.bancoHorasMinutes, 0);
      assert.equal(result.summary.expectedMinutes, 0);
      assert.equal(result.balance.horaExtraMinutes, 0);
    }
  }
});

test('8–12 / 13–17 excludes lunch; no fixed break is invented', () => {
  const calculate = loadBackend().handlers.calculate;
  assert.equal(calculate(point({horaEntrada: '08:00', horaAlmocoSaida: '12:00', horaAlmocoRetorno: '13:00', horaSaida: '17:00'})).summary.workedMinutes, 480);
  const continuous = calculate(point({horaEntrada: '08:00', horaSaida: '13:00'}));
  assert.equal(continuous.summary.workedMinutes, 300);
  assert.equal(continuous.balance.almocoNaoRegistradoBancoHoras, 0);
});

test('incomplete day never presumes exit or missing lunch return', () => {
  const calculate = loadBackend().handlers.calculate;
  assert.equal(calculate(point({horaEntrada: '08:00'})).summary.workedMinutes, 0);
  assert.equal(calculate(point({horaEntrada: '08:00'})).status.statusPonto, 'Em andamento');
  const incomplete = calculate(point({horaEntrada: '08:00', horaAlmocoSaida: '12:00', horaSaida: '17:00'}));
  assert.equal(incomplete.summary.workedMinutes, null);
  assert.equal(incomplete.status.inconsistente, true);
  const malformedPeriod = calculate(point({periodosTrabalho: [{horaInicio: '08:00', horaFim: '17:00', horaAlmocoSaida: '12:00'}]}));
  assert.equal(malformedPeriod.summary.workedMinutes, null);
  assert.equal(malformedPeriod.status.inconsistente, true);
});

test('87h35 monthly total and report has no theoretical balance', () => {
  const calculate = loadBackend().handlers.calculate;
  const days = Array.from({length: 17}, () => calculate(point(fiveHours)));
  days.push(calculate(point({horaEntrada: '08:00', horaSaida: '10:35'})));
  const total = policy.sumPointWorkedMinutes(days);
  assert.equal(total, 5255);
  assert.equal(policy.formatPointWorkedMonth(total), '87h35');
  assert.equal(days.reduce((sum, day) => sum + day.balance.bancoHorasMinutes, 0), 0);
});

test('fixed weekday, custom and scheduled Saturday keep their negative bank rules', () => {
  const calculate = loadBackend().handlers.calculate;
  const cases = [
    ['seg-sex', '2026-10-06', {}, -180],
    ['personalizada', '2026-10-06', {cargaHorariaPorDia: {2: '06:00'}}, -60],
    ['seg-sab-folga', '2026-10-10', {}, 0],
  ];
  for (const [tipoEscala, dia, extra, expected] of cases) {
    const result = calculate({dia, jornadaTrabalho: policy.sanitizeEmployeeWorkSchedule({tipoEscala, ...extra}), ...fiveHours});
    assert.equal(result.balance.bancoHorasMinutes, expected, tipoEscala);
  }
});

test('updateUser records server-owned effective schedule, leaves points/balances untouched', async () => {
  const original = {...userPayload, jornadaTrabalho: policy.sanitizeEmployeeWorkSchedule({tipoEscala: 'seg-sex'})};
  const backend = loadBackend({employee: original});
  const historicalPoint = {dia: '2026-09-15', jornadaTrabalho: clone(original.jornadaTrabalho), bancoHorasMinutes: -180, ...fiveHours};
  const before = JSON.stringify(historicalPoint);
  const updated = await backend.handlers.updateUser({auth: {uid: 'manager'}, data: {...userPayload, uid: 'employee', jornadaTrabalho: {...hourly, historicoEscalas: [{inicio: '', jornadaTrabalho: hourly}]}}});
  const history = updated.jornadaTrabalho.historicoEscalas;
  assert.equal(history[0].jornadaTrabalho.tipoEscala, 'seg-sex');
  assert.equal(policy.resolvePointWorkSchedule(updated.jornadaTrabalho, '2000-01-01').tipoEscala, 'seg-sex');
  assert.equal(policy.resolvePointWorkSchedule(updated.jornadaTrabalho, history[1].inicio).tipoEscala, 'horista');
  assert.equal(loadBackend().handlers.calculate(historicalPoint).balance.bancoHorasMinutes, -180);
  assert.equal(JSON.stringify(historicalPoint), before);
  assert.deepEqual(backend.writes.map((item) => item.name), ['users']);
});

test('midmonth transition preserves missing old days and supports switching back later', () => {
  const schedule = policy.buildPointScheduleUpdate({tipoEscala: 'seg-sex'}, hourly, '2026-10-16');
  assert.equal(policy.getPointScheduleDayInfo(schedule, new Date(2026, 9, 15)).expectedMinutes, 480);
  assert.equal(policy.getPointScheduleDayInfo(schedule, new Date(2026, 9, 16)).expectedMinutes, 0);
  const back = policy.buildPointScheduleUpdate(schedule, {tipoEscala: 'seg-sex'}, '2026-11-02');
  assert.equal(policy.resolvePointWorkSchedule(back, '2026-09-01').tipoEscala, 'seg-sex');
  assert.equal(policy.resolvePointWorkSchedule(back, '2026-10-20').tipoEscala, 'horista');
  assert.equal(policy.resolvePointWorkSchedule(back, '2026-11-02').tipoEscala, 'seg-sex');
});

test('real registerEmployeePoint transaction persists hourly punches, actual hours and no bank debt', async () => {
  const backend = loadBackend();
  const stored = new Map();
  const context = backend.context;
  let time = '08:00';
  let auditId = 0;
  const reference = (prefix) => ({
    id: prefix.split('/').pop(), path: prefix,
    collection: (name) => collection(`${prefix}/${name}`),
  });
  const snapshot = (ref) => ({ref, exists: stored.has(ref.path), data: () => stored.get(ref.path)});
  const collection = (prefix) => ({
    doc: (id = `audit-${++auditId}`) => reference(`${prefix}/${id}`),
    where: () => ({query: prefix, where() {return this;}}),
  });
  context.db = {
    collection,
    runTransaction: async (callback) => callback({
      get: async (ref) => {
        if (!ref.query) return snapshot(ref);
        const docs = [...stored.keys()].filter((key) => key.startsWith(`${ref.query}/`)).map((key) => snapshot(reference(key)));
        return {empty: docs.length === 0, docs};
      },
      set: (ref, data, options) => stored.set(ref.path, clone(options?.merge ? {...stored.get(ref.path), ...data} : data)),
    }),
  };
  context.verifyPointStoreAccess = async () => ({profile: {nome: 'Horista', jornadaTrabalho: hourly}});
  context.getSaoPauloPointNow = () => ({now: new Date(`2026-10-06T${time}:00-03:00`), dayKey: '2026-10-06', competenciaKey: '2026-10', timeLabel: time});
  context.admin.firestore.Timestamp = {fromDate: (date) => date.toISOString()};
  context.admin.firestore.FieldValue.arrayUnion = (value) => [value];
  const from = source.indexOf('const pointPayloadForType =');
  const to = source.indexOf('exports.api =', from);
  vm.runInContext(source.slice(from, to), context);
  let response;
  for (const [type, at] of [['entrada', '08:00'], ['almoco_inicio', '11:00'], ['almoco_fim', '12:00'], ['saida', '14:00']]) {
    time = at;
    response = await context.exports.registerEmployeePoint({auth: {uid: 'employee'}, data: {lojaId: 'dev', type}});
  }
  assert.equal(response.record.qtde, '05:00');
  assert.equal(response.record.bancoHoras, '—');
  assert.equal(response.record.bancoHorasMinutes, 0);
  assert.equal(response.record.jornadaTrabalho.tipoEscala, 'horista');
  assert.equal(response.record.statusPonto, 'Completo');
  assert.equal(stored.get('lojas/dev/pontos/employee_2026-10-06').batidas.length, 4);
});

test('updateUser saves a chosen future date; fixed rules remain until the day before and survive reopen and unrelated edits', async () => {
  const fixed = policy.sanitizeEmployeeWorkSchedule({tipoEscala: 'personalizada', cargaHorariaPorDia: {2: '06:00'}});
  const backend = loadBackend({employee: {...userPayload, jornadaTrabalho: fixed}});
  const updated = await backend.handlers.updateUser({auth: {uid: 'manager'}, data: {
    ...userPayload, uid: 'employee', dataInicioJornada: '2026-11-01',
    jornadaTrabalho: {...hourly, historicoEscalas: [{inicio: '', jornadaTrabalho: hourly}]},
  }});
  assert.equal(policy.resolvePointWorkSchedule(updated.jornadaTrabalho, '2026-10-31').tipoEscala, 'personalizada');
  assert.equal(policy.resolvePointWorkSchedule(updated.jornadaTrabalho, '2026-11-01').tipoEscala, 'horista');
  assert.equal(policy.getPointScheduleEffectiveDate(updated.jornadaTrabalho), '2026-11-01');
  const reopened = (await backend.handlers.listAllUsers({auth: {uid: 'manager'}})).users[0];
  const before = clone(reopened.jornadaTrabalho);
  const unrelated = await backend.handlers.updateUser({auth: {uid: 'manager'}, data: {
    ...userPayload, uid: 'employee', nome: 'New display name', jornadaTrabalho: reopened.jornadaTrabalho,
  }});
  assert.deepEqual(unrelated.jornadaTrabalho, before);
  assert.deepEqual(backend.writes.map((write) => write.name), ['users', 'users']);
});

test('updateUser accepts a past effective date without editing historical point documents', async () => {
  const backend = loadBackend({employee: {...userPayload, jornadaTrabalho: {tipoEscala: 'seg-sex'}}});
  const updated = await backend.handlers.updateUser({auth: {uid: 'manager'}, data: {...userPayload, uid: 'employee', dataInicioJornada: '2026-09-01'}});
  assert.equal(policy.resolvePointWorkSchedule(updated.jornadaTrabalho, '2026-08-31').tipoEscala, 'seg-sex');
  assert.equal(policy.resolvePointWorkSchedule(updated.jornadaTrabalho, '2026-09-01').tipoEscala, 'horista');
  assert.deepEqual(backend.writes.map((write) => write.name), ['users']);
});

test('updateUser rejects empty, malformed and impossible effective dates before writing', async () => {
  for (const date of ['', '01/09/2026', '2026-02-30', '2026-13-01', '2026-09-31']) {
    const backend = loadBackend({employee: {...userPayload, jornadaTrabalho: {tipoEscala: 'seg-sex'}}});
    await assert.rejects(backend.handlers.updateUser({auth: {uid: 'manager'}, data: {...userPayload, uid: 'employee', dataInicioJornada: date}}), /data válida/);
    assert.deepEqual(backend.writes, []);
    assert.deepEqual(backend.authUpdates, []);
    assert.equal(backend.users.employee.jornadaTrabalho.tipoEscala, 'seg-sex');
  }
});

for (const legacyFixedSnapshot of [false, true]) test(`real registerEmployeePoint persists hourly punches without bank debt (legacy fixed snapshot: ${legacyFixedSnapshot})`, async () => {
  const backend = loadBackend();
  const stored = new Map();
  if (legacyFixedSnapshot) stored.set('lojas/dev/pontos/employee_2026-10-06', {
    funcionarioId: 'employee', dia: '2026-10-06', competencia: '2026-10',
    jornadaTrabalho: policy.sanitizeEmployeeWorkSchedule({tipoEscala: 'seg-sex'}),
    historicoAlteracoes: [{tipo: 'existing-audit', observacoes: 'must remain intact'}],
  });
  const context = backend.context;
  let time = '08:00';
  let auditId = 0;
  const reference = (prefix) => ({
    id: prefix.split('/').pop(), path: prefix,
    collection: (name) => collection(`${prefix}/${name}`),
  });
  const snapshot = (ref) => ({ref, exists: stored.has(ref.path), data: () => stored.get(ref.path)});
  const collection = (prefix) => ({
    doc: (id = `audit-${++auditId}`) => reference(`${prefix}/${id}`),
    where: () => ({query: prefix, where() {return this;}}),
  });
  context.db = {
    collection,
    runTransaction: async (callback) => callback({
      get: async (ref) => {
        if (!ref.query) return snapshot(ref);
        const docs = [...stored.keys()].filter((key) => key.startsWith(`${ref.query}/`)).map((key) => snapshot(reference(key)));
        return {empty: docs.length === 0, docs};
      },
      set: (ref, data, options) => stored.set(ref.path, clone(options?.merge ? {...stored.get(ref.path), ...data} : data)),
    }),
  };
  context.verifyPointStoreAccess = async () => ({profile: {nome: 'Horista', jornadaTrabalho: legacyFixedSnapshot
    ? policy.buildPointScheduleUpdate({tipoEscala: 'seg-sex'}, hourly, '2026-10-06') : hourly}});
  context.getSaoPauloPointNow = () => ({now: new Date(`2026-10-06T${time}:00-03:00`), dayKey: '2026-10-06', competenciaKey: '2026-10', timeLabel: time});
  context.admin.firestore.Timestamp = {fromDate: (date) => date.toISOString()};
  context.admin.firestore.FieldValue.arrayUnion = (value) => [value];
  const from = source.indexOf('const pointPayloadForType =');
  const to = source.indexOf('exports.api =', from);
  vm.runInContext(source.slice(from, to), context);
  let response;
  for (const [type, at] of [['entrada', '08:00'], ['almoco_inicio', '11:00'], ['almoco_fim', '12:00'], ['saida', '14:00']]) {
    time = at;
    response = await context.exports.registerEmployeePoint({auth: {uid: 'employee'}, data: {lojaId: 'dev', type}});
  }
  assert.equal(response.record.qtde, '05:00');
  assert.equal(response.record.bancoHoras, '—');
  assert.equal(response.record.bancoHorasMinutes, 0);
  assert.equal(response.record.jornadaTrabalho.tipoEscala, 'horista');
  assert.equal(response.record.statusPonto, 'Completo');
  assert.equal(stored.get('lojas/dev/pontos/employee_2026-10-06').batidas.length, 4);
  if (legacyFixedSnapshot) assert.equal(stored.get('lojas/dev/pontos/employee_2026-10-06').historicoAlteracoes[0].tipo, 'existing-audit');
});
