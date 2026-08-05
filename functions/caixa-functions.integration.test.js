const assert = require('node:assert/strict');
const {after, before, beforeEach, test} = require('node:test');
const admin = require('firebase-admin');
const {HttpsError} = require('firebase-functions/v2/https');

const {createCaixaFunctions} = require('./caixa');
const {
  defaultCashPermissions,
} = require('./caixa-core');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-caixa-rules';
const TIME_ZONE = 'America/Sao_Paulo';

let app;
let db;
let caixa;

const unwrapOnCall = (optionsOrHandler, maybeHandler) => (
  typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler
);

const unwrapDocumentWritten = (_path, handler) => handler;

const requestFor = (uid, data = {}) => ({
  auth: {uid, token: {email: `${uid}@example.test`}},
  data,
});

const expectHttpsCode = (expectedCode) => (error) => {
  assert.ok(error instanceof Error);
  assert.match(String(error.code || ''), new RegExp(expectedCode));
  return true;
};

const seedStore = async (storeId) => {
  await Promise.all([
    db.collection('lojas').doc(storeId).set({nome: storeId}),
    db.collection('lojas').doc(storeId)
      .collection('configuracoes').doc('config')
      .set({timezone: TIME_ZONE}),
  ]);
};

const seedUser = async (
    uid,
    role,
    storeIds = [],
    cashPermissions = defaultCashPermissions(role),
) => {
  const permissions = {fornecedores: true};
  const permissionDetails = {caixa: cashPermissions};
  const profile = {
    uid,
    nome: uid,
    email: `${uid}@example.test`,
    role,
    lojaId: storeIds[0] || null,
    lojaIds: storeIds,
    permissions,
    permissionDetails,
  };
  await Promise.all([
    db.collection('users').doc(uid).set(profile),
    db.collection('customProfiles').doc(uid).set({
      uid,
      role,
      permissions,
      permissionDetails,
    }),
  ]);
};

const seedCashOrder = async (storeId, orderId, total, timestamp) => {
  await db.collection('lojas').doc(storeId)
    .collection('pedidos').doc(orderId).set({
      lojaId: storeId,
      status: 'Finalizado',
      formaPagamento: 'Dinheiro',
      total,
      createdAt: timestamp,
      finalizadoEm: timestamp,
      dataOperacionalFinalizacao: '2026-07-27',
    });
};

const registerBaseDay = async (storeId, closingCents) => {
  await caixa.registrarValorInicialCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 20000,
    idempotencyKey: `${storeId}-inicio-20260727`,
  }));

  const finalizedAt = admin.firestore.Timestamp.fromDate(
      new Date('2026-07-27T15:00:00.000Z'),
  );
  await seedCashOrder(storeId, 'pedido-dinheiro', 300, finalizedAt);

  await caixa.registrarRetiradaDespesaCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 5000,
    motivo: 'Compra pequena',
    idempotencyKey: `${storeId}-retirada-20260727`,
  }));

  await caixa.registrarSangriaCaixa(requestFor('manager', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 15000,
    motivo: 'Deposito de seguranca',
    destino: 'Banco',
    idempotencyKey: `${storeId}-sangria-20260727`,
  }));

  return caixa.registrarEncerramentoCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: closingCents,
    idempotencyKey: `${storeId}-encerramento-20260727`,
  }));
};

before(async () => {
  app = admin.initializeApp({projectId: PROJECT_ID}, 'caixa-integration');
  db = app.firestore();
  caixa = createCaixaFunctions({
    admin,
    db,
    onCall: unwrapOnCall,
    onDocumentWritten: unwrapDocumentWritten,
    HttpsError,
    logger: {info() {}, warn() {}, error() {}},
  });
});

beforeEach(async () => {
  await Promise.all([
    db.recursiveDelete(db.collection('lojas')),
    db.recursiveDelete(db.collection('users')),
    db.recursiveDelete(db.collection('customProfiles')),
  ]);
});

