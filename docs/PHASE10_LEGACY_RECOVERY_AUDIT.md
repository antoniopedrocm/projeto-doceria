# Fase 10 — auditoria de recuperação completa de legado

## Estado vigente — 07/11/2026: acesso Google existente homologado

C15-E integral PASS preservado. [Google final 8602 no perfil separado da Ana](PHASE10_C15_GOOGLE_8602.md): 2 endereços/1 pedido, refresh/detalhe/retorno, saída sem shell privado/loading e reentrada Google sem SMS/claim PASS. [8 verificações de preservação](evidence/phase10-google-8602-data-preservation-dev.json): Customer original, owner, índices e versão/referência do pedido inalterados. O caso já tinha owner; primeiro claim Google continua não demonstrado, sem desfazer vínculo para fabricar evidência. C15 geral/C16 pendentes; **Fase 10 87,50%; global formal 97,00%; Fase 9 100%; Fase 13 0%; PROD READY: NÃO**. Sem código/deploy ou mudança administrativa de dados. Pendências anteriores de login Google abaixo são históricas, superadas apenas para o acesso existente.

## Atualização vigente — 07/11/2026: aceite C15-E completo

[Resposta explícita “PASS demais checks”](evidence/phase10-c15-email-acceptance-dev.json) encerra C15-E: endereço/2 pedidos, refresh e logout/relogin sem novo claim/SMS, além do retorno já aceito. Google final 8602 indicado e conferido: **já tem a própria conta como owner e mapping Google**, com 2 endereços/1 pedido. [Diagnóstico do caso](PHASE10_C15_GOOGLE_8602.md). Testar login/acesso existente sem remover ownership; ainda não prova primeira vinculação Google de legado sem owner. C15 geral/C16 continuam pendentes, **Fase 10 87,50%, global formal 97,00%, Fase 9 100%, Fase 13 0%**. Sem SMS/claim/escrita remota, código ou deploy novo. Pendências de checks C15-E nas seções anteriores abaixo foram superadas por este aceite.

## Estado vigente — 07/11/2026: C15-E técnico comprovado; Google e C16 pendentes

Compatibilidade `a36d558c` preservada; frontend `125dad90` publicado, testes/aceite de retorno registrados em `d1327182`. [Claim e-mail/senha real](evidence/phase10-c15-0811-after-claim-dev.json): 15 pós-condições técnicas PASS, Customer original, 18 Customers antes/depois, 1 endereço/2 pedidos preservados. [Retorno humano PASS](evidence/customer-menu-first-registration-review-dev.json); demais checks individuais de endereço/pedidos, refresh e logout/relogin ainda não atestados. Único SMS final 0811 consumido, sem repetição autorizada. Falta outro cadastro sem owner/conta Google legítima para C15-G, depois aceite consolidado C16. Não declarar ausência de todo claim real com base nas seções históricas.

[Matriz C16 preparada](PHASE10_C16_CONSOLIDATION.md), [conferência de retomada](evidence/phase10-resume-2026-11-07.json). **C01–C14 PASS preservados; C15/C16 pendentes. Fase 9 = 100%; Fase 10 = 87,50% (14/16); global formal = 97,00%; Fase 13 = 0%; PROD READY: NÃO.** Sem nova mudança funcional, envio, vínculo, build/deploy ou escrita remota. Rubrica e evidências originais abaixo são históricas e não foram reiniciadas.

## Estado vigente — patch publicado, C15 real pendente

Correções pontuais **`a36d558c`** publicadas e verificadas somente no DEV após autorização do Dono: dois índices READY, 15 Functions ACTIVE/58 arquivos por fonte, env/bindings preservados e 131 outras Functions/Hosting/Rules inalterados. 417 testes locais e 15 negativas remotas PASS; nenhum SMS/claim/Customer/pedido real alterado. [Evidência de release](evidence/phase10-compatibility-release-dev.json), [relatório](PHASE10_DEV_RELEASE.md).

**C01–C14 preservados; C15/C16 pendentes. Fase 9 = 100%, Fase 10 = 87,50%, global formal = 97,00%, Fase 13 = 0%; PROD READY: NÃO.** Próximo ponto é selecionar titulares/casos legítimos Google/e-mail e obter aprovações específicas de vínculo/SMS. Publicação não substitui prova real. Pré-checagem anterior não é inventário remoto novo de clientes; não foram refeitas consultas de dados de clientes nesta publicação. Registros abaixo são históricos.

