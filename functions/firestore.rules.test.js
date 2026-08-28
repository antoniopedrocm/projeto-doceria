const fs = require("node:fs");
const path = require("node:path");
const {after, before, beforeEach, describe, test} = require("node:test");

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-caixa-rules";
const STORE_A = "loja-a";
const STORE_B = "loja-b";
const STORE_C = "loja-c";
const STORE_D = "loja-d-inativa";

let testEnv;

const userProfile = (role, storeIds = [], cashPermissions = {}) => ({
  role,
  lojaId: storeIds[0] || null,
  lojaIds: storeIds,
  permissions: {},
  permissionDetails: {
    caixa: cashPermissions,
  },
});

const seedFirestore = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all([
      setDoc(doc(db, "users", "owner"), userProfile("dono")),
      setDoc(
          doc(db, "users", "manager-a"),
          userProfile("gerente", [STORE_A], {
            visualizarConferencia: true,
            visualizarValoresCalculados: true,
            visualizarDivergencias: true,
            visualizarSangrias: true,
          }),
      ),
      setDoc(doc(db, "users", "manager-b"), userProfile("gerente", [STORE_B])),
      setDoc(doc(db, "users", "manager-c"), userProfile("gerente", [STORE_C])),
      setDoc(doc(db, "users", "manager-no-entre-lojas"), {
        ...userProfile("gerente", [STORE_A]),
        permissions: {"entre-lojas": false},
      }),
      setDoc(
          doc(db, "users", "manager-ab"),
          userProfile("gerente", [STORE_B, STORE_A]),
      ),
      setDoc(
          doc(db, "users", "manager-limited"),
          userProfile("gerente", [STORE_A], {
            visualizarConferencia: false,
            visualizarSangrias: false,
            visualizarDivergencias: false,
          }),
      ),
      setDoc(
          doc(db, "users", "manager-partial"),
          userProfile("gerente", [STORE_A], {
            visualizarConferencia: true,
            visualizarValoresCalculados: true,
            visualizarDivergencias: false,
            visualizarSangrias: true,
          }),
      ),
      setDoc(doc(db, "users", "manager-no-module"), {
        ...userProfile("gerente", [STORE_A], {
          visualizarConferencia: true,
          visualizarValoresCalculados: true,
          visualizarDivergencias: true,
          visualizarSangrias: true,
        }),
        permissions: {fornecedores: false},
      }),
      setDoc(
          doc(db, "users", "attendant-a"),
          userProfile("atendente", [STORE_A]),
      ),
      setDoc(doc(db, "users", "client"), userProfile("cliente")),
      setDoc(doc(db, "customProfiles", "attendant-a"), {
        role: "atendente",
        permissions: {},
        permissionDetails: {},
      }),
      setDoc(doc(db, "lojas", STORE_A), {nome: "Loja A"}),
      setDoc(doc(db, "lojas", STORE_B), {nome: "Loja B"}),
      setDoc(doc(db, "lojas", STORE_C), {nome: "Loja C"}),
      setDoc(doc(db, "lojas", STORE_D), {
        nome: "Loja D inativa",
        ativo: false,
      }),
      setDoc(doc(db, "lojas", STORE_A, "configuracoes", "config"), {
        entreLojas: {authorizedDestinationStoreIds: [STORE_B, STORE_D]},
      }),
      setDoc(doc(db, "lojas", STORE_B, "configuracoes", "config"), {
        entreLojas: {authorizedDestinationStoreIds: [STORE_A]},
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-origem"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "aguardando_conferencia",
        historico: [],
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-destino"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "aguardando_conferencia",
        historico: [],
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-pagamento"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "conferencia_sem_divergencia",
        historico: [],
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-pagamento-origem"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "conferencia_com_divergencia",
        historico: [],
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-cancelamento"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "aguardando_conferencia",
        historico: [],
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "rascunho-autorizado"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "rascunho",
        historico: [],
      }),
      setDoc(doc(db, "fechamentosEntreLojas", "fechamento-aberto"), {
        nome: "Fechamento aberto",
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "aberto",
        historico: [],
      }),
      setDoc(doc(db, "fechamentosEntreLojas", "fechamento-cancelamento"), {
        nome: "Fechamento para cancelar",
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "aberto",
        historico: [],
      }),
      setDoc(doc(db, "fechamentosEntreLojas", "fechamento-pagamento"), {
        nome: "Fechamento para pagamento",
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "fechado",
        historico: [],
      }),
      setDoc(doc(db, "lojas", STORE_A, "caixas", "2026-07-27"), {
        dataOperacional: "2026-07-27",
        valorInicialCentavos: 20000,
      }),
      setDoc(doc(db, "lojas", STORE_B, "caixas", "2026-07-27"), {
        dataOperacional: "2026-07-27",
        valorInicialCentavos: 10000,
      }),
      setDoc(
          doc(
              db,
              "lojas",
              STORE_A,
              "conferenciasCaixa",
              "2026-07-27",
          ),
          {
            dataOperacional: "2026-07-27",
            valorEsperadoCentavos: 30000,
            diferencaCentavos: -2000,
          },
      ),
      setDoc(
          doc(
              db,
              "lojas",
              STORE_B,
              "conferenciasCaixa",
              "2026-07-27",
          ),
          {
            dataOperacional: "2026-07-27",
            valorEsperadoCentavos: 10000,
            diferencaCentavos: 0,
          },
      ),
      setDoc(
          doc(db, "lojas", STORE_A, "sangriasCaixa", "sangria-a"),
          {valorCentavos: 15000, responsavelUid: "manager-a"},
      ),
      setDoc(
          doc(db, "lojas", STORE_B, "sangriasCaixa", "sangria-b"),
          {valorCentavos: 5000, responsavelUid: "owner"},
      ),
      setDoc(doc(db, "lojas", STORE_A, "alertas", "alerta-a"), {
        tipo: "CAIXA_ENCERRAMENTO_DIVERGENTE",
        diferencaCentavos: -2000,
      }),
      setDoc(
          doc(db, "lojas", STORE_A, "configuracoesInternas", "alertas"),
          {destinatarios: "dono_e_gerentes"},
      ),
      setDoc(
          doc(
              db,
              "lojas",
              STORE_A,
              "configuracoesInternas",
              "operacaoCaixa_teste",
          ),
          {tipo: "idempotencia_caixa"},
      ),
      setDoc(doc(db, "users", "manager-a", "notificacoes", "notice-a"), {
        categoria: "caixa",
        tipo: "CAIXA_ENCERRAMENTO_DIVERGENTE",
        lojaId: STORE_A,
        lida: false,
      }),
      setDoc(doc(db, "users", "owner", "notificacoes", "notice-owner"), {
        categoria: "caixa",
        tipo: "CAIXA_INICIO_DIVERGENTE",
        lojaId: STORE_A,
        lida: false,
      }),
      setDoc(
          doc(db, "lojas", STORE_A, "contas_a_pagar", "normal"),
          {tipo: "fornecedor", valor: 50},
      ),
      setDoc(
          doc(db, "lojas", STORE_A, "contas_a_pagar", "retirada"),
          {tipo: "retirada_caixa", origem: "retirada_caixa", valor: 20},
      ),
    ]);
  });
};

