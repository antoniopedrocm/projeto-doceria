# C16 — decisão de consolidação

> Atualização posterior: C16_VOLUNTARY_LINKING_20261117.md substitui a estratégia de reconciliação em massa pela vinculação voluntária. Permanecem os gates de revisão, equivalência publicada e homologação; não exigir manifesto administrativo por cliente.

Decisão: C16 PENDENTE. Segurança das correções revisada; aceite consolidado do estado publicado ainda não comprovado. Não executar novo scan, publicação ou reconciliação nesta etapa.

## Base normativa

- PHASE10_C16_CONSOLIDATION.md, matriz C16: "aceite consolidado do estado publicado". Sequência mínima item 5: resolver achados, concluir revisão, verificar pacote versionado versus publicado e registrar aceite consolidado.
- PHASE10_LEGACY_RECOVERY_AUDIT.md:71,116: homologação consolidada após publicação dos gaps e encerramento C14/C15; regressão final no estado atual.
- PHASE10_C15_EXECUTION.md:148-150: runtime corrigido requer validações pertinentes e publicação DEV antes do novo aceite; C16 PASS leva Fase10 a100%, global permanece97%.
- C16_ASTRA_REVIEW_HANDOFF.md itens8/10: reconciliar revisão/versionamento/publicação; após correções/reteste/revisão registrar C16. Não há cláusula exigindo novo scan completo para cada HEAD.
- Skill verify-fix: revisão standalone das correções; não é aceite do projeto nem atualização do scan encerrado. Não exige scan novo.

Orientações históricas de Python indisponível/recuperação do scan antigo foram superadas pelos eventos posteriores registrados nesta conversa. Não reabri-las. Requisito de estado publicado não foi revogado.

## Rastreabilidade e evidências satisfeitas

Git ancestry confirmado:67cf340c (candidato do scan formal04ad2505-eaec-4583-b13c-343e9e7f42f5) → cc69693f (correções Medium) → d29885fd7f7a0819c79bd5b7792a252605208e75 (dry-run,HTTP,otimização) →8805a04650423b6dfd78787efd75e6e60b657630 (somente política documental). Worktree limpo antes deste registro. O scan completo continua associado ao candidato67cf340c; não atribuir sua cobertura ao novoHEAD.

C01–C15 PASS preservados conforme matriz/aceites, incluindo C14 e Google/password reais C15. Não repetir claims,SMS ou autenticação já homologada sem falha nova. Scan formal completo:41/41descoberta,4/4validações,3/3ataques,3Medium; High descartado como anterior ao delta. Correções verificadas e revisão final Astra em artifacts/c16-final-review-astra-20261116.md: três caminhos corrigidos, nenhum novo achado confirmado no delta. Histórico do scan preservado, sem mudar achados retrospectivamente.

Regressões reaproveitadas: emulador20/20 +performance1/1; unitários33/33; HTTP real de rota/transação com autenticação injetada; dry-runCLI; lint0erros; diff-check e buildCRM anterior pertinente. Grupos anteriores50+1,37/37,34/34 preservados, não somados como novos testes. Revisão financeira: Rules/manual-order-payment sem delta desde67cf340c; evidências anteriores preservadas.

## Pendências por gate

| Pendência | Efeito sobre C16 | Efeito sobre produção |
|---|---|---|
| Equivalência entre pacote corrigido versionado e DEV publicado | Bloqueador direto: evidência ausente para runtime novo | Também bloqueia promoção |
| Homologação específica dos fluxos afetados no DEV e aceite consolidado | Bloqueador direto; testes locais não substituem estado publicado | Também bloqueia release |
| Vínculos legados necessários no DEV | Pré-requisito operacional do aceite funcional do novo runtime; não falha de segurança por negar acesso sem prova | Cobertura própria PROD necessária antes de rollout |
| Reconciliação PROD, backup/rollback e configurações/contas por loja | Não exige aplicar dados PROD para fechar C16 DEV | Gates próprios de produção |
| Limite10mil/HTTP503 | Risco conhecido não resolvido; se impedir fluxos de aceite DEV, bloqueia C16. Sem evidência disso nesta etapa | Exige avaliar volume real/índices/capacidade antes do rollout |
| Autenticação Firebase real no teste HTTP novo | Teste usa identidade injetada; C15 real existente permanece válido. Não há exigência de repetir C15 | Smoke autenticado do pacote publicado deve cobrir autorização Staff afetada, sem novo vínculo |
| Revogação | Política explicitamente aceita; teste de acesso negado e transação preservado | Novo checkoutSTRONG pode reativar, conforme decisão |

Reconciliação: planejador offline pronto, nenhuma aplicação aprovada. Hash/evidenceRef não prova autenticidade; exigir inventário autorizado somente leitura, verificação independente das evidências, pares canônicos/aliases, cobertura por loja/multiloja, manifesto aprovado, executor transacional auditável e autorização explícita para escrita. Executor apply ainda não implementado. Não reabrir disposição C14 nem presumir que seus14remanescentes sejam todos os vínculos novos. Dados sem prova continuam preservados e sem acesso automático. Sem inventário não é possível afirmar se toda a reconciliação é necessária no DEV ou quantos clientes seriam afetados.

Disponibilidade: otimização restringe perfis lidos, mas aliases/pedidos ainda contam no orçamento. 503 não resolvido. Abuso de volume é hipótese plausível não validada, não achado novo confirmado; ausência de PoC não elimina risco. Medição local não prova escala cloud. Proporção de dados reais e índices não foi consultada.

## Novo scan formal: NÃO obrigatório pelo procedimento consultado

O procedimento exige revisão completa inicial, resolução de achados, reteste/revisão e reconciliação do publicado. Scan inicial mais revisão dos deltas/correções fornece a trilha de segurança sem reescrever cobertura histórica. Não foi encontrada exigência de novo Changes para oHEAD corrigido; não inventar esse gate. Uma exigência adicional do proprietário/política pode mudar esta decisão. Nenhum scan foi iniciado. Isto não concede C16 porque os gates de publicação/homologação acima permanecem.

## Próxima ação objetiva

Preparar janela DEV do candidato revisado: inventário somente leitura especificamente autorizado dos vínculos/cobertura, identificar se há legado legítimo que ficaria oculto, proposta de reconciliação com provas e autorização de aplicação quando necessária. Então reconciliar pacote DEV versionado/publicado e homologar somente os fluxos afetados com sessão Staff legítima, preservando C15. Registrar evidência de versão/índices, resultados e aceite consolidado. Nesta missão push/deploy e dados reais estão proibidos, portanto nenhum desses passos remotos foi executado. Configuração/integração PROD, Fase13 e autorização do proprietário permanecem posteriores.

Fase10 93,75%;global97%;Fase13 0%;PRODREADY NÃO. Sem código alterado, scan, push, deploy, dados reais, pagamentos ou SMS. Este registro é documental e não promove candidato.
