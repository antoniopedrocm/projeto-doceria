# Webhook WhatsApp — Fase 6 (DEV)

Implementação local. Nenhum endpoint foi publicado ou configurado na Meta.
Projeto permitido pelo runtime: `crmdoceria-9959e`. Workspace: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`.

## Contrato e configuração futura

Function HTTP `whatsappWebhook`, região `southamerica-east1`, caminho `/{storeId}`. URL após publicação: `https://southamerica-east1-crmdoceria-9959e.cloudfunctions.net/whatsappWebhook/{storeId}`. Cada loja precisa de callback compatível com a configuração de assinatura da sua conta/app Meta; não presumir que um callback global atende várias lojas. Confirmar assinatura/override por número na homologação.

Documento privado `integrations/whatsapp/stores/{storeId}` deve ter `webhookEnabled: true`, `wabaId` e `phoneNumberId` (strings numéricas). Recepção independe de `enabled`/`automaticEnabled`: desligar novos envios não deve impedir recibos pendentes. `webhookEnabled` ausente/false bloqueia o endpoint.

Secrets no Secret Manager DEV, nunca no frontend/Firestore/checkpoint:

- `whatsapp-dev-{storeId}-verify-token`: token aleatório da verificação de inscrição.
- `whatsapp-dev-{storeId}-app-secret`: App Secret da aplicação Meta que assina o webhook, diferente do access token.

Leitura da versão latest a cada requisição, com prazo de cinco segundos e sem retry do SDK. Conceder ao runtime somente acesso necessário aos secrets específicos quando for homologar. Não foram criados secrets, permissões ou recursos remotos.

GET exige `hub.mode=subscribe`, verify token correto e challenge numérico, retornando somente o challenge em texto. POST verifica HMAC SHA-256 do `rawBody` com comparação constante, antes de interpretar JSON. Limite de 256 KiB, 20 entradas, 20 alterações por entrada e 100 status no lote. Assinatura inválida: 401; corpo inválido: 400/413; configuração desativada: 403; falha de secret/banco: 503. Sucesso: 200 EVENT_RECEIVED. Não enviar o corpo, assinatura, query ou erros brutos aos logs da aplicação; revisar também logging de infraestrutura na homologação.

Referências primárias para validação e estrutura: [SDK hospedado pela Meta — validação do webhook](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/), [coleção oficial Meta — status](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object). A página atual de referência de messages da Meta não pôde ser carregada nesta sessão. Validar `biz_opaque_callback_data` e os payloads reais da versão configurada na Fase 8; os testes desta fase usam fixtures locais.

## Correlação e estados

O claim cloud grava `integrations/whatsapp/correlations/{uuid}` atomicamente antes do POST. Guarda job, tentativa, loja, remetente e hash do destinatário, sem nome, telefone em claro ou texto. O serviço envia esse UUID em `biz_opaque_callback_data`. Ao aceitar a resposta HTTP, o worker cria também `integrations/whatsapp/messages/{sha256(wamid)}` para localizar recibos sem callback opaco.

Webhook exige correspondência de WABA/remetente configurados, loja, tentativa atual, hash do destinatário e ID Meta conhecido quando disponível. Vincula o primeiro ID válido à correlação. Nada é correlacionado apenas pelos últimos quatro dígitos. Eventos sem vínculo seguro são contabilizados como unmatched e ignorados com 200. Não fazem backfill ou reiniciam jobs antigos.

Status de transporte são independentes do status comercial do pedido:

- `accepted`: API aceitou; não comprova envio/entrega.
- `sent`: recibo de envio.
- `failed`: falha do provedor; supera sent, mas não comprova ausência de entrega quando há recibo delivered/read.
- `delivered`: entrega confirmada; supera failed/sent.
- `read`: leitura confirmada; estado de maior precedência.

Cada mensagem/status tem um evento determinístico em history, mesmo que receba novo timestamp. Eventos fora de ordem são preservados com `applied: false`; não rebaixam o estado. Guarda horário do provedor separado do horário do servidor e somente código numérico de erro, quando presente. Mensagens recebidas de clientes são ignoradas e não são armazenadas/respondidas.

Atualização do job, índice, correlação e histórico ocorre na mesma transação. Recibo válido encerra o agendamento e limpa payload/owner. Pode reconciliar unknown de timeout/lease quando há correlação. Se chegar durante o POST, a resposta posterior do worker fica como late_result sem sobrescrever a entrega nem agendar retry. Duplicações concorrentes e reentrega após commit falho são seguras. Não há chamada de envio no webhook.

## Limites e próxima etapa

Recibo sem callback opaco recebido antes de existir índice do ID Meta é unmatched; não inferir falha ou entrega. Esse caso, respostas indeterminadas sem callback, payloads legados e eventos de tentativa anterior exigem investigação manual; não existe inbox adicional nem reconciliação por heurística. A integração nova deve ser homologada com callback opaco inclusive em falhas. Falta de read não prova que o cliente não leu.

Sem expurgo/TTL automático de correlações, índices, jobs e histórico; definir retenção na auditoria sem perder deduplicação. Estrutura continua na árvore integrations negada ao cliente. Fase 7 deve consultar uma projeção autorizada por loja, incluindo delivery/status e histórico sanitizado, e implementar ação manual autenticada com operador. Não abrir regras genéricas de integrations.

A integração HTTP/Firestore/Secret Manager e a configuração de inscrição real ainda dependem da Fase 8. Não substituir essa homologação pelos doubles transacionais. Sem migração, alterações comerciais do pedido, novos envios, frontend, produção ou ativação cloud nesta fase.
