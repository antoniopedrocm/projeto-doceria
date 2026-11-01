# Revisão manual de legado — procedimento operacional DEV

Responsável pela decisão de vínculo: Dono do projeto. Responsável técnico: executor identificado na proposta/aplicação. Caso: `MANUAL_REVIEW_REQUIRED`. Conhecer telefone/e-mail, similaridade de nome ou geocoding não comprova identidade. Nenhuma etapa deste procedimento permite primeiro match, criação de UID falso ou cópia de pedidos.

## Abrir e classificar

1. Registrar um caseId pseudônimo, motivo e escopo (Customer, identity/UID, endereço ou pedido), sem PII em Git/Hosting. Guardar evidência original em pacote privado local com controle de acesso.
2. Reexecutar inventário somente leitura e dry-run com projeto DEV explícito, workspace/branch verificados e timestamps/updateTime de todas as fontes. Proposta antiga com fonte alterada deve ser regenerada.
3. Identificar separadamente: telefone inválido/ausente; telefone compartilhado/reciclado; duplicação já revisada; owner distinto; referência sem Customer; endereço órfão; pedido root sem loja. Não confundir conta anônima Firebase com Customer a recuperar.
4. Consultar somente as referências necessárias. Não solicitar cartão, CVV, OTP, credencial, documento completo ou comprovante contendo dados privados por chat. Não fazer lookup de provider/telefone como substituto da prova exigida para ownership.

## Decidir sem conceder acesso indevido

| Situação | Ação segura imediata | Condição para recuperar/vincular |
|---|---|---|
| Sem telefone / inválido | Preservar registro; fora da recuperação por telefone | Prova do owner existente ou revisão documental aprovada; correção por fluxo próprio |
| Outro owner / vários UIDs não revisados | Manter negado e sem claim automático | Decisão explícita do Dono sobre cada UID e acesso ao histórico, com prova adequada |
| Vários UIDs já revisados de C02 | Preservar mappings aprovados | Não reabrir nem reaplicar por contagem bruta de duplicados |
| Endereço global órfão | Preservar privado e sem atribuição | Proveniência/ownership comprovados; não associar por nome, proximidade ou CEP |
| Pedido somente por telefone / Customer ausente | Preservar no CRM; excluir de histórico privado Customer | Referência de ownership comprovada, aprovada e auditada; telefone isolado não basta |
| Pedido root sem loja | Histórico revisado pode aparecer sem loja determinada | Não atribuir Matriz; recompra fica indisponível enquanto a loja não estiver comprovada |
| UID anônimo sem Customer | Nenhuma criação ou migração automática | Identidade forte ou fluxo de negócio explícito; não promover Auth por telefone |

O estado conservador acima pode continuar enquanto faltar prova. Documentar se a disposição é definitiva aprovada ou apenas pendente; “preservado em quarentena” não significa dado recuperado nem autorização de ownership.

## Proposta e aprovação exatas

Montar pacote privado com fontes/updateTime, canonicalCustomerId pretendido, aliases, UIDs mantidos/removidos, endereços/IDs/apelidos/defaults, referências de pedidos, exclusões deliberadas, conflitos, justificativa e impacto de acesso. Calcular digest da proposta completa. O Dono aprova **esse digest** e confirma explicitamente todos os UIDs revisados; uma autorização genérica de manutenção não serve como aprovação de merge.

Se não houver prova, registrar rejeição/manutenção de bloqueio com motivo. Não adivinhar telefone ou fundir por e-mail. Alteração material ou fonte nova invalida a aprovação anterior.

## Aplicação e auditoria

Reutilizar `scripts/customer-phone-migrate.cjs`: `--dry-run` primeiro; somente depois, no escopo exato aprovado, `--apply-reviewed` com proposal-file/approval-file e guarded runtime previamente verificado. O executor não fabrica approval-file. Ferramenta exige DEV/branch, digest, updateTime/preconditions, migrationId e marker; gera backup privado tipado antes do commit atômico. Não escreve Auth users, pedidos, pagamentos ou notas.

Registrar caseId/digest, aprovador, executor, migrationId, before/after ou referência ao backup privado, fontes e horário. Preservar eventos/mappings originais. Reexecutar o mesmo migrationId deve devolver ALREADY_APPLIED/zero writes. Não fazer hard delete de registros antigos para melhorar indicadores.

## Rollback e encerramento

Testar primeiro em emulador. Rollback usa o backup tipado e afterUpdateTime de cada destino: se houve edição posterior, aborta sem sobrescrever. Nunca executar rollback remoto por simples teste de aceite. Após aplicação aprovada: validar canônico/aliases, endereço padrão/apelidos, histórico sem cópia, isolamento A/B e todos os UIDs autorizados; revisar métricas/cupons sem somar contadores cegamente.

Encerrar caso com `RECOVERED_WITH_APPROVED_MAPPING`, `REJECTED_NO_PROOF` ou `PRESERVED_UNASSIGNED_APPROVED`. Manter pendente quando a disposição ainda não foi aprovada. Os 14 remanescentes da fotografia de 01/11 estão classificados conservadoramente em `evidence/phase10-current-inventory-dev.json`; não receberam novo vínculo, correção de telefone ou aprovação de disposição definitiva nesta execução.

## Evidência

Dry-run atual: `customer-phone-3e21d91aacf839d4`, 0 Customer/order/identity writes. Uma duplicação bruta corresponde aos aliases já revisados de C02; não é novo conflito a resolver automaticamente. A aprovação C02 anterior e os testes do driver exercem proposta/digest, source-changed, owner distinto, CAS, backup, rollback e retry. A aferição atual dos testes e o aceite E2E de SMS/Google/e-mail ficam no checkpoint; não substituir SMS real por fornecedor mockado na homologação.
