# Histórico e rastreabilidade — Fase 5

Implementação local DEV, sem publicação ou envio real. O histórico amplia o ledger existente; não cria outra fila nem altera a compra.

## Dados registrados

Cada job em `integrations/whatsapp/jobs/{jobId}` possui a subcoleção `history`. As regras existentes negam acesso direto de todos os clientes à árvore integrations; somente backend/Admin com IAM apropriado pode consultar. Não houve alteração de rules nesta fase.

Eventos usam IDs determinísticos `tipo-numeroDaTentativa` e são gravados na mesma transação da transição correspondente do job. Retry de transação não duplica entradas. Os controles de estado/proprietário impedem repetir transições concluídas. O helper deve sempre ser chamado por código servidor confiável, dentro desses controles, nunca diretamente por um endpoint que aceite campos arbitrários do navegador.

| Evento | Significado |
| --- | --- |
| created-0 | Job admitido, pendente ou encerrado por falha de preparação/consentimento. |
| attempt_started-N | Tentativa N reservada com sucesso, antes de chamar o serviço. Não prova POST ou entrega. |
| attempt_finished-N | Resultado observado da tentativa: status, código, HTTP/Meta e ID Meta quando disponíveis. Indica também retryScheduled/nextRetryAt. |
| stopped-N | Encerramento sem nova chamada por configuração, quota, elegibilidade ou esgotamento. N continua sendo a quantidade de tentativas já iniciadas. |
| lease_expired-N | Propriedade venceu sem resultado persistido; o envio passa a indeterminado e não é repetido. |
| late_result-N | Resposta observada depois da recuperação por prazo vencido; guarda inclusive ID Meta, sem alterar/reabrir job indeterminado. |

Cada evento registra schemaVersion, loja/pedido, type=order_confirmation, mode, operatorId, destinatário mascarado, templateVersion, deliveryMode, número da tentativa, horário de servidor em milissegundos UTC e outcome sanitizado. Início e fim separados permitem reconstruir duração e identificar tentativa sem resultado. Para desempate de horários iguais, usar número da tentativa e tipo; não depender da ordem lexical dos IDs.

O job mantém attemptCount e lastResult existentes e agora conserva recipientMasked/templateVersion mesmo após limpar prepared. Resultado de transporte e encerramento são conceitos distintos: lastResult representa a última resposta conhecida, enquanto status/code do job refletem sua situação atual; consultar eventos stopped/lease_expired para entender diferenças.

## Automático versus manual

O worker atual grava mode=automatic e operatorId=null. Não atribui ao cliente ou a um funcionário fictício a autoria de uma automação.

O contrato `buildHistoryEvent`/`recordHistory` também aceita mode=manual, exigindo operatorId. A Fase 7 deverá fornecer esse UID a partir do funcionário autenticado/autorizado no servidor e uma nova chave de solicitação manual. O contrato foi testado com operador e resultado/ID Meta; ele não autentica usuários e não é um endpoint público.

O botão wa.me existente continua funcionando e ainda não chama essa infraestrutura de auditoria. Portanto, esta entrega NÃO registra envios manuais feitos por esse botão nem comprova seu resultado. A integração do reenvio autenticado e sua interface permanece na Fase 7, conforme o plano. Não criar eventos manuais retrospectivos nem presumir envio concluído pela abertura de wa.me.

## Privacidade e segurança

- Destinatário representado somente por `***` e os quatro últimos dígitos no histórico. O telefone completo existe no snapshot temporário privado para o transporte e no pedido original, não é duplicado nos eventos.
- Histórico não contém preview, parâmetros, endereço, nome do cliente, token, cabeçalhos, mensagem de exceção ou corpo bruto da Meta.
- Resultado usa whitelist de status/códigos internos. Textos arbitrários são substituídos por unexpected_result; somente HTTP/código Meta numéricos válidos e ID wamid no formato esperado são preservados.
- operatorId manual é identificador pessoal interno necessário à auditoria; não armazenar email, nome completo ou outros dados do operador nesses eventos.
- Logs continuam limitados a jobId/status/code. Conteúdo do histórico não é enviado ao log por padrão.

Não há exclusão automática nesta fase. Eventos são limitados por job pelas quatro tentativas e transições da fila. Política de retenção/expurgo deve ser validada antes de produção, incluindo operador e IDs Meta. Nunca apagar a chave/tombstone de deduplicação ao expurgar detalhes. Não foi inventado um prazo de retenção com base jurídica presumida.

## Investigação operacional

1. Obter loja e ID do pedido. Calcular a chave com jobIdFor em whatsapp-worker.js, a mesma da Fase 4, ou localizar o job por storeId/orderId em ferramenta administrativa autorizada.
2. Consultar job para status/code, attemptCount e lastResult. Dados pessoais do pedido ficam no próprio pedido.
3. Consultar sua subcoleção history e ordenar por recordedAt/attempt/tipo. Uma primeira falha 429 seguida de nova tentativa e accepted fica preservada, em vez de ser sobrescrita pelo sucesso final.
4. attempt_started sem attempt_finished pode indicar execução interrompida; lease_expired explica a decisão de não repetir. late_result com wamid pode ajudar a futura reconciliação por webhook. Nenhum desses registros autoriza reenvio automático de um resultado incerto.
5. Ausência de job pode significar integração desligada, evento antigo, destinatário fora da lista ou limite de admissão. Os descartes antes da admissão não geram histórico por pedido nesta fase; não inferir sucesso/falha de entrega da ausência de registro.

Não existe interface/callable de consulta ao histórico nesta fase. A Fase 7 implementará a leitura administrativa com autorização por loja e projeção dos campos permitidos. Não expor diretamente a árvore integrations ao navegador.

## Consistência, compatibilidade e rollback

Falha ao gravar histórico do início aborta o claim antes do transporte. Falha na transação de resultado não grava parcialmente sucesso no job ou no histórico; conserva attempt_started e a recuperação registra lease_expired, sem novo envio. O pedido original continua intacto.

Jobs legados da Fase 4 ainda podem avançar: os campos novos são opcionais para a leitura; a máscara e versão são recuperadas do snapshot quando disponível. Não há backfill de tentativas antigas inexistentes, nem reinício de jobs terminais para fabricar histórico. Quando o payload legado já foi removido, a máscara pode permanecer null.

Rollback de código não requer migration ou apagar dados. Voltar ao worker anterior apenas para de criar eventos novos; manter jobs/tombstones e histórico existente. Nenhuma operação remota foi realizada.

## Testes

Testes puros verificam sanitização, máscara, modo automático/manual, operador obrigatório, resultado/ID Meta e informações do retry. Testes com transações atômicas simuladas verificam registro de cada tentativa, concorrência/reentrega sem duplicação, falha de commit, resposta tardia, encerramento sem chamada e compatibilidade com jobs legados. O double de consulta foi ajustado para retornar apenas documentos diretos da coleção, como Firestore, sem contar documentos de history como jobs.

Executar `npm run test:whatsapp` em functions. Não há teste real Meta, emulador ou consulta remota nessa suíte. A homologação das regras efetivamente publicadas e a auditoria de retenção continuam pendentes.