## Estado local vigente — 05/11/2026: OPÇÃO B implementada para revisão

Proprietário autorizou correções pontuais locais de índice ausente, endereços legados e referências históricas. Patch sobre `1a0ede75` validado localmente e aguardando revisão, **sem commit/push/deploy ou operação remota**. [Comportamentos, arquivos e limites](PHASE10_LOCAL_COMPATIBILITY_FIXES.md), [checkpoint](CHECKPOINT_PREPROD_MISSION.md). As reproduções sintéticas não representam novos aceites reais. C01–C14 preservados, C15/C16 pendentes; Fase 9 = 100%, Fase 10 = 87,50%, global formal = 97,00%, Fase 13 = 0%. PROD não autorizada.

## Preparação anterior — 05/11/2026: C15 preparado, sem caso autorizado

**Fase 10 = 87,50% (14/16). C15 e C16 continuam pendentes. Fase 9 = 100%, global formal = 97,00%, Fase 13 = 0%; PROD READY: NÃO.** [Pré-checagem real sanitizada](evidence/phase10-c15-preflight-2026-11-05-dev.json): 18 Customers/4 aliases; 2 canônicos com proprietários e SMS liberado; 8 sem owner, com celular/índice válidos e sem mapping, mas fora da allowlist; 4 sem telefone/índice válidos. Não há caso pronto na política atual da Matriz. Política configurada não equivale a teste do provedor ao vivo.

[Roteiro C15/C16](PHASE10_C15_EXECUTION.md) e ferramenta somente leitura preparados. Aguardam seleção dos titulares/cadastros e identidades DEV legítimas, proposta e aprovações específicas de vínculo permanente/destinatário/novo SMS. Não desfazer owners, ampliar allowlist ou alterar os 14 remanescentes C14 automaticamente. Zero escrita remota/claim/SMS nesta retomada. [Runtime DEV preservado](evidence/preprod-current-dev-2026-11-05.json); nenhum novo deploy. Esta seção prevalece sobre o histórico abaixo.

## Fechamento anterior — sessão temporária SMS PASS

**Fase9=100%; Fase10=87,50% (14/16); Global formal=97,00%; Fase13=0%. PROD READY: NÃO.** Gate SMS Enterprise temporário concluído no DEV:2envios com autorizações específicas separadas, titular confirmou só na aplicação; navegação/grant privado,12endereços, histórico/detalhe, refresh e saída preservando Staff PASS. Nenhum novo pedido/pagamento/NF/WhatsApp, mutação de perfil/endereço ou claim permanente. Carrinhos locais restaurados a0; não há autorização de novo SMS.

Correção de handoff/saída fb89b0fd homologada em conta real; complemento visual restrito a hashes longos a4a5cdfe publicado no Hosting DEV versãof960c57c592945d0,61/61hashes,146Functions/Rules inalteradas/cache/slugs preservados.41testes focados e16cenários visuais do componente real com dados fictícios PASS, buildmain.08ad2156.js455,34kB/CSSa5070aae14,61kB, lint/diffPASS; regressão anterior597React/164públicos preservada sem somar repetições. [Fechamento do gate](evidence/preprod-mission-2026-11-04/sms-temporary-gate-final-dev.json), [causa/correções](SMS_TEMPORARY_SESSION_HANDOFF.md).

**Próximo ponto exato: C15.** Solicitada ao Dono indicação dos cadastros legados sem proprietário e contas DEV legítimas/titulares para cenários Google/e-mail. Não desvincular C02/final0290, falsificar Auth ou conceder ownership para fabricar aceite. Preparar caso concreto e aprovação própria de claim/SMS; a autorização temporária não os abrange. Depois C16 consolidado; não elevar Fase10 por fechar somente SMS. Não refazer Fase9 ou gates já PASS. Registros abaixo são históricos e esta seção prevalece.


## Fase9 encerrada no DEV — 04/11/2026

