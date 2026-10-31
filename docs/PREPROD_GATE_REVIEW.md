# PRE-PROD GATE REVIEW

**31/10/2026 — PROD READY: NÃO.** Ambiente de execução: DEV `crmdoceria-9959e`; produção não autorizada nem consultada. Revisão documental/código na base `2507adfdf3c877e41197d885a5d5c85d159c6656`, sem implementação grande, alteração remota ou deploy.

Decisão do proprietário: **Fase 9 = 100% E Fase 10 = 100%** antes de qualquer autorização para produção. Fase 10 tornou-se gate obrigatório de produção por decisão do proprietário. Os demais gates abaixo também exigem PASS e autorização explícita final. Obrigatoriedade não cria peso global: Fase 9 **75%**, global formal **95,00%**, Fase 13 **0%** preservados. Fase 10 aferida em **75% (12/16 critérios de evidência)**, fora da ponderação global. Fases 11/12 continuam 100% do escopo histórico, sem conferir aprovação automática aos complementos.

## 1. Fase 9 — estado atual real

**75%, gate BLOQUEADO. Contrato oficial OBTIDO.** As duas respostas formais do suporte de 25/10/2026 foram conferidas, incluindo o esclarecimento final sobre eventos não-PAID. A pendência não é mais obter resposta: é implementar a semântica suportada, testar, publicar DEV e homologar. [Resumo rastreável do contrato](INFINITEPAY_SUPPORT_CONTRACT_2026-10-25.md).

Existe aprovação consultada server-side, correlação aos registros persistidos, idempotência/recibos, tratamento conservador de criação ambígua e sinais retidos. A política atual inspeciona `event/type/status`, enquanto o suporte confirma `event_type`; a criação atual usa `webhook_url`, voltado à aprovação. Não existe implementação completa de despacho dos seis eventos/operacões esperadas. Proteções existentes não equivalem ao fechamento da fase.

## 2. Fase 9 — itens restantes e critérios de 100%

| Item | Base existente / falta real |
|---|---|
| paid / payment_check | Preservar o fluxo já homologado; validar o envelope oficial, quatro referências completas, conta/loja/valor/método e repetições/concorrência. Payload incompleto não deve sustentar conclusão negativa. |
| payment_failed | Registrar tentativa não concluída sem transformar ausência de aprovação em estorno/falha definitiva do pedido nem rebaixar PAID. Cobrir transaction_nsu ausente antes do pagamento, retry legítimo e evento antigo. |
| canceled / refunded | Implementar operações financeiras esperadas e reconciliação com execução verificável no App/Conta. Apenas registrar intenção não prova execução. Sem correspondência/prova, manter pendência e investigação; nenhum POST isolado finaliza a mudança financeira. Parcial não vira integral. |
| settled / created | Processar sem novo recebimento, consumo, liberação ou falsa confirmação. Settled não tem consulta autenticada no contrato informado; distinguir sinal informativo de liquidação comprovada operacionalmente. |
| Seleção/parser | Adequar `event_type/invoice_type` e `webhook:{url,events}` conforme contrato; preservar compatibilidade de links antigos. Não presumir que webhook_url simples já recebe todos os eventos. |
| expected financial operations | Definir registro servidor de operação/tipo/conta/loja/pedido/transação/valor/prova/Staff/estado e consumo idempotente. Intenção pendente, execução verificada e evento recebido são conceitos distintos. |
| pending reconciliation | Fila/estado operacional para sinais anômalos, referências incompletas, evento sem operação conhecida e prova ausente. A recuperação de criação ambígua já existente não substitui essa conciliação. Registrar resolução autorizada/auditada sem endpoint público que aceite “novo estado” arbitrário. |
| Webhook não assinado / POST forjado | Sem HMAC documentado: não inventar segredo de origem. Conferir o pagamento no provider quando aplicável; correlação com intenção sozinha não autoriza estorno. Validar origem do procedimento interno e prova de execução, mantendo anomalias retidas. |
| Duplicados / fora de ordem | Deduplicar por semântica de evento e transação/operação, não só transaction_nsu; suportar evento pré-pagamento sem esse campo, concorrência, replay e eventos tardios. Não inventar ID/timestamp garantidos. |
| Estado / efeitos | Separar financeiro de operacional e liquidação. Nenhuma segunda baixa/reserva, uso de cupom, recebimento, estorno ou reposição automática indevida. Preservar recibo original e trilha. |
| Testes / DEV | Bateria unitária/HTTP/Auth/Firestore/Rules + casos adversos dos cinco eventos pedidos e created, valores/owners/lojas divergentes, expected operation sem prova e evento forjado coincidente com intenção. Depois build/lint/diff, commit/push, deploy seletivo DEV, evidência remota e aceite. |