after(async () => {
  await app.delete();
});

test('callables calculam R$ 300,00 sem expor conferencia a atendente', async () => {
  const storeId = 'callable-sem-divergencia';
  await seedStore(storeId);
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('manager', 'gerente', [storeId]),
    seedUser('attendant', 'atendente', [storeId]),
  ]);

  const initialPayload = {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 20000,
    idempotencyKey: `${storeId}-inicio-idempotente`,
  };
  const initial = await caixa.registrarValorInicialCaixa(
      requestFor('attendant', initialPayload),
  );
  assert.equal(initial.message, 'Valor inicial registrado com sucesso.');
  assert.equal(initial.registro.valorInicialCentavos, 20000);
  assert.equal('diferencaCentavos' in initial, false);

  await caixa.registrarValorInicialCaixa(
      requestFor('attendant', initialPayload),
  );
  await assert.rejects(
      caixa.registrarValorInicialCaixa(requestFor('attendant', {
        ...initialPayload,
        idempotencyKey: `${storeId}-outra-chave-inicio`,
      })),
      expectHttpsCode('already-exists'),
  );

  const finalizedAt = admin.firestore.Timestamp.fromDate(
      new Date('2026-07-27T15:00:00.000Z'),
  );
  await seedCashOrder(storeId, 'pedido-dinheiro', 300, finalizedAt);
  await caixa.registrarRetiradaDespesaCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 5000,
    motivo: 'Compra pequena',
    idempotencyKey: `${storeId}-retirada-idempotente`,
  }));
  await caixa.registrarSangriaCaixa(requestFor('manager', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 15000,
    motivo: 'Deposito de seguranca',
    idempotencyKey: `${storeId}-sangria-idempotente`,
  }));

  await assert.rejects(
      caixa.registrarSangriaCaixa(requestFor('attendant', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
        valorCentavos: 100,
        motivo: 'Tentativa indevida',
        idempotencyKey: `${storeId}-sangria-atendente`,
      })),
      expectHttpsCode('permission-denied'),
  );

  const closing = await caixa.registrarEncerramentoCaixa(
      requestFor('attendant', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
        valorCentavos: 30000,
        idempotencyKey: `${storeId}-encerramento-idempotente`,
      }),
  );
  assert.equal(closing.message, 'Encerramento registrado com sucesso.');
  assert.equal(closing.registro.valorEncerramentoCentavos, 30000);
  assert.equal('conferencia' in closing, false);

  const conference = (await db.collection('lojas').doc(storeId)
    .collection('conferenciasCaixa').doc('2026-07-27').get()).data();
  assert.equal(conference.vendasDinheiroCentavos, 30000);
  assert.equal(conference.retiradasDespesaCentavos, 5000);
  assert.equal(conference.sangriasCentavos, 15000);
  assert.equal(conference.valorEsperadoCentavos, 30000);
  assert.equal(conference.diferencaCentavos, 0);

  const alerts = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alerts.empty, true);

  const attendantView = await caixa.obterRegistroDiarioCaixa(
      requestFor('attendant', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
      }),
  );
  assert.equal('conferencia' in attendantView, false);
});