**Fase9=100%; Fase10=87,50%; Global formal=97,00%; Fase13=0%. PROD READY: NÃO.** Esta seção prevalece sobre estados anteriores preservados abaixo. Sessão Dono fornecida pelo proprietário: conciliação por loja, estado vazio, consulta de pedido existente PAID/R$1,00, referências do provider, aviso de execução externa e gravação bloqueada sem referência/atesto conferidos em Chrome real; formulário cancelado, sem registrar operação. Layout desktop/estreito sem overflow horizontal nas dimensões CSS efetivamente registradas (zoom do Chrome impede afirmar390CSS exatos). Nenhuma operação financeira/fiscal/pedido executada. Com implementação,1.120testes PASS, review, build/lint/diff e API/Rules/Hosting DEV já verificados, o último aceite da Fase9 foi concluído. [Evidência](evidence/preprod-mission-2026-11-04/phase9-staff-acceptance-dev.json).

Restam SMS Enterprise/grant temporário real, C15 claim Google/e-mail e C16 consolidação. Dono autorizou **até1SMS ao celular homologado final0290 somente para sessão temporária**, sem claim permanente; não pedir autorização novamente para esse envio, não reenviar além do limite. Nenhum envio concluído no ponto deste registro. Pré-checagem Garavelo retornou canais vazios antes de enviar; usar apenas configuração DEV legítima existente, sem copiar/habilitar flags. Não reabrir C14 nem aceites antigos.


## Decisão vigente registrada em 04/11/2026

Runtime4e264054 publicado e conferido no DEV em04/11; suíte final1.120PASS inclui registry/claim/migração/rollback/grants/isolamento. Isso encerra publicação e regressão automatizada dos gaps, **não C15/C16**. Falta SMS Enterprise autorizado com claim real pós-Google e pós-e-mail e aceite consolidado, conforme [roteiro mínimo atual](PRODUCTION_READINESS_REVIEW.md). Nenhum SMS enviado; não remover owners, criar identity falsa ou liberar órfãos para fabricar aceite. Fotografia de dados abaixo é de01/11; aprovação dos14caseIds é específica, não afirma inventário remoto em tempo real.

O Dono aprovou explicitamente “Aprovar preservação sem atribuição” para os 14 caseIds do inventário do commit4d894ddf. C14 passa a **PASS por disposição segura formal**, sem apagar, fundir, corrigir telefone ou conceder ownership. Originais permanecem privados e não atribuídos até prova futura. [Registro exato da decisão](evidence/phase10-remnants-owner-decision.json). Isso encerra a decisão dos remanescentes desta fotografia; não afirma que os dados foram recuperados nem aprova migração.

**Fase10 = 87,50% (14/16): C01–C14 PASS; C15 e C16 pendentes.** A declaração de81,25% abaixo fica como histórico anterior à resposta. C15 exige claim real Google/e-mail com SMS Enterprise autorizado; C16 exige homologação consolidada do estado publicado. Fase9=75%, global95,00%, Fase13=0%. PROD bloqueada.

## Atualização vigente — 01/11/2026

Reauditoria DEV somente leitura, sem migração aplicada, SMS ou alteração de dados. Esta atualização prevalece sobre a fotografia de 31/10 preservada abaixo. **Fase 10 = 81,25% (13/16 critérios)**, fora da ponderação global histórica. C13 agora está PASS: o procedimento operacional foi formalizado em [LEGACY_MANUAL_REVIEW.md](LEGACY_MANUAL_REVIEW.md), reutiliza proposta exata/aprovação de todos os UIDs/dry-run/CAS/backup/rollback e foi conferido com 23 testes emulados de registry, histórico, claim, migração e Rules. Não equivale a aprovação dos casos de dados pendentes.

| Critério | Situação atual | Evidência/ação restante |
|---|---|---|
| C01–C12 | PASS, preservados e regressão pertinente aprovada | Implementação e evidências históricas abaixo; suíte atual registry/migração/claim/Rules: 23 PASS |
| C13 | PASS | Procedimento explícito de conflitos, rejeição, aprovação, auditoria e rollback; LEGACY_MANUAL_REVIEW.md |
| C14 | PARTIAL | Inventário e dry-run atuais concluídos; falta decisão aprovada para cada remanescente, sem inventar vínculos |
| C15 | PENDENTE | Claim real pós-Google e pós-e-mail com SMS Enterprise; nenhum SMS autorizado/enviado nesta missão |
| C16 | PENDENTE | Homologação consolidada após publicação dos gaps e encerramento de C14/C15 |

