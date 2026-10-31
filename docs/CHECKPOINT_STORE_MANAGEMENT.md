# Checkpoint — gerenciamento de lojas exclusivo Dono

DEV crmdoceria-9959e; branch feature/infinitepay-customer-auth; workspace C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree. PROD não autorizada. 31/10/2026.

## Retomada

Base b4cd6b67 (disponibilidade por loja homologada). Auditoria/implementação em andamento. Não alterar Matriz/Garavelo reais para testar; mutações destrutivas somente em fixtures/emuladores. Nenhum deploy realizado neste workstream.

Achados: createStore permite Dono/Gerente e usa normalização que inclui Admin como Dono; frontend tem o mesmo grant. Novo manage_stores deve validar papel ORIGINAL dono/owner, revogável e sem grant a Admin, Gerente ou Staff. Não mudar globalmente o normalizador de Auth/Customer. Fulfillment estrutural passa a ser exclusivo Dono conforme decisão atual, mantendo leitura Staff autorizada.

Plano: serviço administrativo de listagem/detalhe/mutação e auditoria imutável; criar DRAFT, editar nome/nome público/slug e configuração de publicação; inativar sem apagar histórico; reativar somente com readiness; hard delete conservador apenas draft novo nunca publicado, vazio e sem referências, sem recursiveDelete. Slug antigo preservado como alias. Loja virtual Visão Geral nunca é entidade editável; canais/legado precisam de classificação/modelo válido.

Investigar também proteção contra alteração direta de storefront/raiz e concessão indireta de Dono pelos endpoints Staff. Não alterar provider, Customer Auth, fiscal ou histórico. Validar escopo/readiness/concorrência e dependências antes de publicar.

## Próximos passos

Implementados localmente: functions/store-management.js (CRUD/lifecycle/audit/delete conservador/readiness), store-owner-policy.js (papel original e grants de conta Dono), dois novos callables e createStore compatível; fulfillment save exclusivo Dono; proteção estreita de concessão/reset de Dono nos endpoints Staff. UI StoreManagementModal substitui formulário antigo, reusa Modal/Button/Input; nomes por registro+unidade, root/slug imutáveis por rename, aliases dinâmicos preservam URLs antigas. Rules restringem aliases/audit/identidade de exibição, bloqueiam escrita com deletionLock e criação de novos pedidos em loja inativa, sem bloquear edição histórica.

Primeira validação: 19 casos de emulador (inclui ciclo, autorização, Rules e fulfillment) PASS após correção de isolamento de fixture; 26 Node de rotas/resolver/diretório e 9 React PASS. Mudanças posteriores pequenas de contato/endereço e mensagens ainda precisam rechecagem focada. Lint identificou helper antigo/reset de estado removidos — corrigidos; rerodar lint. Ainda não há build, commit, push ou deploy deste workstream. Logs %TEMP%/store-management-*.log, baseline remoto privado %TEMP%/store-management-baseline-private.json, inventário somente leitura %TEMP%/store-management-inventory.json. Não imprimir configuração sensível.

Concluir inventário DEV somente leitura, implementar e testar Owner/Admin/Gerente/Staff/anon, preservar seleção/histórico, build/lint/diff e revisão visual, commit/push, deploy DEV seletivo com baseline/env/secrets preservados, conferir fontes/hashes e pedir aceite manual somente visual. Registrar commit/targets/processos neste checkpoint antes de interrupção.

Fase9 75%, Fase11/12 100%, Global95,00%, Fase13 0% preservados. Mercado Pago futuro. Pendência fiscal anterior separada.

## Validação final local

Implementação concluída, sem commit/deploy até este registro. Regressão ampliada 53 casos em emuladores PASS; rechecagem final focada 19 PASS, sobreposta à regressão. React 9 e Node 26 PASS. Lint sem erros/avisos novos (65 App.js e um no-control-regex preexistentes). Capturas locais de 12 estados desktop/mobile, menu mobile corrigido e sem overflow; respostas fictícias. Build final em andamento após esse ajuste visual. Não repetir implementação. Próximo: conferir build/sourcemap/diff, commit/push e publicar somente os dez exports necessários, Rules e Hosting DEV, preservando env/secrets e Functions não relacionadas. Matriz/Garavelo reais não foram alteradas.

Build final PASS: /static/js/main.60d6a111.js, CSS /static/css/main.cda549b5.css; fontes/sourcemap conferidas. Diff-check e lint final PASS, sem avisos novos. 19 casos focados finais incluem redação de campos desconhecidos/segredos. Próximo passo efetivo: commit/push e publicação DEV seletiva.
