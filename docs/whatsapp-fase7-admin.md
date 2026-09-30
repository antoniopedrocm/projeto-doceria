# WhatsApp — administração e reenvio (Fase 7)

Implementado localmente no workspace DEV `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, reservado a `crmdoceria-9959e`. Não houve publicação, alteração de configuração remota ou envio real.

## Uso no CRM

Os detalhes de pedido mostram status simples do WhatsApp, último modo/data/destinatário mascarado e ações para atualizar, consultar histórico ou solicitar novo envio pela API. A consulta é feita ao abrir o pedido e ao clicar em Atualizar; não há polling em listas de pedidos. Histórico é carregado sob demanda, até 20 eventos por job, com o envio automático e até 20 solicitações manuais.

Aceitação pela API, envio, entrega, leitura, simulação e resultado indeterminado são diferenciados. Ausência de registro não comprova falha. Uma solicitação aceita pelo callable é exibida como solicitada, não como entregue. O operador pode atualizar para acompanhar processamento/webhooks.

O botão de reenvio exige confirmação explícita de que outra mensagem pode ser recebida. Solicitações em andamento desabilitam novo clique. UUID por intenção é preservado no sessionStorage, com chave por usuário/loja/pedido, para reutilização após erro de rede ou remount. Após confirmação do servidor, a intenção é encerrada; um reenvio deliberado posterior recebe outro UUID. Se o armazenamento de sessão/gerador seguro estiver indisponível, a ação falha antes de enviar.

O botão existente de wa.me nos detalhes de Pedidos permanece, identificado como **Abrir resumo no WhatsApp**. Ele apenas abre o aplicativo; não representa envio confirmado pela API e não é registrado como tal. O novo componente também está no modal secundário de detalhes. Esse modal já tinha handlers vazios de impressão/abertura WhatsApp; esse problema anterior não foi ampliado para uma refatoração nesta fase.

## Backend e autorização

Callables `getWhatsAppOrderStatus` e `requestWhatsAppOrderResend`, região `southamerica-east1`. O componente usa explicitamente essa região sem mudar a instância padrão das Functions do restante do CRM. Frontend e backend bloqueiam a funcionalidade fora de DEV; a barreira efetiva está no backend.

Exigem Firebase Auth, conta não desabilitada, perfil ativo em users e política já utilizada pelo módulo de pedidos (`profileCanReceiveOrder`), incluindo vínculo com loja e restrições explícitas em customProfiles. Papel/permissões/operador enviados pelo cliente não são aceitos. O pedido precisa existir no caminho da loja e possuir lojaId correspondente. Não há regra nova de leitura direta de integrations.

Consulta retorna projeção escolhida de campos: resultado sanitizado, horários, número de tentativas, modo, UID do operador, destinatário mascarado e histórico reduzido. Não retorna texto da mensagem, telefone completo, secrets, owner, configuração do provedor ou correlações internas. O histórico do backend continua sendo a fonte completa; a UI apresenta a janela limitada.

## Reenvio e configuração

Além de `enabled: true` e da configuração existente, é necessário `manualEnabled: true` no documento privado `integrations/whatsapp/stores/{storeId}`. Ausente/false significa desligado. Não alterar automaticEnabled para habilitar manual: são controles independentes. Nenhuma chave foi ativada por esta implementação.

O callable valida referências/UUID/confirmação, lê o pedido persistido e usa o preparador/template existentes. Não aceita conteúdo, destinatário ou consentimento do navegador. Pedido sem consentimento válido/telefone válido/resumo compatível é recusado. Pedido cancelado não recebe confirmação; o manual pode usar pedido finalizado, diferentemente da seleção automática de pedidos novos. Não há backfill de consentimento de pedidos antigos; a alternativa existente de abertura do aplicativo é preservada.

Job manual usa a mesma coleção/fila, worker, cliente e webhook. ID deriva de loja/pedido/operador/UUID e não interfere no tombstone automático. Histórico grava modo manual e operador da autenticação. A transação impede duplicação da intenção e mais de uma solicitação manual pendente por pedido, com intervalo mínimo de 60 segundos e limite DEV de 20 solicitações por pedido. Índice privado manualOrders limita custo da consulta.

Worker revalida perfil/permissões/conta, configuração, consentimento e telefone antes de chamar o serviço. Cloud mantém allowlist, limite total compartilhado de 20 tentativas por loja/dia UTC e quota separada de até quatro tentativas manuais por destinatário/dia UTC. A quota manual não utiliza o jobId automático como bloqueio. Quotas não são estornadas. Cada solicitação manual faz no máximo uma tentativa de transporte; falha temporária não gera retry automático. A solicitação explícita de novo reenvio continua possível após resultado terminal, respeitando limites.

Unknown continua significando resultado indeterminado. Reenviar conscientemente pode resultar em outra mensagem se a primeira já tiver chegado; o aviso de confirmação não transforma esse risco em garantia de exactly-once. Pendência automática também não é apagada pelo manual.

## Homologação seguinte

Testes locais usam doubles de Auth/Firestore/Meta e DOM simulado. Homologar na Fase 8 as Functions, permissões efetivas, dados de perfis reais, fluxo visual autenticado, região, sessão móvel/navegador, job/eventos, recibos e falhas externas. Não confundir testes locais com DEV publicado/homologado.

Manter os requisitos de template/credenciais/conta e os limites de correlação do webhook registrados na Fase 6. Nenhuma migração, TTL, expurgo ou mudança de rules nesta fase. Rever retenção dos índices e tombstones antes da produção. Próxima etapa: Fase 8, testes e homologação DEV, com parada prevista aos 90% antes da auditoria.
