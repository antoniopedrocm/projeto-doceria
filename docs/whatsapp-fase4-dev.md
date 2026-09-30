# Envio automático em DEV — Fase 4

Implementado localmente. Não houve deploy, ativação remota ou envio real. O código continua bloqueando projetos diferentes de `crmdoceria-9959e`.

## Fluxo

1. O checkout conclui sua transação existente e responde normalmente. Esta fase não altera sua rota nem adiciona dependência de WhatsApp à compra.
2. `enqueueWhatsAppConfirmation` recebe a criação já persistida em `lojas/{lojaId}/pedidos/{pedidoId}`. Usa o snapshot daquele evento para preparar e congelar a mensagem, não a versão mais recente do pedido.
3. Uma transação cria uma única entrada em `integrations/whatsapp/jobs/{sha256}`. A chave representa loja/pedido/confirmação/automático, independentemente do ID da entrega do evento.
4. `processWhatsAppConfirmation`, acionada pela criação do job, disputa a execução por transação e só depois de obter propriedade chama o serviço Meta/mock.
5. `recoverWhatsAppConfirmations` procura até 50 jobs vencidos a cada minuto. Recupera jobs cujo evento de criação não foi processado, retries seguros e tentativas interrompidas. Sobreposição de execuções usa a mesma disputa transacional.

As funções são exportadas em index.js. Ainda precisam de um deploy DEV explicitamente controlado e das configurações abaixo para executar remotamente. Não há tarefa local em background ou endpoint público de envio. A publicação criará Scheduler/Eventarc e terá custos de infraestrutura; nada disso foi provisionado nesta fase.

## Configuração e elegibilidade

Documento privado já previsto: `integrations/whatsapp/stores/{lojaId}`. Além da configuração da Fase 1, são obrigatórios:

| Campo | Regra |
| --- | --- |
| automaticEnabled | Deve ser o booleano true; ausência/false desliga automação. |
| automaticSince | Inteiro em milissegundos UTC, marcando o início explícito dos testes; eventos anteriores são ignorados. |
| enabled / mode | Integração habilitada em mock ou cloud. Começar em mock. |
| templateName / templateLanguage | confirmacao_pedido_v1 / pt_BR, conforme Fase 3. |
| allowedRecipients | Em cloud, somente números de teste consentidos e controlados pela equipe. Nunca usar lista de clientes nesta etapa DEV. |

Eventos precisam ter no máximo uma hora, loja consistente, status inicial Pendente e origem Plataforma ou Cardapio Online. Usa-se o horário do evento Firestore, não um createdAt arbitrário do cliente. Consentimento e telefone válidos continuam obrigatórios.

Antes de cada tentativa, a fila relê configuração e pedido. Cancelamento, mudança de telefone, revogação/inconsistência do consentimento ou status fora de Pendente/Em Preparo interrompem o envio. O conteúdo permanece o primeiro snapshot. A conferência do pedido ocorre antes do transporte; uma alteração após essa conferência não cancela um POST já iniciado.

Modo e phoneNumberId são vinculados ao job. Trocar mock para cloud ou mudar remetente não converte jobs antigos em envios reais. O serviço também verifica configuração/mode/remetente depois do claim. Nome/idioma do template continuam sujeitos ao contrato da Fase 3. Desligar integração/automação impede novas tentativas após releitura; chamadas já em curso podem terminar.

## Limites de segurança DEV

- Máximo de 100 novos jobs admitidos por loja/dia UTC, incluindo preparações que terminam sem envio.
- Máximo de 20 tentativas cloud por loja/dia UTC. Reserva é feita antes da chamada e não é estornada em falha, por segurança.
- Um único job automático por destinatário/dia UTC, compartilhado entre lojas; até quatro tentativas desse job. Assim, criar pedidos com IDs diferentes não permite várias confirmações de teste para o mesmo número no mesmo dia.
- Lista de destinatários cloud de 1 a 20 números, herdada da Fase 1. Números fora dela não entram na fila cloud.
- Até quatro tentativas por job, com janela máxima de uma hora. Mock também tem limite de admissão e tentativas.

Esses limites são específicos de testes DEV. O endpoint de checkout continua público e origem/consentimento informados pelo cliente não são prova de identidade. As proteções privadas restringem alcance e custo de mensagens de teste; não equivalem a proteção completa contra abuso do checkout, criação de pedidos fraudulentos ou validação comercial de preços. Antes de produção, é necessário resolver esse risco conforme a auditoria/plano de produção. O bloqueio de projeto e lista de teste não devem ser removidos nesta fase.