Fotografia de 01/11 às 08:04 UTC−3: **18 Customers, 4 aliases, 4 identities/UIDs, 10 entradas de telefone, 96 pedidos (58 por loja/38 root), 3 endereços globais**. Há 3 Customers sem telefone, 1 telefone inválido, 12 canônicos sem owner, 1 pedido somente por telefone e 6 pedidos cujo customerId não está no cadastro/mapping atual. Os 3 endereços globais continuam órfãos. O único grupo com múltiplos UIDs é o C02 já revisado; nenhum conflito novo não revisado foi encontrado. Os 14 casos sanitizados permanecem pendentes de disposição formal; isolamento preventivo não significa recuperação concluída.

Auth atual: 167 usuários, dos quais 4 vinculados ao registry Customer; os 163 restantes são 154 anônimos e 9 Staff com identidade forte. Nenhum UID do registry está ausente no Auth. Não há evidência de 163 Customers fortes sem vínculo. Dry-run atual: 18 Customers/10 telefones, 9 grupos prontos, 1 grupo revisável já conhecido e 4 registros sem resolução; **zero escrita**. Não aplicar o dry-run como migração sem nova aprovação explícita da proposta.

Evidências sanitizadas: [inventário](evidence/phase10-current-inventory-dev.json), [Auth/SMS](evidence/phase10-auth-sms-inventory-dev.json), [dry-run](evidence/phase10-current-dry-run-dev.json). Snapshot com dados pessoais permanece somente em TEMP privado, fora do Git/Hosting.

Decisão da missão: LEGACY_PHONE pode comprar/pagar sem SMS; SMS com finalidade própria permite sessão privada temporária, sem promover Firebase Auth. Claim permanente continua exigindo identidade forte e prova específica. Implementação registrada em [LEGACY_PHONE_ACCESS_V2.md](LEGACY_PHONE_ACCESS_V2.md), commit b5892db3; publicação/homologação ainda pendentes. O projeto de verificação Enterprise existente está habilitado, com dois destinatários autorizados e nenhum telefone de teste configurado; não foi enviado SMS real.

Fase 9 continua 75%; global formal 95,00%; Fase 13 0%. C14–C16 impedem Fase 10 = 100%. Nenhuma produção autorizada.

## Auditoria original preservada — 31/10/2026

Data: **31/10/2026**, DEV `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`, base `2507adfdf3c877e41197d885a5d5c85d159c6656`. Revisão de documentos, código e evidências versionadas; nenhum inventário remoto novo, migração, SMS ou deploy. Dados quantitativos de legado abaixo são a fotografia de 24–25/10, não uma contagem atual presumida.

**Fase 10 tornou-se gate obrigatório de produção por decisão do proprietário.** Continua fora da ponderação global histórica. Sua aferição nesta auditoria é **75% de atendimento comprovado (12/16 critérios)**, com quatro critérios ainda não encerrados; **não está concluída nem integralmente homologada**.

## 1. Definição original recuperada

O roadmap original vigente na base registra recuperação de histórico e endereços legados **somente após prova de posse do telefone**, antes opcional. As regras originais complementam: Google/e-mail usam identidade estável; telefone digitado não autoriza histórico, ownership nem auto-merge. Fontes: `INFINITEPAY_PROJECT_PLAN.md`, roadmap e regras de identidade; `CUSTOMER_PHONE_CANONICALIZATION.md`; `CHECKOUT_IDENTITY_CONTRACT.md`; `ADDRESS_VERIFICATION_CONTRACT.md`.

Definição operacional preservada: permitir que a identidade forte correta recupere seu cadastro/dados antigos, mantendo o Customer técnico, referências históricas, valores, ownership e trilha revisável, sem liberar dados a quem apenas conhece o telefone. A decisão atual altera a obrigatoriedade; não autoriza fusões arbitrárias nem modifica a regra aprovada de primeiro cadastro forte com telefone livre sem SMS.

## 2. Critérios de aceite e método de aferição

Não existia rubrica interna numérica detalhada da fase opcional. O antigo 0% não foi tratado como prova de ausência de implementação. A tabela operacionaliza a definição e os contratos já aprovados em **16 critérios binários, com o mesmo peso interno**. Critério comprovado vale 1; parcial/pendente vale 0, sem crédito proporcional presumido. Isso mede cobertura de aceite nesta auditoria, não percentual de clientes migrados nem nova ponderação do projeto.