test('divergencia inicial notifica somente dono e gerente autorizado', async () => {
  const storeId = 'callable-inicio-divergente';
  const otherStoreId = 'callable-outra-loja';
  await Promise.all([seedStore(storeId), seedStore(otherStoreId)]);
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('manager', 'gerente', [storeId]),
    seedUser('manager-other', 'gerente', [otherStoreId]),
    seedUser('attendant', 'atendente', [storeId]),
  ]);
  await db.collection('lojas').doc(storeId)
    .collection('configuracoesInternas').doc('alertas')
    .set({destinatarios: 'dono_e_gerentes'});
  await db.collection('lojas').doc(storeId)
    .collection('caixas').doc('2026-07-26').set({
      lojaId: storeId,
      dataOperacional: '2026-07-26',
      valorEncerramentoCentavos: 20000,
      temValorEncerramento: true,
    });

  const response = await caixa.registrarValorInicialCaixa(
      requestFor('attendant', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
        valorCentavos: 10000,
        idempotencyKey: `${storeId}-inicio-divergente`,
      }),
  );
  assert.equal(response.message, 'Valor inicial registrado com sucesso.');
  assert.equal('diferencaCentavos' in response, false);

  const alerts = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alerts.size, 1);
  const alert = alerts.docs[0].data();
  assert.equal(alert.tipo, 'CAIXA_INICIO_DIVERGENTE');
  assert.equal(alert.diferencaCentavos, -10000);
  assert.deepEqual(
      [...alert.destinatariosUids].sort(),
      ['manager', 'owner'],
  );

  const alertId = alerts.docs[0].id;
  const [ownerNotice, managerNotice, attendantNotice, otherManagerNotice] =
    await Promise.all([
      db.collection('users').doc('owner')
        .collection('notificacoes').doc(alertId).get(),
      db.collection('users').doc('manager')
        .collection('notificacoes').doc(alertId).get(),
      db.collection('users').doc('attendant')
        .collection('notificacoes').doc(alertId).get(),
      db.collection('users').doc('manager-other')
        .collection('notificacoes').doc(alertId).get(),
    ]);
  assert.equal(ownerNotice.exists, true);
  assert.equal(managerNotice.exists, true);
  assert.equal(attendantNotice.exists, false);
  assert.equal(otherManagerNotice.exists, false);

  await caixa.atualizarEstadoNotificacaoCaixa(requestFor('manager', {
    notificacaoId: alertId,
    lida: true,
  }));
  assert.equal((await managerNotice.ref.get()).data().lida, true);
  await caixa.atualizarEstadoNotificacaoCaixa(requestFor('manager', {
    notificacaoId: alertId,
    lida: false,
  }));
  assert.equal((await managerNotice.ref.get()).data().lida, false);
  const markAllResult = await caixa.marcarTodasNotificacoesCaixaComoLidas(
      requestFor('manager', {lojaId: storeId}),
  );
  assert.equal(markAllResult.atualizadas, 1);
  assert.equal((await managerNotice.ref.get()).data().lida, true);

  await assert.rejects(
      caixa.obterRegistroDiarioCaixa(requestFor('manager-other', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
      })),
      expectHttpsCode('permission-denied'),
  );
});

