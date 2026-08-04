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
      setDoc(doc(db, "users", "inactive-attendant"), {
        ...userProfile("atendente", [STORE_A]),
        ativo: false,
        status: "inativo",
      }),
      setDoc(doc(db, "users", "client"), userProfile("cliente")),
      setDoc(doc(db, "customProfiles", "attendant-a"), {
        role: "atendente",
        permissions: {},
        permissionDetails: {},
      }),
      setDoc(doc(db, "lojas", STORE_A), {nome: "Loja A"}),
      setDoc(doc(db, "lojas", STORE_B), {nome: "Loja B"}),
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

describe("bloqueio imediato de usuario inativo", () => {
  test("inativo nao le nem opera a plataforma", async () => {
    const db = testEnv.authenticatedContext("inactive-attendant").firestore();

    await assertFails(
        getDoc(doc(db, "users", "inactive-attendant")),
    );
    await assertFails(
        getDoc(cashDoc(db, STORE_A, "caixas", "2026-07-27")),
    );
    await assertFails(
        setDoc(cashDoc(db, STORE_A, "contas_a_pagar", "bloqueada"), {
          tipo: "fornecedor",
          valor: 100,
        }),
    );
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