| ID | Critério | Evidência principal | Resultado |
|---|---|---|---|
| C01 | Normalização única de telefone, formatos equivalentes e rejeição de heurística ambígua | functions/customer-phone.js e customer-phone.test.js | COMPROVADO |
| C02 | Índice privado e writers transacionais sem duplicidade concorrente | customer-registry.js, registry-emulator e registry-api-emulator | COMPROVADO |
| C03 | Google/password resolvidos por identidade estável/UID, incluindo providers do mesmo UID | registry.resolveStrongIdentity/createForStrong e testes de sessão/registry | COMPROVADO |
| C04 | Ownership não concedido por telefone/e-mail; outro proprietário não é incorporado automaticamente | customer-ownership.js, registry/claim e Rules tests | COMPROVADO |
| C05 | Lookup/seleção weak com máscaras/referências opacas e destino resolvido no backend | CHECKOUT_IDENTITY_CONTRACT.md e evidências DEV | COMPROVADO |
| C06 | Recuperação dos modelos comprovados de endereço antigo, IDs/apelidos/padrão preservados | migration-plan.js, testes e aceite Thiago/C02 | COMPROVADO |
| C07 | Canônico/aliases revisados, preservação dos originais e dos UIDs aprovados | consolidação C02, registry.resolveId, entrega DEV f7466d4a | COMPROVADO |
| C08 | Histórico por referências originais, sem cópia ou reescrita financeira | 91/91 hashes iguais no rollout e canonical-history-emulator | COMPROVADO |
| C09 | Histórico privado somente para owners revisados; loja desconhecida sem fallback ou recompra indevida | customer-orders.js e canonical-history-emulator | COMPROVADO |
| C10 | Implementação do claim de legado sem owner após login forte, com prova de telefone ligada ao UID | customer-phone-claim.js, registry.attachVerifiedClaim, teste emulado; UI customer-phone-claim.mjs | COMPROVADO NA IMPLEMENTAÇÃO/TESTES; o aceite real é C15 |
| C11 | Propósitos de SMS/grant segregados, expiração/nonce/consumo e ausência de promoção de endereço para identidade | claim-emulator, address-verification e contratos de confiança | COMPROVADO NA IMPLEMENTAÇÃO/TESTES; o aceite real é C15 |
| C12 | Ferramenta de migração com proposta/aprovação, dry-run, CAS, backup tipado, retry idempotente e rollback protegido | scripts/customer-phone-migrate.cjs, migration-writes/driver tests; rollout DEV com retry zero | COMPROVADO |
| C13 | Processo operacional completo de conflitos/remanescentes, aprovação e auditoria de decisão, incluindo owner distinto | C02 tem proposta/aprovação aplicada; outros casos permanecem bloqueados/revisão, sem aceite geral do processo | PARCIAL, NÃO ENCERRADO |
| C14 | Inventário atualizado e disposição aprovada para cada débito remanescente | Última fotografia 24–25/10; faltam reconferência e decisões finais dos remanescentes | PENDENTE |
| C15 | Claim real pós-Google e pós-e-mail com SMS Enterprise atual, sem troca de UID/Staff/conta, com isolamento demonstrado | Aceite anterior exclui expressamente claim real e novo SMS; fornecedor emulado não prova entrega | PENDENTE |
| C16 | Homologação consolidada da Fase 10 ampliada e regressão final no estado atual | Aceite de canonicalização é delimitado; não cobre todos os critérios desta fase agora obrigatória | PENDENTE |

**Cálculo:** 12 comprovados ÷ 16 = **75%**. C13 parcial não recebe meio ponto. SMS existente, lookup isolado ou C02 sozinho não bastam: histórico, ownership, aliases, migração/rollback e controles independentes sustentam os critérios pontuados. Faltam C13–C16 para 100%. A revisão dos critérios pode ser aprovada/ajustada pelo proprietário sem adulterar os pesos históricos globais.

## 3. Funcionalidades implementadas

Normalização BR/E.164; índice privado; criação idempotente; resolução UID/identity; aliases com limite de profundidade/recusa de ciclo; whitelist de owners revisados; leitura mascarada fraca; endereços históricos comprovados; histórico root/loja autorizado por referências; claim de propósito próprio; writer/Rules protegidos; família de cupons; migração e rollback com precondições. O código existe e há evidências de testes/publicação; não se trata de projeto começando do zero.

