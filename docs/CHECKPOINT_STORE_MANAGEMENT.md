# Checkpoint — gerenciamento de lojas exclusivo Dono

## Estado atual para retomada

**CONCLUÍDO E HOMOLOGADO NO DEV.** O usuário respondeu **PASS** ao novo aceite autenticado da aba Configurações → Gerenciar Lojas e do seletor rápido, em 2026-10-31. A reprovação inicial foi tratada no complemento 9959c630. Não repetir implementação, build, deploy, homologação ou correção de papel sem nova falha.

Workspace: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree.
Branch feature/infinitepay-customer-auth. Firebase crmdoceria-9959e. PROD não autorizada.

## Commits e publicação

Base anterior b4cd6b67. Backend/gestão original c3a7bb63cb9210ccd87b383382d7f3fbcadc6612; evidências 0b9c23a8. Complemento de navegação **9959c630636a304cff4b340dc4d97183ab20b0f6**, push concluído e Hosting-only DEV publicado (CLI exit0). Artefato .deploy-crm-store-baseline-9959c630, main.8b290d13.js/CSS main.dfbd1739.css. 61/61 hashes, 29 fontes sourcemap, 52 fontes públicas e cache correto. Backend/Rules não precisaram de novo deploy.

## Interface atual

**Ver lojas** e seletor superior: visualizar/selecionar loja, sem criação ou mutações estruturais mesmo para Dono. Modal mantido.

**Configurações → Gerenciar Lojas**: aba/página exclusiva manage_stores, header/subtexto e **+ Nova Loja**; cards em grid desktop/coluna mobile, IDs/status, seleção, menu Editar/Configurações/Inativar/Reativar/Excluir por elegibilidade. Mesmo componente/serviço central reutilizado em modo página. Visão Geral somente seleção. ApFood legado continua protegido. Entre Lojas não foi alterado. Restauração de aba sem capability não monta o painel; backend segue negando mutações de não Dono.

## Causa da opção ausente e correção autorizada

A conta indicada pelo usuário estava com papel ORIGINAL admin, exibido como Dono pelo normalizador legado; manage_stores corretamente era false. Usuário autorizou explicitamente corrigir SOMENTE essa conta no DEV para dono. **Correção já executada em 31/10/2026 21:21:26 UTC: NÃO repetir.** Escrita condicional e atômica somente no campo role, com evento privado append-only STAFF_OWNER_ROLE_CORRECTED/DEV_ROLE_CORRECTION em storeManagementAudit e timestamp server-side. Lojas, permissões e custom profile verificados idênticos; Firebase Auth não tocado. Leitura atual confirma dono/ativo/manage_stores=true. Identificadores pessoais omitidos nas evidências. Outros Admin/Gerente permanecem sem gestão.

## Contrato preservado

Papel original dono/owner + capability não revogada, validação server-side e escopo Staff. Nova loja DRAFT/inativa; cadastro/publicação e ID imutável; aliases publicados preservados; inativação sem apagar histórico; reativação exige readiness; hard delete conservador de rascunho novo nunca publicado/vazio/sem referências comprovadas, confirmação/nome/revisão/lock/tombstone e sem recursiveDelete. Auditoria global append-only. Disponibilidade estrutural exclusiva Dono, leitura Staff autorizada. Legado/canais protegidos. Proteções de concessão/reset de conta Dono nos endpoints Staff permanecem.

## Validação

Complemento: 38 React/cinco suítes PASS (aba Owner-only, Admin/Gerente/Staff, criação/edição e cancelamento, seleção rápida, resposta server-side negada e regressão capability/Frete). Build/lint/diff-check PASS; zero erros/avisos novos, 65 App.js e um no-control-regex preexistentes. 18 capturas locais de componentes reais com respostas fictícias desktop1920×889/mobile390×800, sem overflow/pageerror nem mutação; não são sessão Staff autenticada DEV. Chrome público real Matriz/Garavelo direto/refresh desktop/mobile PASS, zero mutações.

Validação original backend permanece: 53 emulador +19 focados sobrepostos, 26 Node; nenhuma mudança backend neste complemento. 142 Functions e Rules conferidas inalteradas após Hosting, incluindo dez exports de gestão nas revisões publicadas. API api-00068-xis; Rules 674db1b8-5757-44cb-b256-5eb25b367e2b. Env/secrets não alterados. Nenhuma loja real criada/editada/inativada/excluída; única mutação de dados autorizada foi a correção de papel da conta, além de sua auditoria.

Evidências: [local](evidence/store-management-settings/local-validation.json), [capturas](evidence/store-management-settings/local-report.json), [Hosting](evidence/store-management-settings/hosting-dev.json), [backend/Rules](evidence/store-management-settings/backend-rules-unchanged-dev.json), [correção autorizada](evidence/store-management-settings/owner-correction-dev.json), [capability atual](evidence/store-management-settings/owner-capability-dev.json), [Chrome público](evidence/store-management-settings/dev-public-report.json). Logs %TEMP%/store-management-settings-*.log; dados privados não devem ser copiados aos docs.

## Encerramento

Usuário respondeu PASS à solicitação consolidada revisada: Configurações → Gerenciar Lojas, + Nova Loja/Editar abrindo e cancelando, cards/ações por elegibilidade, Visão Geral somente seleção, ApFood protegido, Entre Lojas separado e Ver lojas rápido; desktop/mobile. [Aceite humano](evidence/store-management-settings/manual-acceptance-dev.json). As gravações, exclusão, auditoria e negações de papéis não Dono continuam sustentadas pelos testes automatizados, sem inferir mutações reais desse aceite visual. Nenhuma nova mudança de papel, dado remoto ou runtime foi necessária para o fechamento; nenhuma nova publicação. O aceite fiscal anterior permanece separado.

Percentuais: Fase9 75%, Fase11/12 100%, Global95,00%, Fase13 0%, preservados. Mercado Pago futuro; aceite fiscal anterior separado. PROD intacta. Nenhum pedido/pagamento/nota/SMS/WhatsApp real.