**Só implementar + testar não encerra a fase:** publicação DEV necessária e homologação são obrigatórias. Nenhum pagamento/refund/SMS/WhatsApp real é autorizado por esta revisão. Consulta pública nova, endpoint privado ou assinatura não informada não serão inventados para contornar a limitação do provider.

## 3. Fase 10 — definição formal

Recuperar dados históricos do Customer certo após prova adequada, com vínculo seguro da identidade Google/password e telefone existente, preservando ownership, aliases, endereços, pedidos e valores. Telefone digitado, SMS de endereço ou nome/e-mail coincidente não bastam. Passa de opcional a **obrigatória pré-PROD**, sem mudar pesos históricos. [Auditoria completa com os 20 itens solicitados](PHASE10_LEGACY_RECOVERY_AUDIT.md).

## 4. Fase 10 — estado atual real

**75% aferido nesta auditoria: 12 de 16 critérios comprovados; gate BLOQUEADO.** Não é percentual de Customers migrados nem homologação integral. A rubrica interna é explícita porque não havia aferição detalhada da antiga fase opcional; não altera o cálculo global.

Implementados/testados: normalização, índice/writers, identidade estável, ownership, lookup mascarado, recuperação de endereços antigos, canônico/aliases revisados, histórico por referência, claim seguro e segregação de grants, ferramentas de migração/backup/rollback. C02 foi consolidado com quatro aliases, três UIDs e 12 endereços; 91/91 pedidos ficaram intactos na fotografia do rollout. A existência desses componentes não fecha os critérios restantes.

## 5. Fase 10 — itens restantes

1. **C13 — conflitos/manuais:** encerrar procedimento verificável e aceite dos casos remanescentes/owner distinto, com prova, consentimento dos acessos, responsável e auditoria. A aprovação C02 não é autorização geral.
2. **C14 — dados:** atualizar inventário/dry-run e dar destino aprovado aos três cadastros sem telefone, um inválido, três endereços órfãos e um pedido só por telefone identificados na fotografia histórica. Revalidar números atuais. Não inventar telefone/owner/loja; quarentena/exclusão deliberada do escopo recuperável precisa decisão rastreável.
3. **C15 — claim real:** homologar legado sem owner após Google e após e-mail/senha com SMS Enterprise atual, mantendo UID, isolamento e ausência de duplicidade. O aceite anterior explicitamente não incluiu claim real.
4. **C16 — consolidação:** executar regressão dos gaps e aceite integral específico da fase obrigatória em DEV, com fixtures/rollback seguro. Não executar migração em massa ou alterar usuários Auth por implicação.

A auditoria documental inicial já foi feita nesta revisão. O levantamento atual de dados e a implementação dos gaps serão executados na etapa própria, depois da Fase 9, conforme ordem do proprietário.

## 6. Nota Fiscal

**PENDENTE.** Duas opções de pagamento aprovadas visualmente; edição completa/status já homologados. Falta o aceite fiscal final de pedido legitimamente elegível na fila e do método obrigatório em AGREED_LATER, sem salvar/emitir nota real para teste. Não encerrar esse gate com o PASS de edição de pedidos. Fonte: CHECKPOINT_AUTHENTICATED_PAYMENT_V1.md.

## 7. SMS Enterprise

**PENDENTE.** Implementação/testes/publicação existem; falta o aceite do fluxo atual Enterprise em desktop/mobile, distinto do SMS anterior. Claim de identidade tem finalidade própria e também precisa C15. Eventual envio real exige autorização específica; nenhuma autorização antiga é reaproveitada. Fonte: RECAPTCHA_ENTERPRISE_DEV.md.

## 8. Refresh CRM