test('encerramento de R$ 280,00 alerta dono e ajuste recalcula auditoria', async () => {
  const storeId = 'callable-encerramento-divergente';
  await seedStore(storeId);
  const limitedPermissions = {
    ...defaultCashPermissions('gerente'),
    visualizarSangrias: false,
    visualizarValoresCalculados: false,
    visualizarDivergencias: false,
  };
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('manager', 'gerente', [storeId]),
    seedUser('manager-limited', 'gerente', [storeId], limitedPermissions),
    seedUser('attendant', 'atendente', [storeId]),
  ]);

  const closing = await registerBaseDay(storeId, 28000);
  assert.equal(closing.message, 'Encerramento registrado com sucesso.');
  assert.equal('conferencia' in closing, false);

  let conference = (await db.collection('lojas').doc(storeId)
    .collection('conferenciasCaixa').doc('2026-07-27').get()).data();
  assert.equal(conference.valorEsperadoCentavos, 30000);
  assert.equal(conference.diferencaCentavos, -2000);

  const alerts = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].data().tipo, 'CAIXA_ENCERRAMENTO_DIVERGENTE');
  const alertId = alerts.docs[0].id;
  assert.equal((await db.collection('users').doc('owner')
    .collection('notificacoes').doc(alertId).get()).exists, true);
  assert.equal((await db.collection('users').doc('manager')
    .collection('notificacoes').doc(alertId).get()).exists, false);

  const limitedHistory = await caixa.listarConferenciasCaixa(
      requestFor('manager-limited', {
        lojaId: storeId,
        dataInicio: '2026-07-27',
        dataFim: '2026-07-27',
      }),
  );
  assert.equal(limitedHistory.conferencias.length, 1);
  const limitedConference = limitedHistory.conferencias[0];
  assert.equal('vendasDinheiroCentavos' in limitedConference, false);
  assert.equal('valorEsperadoCentavos' in limitedConference, false);
  assert.equal('diferencaCentavos' in limitedConference, false);
  assert.equal('sangriasCentavos' in limitedConference, false);
  await assert.rejects(
      caixa.listarSangriasCaixa(requestFor('manager-limited', {
        lojaId: storeId,
        dataInicio: '2026-07-27',
        dataFim: '2026-07-27',
      })),
      expectHttpsCode('permission-denied'),
  );

  const sangrias = await caixa.listarSangriasCaixa(requestFor('manager', {
    lojaId: storeId,
    dataInicio: '2026-07-27',
    dataFim: '2026-07-27',
  }));
  assert.equal(sangrias.sangrias.length, 1);
  const sangriaId = sangrias.sangrias[0].id;
  await caixa.ajustarSangriaCaixa(requestFor('manager', {
    lojaId: storeId,
    sangriaId,
    novoValorCentavos: 14000,
    motivoAjuste: 'Correcao conferida no comprovante',
    idempotencyKey: `${storeId}-ajuste-sangria`,
  }));

  conference = (await db.collection('lojas').doc(storeId)
    .collection('conferenciasCaixa').doc('2026-07-27').get()).data();
  assert.equal(conference.sangriasCentavos, 14000);
  assert.equal(conference.valorEsperadoCentavos, 31000);
  assert.equal(conference.diferencaCentavos, -3000);
  const adjustedRemoval = (await db.collection('lojas').doc(storeId)
    .collection('sangriasCaixa').doc(sangriaId).get()).data();
  assert.equal(adjustedRemoval.valorAtualCentavos, 14000);
  assert.equal(adjustedRemoval.ajustes.length, 1);
  assert.equal(adjustedRemoval.ajustes[0].deltaCentavos, -1000);
});