const cashDoc = (db, storeId, collectionName, documentId) =>
  doc(db, "lojas", storeId, collectionName, documentId);

before(async () => {
  const rules = fs.readFileSync(
      path.join(__dirname, "..", "firestore.rules"),
      "utf8",
  );

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {rules},
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe("regras de caixa por perfil e loja", () => {
  test("atendente le somente o registro operacional da propria loja", async () => {
    const db = testEnv.authenticatedContext("attendant-a").firestore();

    await assertSucceeds(
        getDoc(cashDoc(db, STORE_A, "caixas", "2026-07-27")),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_B, "caixas", "2026-07-27")),
    );
    await assertFails(
        getDoc(
            cashDoc(
                db,
                STORE_A,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_A, "sangriasCaixa", "sangria-a")),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_A, "alertas", "alerta-a")),
    );
    await assertFails(
        getDoc(
            cashDoc(db, STORE_A, "configuracoesInternas", "alertas"),
        ),
    );
  });

  test("gerente autorizado le dados gerenciais somente da propria loja", async () => {
    const db = testEnv.authenticatedContext("manager-a").firestore();

    await assertSucceeds(
        getDoc(cashDoc(db, STORE_A, "caixas", "2026-07-27")),
    );
    await assertSucceeds(
        getDoc(
            cashDoc(
                db,
                STORE_A,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertSucceeds(
        getDoc(cashDoc(db, STORE_A, "sangriasCaixa", "sangria-a")),
    );
    await assertSucceeds(
        getDoc(
            cashDoc(db, STORE_A, "configuracoesInternas", "alertas"),
        ),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_B, "caixas", "2026-07-27")),
    );
    await assertFails(
        getDoc(
            cashDoc(
                db,
                STORE_B,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_B, "sangriasCaixa", "sangria-b")),
    );
    await assertSucceeds(
        getDoc(cashDoc(db, STORE_A, "alertas", "alerta-a")),
    );
  });

  test("permissoes granulares podem retirar o acesso gerencial", async () => {
    const db = testEnv.authenticatedContext("manager-limited").firestore();

    await assertFails(
        getDoc(
            cashDoc(
                db,
                STORE_A,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_A, "sangriasCaixa", "sangria-a")),
    );
    await assertSucceeds(
        getDoc(
            cashDoc(db, STORE_A, "configuracoesInternas", "alertas"),
        ),
    );
  });

  test("gerente deixa de ler alertas quando a loja fica somente dono", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
          cashDoc(
              context.firestore(),
              STORE_A,
              "configuracoesInternas",
              "alertas",
          ),
          {destinatarios: "somente_dono"},
      );
    });
    const db = testEnv.authenticatedContext("manager-a").firestore();
    await assertFails(
        getDoc(cashDoc(db, STORE_A, "alertas", "alerta-a")),
    );
  });

  test("conferencia exige todas as permissoes dos campos protegidos", async () => {
    const db = testEnv.authenticatedContext("manager-partial").firestore();

    await assertFails(
        getDoc(
            cashDoc(
                db,
                STORE_A,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertSucceeds(
        getDoc(cashDoc(db, STORE_A, "sangriasCaixa", "sangria-a")),
    );
  });

  test("gerente sem o modulo fornecedores nao acessa dados do caixa", async () => {
    const db = testEnv.authenticatedContext("manager-no-module").firestore();

    await assertFails(
        getDoc(cashDoc(db, STORE_A, "caixas", "2026-07-27")),
    );
    await assertFails(
        getDoc(
            cashDoc(
                db,
                STORE_A,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_A, "sangriasCaixa", "sangria-a")),
    );
    await assertFails(
        getDoc(
            cashDoc(db, STORE_A, "configuracoesInternas", "alertas"),
        ),
    );
  });

  test("documentos internos de idempotencia nao sao expostos ao gerente", async () => {
    const db = testEnv.authenticatedContext("manager-a").firestore();

    await assertFails(
        getDoc(
            cashDoc(
                db,
                STORE_A,
                "configuracoesInternas",
                "operacaoCaixa_teste",
            ),
        ),
    );
  });

  test("dono le dados de caixa de qualquer loja", async () => {
    const db = testEnv.authenticatedContext("owner").firestore();

    await assertSucceeds(
        getDoc(cashDoc(db, STORE_B, "caixas", "2026-07-27")),
    );
    await assertSucceeds(
        getDoc(
            cashDoc(
                db,
                STORE_B,
                "conferenciasCaixa",
                "2026-07-27",
            ),
        ),
    );
    await assertSucceeds(
        getDoc(cashDoc(db, STORE_B, "sangriasCaixa", "sangria-b")),
    );
    await assertSucceeds(
        getDoc(cashDoc(db, STORE_A, "alertas", "alerta-a")),
    );
  });

  test("nenhum cliente grava diretamente nas colecoes de caixa", async () => {
    const attendantDb = testEnv
        .authenticatedContext("attendant-a")
        .firestore();
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertFails(
        setDoc(cashDoc(attendantDb, STORE_A, "caixas", "2026-07-28"), {
          dataOperacional: "2026-07-28",
        }),
    );
    await assertFails(
        setDoc(
            cashDoc(
                ownerDb,
                STORE_A,
                "conferenciasCaixa",
                "2026-07-28",
            ),
            {dataOperacional: "2026-07-28"},
        ),
    );
    await assertFails(
        setDoc(cashDoc(ownerDb, STORE_A, "sangriasCaixa", "nova"), {
          valorCentavos: 1000,
        }),
    );
    await assertFails(
        setDoc(cashDoc(ownerDb, STORE_A, "alertas", "novo"), {
          tipo: "CAIXA_INICIO_DIVERGENTE",
        }),
    );
    await assertFails(
        updateDoc(
            cashDoc(
                ownerDb,
                STORE_A,
                "configuracoesInternas",
                "alertas",
            ),
            {destinatarios: "somente_dono"},
        ),
    );
  });
});

describe("notificacoes individuais e perfis", () => {
  test("alerta financeiro individual exige Callable e nao aceita escrita", async () => {
    const db = testEnv.authenticatedContext("manager-a").firestore();
    const ownNotice = doc(
        db,
        "users",
        "manager-a",
        "notificacoes",
        "notice-a",
    );

    await assertFails(getDoc(ownNotice));
    await assertFails(
        getDoc(doc(db, "users", "owner", "notificacoes", "notice-owner")),
    );
    await assertFails(updateDoc(ownNotice, {lida: true}));
    await assertFails(
        setDoc(
            doc(db, "users", "manager-a", "notificacoes", "forjada"),
            {tipo: "CAIXA_ENCERRAMENTO_DIVERGENTE", lida: false},
        ),
    );
  });

  test("usuario autenticado nao promove perfil nem customProfile", async () => {
    const db = testEnv.authenticatedContext("attendant-a").firestore();

    await assertFails(updateDoc(doc(db, "users", "attendant-a"), {
      role: "dono",
      lojaId: null,
      lojaIds: [],
    }));
    await assertFails(
        updateDoc(doc(db, "customProfiles", "attendant-a"), {
          permissions: {configuracoes: true},
        }),
    );
  });

  test("bootstrap direto aceita somente perfil cliente proprio e sem loja", async () => {
    const ownDb = testEnv.authenticatedContext("new-client").firestore();
    const attackerDb = testEnv.authenticatedContext("attacker").firestore();

    await assertSucceeds(setDoc(doc(ownDb, "users", "new-client"), {
      email: "cliente@example.test",
      nome: "Cliente",
      role: "cliente",
      lojaId: null,
      lojaIds: [],
    }));
    await assertFails(setDoc(doc(attackerDb, "users", "attacker"), {
      email: "dono@example.test",
      nome: "Dono forjado",
      role: "dono",
      lojaId: null,
      lojaIds: [],
    }));
    await assertFails(setDoc(doc(attackerDb, "users", "outra-pessoa"), {
      email: "cliente2@example.test",
      nome: "Outra pessoa",
      role: "cliente",
      lojaId: null,
      lojaIds: [],
    }));
  });
});

describe("retiradas para despesa em contas a pagar", () => {
  test("conta comum continua gravavel e retirada de caixa exige Function", async () => {
    const db = testEnv.authenticatedContext("attendant-a").firestore();
    const normal = cashDoc(db, STORE_A, "contas_a_pagar", "nova-normal");
    const withdrawal = cashDoc(
        db,
        STORE_A,
        "contas_a_pagar",
        "nova-retirada",
    );

    await assertSucceeds(setDoc(normal, {
      tipo: "fornecedor",
      valor: 100,
    }));
    await assertSucceeds(updateDoc(normal, {valor: 120}));
    await assertSucceeds(deleteDoc(normal));

    await assertFails(setDoc(withdrawal, {
      tipo: "RETIRADA_DESPESA_CAIXA",
      origem: " Retirada_Despesa_Caixa ",
      registroCaixa: true,
      valor: 50,
    }));
    await assertFails(
        updateDoc(
            cashDoc(db, STORE_A, "contas_a_pagar", "normal"),
            {origem: "retirada_para_despesa"},
        ),
    );
    await assertFails(
        updateDoc(
            cashDoc(db, STORE_A, "contas_a_pagar", "retirada"),
            {valor: 25},
        ),
    );
    await assertFails(
        deleteDoc(cashDoc(db, STORE_A, "contas_a_pagar", "retirada")),
    );
  });
});

const entreLojasDoc = (db, collectionName, documentId) =>
  doc(db, collectionName, documentId);

const entreLojasHistory = (uid, action, previousStatus, nextStatus, relation) => ({
  acao: action,
  status: nextStatus,
  statusAnterior: previousStatus,
  statusNovo: nextStatus,
  usuarioUid: uid,
  usuarioPerfil: uid === "owner" ? "dono" : "gerente",
  usuarioLojaIds: [],
  relacaoAutorizacao: relation,
  comentario: "teste direto de autorizacao",
  data: "2026-08-05T12:00:00.000Z",
});

const newTransferPayload = (originStoreId, destinationStoreId, status = "rascunho") => ({
  lojaOrigemId: originStoreId,
  lojaDestinoId: destinationStoreId,
  status,
  historico: [],
});

describe("rotas autorizadas para novas remessas entre lojas", () => {
  test("usuario da origem cria remessa para destino autorizado sem acesso geral ao destino", async () => {
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();
    const attendantDb = testEnv.authenticatedContext("attendant-a").firestore();

    await assertSucceeds(setDoc(
        entreLojasDoc(managerDb, "transferenciasEntreLojas", "nova-manager"),
        newTransferPayload(STORE_A, STORE_B),
    ));
    await assertSucceeds(setDoc(
        entreLojasDoc(attendantDb, "transferenciasEntreLojas", "nova-atendente"),
        newTransferPayload(STORE_A, STORE_B, "aguardando_conferencia"),
    ));
  });

  test("a configuracao e direcional e usa somente a origem escolhida", async () => {
    const managerBDb = testEnv.authenticatedContext("manager-b").firestore();

    await assertSucceeds(setDoc(
        entreLojasDoc(managerBDb, "transferenciasEntreLojas", "volta-autorizada"),
        newTransferPayload(STORE_B, STORE_A),
    ));
    await assertFails(setDoc(
        entreLojasDoc(managerBDb, "transferenciasEntreLojas", "origem-manipulada"),
        newTransferPayload(STORE_A, STORE_B),
    ));
  });

  test("bloqueia destino nao autorizado, inativo e igual a origem", async () => {
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();

    await assertFails(setDoc(
        entreLojasDoc(managerDb, "transferenciasEntreLojas", "destino-nao-autorizado"),
        newTransferPayload(STORE_A, STORE_C),
    ));
    await assertFails(setDoc(
        entreLojasDoc(managerDb, "transferenciasEntreLojas", "destino-inativo"),
        newTransferPayload(STORE_A, STORE_D),
    ));
    await assertFails(setDoc(
        entreLojasDoc(managerDb, "transferenciasEntreLojas", "mesma-loja"),
        newTransferPayload(STORE_A, STORE_A),
    ));
  });

  test("bloqueia criacao sem acesso ao modulo Entre Lojas", async () => {
    const db = testEnv.authenticatedContext("manager-no-entre-lojas").firestore();
    await assertFails(setDoc(
        entreLojasDoc(db, "transferenciasEntreLojas", "sem-modulo"),
        newTransferPayload(STORE_A, STORE_B),
    ));
  });

  test("revalida rascunho no envio sem afetar remessa historica", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
          doc(context.firestore(), "lojas", STORE_A, "configuracoes", "config"),
          {"entreLojas.authorizedDestinationStoreIds": []},
      );
    });
    const managerDb = testEnv.authenticatedContext("manager-a").firestore();

    await assertFails(updateDoc(
        entreLojasDoc(managerDb, "transferenciasEntreLojas", "rascunho-autorizado"),
        {status: "aguardando_conferencia"},
    ));
    await assertSucceeds(getDoc(
        entreLojasDoc(managerDb, "transferenciasEntreLojas", "remessa-origem"),
    ));
  });

  test("configuracao e auditoria nao podem ser manipuladas diretamente", async () => {
    const ownerDb = testEnv.authenticatedContext("owner").firestore();
    await assertFails(updateDoc(
        doc(ownerDb, "lojas", STORE_A, "configuracoes", "config"),
        {"entreLojas.authorizedDestinationStoreIds": [STORE_C]},
    ));
    await assertFails(getDoc(
        doc(ownerDb, "transferDestinationAuditLogs", "qualquer"),
    ));
  });
});