## 4. Funcionalidades parcialmente implementadas/aceitas

O claim pós-login tem backend, UI e testes, mas não tem aceite real com o SMS Enterprise atual. A revisão manual funciona para a proposta C02 e a ferramenta aceita propostas exatas aprovadas, porém não há comprovação de encerramento operacional dos demais tipos de conflito/remanescentes. O histórico seguro funciona para vínculos comprovados; referência por telefone isolado continua fora. Essas limitações não autorizam relaxar ownership para terminar a fase.

## 5. Funcionalidades/entregas ausentes na evidência

Não foram encontrados: inventário reconciliado atual de todos os remanescentes; decisão final rastreável por débito; homologação real dos claims Google/e-mail no contrato atual; aceite consolidado específico da Fase 10 obrigatória. A existência de uma tela genérica de triagem não é pressuposta nem exigida arbitrariamente: é necessário um processo verificável, que pode reutilizar proposta/dry-run/aprovação e ferramentas existentes. Mudança real de telefone continua bloqueada; não é contada como entrega faltante da recuperação original sem decisão separada de escopo.

## 6. Débitos de dados legados

Fotografia documentada: **3 Customers sem telefone, 1 telefone inválido, 3 endereços globais sem vínculo comprovado e 1 pedido associado apenas por telefone**, além de pedidos root sem loja informada. Precisam ser reconferidos. Resolver por evidência ou registrar exclusão/quarentena deliberada, aprovada e auditável; “100%” não exige inventar proprietários, telefone ou loja para registros irrecuperáveis. Preservar originais e dados pessoais fora do Git/Hosting. A exclusão deliberada de itens na proposta C02 não equivale ao encerramento de todos os remanescentes da Fase 10.

## 7. Customers antigos

Auditoria de 24/10: 18 documentos, 14 linhas principais após consolidação, com originais/aliases preservados. Esses números são históricos. Atualizar a classificação canônico/alias/inválido/revisão sem criar outro Customer por cada login/provedor ou telefone equivalente. Não excluir cadastros antigos para simplificar a métrica.

## 8. Pedidos históricos

Fotografia: 91 pedidos, 53 por loja e 38 root, sem repetição de IDs entre esses documentos; 91/91 hashes preservados na migração. C02 acessa 64 referências diretas revisadas (41 por loja, 23 root). Um vínculo apenas por telefone ficou fora. Root sem loja aparece explicitamente como histórico sem loja determinada, sem fallback Matriz e sem recompra que atribua loja arbitrária. Atualizar o inventário sem copiar pedidos nem alterar status/valores/ownership/snapshots.

## 9. Endereços históricos

Modelos `enderecos[]`, `endereco` e `address` foram comprovados. Thiago/C07 recebeu compatibilidade com um endereço antigo; C02 consolidou 12 IDs e um padrão, preservando fontes/defaults dos aliases. Três documentos globais órfãos não foram atribuídos. Sem SMS, manter máscaras; grant específico autoriza somente os detalhes/ações permitidos. Normalização não pode inventar número, coordenadas ou proximidade para fundir destinos.

## 10. Identities

`customerAuthIdentities` usa provider/subject; registry privado resolve UID e canônico. Mesmo UID com Google/password não é outro Customer. Três UIDs revisados de C02 foram preservados, sem mesclar usuários Firebase. Novo UID com outro owner exige prova da conta/revisão; endereço de e-mail coincidente não basta. Reconferir mappings contraditórios/revogados na auditoria atualizada.

## 11. Canonicalização por telefone

Chave de negócio única normalizada; customerId continua técnico e imutável. Primeiro cadastro forte com telefone livre sem SMS é decisão vigente, com telefone não verificado. Número já existente não recebe ownership pela digitação. Índice e escrita são transacionais; registro ausente, conflito ou canônico contraditório falham fechado.

## 12. Aliases

C04/C06/C08/C18 foram revisados como aliases de C02, com documentos originais preservados e mappings privados. Resolução amplia apenas a família comprovada; não publica índice nem confia no payload do browser. Novos grupos/conflitos requerem proposta e autorização; quatro aliases não provam saneamento de toda a base.

## 13. Recuperação por telefone