test('historico sincroniza leitura, resolucao e exclusao logica auditada', async () => {
  const storeId = 'historico-alertas';
  await seedStore(storeId);
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('manager', 'gerente', [storeId]),
    seedUser('attendant', 'atendente', [storeId]),
  ]);
  await db.collection('lojas').doc(storeId)
    .collection('configuracoesInternas').doc('alertas')
    .set({destinatarios: 'dono_e_gerentes'});
  await db.collection('lojas').doc(storeId)
    .collection('caixas').doc('2026-07-26').set({
      lojaId: storeId,
      dataOperacional: '2026-07-26',
      valorEncerramentoCentavos: 20000,
      temValorEncerramento: true,
    });
  await caixa.registrarValorInicialCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 10000,
    idempotencyKey: `${storeId}-inicio-divergente`,
  }));

  const ownerHistory = await caixa.listarAlertasCaixa(requestFor('owner', {
    lojaId: storeId,
    tamanhoPagina: 25,
  }));
  assert.equal(ownerHistory.alertas.length, 1);
  assert.equal(ownerHistory.alertas[0].lida, false);
  const alertId = ownerHistory.alertas[0].id;

  const managerHistory = await caixa.listarAlertasCaixa(
      requestFor('manager', {lojaId: storeId}),
  );
  assert.equal(managerHistory.alertas.length, 1);
  await caixa.atualizarEstadoNotificacaoCaixa(requestFor('manager', {
    notificacaoId: alertId,
    lida: true,
  }));
  const managerReadHistory = await caixa.listarAlertasCaixa(
      requestFor('manager', {
        lojaId: storeId,
        situacao: 'lido',
      }),
  );
  assert.equal(managerReadHistory.alertas.length, 1);
  assert.equal(managerReadHistory.alertas[0].lida, true);

  await caixa.alterarSituacaoAlertaCaixa(requestFor('manager', {
    lojaId: storeId,
    alertaId: alertId,
    situacao: 'resolvido',
    observacao: 'Conferencia concluida',
    idempotencyKey: `${storeId}-resolver-alerta`,
  }));
  const resolvedHistory = await caixa.listarAlertasCaixa(
      requestFor('owner', {
        lojaId: storeId,
        situacao: 'resolvido',
      }),
  );
  assert.equal(resolvedHistory.alertas.length, 1);
  assert.equal(resolvedHistory.alertas[0].situacao, 'resolvido');

  const details = await caixa.obterDetalhesAlertaCaixa(
      requestFor('owner', {lojaId: storeId, alertaId: alertId}),
  );
  assert.equal(details.destinatarios.length, 2);
  assert.ok(details.auditoria.length >= 3);

  await assert.rejects(
      caixa.excluirAlertaCaixa(requestFor('manager', {
        lojaId: storeId,
        alertaId: alertId,
        idempotencyKey: `${storeId}-manager-excluir`,
      })),
      expectHttpsCode('permission-denied'),
  );
  await caixa.excluirAlertaCaixa(requestFor('owner', {
    lojaId: storeId,
    alertaId: alertId,
    motivo: 'Registro conferido pelo dono',
    idempotencyKey: `${storeId}-owner-excluir`,
  }));

  const deletedAlert = (await db.collection('lojas').doc(storeId)
    .collection('alertas').doc(alertId).get()).data();
  assert.equal(deletedAlert.isDeleted, true);
  assert.equal(deletedAlert.deletedBy, 'owner');
  assert.equal((await db.collection('users').doc('manager')
    .collection('notificacoes').doc(alertId).get()).data().isDeleted, true);
  assert.equal((await caixa.listarAlertasCaixa(requestFor('owner', {
    lojaId: storeId,
  }))).alertas.length, 0);
  assert.equal((await caixa.listarNotificacoesCaixa(
      requestFor('owner'),
  )).notificacoes.length, 0);
  await assert.rejects(
      caixa.obterDetalhesAlertaCaixa(requestFor('owner', {
        lojaId: storeId,
        alertaId: alertId,
      })),
      expectHttpsCode('not-found'),
  );
  await assert.rejects(
      caixa.listarAlertasCaixa(requestFor('attendant', {
        lojaId: storeId,
      })),
      expectHttpsCode('permission-denied'),
  );
});

