const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {after, before, beforeEach, describe, test} = require("node:test");

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} = require("firebase/firestore");

const PROJECT_ID = "demo-caixa-rules";
const STORE_A = "loja-a";
const STORE_B = "loja-b";
const STORE_C = "loja-c";

let testEnv;

const userProfile = (role, storeIds = [], cashPermissions = {}) => ({
  role,
  lojaId: storeIds[0] || null,
  lojaIds: storeIds,
  permissions: {},
  permissionDetails: {
    "entre-lojas": {
      statuses: [
        "rascunho",
        "aguardando_conferencia",
        "conferencia_sem_divergencia",
        "conferencia_com_divergencia",
        "pagamento_informado",
      ],
    },
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
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-rascunho"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "rascunho",
        historico: [],
      }),
      setDoc(doc(db, "transferenciasEntreLojas", "remessa-confirmacao"), {
        lojaOrigemId: STORE_A,
        lojaDestinoId: STORE_B,
        status: "pagamento_informado",
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

const confirmTransferPatch = (uid, status, relation) => ({
  status,
  dataConferencia: "2026-08-05T12:00:00.000Z",
  conferidoPorUid: uid,
  conferidoPorNome: uid,
  observacaoDestino: status === "conferencia_com_divergencia" ? "Divergencia" : "",
  dataAtualizacao: "2026-08-05T12:00:00.000Z",
  historico: [entreLojasHistory(
      uid,
      status,
      "aguardando_conferencia",
      status,
      relation,
  )],
});

describe("regras de acao do modulo Entre Lojas", () => {
  test("consultas de remessas autorizam gerente de origem e destino", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const thirdDb = testEnv.authenticatedContext("manager-c").firestore();
    const transfers = (db) => collection(db, "transferenciasEntreLojas");

    const originSnapshot = await assertSucceeds(getDocs(query(
        transfers(originDb),
        where("lojaOrigemId", "==", STORE_A),
        where("status", "==", "aguardando_conferencia"),
    )));
    const destinationSnapshot = await assertSucceeds(getDocs(query(
        transfers(destinationDb),
        where("lojaDestinoId", "==", STORE_B),
        where("status", "==", "aguardando_conferencia"),
    )));

    assert.equal(originSnapshot.size, 3);
    assert.equal(destinationSnapshot.size, 3);
    await assertFails(getDocs(query(
        transfers(thirdDb),
        where("lojaDestinoId", "==", STORE_B),
        where("status", "==", "aguardando_conferencia"),
    )));
  });

  test("rascunho permanece somente na origem e demais leituras respeitam a relacao", async () => {
    const ownerDb = testEnv.authenticatedContext("owner").firestore();
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const thirdDb = testEnv.authenticatedContext("manager-c").firestore();
    const draftRef = (db) => entreLojasDoc(
        db, "transferenciasEntreLojas", "remessa-rascunho",
    );

    await assertSucceeds(getDoc(draftRef(ownerDb)));
    await assertSucceeds(getDoc(draftRef(originDb)));
    await assertFails(getDoc(draftRef(destinationDb)));
    await assertFails(getDoc(entreLojasDoc(
        thirdDb, "transferenciasEntreLojas", "remessa-origem",
    )));

    const originDrafts = await assertSucceeds(getDocs(query(
        collection(originDb, "transferenciasEntreLojas"),
        where("lojaOrigemId", "==", STORE_A),
        where("status", "==", "rascunho"),
    )));
    assert.equal(originDrafts.size, 1);
    await assertFails(getDocs(query(
        collection(destinationDb, "transferenciasEntreLojas"),
        where("lojaDestinoId", "==", STORE_B),
        where("status", "==", "rascunho"),
    )));
  });

  test("pagamento confirmado permanece visivel apos a transicao para origem e destino", async () => {
    const ownerDb = testEnv.authenticatedContext("owner").firestore();
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const thirdDb = testEnv.authenticatedContext("manager-c").firestore();
    const confirmedRef = (db) => entreLojasDoc(
        db, "transferenciasEntreLojas", "remessa-confirmacao",
    );

    await assertSucceeds(updateDoc(confirmedRef(originDb), {
      status: "pagamento_confirmado",
      dataPagamentoConfirmado: "2026-08-09T12:00:00.000Z",
      pagamentoConfirmadoPorUid: "manager-a",
      pagamentoConfirmadoPorNome: "manager-a",
      observacaoPagamento: "Pagamento confirmado",
      dataAtualizacao: "2026-08-09T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-a", "pagamento_confirmado", "pagamento_informado",
          "pagamento_confirmado", "origem",
      )],
    }));

    await assertSucceeds(getDoc(confirmedRef(ownerDb)));
    await assertSucceeds(getDoc(confirmedRef(originDb)));
    await assertSucceeds(getDoc(confirmedRef(destinationDb)));
    await assertFails(getDoc(confirmedRef(thirdDb)));

    const originSnapshot = await assertSucceeds(getDocs(query(
        collection(originDb, "transferenciasEntreLojas"),
        where("lojaOrigemId", "==", STORE_A),
        where("status", "==", "pagamento_confirmado"),
    )));
    const destinationSnapshot = await assertSucceeds(getDocs(query(
        collection(destinationDb, "transferenciasEntreLojas"),
        where("lojaDestinoId", "==", STORE_B),
        where("status", "==", "pagamento_confirmado"),
    )));
    assert.equal(originSnapshot.size, 1);
    assert.equal(destinationSnapshot.size, 1);
    await assertFails(getDocs(query(
        collection(thirdDb, "transferenciasEntreLojas"),
        where("lojaDestinoId", "==", STORE_B),
        where("status", "==", "pagamento_confirmado"),
    )));
  });

  test("consultas de fechamentos permitem origem e destino, mas bloqueiam terceira loja", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const thirdDb = testEnv.authenticatedContext("manager-c").firestore();

    const originClosings = await assertSucceeds(getDocs(query(
        collection(originDb, "fechamentosEntreLojas"),
        where("lojaOrigemId", "in", [STORE_A]),
    )));
    const destinationClosings = await assertSucceeds(getDocs(query(
        collection(destinationDb, "fechamentosEntreLojas"),
        where("lojaDestinoId", "in", [STORE_B]),
    )));
    assert.equal(originClosings.size, 3);
    assert.equal(destinationClosings.size, 3);
    await assertFails(getDoc(entreLojasDoc(
        thirdDb, "fechamentosEntreLojas", "fechamento-aberto",
    )));
    await assertFails(getDocs(query(
        collection(thirdDb, "fechamentosEntreLojas"),
        where("lojaDestinoId", "in", [STORE_B]),
    )));
  });

  test("origem e destino conferem; terceira loja e atendente sao bloqueados", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const thirdDb = testEnv.authenticatedContext("manager-c").firestore();
    const attendantDb = testEnv.authenticatedContext("attendant-a").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        originDb, "transferenciasEntreLojas", "remessa-origem",
    ), confirmTransferPatch("manager-a", "conferencia_sem_divergencia", "origem")));
    await assertSucceeds(updateDoc(entreLojasDoc(
        destinationDb, "transferenciasEntreLojas", "remessa-destino",
    ), confirmTransferPatch("manager-b", "conferencia_com_divergencia", "destino")));
    await assertFails(updateDoc(entreLojasDoc(
        thirdDb, "transferenciasEntreLojas", "remessa-cancelamento",
    ), confirmTransferPatch("manager-c", "conferencia_sem_divergencia", "sem_vinculo")));
    await assertFails(updateDoc(entreLojasDoc(
        attendantDb, "transferenciasEntreLojas", "remessa-cancelamento",
    ), confirmTransferPatch("attendant-a", "conferencia_sem_divergencia", "origem")));
  });

  test("origem e destino marcam remessas como pagas", async () => {
    const pay = async (uid, documentId, previousStatus, relation) => {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertSucceeds(updateDoc(entreLojasDoc(
          db, "transferenciasEntreLojas", documentId,
      ), {
        status: "pagamento_informado",
        dataPagamentoInformado: "2026-08-05T12:00:00.000Z",
        pagamentoInformadoPorUid: uid,
        pagamentoInformadoPorNome: uid,
        observacaoPagamento: "Pagamento",
        dataAtualizacao: "2026-08-05T12:00:00.000Z",
        historico: [entreLojasHistory(
            uid, "pagamento_informado", previousStatus,
            "pagamento_informado", relation,
        )],
      }));
    };

    await pay("manager-a", "remessa-pagamento-origem", "conferencia_com_divergencia", "origem");
    await pay("manager-b", "remessa-pagamento", "conferencia_sem_divergencia", "destino");
  });

  test("cancelamento de remessa permite origem e bloqueia destino", async () => {
    const cancellationPatch = (uid, relation) => ({
      status: "cancelado",
      dataCancelamento: "2026-08-05T12:00:00.000Z",
      canceladoPorUid: uid,
      canceladoPorNome: uid,
      observacaoCancelamento: "Cancelamento",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          uid, "remessa_cancelada", "aguardando_conferencia", "cancelado", relation,
      )],
    });
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();
    const originDb = testEnv.authenticatedContext("manager-a").firestore();

    await assertFails(updateDoc(entreLojasDoc(
        destinationDb, "transferenciasEntreLojas", "remessa-cancelamento",
    ), cancellationPatch("manager-b", "destino")));
    await assertSucceeds(updateDoc(entreLojasDoc(
        originDb, "transferenciasEntreLojas", "remessa-cancelamento",
    ), cancellationPatch("manager-a", "origem")));
  });

  test("destino paga fechamento, mas nao edita nem cancela", async () => {
    const destinationDb = testEnv.authenticatedContext("manager-b").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        destinationDb, "fechamentosEntreLojas", "fechamento-pagamento",
    ), {
      status: "pagamento_informado",
      pagamentoInformadoPorUid: "manager-b",
      pagamentoInformadoPorNome: "manager-b",
      dataAtualizacao: "2026-08-05T12:00:00.000Z",
      historico: [entreLojasHistory(
          "manager-b", "pagamento_informado", "fechado", "pagamento_informado", "destino",
      )],
    }));
    await assertFails(updateDoc(entreLojasDoc(
        destinationDb, "fechamentosEntreLojas", "fechamento-aberto",
    ), {nome: "Edicao indevida"}));
    await assertFails(updateDoc(entreLojasDoc(
        destinationDb, "fechamentosEntreLojas", "fechamento-cancelamento",
    ), {
      status: "cancelado",
      canceladoPorUid: "manager-b",
      historico: [entreLojasHistory(
          "manager-b", "fechamento_cancelado", "aberto", "cancelado", "destino",
      )],
    }));
  });

  test("terceira loja nao paga nem edita fechamento", async () => {
    const thirdDb = testEnv.authenticatedContext("manager-c").firestore();

    await assertFails(updateDoc(entreLojasDoc(
        thirdDb, "fechamentosEntreLojas", "fechamento-pagamento",
    ), {
      status: "pagamento_informado",
      pagamentoInformadoPorUid: "manager-c",
      historico: [entreLojasHistory(
          "manager-c", "pagamento_informado", "fechado",
          "pagamento_informado", "sem_vinculo",
      )],
    }));
    await assertFails(updateDoc(entreLojasDoc(
        thirdDb, "fechamentosEntreLojas", "fechamento-aberto",
    ), {nome: "Edicao de terceira loja"}));
  });

  test("origem, vinculo duplo e dono preservam as acoes de origem", async () => {
    const originDb = testEnv.authenticatedContext("manager-a").firestore();
    const bothDb = testEnv.authenticatedContext("manager-ab").firestore();
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertSucceeds(updateDoc(entreLojasDoc(
        originDb, "fechamentosEntreLojas", "fechamento-aberto",
    ), {nome: "Edicao autorizada"}));
    await assertSucceeds(updateDoc(entreLojasDoc(
        bothDb, "fechamentosEntreLojas", "fechamento-cancelamento",
    ), {
      status: "cancelado",
      canceladoPorUid: "manager-ab",
      historico: [entreLojasHistory(
          "manager-ab", "fechamento_cancelado", "aberto", "cancelado", "origem",
      )],
    }));
    await assertSucceeds(updateDoc(entreLojasDoc(
        ownerDb, "fechamentosEntreLojas", "fechamento-aberto",
    ), {nome: "Edicao do dono"}));
    await assertSucceeds(updateDoc(entreLojasDoc(
        ownerDb, "transferenciasEntreLojas", "remessa-cancelamento",
    ), {status: "cancelado"}));
  });
});
