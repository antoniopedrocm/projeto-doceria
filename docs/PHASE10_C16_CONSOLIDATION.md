# Fase 10 — preparação da consolidação C16

## Situação em 07/11/2026

**PREPARADO, NÃO HOMOLOGADO. C15 e C16 permanecem pendentes.** Este documento organiza as evidências existentes, sem substituir aceites reais nem redefinir a rubrica original. Fase 9 = **100%**; Fase 10 = **87,50% (14/16)**; global formal = **97,00%**; Fase 13 = **0%**. PROD READY: **NÃO**.

Retomada no worktree DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, HEAD `d1327182`, sincronizado com origin, sem alterações tracked anteriores. Helpers e diretórios untracked preexistentes preservados. [Conferência somente leitura](evidence/phase10-resume-2026-11-07.json): 14 artefatos JSON conferidos, snapshot da decisão C14 correspondente, orçamento SMS final 0811 zerado; Hosting `75f46bb8c26f95e6` continua publicado e HTML remoto corresponde ao build local, com revalidação. Não houve consulta nova de Customers/pedidos, escrita remota, SMS, claim, build ou deploy.

## Matriz de critérios preservados

A definição completa e o histórico estão em [PHASE10_LEGACY_RECOVERY_AUDIT.md](PHASE10_LEGACY_RECOVERY_AUDIT.md). Os status abaixo refletem os aceites já registrados; conferir os artefatos não constitui nova execução dos testes.

| Critério | Situação | Evidência existente |
|---|---|---|
| C01 — normalização de telefone | PASS preservado | `functions/customer-phone.js`, `customer-phone.test.js`; bateria de compatibilidade |
| C02 — índice e writers sem duplicidade concorrente | PASS preservado | `customer-registry.js`, registry/API emulados; fallback de índice ausente testado e publicado |
| C03 — identidade Google/password estável | PASS preservado na implementação | Registry/sessão e primeira transição de identidade sintética; prova real dos dois métodos pertence a C15 |
| C04 — ownership protegido | PASS preservado | Ownership, registry, claim e Rules; outro UID não assume cadastro automaticamente |
| C05 — lookup fraco sem divulgação privada | PASS preservado | Contrato de identidade, referências opacas e testes de autorização |
| C06 — endereços legados | PASS preservado | Compatibilidade `enderecos`/`endereco`/`address`, exclusões e deduplicação testadas; caso C15-E com 1 endereço preservado |
| C07 — canônico e aliases revisados | PASS preservado | Caso C02, resolução de IDs, consolidação e referências originais preservadas |
| C08 — histórico sem reescrita financeira | PASS preservado | Histórico canônico emulado; 2 pedidos C15-E com versões/referências inalteradas |
| C09 — histórico privado autorizado | PASS preservado | `customer-orders.js`, campos alternativos concordantes, caminhos root revisados e limites defensivos |
| C10 — claim após identidade forte e prova específica | PASS preservado na implementação | Claim emulado; pós-condições reais e-mail/senha registradas, C15 geral ainda pendente |
| C11 — propósitos, expiração e consumo de prova | PASS preservado na implementação | Claim/endereço/grants segregados; sessão temporária homologada separadamente |
| C12 — migração e rollback controlados | PASS preservado | Ferramentas/dry-run/CAS/backup/rollback e testes existentes; nenhuma migração nova autorizada |
| C13 — processo de conflitos manuais | PASS preservado | [LEGACY_MANUAL_REVIEW.md](LEGACY_MANUAL_REVIEW.md), revisão e 23 testes emulados registrados na auditoria |
| C14 — disposição dos remanescentes | PASS preservado por decisão formal | [Decisão dos 14 caseIds](evidence/phase10-remnants-owner-decision.json): preservar sem atribuição até prova futura; não equivale a recuperar/apagar registros |
| C15 — claim real Google e e-mail/senha | **PENDENTE** | E-mail/senha técnico e retorno humano PASS; demais checks individuais e caso Google independente ainda pendentes |
| C16 — aceite consolidado do estado publicado | **PENDENTE** | Matriz preparada; depende de C15 integral e aceite consolidado, sem crédito por preparação |

## Evidências complementares e limites

- [Compatibilidade local](evidence/phase10-local-compatibility-2026-11-05.json): **417 testes finais PASS** (164 unitários, 153 públicos, 100 emulados). Inclui recuperação com índice ausente, cadastro novo, modelos de endereço, histórico autorizado, concorrência, idempotência e falhas. Limite defensivo do fallback: até 1.000 documentos de metadados; excesso/falha/conflito exige regularização controlada. Não é migração universal nem prova real Google.
- [Publicação da compatibilidade](evidence/phase10-compatibility-release-dev.json): backend `a36d558c`, dois índices READY e 15 negativas remotas PASS; autorização e proteção não foram substituídas por busca por telefone.
- [C15-E real](evidence/phase10-c15-0811-after-claim-dev.json): **15/15 pós-condições técnicas PASS**, mesmo Customer original, único owner aprovado, mappings corretos, **18 Customers antes/depois**, **1 endereço e 2 pedidos preservados**. O único SMS autorizado foi consumido; não repetir ou desfazer vínculo.
- [Retorno v2](evidence/customer-menu-return-v2-local.json) e [publicação](evidence/customer-menu-return-v2-after-dev.json): runtime frontend `125dad90`, **771 testes PASS** e 61/61 arquivos locais verificados no release. [Aceite humano e primeira criação](evidence/customer-menu-first-registration-review-dev.json): retorno atual PASS; 8 novos cenários sintéticos PASS, 15 execuções focadas incluindo testes anteriores. Não somar baterias sobrepostas nem atribuir novo aceite real à simulação.
- Nota Fiscal, Refresh CRM, Admin Preview, SMS temporário e Fase 9 permanecem nos aceites registrados em [PRODUCTION_READINESS_REVIEW.md](PRODUCTION_READINESS_REVIEW.md). Não reabrir mutações reais nem repetir operações financeiras/fiscais para gerar evidência.

## Sequência mínima restante

1. Obter somente a confirmação ainda ausente do titular C15-E: 1 endereço/2 pedidos visíveis, refresh mantendo acesso e logout/relogin com a mesma conta sem novo claim/SMS. O retorno ao cardápio já está PASS e não precisa ser repetido.
2. Receber indicação de **outro** cadastro legado sem proprietário e conta Google legítima do titular. Conferir o caso somente leitura; não usar final 0811 já vinculado nem remover owners para fabricar teste.
3. Preparar escopo exato e obter autorização específica para eventual destinatário/limite de SMS e vínculo Google. Autorização de deploy DEV não cobre essas ações. Credenciais e código somente na aplicação.
4. Homologar C15-G com baseline/pós-condições de Customer original, UID, histórico/endereço, ausência de duplicidade, auditoria e acesso persistente; registrar resultado humano e técnico sem dados pessoais desnecessários. Falha não autoriza reenvio automático.
5. Fechar C15 somente após os dois cenários aceitos. Consolidar C16: conferir critérios e evidências no estado final; executar regressão pertinente se houver novo delta/falha, registrar os limites e obter aceite consolidado. Não repetir suítes/build/deploy sem necessidade.

C15 completo permite Fase 10 = 93,75% (15/16); C16 aceito permite 100%. Isso **não repondera** o global formal nem autoriza PROD. Configuração/backup/rollback efetivos de PROD e autorização explícita do proprietário continuam gates futuros, sem acesso nesta missão.