**PENDENTE DE ACEITE ESPECÍFICO REGISTRADO.** Loja após reload teve PASS. Correção de seção 3dc11bc1 foi entregue/testada; falta registrar o roteiro Nota Fiscal/Clientes/Financeiro/Página Inicial → Ctrl+R com loja preservada. Aceites de rotas Customer e gestão de lojas não substituem esse roteiro. Fonte: CRM_STORE_LOADING_PERFORMANCE.md.

## 9. Admin Preview

**Visual homologado; gate técnico PENDENTE.** Conferir trilha real STARTED → ORDER_VIEWED → ENDED da mesma sessão/canônico C02, família C04/C06/C08/C18, ausência de associação indevida a C03/C07 e zero leases/sessões ativas após saída. As leituras antigas e a expiração prevista não provam o estado atual; esta revisão não consultou sessões remotas. Fonte: ADMIN_CUSTOMER_PREVIEW.md e últimas solicitações de auditoria do usuário.

## 10. Outros blockers

| Gate | Estado nesta revisão |
|---|---|
| Configurações PROD por loja, Auth/CORS/URLs/secrets/readiness | PENDENTE de revisão específica autorizada; PROD não consultada agora. Nenhum dado DEV será promovido como configuração PROD por conveniência. |
| Backup/rollback | Ferramentas e plano DEV existem; comprovação própria da promoção, armazenamento seguro/durável e restauração de fixture ainda devem estar PASS. TEMP privado de migração não substitui plano operacional de backup PROD. |
| Security/regression tests finais | PENDENTE da bateria relativa ao HEAD final das fases/gaps. Há baterias aprovadas e débitos legados documentados; não declarar todas as suítes verdes nem ignorar Rules/Storage antes da revisão final. |
| Gestão de lojas exclusiva Dono | CONCLUÍDA/HOMOLOGADA, usuário PASS, fechamento 2507adfd. Não reabrir nem repetir a correção de papel. |
| URLs, edição completa, disponibilidade por loja | Homologações já registradas; não repetir sem regressão demonstrada. |
| Mercado Pago / cartão salvo | Mercado Pago não implementado; trabalho futuro separado. Cartão salvo não existe no produto InfinitePay contratado conforme suporte; adiado, sem carteira local. Não são entregas inventadas dentro de Fase 9/10. |
| Autorização do proprietário | NÃO CONCEDIDA para PROD. PASS dos gates não equivale a autorização automática. |

## 11. Ordem recomendada de execução

1. Encerrar os complementos pequenos em andamento: fiscal, Enterprise, refresh CRM e auditoria técnica do preview, agrupando somente verificações compatíveis e sem mutações reais desnecessárias.
2. Implementar, testar, publicar e homologar **Fase 9 em 100%**, usando o contrato já recebido.
3. Atualizar a auditoria de dados/dry-run da Fase 10 a partir desta revisão inicial.
4. Implementar gaps e decisões aprovadas da Fase 10, com migrações mínimas autorizadas quando comprovadamente necessárias.
5. Homologar **Fase 10 em 100%** no DEV, incluindo seu claim real e negativas.
6. Executar Production Readiness Review: demais gates, configuração/backup/rollback/segurança/regressão PASS.
7. Somente então solicitar autorização explícita para Fase 13. Não publicar ou operar PROD como consequência desta atualização.

## 12. PROD READY: NÃO

Gate formal: `Fase9 == 100% && Fase10 == 100% && NF == PASS && SMS_Enterprise == PASS && Refresh_CRM == PASS && Admin_Preview_Tecnico == PASS && Config_PROD == PASS && Backup_Rollback == PASS && Security_Regression == PASS && Autorizacao_Proprietario == EXPLICITA`.

Esse é o critério documental/operacional; esta tarefa não adiciona nem alega um novo bloqueador de CI/runtime. Percentuais: **Fase9 75%, Fase10 75% auditado fora da ponderação, Global95,00%, Fase13 0%**. Fase 9 em 100% leva a **97,00% formal**, mas não libera PROD se Fase 10 ou qualquer gate estiver pendente. Inclusão futura da Fase 10 nos pesos exige decisão explícita e rebaseline preservando o histórico.

Validação desta revisão: 12/12 testes locais de normalização/plano/migração/UI claim PASS, com fixtures e sem SMS real; conferência documental/diff. Sem build, deploy, escrita remota, mudança de runtime ou contato com o suporte. Evidência em [preprod-gate-review-2026-10-31.json](evidence/preprod-gate-review-2026-10-31.json).