O sistema NÃO passou a deduplicar a criação de pedidos: duas submissões do checkout ainda podem criar dois pedidos diferentes. A fila deduplica o evento do mesmo pedido; a quota adicional DEV impede envio para o mesmo destinatário em jobs distintos no dia. Não usar essa quota como substituto de uma futura idempotência de checkout. O botão manual atual wa.me permanece independente dessas chaves e quotas.

## Estados e retry

queued → processing → accepted / simulated / failed / skipped / unknown, ou retry → processing.

O claim tem proprietário UUID e prazo de três minutos, acima do timeout de 120 segundos da Function de processamento e dos prazos normais do serviço. Uma propriedade vencida vira unknown e nunca é retomada para outro POST. Se a execução antiga terminar depois disso, não sobrescreve o estado de recuperação.

Retries automáticos são permitidos somente para rate_limited (HTTP 429 reconhecido), credential_unavailable e configuration_unavailable. O intervalo começa em 60 segundos, dobra a cada tentativa e respeita Retry-After se maior, dentro da janela de uma hora. Exceder janela/limite encerra o job. Uma resposta 4xx permanente não é repetida.

Timeout, rede, HTTP 408/5xx ambíguo, exceção inesperada de transporte e falha ao gravar resultado após possível aceitação não geram reenvio cego. Após falha no commit do resultado, o job permanece processing até a recuperação indeterminada. Isso prioriza evitar duplicação e pode deixar uma mensagem não enviada ou entregue sem confirmação local. Não há garantia exactly-once entre Firestore e Meta. A reconciliação por webhook pertence à Fase 6, e o reenvio manual autenticado à Fase 7.

Falha ao enfileirar pode ser repetida pelo evento Firebase dentro da janela, sem afetar pedido já gravado. Configuração desabilitada/inválida e limites de admissão não fazem backfill posterior. Para testar depois de uma ativação, criar novo pedido de teste.

## Persistência e privacidade

Jobs e quotas estão sob integrations, já negado a clientes pelas regras atuais inclusive no match genérico. Não foi necessária migration, índice composto novo ou mudança de rules. A recuperação consulta apenas nextRunAt (índice simples). Validar regras e índice efetivamente publicados na homologação.

Jobs contêm referência do pedido, modo automático, estado, tentativa, horários, proprietário e resultado sanitizado/ID Meta quando disponível. O payload mínimo necessário ao retry inclui destinatário e parâmetros; não duplica preview. Ao atingir estado terminal, prepared é limpo, mantendo a chave de deduplicação. Logs contêm apenas jobId, status e código, nunca texto, telefone ou raw error. Quotas de destinatário usam hash e acesso privado; hash não deve ser tratado como anonimização irreversível.

Não configurar TTL dos jobs que apague a chave de deduplicação. Jobs terminais usam nextRunAt = Number.MAX_SAFE_INTEGER para ficar fora da consulta de vencidos. Retenção/tombstones, expurgo de quotas antigas e histórico detalhado deverão ser definidos nas fases de rastreabilidade/auditoria. Não há painel administrativo novo nesta fase.

## Verificação e operação

Testes locais executam transações atômicas simuladas com commits encenados e falhas injetadas, concorrência de eventos/consumidores, API simulada e o cliente HTTP real contra fetch simulado. Não são testes de um Firestore real nem prova de deploy homologado.

`npm run test:whatsapp` em functions inclui worker e fases anteriores. Na Fase 8, validar emuladores, rules efetivas, redelivery/recovery, IAM e Scheduler em DEV. Credenciais e template aprovado são necessários para envio real; não os compartilhar no chat ou repositório.

Rollback operacional futuro: desabilitar automaticEnabled/ enabled, aguardar chamadas em andamento e pausar/remover as três Functions/Scheduler somente com plano de deploy. Manter jobs/tombstones para não perder deduplicação. Pedidos não devem ser apagados, cancelados ou revertidos. A preparação para produção exige autorização própria; esta fase não a concede.

Referências oficiais consultadas: https://firebase.google.com/docs/functions/firestore-events e https://firebase.google.com/docs/functions/schedule-functions . Eventos podem ser entregues mais de uma vez e schedules podem sobrepor execuções, por isso a correção depende da transação e da chave durável, não de maxInstances.