`LEGACY_PHONE` permite resumo/seleção e criação de endereço novo não padrão conforme regra aprovada. Isso não é login forte nem recuperação completa do histórico. A prova de endereço/perfil básico também não cria identidade forte. Claim permanente exige identidade Google/password válida e propósito `CUSTOMER_IDENTITY_CLAIM` no backend.

## 14. Recuperação após Google/e-mail

`customerCompleteProfile` devolve claimRequired para telefone existente sem vínculo; a UI abre confirmação explícita por SMS. Outro owner devolve identityReviewRequired e não inicia o claim automático. Após prova válida, o mesmo Customer é vinculado ao UID correto, sem duplicação. Falta homologar os caminhos reais de Google e senha, mantendo sessão, carrinho, loja e acesso de uma segunda conta isolados.

## 15. SMS/grants

Claim tem UID/provider/subject/Customer/telefone/loja, nonce, prazo, tentativa e consumo único. Endereço/perfil têm grant temporário distinto. A migração de CAPTCHA para Enterprise tem gate próprio ainda aberto: não reaproveitar autorização antiga de um SMS para outro destinatário/finalidade. Nenhum SMS real foi enviado nesta auditoria.

## 16. Conflitos manuais

Cobrir múltiplos UIDs, telefone reciclado/compartilhado, ausência de prova, mapping divergente e duplicação parcial. Documento C02 é evidência concreta de uma revisão aprovada; não é regra de auto-merge. Fechar procedimento de responsável, prova, proposta, consentimento sobre acesso ao histórico, aplicação idempotente, auditoria, rejeição e rollback. Casos negados devem continuar negados, sem ocultar o motivo operacional.

## 17. Migrações necessárias

Não foi comprovada necessidade de migração em massa adicional. Primeiro refazer inventário/dry-run e comparar markers/updateTime; depois planejar somente deltas elegíveis aprovados. Reexecuções já demonstraram ALREADY_APPLIED/zero escritas. Validar backups tipados acessíveis e restauração em fixture; nunca sobrescrever alteração posterior do cliente. Plano PROD exige revisão/autorização própria depois dos gates, não execução nesta fase DEV.

## 18. Testes necessários

Reutilizar os testes de registry/API/Rules, claim, canonical-history, migrations e UI. Cobrir novo owner/owner diferente, Google/password/same UID, alias inválido/ciclo, telefone equivalente/inválido, grants de propósito trocado/expirado/replay, concorrência, troca de UID/loja, negativa Guest/Staff/Customer alheio, histórico root sem loja, defaults/IDs, cupom e idempotência/rollback. A bateria final deve exercer os gaps implementados no HEAD que será homologado, sem confundir teste sintético com SMS real.

Nesta revisão, **12/12 testes locais** de `customer-phone.test.js`, `customer-migration-writes.test.js` e `crm/tests/customer-phone-claim.test.mjs` passaram. UI/provider são simulados, sem emulador novo, rede de pagamento ou SMS. A evidência anterior registra 134 casos emulados e 60 CRM no rollout, com preexistências identificadas; não foram todos repetidos agora nem são provas do gate C15.

## 19. Homologação necessária

Após fechar os pequenos gates e a Fase 9, executar roteiro dedicado DEV com dados sintéticos controlados: legado sem owner → Google → prova própria → mesmo Customer/histórico/endereços; repetir com e-mail/senha; outra conta e outros owners negados; refresh/logout/multiloja; exceções/manuais e retry/rollback em fixtures. Validar desktop/mobile, SMS Enterprise e auditoria sem tokens/endereços expostos. Envio real depende de autorização específica de destinatário/finalidade. Pagamento/estorno/WhatsApp e PROD não são necessários por implicação do aceite.

## 20. Percentual e decisão

**Fase 10 = 75% auditado (12/16), obrigatória pré-PROD, contribuição global atual 0 p.p.** Não é 0% por falta de investigação nem 100% pela existência de SMS/C02. Critérios C13–C16 continuam bloqueadores. Só após implementação dos gaps, testes, atualização DEV necessária e aceite integral pode atingir 100%.

Fase 9 = 75%; global formal = 95,00%; Fase 13 = 0%. Se Fase 9 chegar a 100%, o global será 97,00%, mas PROD continua bloqueada enquanto Fase 10 ou qualquer outro gate não estiver encerrado. Rebaseline global somente por decisão explícita futura do proprietário. [Revisão dos gates](PREPROD_GATE_REVIEW.md).