test('historico pagina alertas antigos sem criar duplicidade', async () => {
  const storeId = 'historico-paginado';
  await seedStore(storeId);
  await seedUser('owner', 'dono');
  const baseTime = Date.parse('2026-07-01T12:00:00.000Z');
  const writes = [];
  for (let index = 0; index < 30; index += 1) {
    const alertId = `alerta-${String(index).padStart(2, '0')}`;
    const createdAt = admin.firestore.Timestamp.fromMillis(
        baseTime + index * 60000,
    );
    const alert = {
      categoria: 'caixa',
      tipo: index % 2 === 0 ?
        'CAIXA_INICIO_DIVERGENTE' :
        'CAIXA_ENCERRAMENTO_DIVERGENTE',
      lojaId: storeId,
      dataOperacional: '2026-07-01',
      titulo: `Alerta ${index}`,
      mensagem: 'Registro historico',
      severidade: 'warning',
      diferencaCentavos: index % 2 === 0 ? index + 1 : -(index + 1),
      responsavelUid: 'attendant',
      responsavelNome: 'Atendente',
      criadoEm: createdAt,
      destinatariosUids: ['owner'],
    };
    writes.push(
        db.collection('lojas').doc(storeId)
          .collection('alertas').doc(alertId).set(alert),
        db.collection('users').doc('owner')
          .collection('notificacoes').doc(alertId).set({
            ...alert,
            alertaId: alertId,
            destinatarioUid: 'owner',
            lida: false,
          }),
    );
  }
  await Promise.all(writes);

  const firstPage = await caixa.listarAlertasCaixa(requestFor('owner', {
    lojaId: storeId,
    tamanhoPagina: 25,
  }));
  assert.equal(firstPage.alertas.length, 25);
  assert.equal(firstPage.temMais, true);
  const secondPage = await caixa.listarAlertasCaixa(requestFor('owner', {
    lojaId: storeId,
    tamanhoPagina: 25,
    cursor: firstPage.proximoCursor,
  }));
  assert.equal(secondPage.alertas.length, 5);
  assert.equal(secondPage.temMais, false);
  assert.equal(new Set([
    ...firstPage.alertas,
    ...secondPage.alertas,
  ].map((item) => item.id)).size, 30);

  const negativeOnly = await caixa.listarAlertasCaixa(requestFor('owner', {
    lojaId: storeId,
    divergencia: 'negativa',
    tipo: 'CAIXA_ENCERRAMENTO_DIVERGENTE',
    pesquisa: 'registro historico',
  }));
  assert.equal(negativeOnly.alertas.length, 15);
  assert.ok(negativeOnly.alertas.every((item) => (
    item.diferencaCentavos < 0 &&
    item.tipo === 'CAIXA_ENCERRAMENTO_DIVERGENTE'
  )));

  const batchIds = firstPage.alertas.slice(0, 3).map((item) => item.id);
  const batchResult = await caixa.excluirAlertasCaixaEmLote(
      requestFor('owner', {
        lojaId: storeId,
        alertasIds: batchIds,
        motivo: 'Limpeza manual auditada',
        idempotencyKey: `${storeId}-exclusao-em-lote`,
      }),
  );
  assert.equal(batchResult.excluidos, 3);
  const deletedSnapshots = await Promise.all(batchIds.map((alertId) => (
    db.collection('lojas').doc(storeId)
      .collection('alertas').doc(alertId).get()
  )));
  assert.ok(deletedSnapshots.every((snapshot) => (
    snapshot.data().isDeleted === true
  )));
});