describe("regras de acao do modulo Entre Lojas", () => {
  test("gerentes de origem e destino conferem remessas", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        originDb,
        "transferenciasEntreLojas",
        "remessa-origem",
    ), {
      status: "conferencia_sem_divergencia",
      dataConferencia: "2026-08-05T12:00:00.000Z",
      conferidoPorUid: "manager-a",
      conferidoPorNome: "Gerente A",
      observacaoDestino: "",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-a",
          "conferencia_sem_divergencia",
          "aguardando_conferencia",
          "conferencia_sem_divergencia",
          "origem",
      )],
    }));

    await assertSucceeds(updateDoc(entreLojasDoc(
        destinationDb,
        "transferenciasEntreLojas",
        "remessa-destino",
    ), {
      status: "conferencia_com_divergencia",
      dataConferencia: "2026-08-05T12:00:00.000Z",
      conferidoPorUid: "manager-b",
      conferidoPorNome: "Gerente B",
      observacaoDestino: "Divergencia de teste",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-b",
          "conferencia_com_divergencia",
          "aguardando_conferencia",
          "conferencia_com_divergencia",
          "destino",
      )],
    }));
  });

  test("gerentes de origem e destino marcam remessas como pagas", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();

    const pay = async (db, documentId, uid, previousStatus, relation) =>
      assertSucceeds(updateDoc(entreLojasDoc(
          db,
          "transferenciasEntreLojas",
          documentId,
      ), {
        status: "pagamento_informado",
        dataPagamentoInformado: "2026-08-05T12:00:00.000Z",
        pagamentoInformadoPorUid: uid,
        pagamentoInformadoPorNome: uid,
        observacaoPagamento: "Pagamento de teste",
        dataAtualizacao: "2026-08-05T12:00:00.000Z",
        historico: [entreLojasHistory(
            uid,
            "pagamento_informado",
            previousStatus,
            "pagamento_informado",
            relation,
        )],
      }));

    await pay(
        originDb,
        "remessa-pagamento-origem",
        "manager-a",
        "conferencia_com_divergencia",
        "origem",
    );
    await pay(
        destinationDb,
        "remessa-pagamento",
        "manager-b",
        "conferencia_sem_divergencia",
        "destino",
    );
  });

  test("cancelamento de remessa permite origem e bloqueia destino", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const transferRef = entreLojasDoc(
        destinationDb,
        "transferenciasEntreLojas",
        "remessa-cancelamento",
    );
    const cancellationPatch = (uid, relation) => ({
      status: "cancelado",
      dataCancelamento: "2026-08-05T12:00:00.000Z",
      canceladoPorUid: uid,
      canceladoPorNome: uid,
      observacaoCancelamento: "Cancelamento de teste",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          uid,
          "remessa_cancelada",
          "aguardando_conferencia",
          "cancelado",
          relation,
      )],
    });

    await assertFails(updateDoc(
        transferRef,
        cancellationPatch("manager-b", "destino"),
    ));
    await assertSucceeds(updateDoc(
        entreLojasDoc(
            originDb,
            "transferenciasEntreLojas",
            "remessa-cancelamento",
        ),
        cancellationPatch("manager-a", "origem"),
    ));
  });

  test("gerente de terceira loja e atendente nao executam acao administrativa", async () => {
    const thirdStoreDb = testEnv.authenticatedContext("manager-c").firestore();
    const attendantDb = testEnv.authenticatedContext("attendant-a").firestore();
    const confirmationPatch = (uid) => ({
      status: "conferencia_sem_divergencia",
      dataConferencia: "2026-08-05T12:00:00.000Z",
      conferidoPorUid: uid,
      conferidoPorNome: uid,
      observacaoDestino: "",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          uid,
          "conferencia_sem_divergencia",
          "aguardando_conferencia",
          "conferencia_sem_divergencia",
          "sem_vinculo",
      )],
    });

    await assertFails(updateDoc(entreLojasDoc(
        thirdStoreDb,
        "transferenciasEntreLojas",
        "remessa-origem",
    ), confirmationPatch("manager-c")));
    await assertFails(updateDoc(entreLojasDoc(
        attendantDb,
        "transferenciasEntreLojas",
        "remessa-origem",
    ), confirmationPatch("attendant-a")));
  });

  test("gerente somente do destino marca fechamento pago, mas nao edita nem cancela", async () => {
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        destinationDb,
        "fechamentosEntreLojas",
        "fechamento-pagamento",
    ), {
      status: "pagamento_informado",
      pagamentoInformadoPorUid: "manager-b",
      pagamentoInformadoPorNome: "Gerente B",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-b",
          "pagamento_informado",
          "fechado",
          "pagamento_informado",
          "destino",
      )],
    }));
    await assertFails(updateDoc(entreLojasDoc(
        destinationDb,
        "fechamentosEntreLojas",
        "fechamento-aberto",
    ), {nome: "Edicao indevida"}));
    await assertFails(updateDoc(entreLojasDoc(
        destinationDb,
        "fechamentosEntreLojas",
        "fechamento-cancelamento",
    ), {
      status: "cancelado",
      canceladoPorUid: "manager-b",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-b",
          "fechamento_cancelado",
          "aberto",
          "cancelado",
          "destino",
      )],
    }));
  });

  test("origem e vinculo duplo podem editar e cancelar fechamento", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const bothDb = testEnv.authenticatedContext("manager-ab").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        originDb,
        "fechamentosEntreLojas",
        "fechamento-aberto",
    ), {nome: "Edicao autorizada pela origem"}));
    await assertSucceeds(updateDoc(entreLojasDoc(
        bothDb,
        "fechamentosEntreLojas",
        "fechamento-cancelamento",
    ), {
      status: "cancelado",
      canceladoPorUid: "manager-ab",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-ab",
          "fechamento_cancelado",
          "aberto",
          "cancelado",
          "origem",
      )],
    }));
  });

  test("gerente de terceira loja nao edita fechamento", async () => {
    const thirdStoreDb = testEnv.authenticatedContext("manager-c").firestore();

    await assertFails(updateDoc(entreLojasDoc(
        thirdStoreDb,
        "fechamentosEntreLojas",
        "fechamento-aberto",
    ), {nome: "Edicao de terceira loja"}));
  });

  test("dono preserva edicao e acoes sem vinculo", async () => {
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        ownerDb,
        "fechamentosEntreLojas",
        "fechamento-aberto",
    ), {nome: "Edicao do dono"}));
    await assertSucceeds(updateDoc(entreLojasDoc(
        ownerDb,
        "transferenciasEntreLojas",
        "remessa-cancelamento",
    ), {status: "cancelado"}));
  });
});