test('somente dono registra retirada pos-encerramento e resolve divergencia', async () => {
  const storeId = 'ajuste-retirada-pos-encerramento';
  await seedStore(storeId);
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('manager', 'gerente', [storeId]),
    seedUser('attendant', 'atendente', [storeId]),
  ]);
  await caixa.registrarValorInicialCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 10000,
    idempotencyKey: `${storeId}-inicio`,
  }));
  await seedCashOrder(
      storeId,
      'venda-200',
      200,
      admin.firestore.Timestamp.fromDate(
          new Date('2026-07-27T15:00:00.000Z'),
      ),
  );
  await caixa.registrarEncerramentoCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 28000,
    observacao: 'Valor contado original',
    idempotencyKey: `${storeId}-encerramento`,
  }));
  const dailyRef = db.collection('lojas').doc(storeId)
    .collection('caixas').doc('2026-07-27');
  const originalDaily = (await dailyRef.get()).data();

  const blockedPayload = {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 2000,
    motivo: 'Despesa esquecida',
  };
  await assert.rejects(
      caixa.registrarRetiradaDespesaCaixa(requestFor('attendant', {
        ...blockedPayload,
        idempotencyKey: `${storeId}-atendente-bloqueada`,
      })),
      expectHttpsCode('failed-precondition'),
  );
  await assert.rejects(
      caixa.registrarRetiradaDespesaCaixa(requestFor('manager', {
        ...blockedPayload,
        idempotencyKey: `${storeId}-gerente-bloqueado`,
      })),
      expectHttpsCode('failed-precondition'),
  );

  const ownerPayload = {
    ...blockedPayload,
    horaMovimentacao: '17:30',
    idempotencyKey: `${storeId}-dono-ajuste`,
  };
  const response = await caixa.registrarRetiradaDespesaCaixa(
      requestFor('owner', ownerPayload),
  );
  await caixa.registrarRetiradaDespesaCaixa(
      requestFor('owner', ownerPayload),
  );
  assert.match(response.message, /conferencia do caixa foi recalculada/i);

  const payables = await db.collection('lojas').doc(storeId)
    .collection('contas_a_pagar')
    .where('origem', '==', 'retirada_despesa_caixa').get();
  assert.equal(payables.size, 1);
  const withdrawal = payables.docs[0].data();
  assert.equal(withdrawal.dataMovimentacao, '2026-07-27');
  assert.equal(withdrawal.horaMovimentacao, '17:30');
  assert.equal(withdrawal.lancamentoPosEncerramento, true);
  assert.equal(withdrawal.perfilResponsavel, 'dono');
  assert.equal(withdrawal.auditoriaPosEncerramento.diferencaAntesCentavos, -2000);
  assert.equal(withdrawal.auditoriaPosEncerramento.diferencaDepoisCentavos, 0);
  assert.ok(withdrawal.registradoEm.toMillis() >=
    originalDaily.valorEncerramentoRegistradoEm.toMillis());

  const conference = (await db.collection('lojas').doc(storeId)
    .collection('conferenciasCaixa').doc('2026-07-27').get()).data();
  assert.equal(conference.retiradasDespesaCentavos, 2000);
  assert.equal(conference.valorEsperadoCentavos, 28000);
  assert.equal(conference.diferencaCentavos, 0);
  assert.equal(conference.ajustesPosEncerramento.length, 1);

  const preservedDaily = (await dailyRef.get()).data();
  assert.equal(preservedDaily.valorEncerramentoCentavos, 28000);
  assert.equal(preservedDaily.responsavelEncerramentoUid, 'attendant');
  assert.equal(preservedDaily.observacaoEncerramento, 'Valor contado original');
  assert.equal(
      preservedDaily.valorEncerramentoRegistradoEm.toMillis(),
      originalDaily.valorEncerramentoRegistradoEm.toMillis(),
  );

  const alerts = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].data().situacao, 'resolvido');
  assert.equal(alerts.docs[0].data().diferencaCentavos, 0);
  assert.equal(alerts.docs[0].data().historicoDivergencias.length, 1);
  const alertAudit = await alerts.docs[0].ref.collection('auditoria').get();
  assert.ok(alertAudit.docs.some((document) => (
    document.data().action ===
      'DIVERGENCIA_RESOLVIDA_APOS_AJUSTE_POS_ENCERRAMENTO'
  )));
});

test('dono registra sangria pos-encerramento e cria uma nova divergencia', async () => {
  const storeId = 'ajuste-sangria-pos-encerramento';
  await seedStore(storeId);
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('manager', 'gerente', [storeId]),
    seedUser('attendant', 'atendente', [storeId]),
  ]);
  await db.collection('lojas').doc(storeId)
    .collection('configuracoesInternas').doc('alertas')
    .set({destinatarios: 'dono_e_gerentes'});
  await caixa.registrarValorInicialCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 10000,
    idempotencyKey: `${storeId}-inicio`,
  }));
  await seedCashOrder(
      storeId,
      'venda-200',
      200,
      admin.firestore.Timestamp.fromDate(
          new Date('2026-07-27T15:00:00.000Z'),
      ),
  );
  await caixa.registrarEncerramentoCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 30000,
    idempotencyKey: `${storeId}-encerramento`,
  }));

  await assert.rejects(
      caixa.registrarSangriaCaixa(requestFor('manager', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
        valorCentavos: 5000,
        motivo: 'Tentativa do gerente',
        idempotencyKey: `${storeId}-gerente-bloqueado`,
      })),
      expectHttpsCode('failed-precondition'),
  );
  await assert.rejects(
      caixa.registrarSangriaCaixa(requestFor('owner', {
        lojaId: storeId,
        dataOperacional: '2026-07-27',
        valorCentavos: 5000,
        motivo: '',
        observacao: 'Sem motivo formal',
        idempotencyKey: `${storeId}-sem-motivo`,
      })),
      expectHttpsCode('invalid-argument'),
  );

  const ownerPayload = {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 5000,
    motivo: 'Sangria informada posteriormente',
    destino: 'Banco',
    horaMovimentacao: '18:10',
    idempotencyKey: `${storeId}-dono-sangria`,
  };
  await caixa.registrarSangriaCaixa(requestFor('owner', ownerPayload));
  await caixa.registrarSangriaCaixa(requestFor('owner', ownerPayload));

  const removals = await db.collection('lojas').doc(storeId)
    .collection('sangriasCaixa').get();
  assert.equal(removals.size, 1);
  const removal = removals.docs[0].data();
  assert.equal(removal.lancamentoPosEncerramento, true);
  assert.equal(removal.dataMovimentacao, '2026-07-27');
  assert.equal(removal.horaMovimentacao, '18:10');
  assert.equal(removal.auditoriaPosEncerramento.diferencaAntesCentavos, 0);
  assert.equal(removal.auditoriaPosEncerramento.diferencaDepoisCentavos, 5000);
  assert.equal((await db.collection('lojas').doc(storeId)
    .collection('contas_a_pagar').get()).empty, true);

  const conference = (await db.collection('lojas').doc(storeId)
    .collection('conferenciasCaixa').doc('2026-07-27').get()).data();
  assert.equal(conference.sangriasCentavos, 5000);
  assert.equal(conference.valorEsperadoCentavos, 25000);
  assert.equal(conference.diferencaCentavos, 5000);

  const alerts = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].data().diferencaCentavos, 5000);
  assert.deepEqual(
      [...alerts.docs[0].data().destinatariosUids].sort(),
      ['manager', 'owner'],
  );
  const alertId = alerts.docs[0].id;
  assert.equal((await db.collection('users').doc('owner')
    .collection('notificacoes').doc(alertId).get()).exists, true);
  assert.equal((await db.collection('users').doc('manager')
    .collection('notificacoes').doc(alertId).get()).exists, true);
  assert.equal((await db.collection('users').doc('attendant')
    .collection('notificacoes').doc(alertId).get()).exists, false);
});

test('ajuste pos-encerramento atualiza alerta existente sem duplicar', async () => {
  const storeId = 'ajuste-altera-divergencia';
  await seedStore(storeId);
  await Promise.all([
    seedUser('owner', 'dono'),
    seedUser('attendant', 'atendente', [storeId]),
  ]);
  await caixa.registrarValorInicialCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 10000,
    idempotencyKey: `${storeId}-inicio`,
  }));
  await seedCashOrder(
      storeId,
      'venda-200',
      200,
      admin.firestore.Timestamp.fromDate(
          new Date('2026-07-27T15:00:00.000Z'),
      ),
  );
  await caixa.registrarEncerramentoCaixa(requestFor('attendant', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 20000,
    idempotencyKey: `${storeId}-encerramento`,
  }));
  const alertsBefore = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alertsBefore.size, 1);
  const originalAlertId = alertsBefore.docs[0].id;
  assert.equal(alertsBefore.docs[0].data().diferencaCentavos, -10000);

  await caixa.registrarRetiradaDespesaCaixa(requestFor('owner', {
    lojaId: storeId,
    dataOperacional: '2026-07-27',
    valorCentavos: 8000,
    motivo: 'Despesa omitida no fechamento',
    idempotencyKey: `${storeId}-retirada-80`,
  }));

  const alertsAfter = await db.collection('lojas').doc(storeId)
    .collection('alertas').get();
  assert.equal(alertsAfter.size, 1);
  assert.equal(alertsAfter.docs[0].id, originalAlertId);
  assert.equal(alertsAfter.docs[0].data().diferencaCentavos, -2000);
  assert.equal(alertsAfter.docs[0].data().situacao, 'aberto');
  assert.equal(alertsAfter.docs[0].data().historicoDivergencias.length, 1);
});
