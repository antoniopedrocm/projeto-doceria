# Fundação WhatsApp em DEV — Fase 1

Implementação backend local, ainda sem ligação ao checkout, triggers, callable ou endpoint público. Nenhum recurso remoto foi criado e nenhuma mensagem foi enviada. Não existe autorização de produção nesta entrega.

## Componentes

- `functions/whatsapp.js`: factory `createWhatsAppService({db})`, usando Firestore Admin já inicializado pelo backend; lê configuração privada e Secret Manager sob demanda.
- `functions/whatsapp-config.js`: validação e restrição explícita ao projeto `crmdoceria-9959e`.
- `functions/whatsapp-client.js`: um POST para o host fixo `https://graph.facebook.com`, sem redirects ou retries internos; parâmetros de template de corpo textual.
- `functions/whatsapp.test.js`: testes offline com HTTP, Firestore e Secret Manager simulados. As credenciais de teste são strings sintéticas sem validade.

O serviço não é importado pelo `index.js` nesta fase. A ligação com o fluxo de pedidos ocorrerá na Fase 4, após telefone/consentimento e construção do resumo persistido. Não chamar este serviço dentro de uma transação de compra.

## Configuração privada por loja

Documento proposto: `integrations/whatsapp/stores/{lojaId}`. As regras existentes negam leitura e escrita de clientes em todo o caminho `integrations`; acesso somente pelo backend Admin/IAM. Não guardar esse documento em configurações públicas do cardápio. IDs de loja aceitam letras, números, hífen e underscore, até 100 caracteres, sem conversões que possam colidir entre lojas.

Documento ausente ou `enabled: false` desabilita o serviço. Para simulação, o formato é:

```json
{
  "enabled": true,
  "mode": "mock",
  "templateName": "confirmacao_teste",
  "templateLanguage": "pt_BR",
  "timeoutMs": 10000
}
```

Esse exemplo não cadastra nem aprova um template. O mock apenas valida a entrada e retorna `simulated`; não lê token, chama rede ou inventa ID Meta.

Para futuro teste real controlado em DEV, o modo `cloud` exige também:

| Campo | Valor necessário |
| --- | --- |
| `apiVersion` | Versão Graph API explicitamente escolhida e suportada pelo app Meta, no formato `vNN.0`; sem fallback implícito. |
| `phoneNumberId` | ID numérico do remetente DEV no painel Meta, como string. Não é o telefone do cliente. |
| `allowedRecipients` | Lista de 1 a 20 telefones de teste, dígitos internacionais incluindo país. Ausente/vazia bloqueia envio. |
| `templateName`, `templateLanguage` | Nome e idioma exatos do template aprovado para o teste. |
| `timeoutMs` | Inteiro entre 1000 e 30000; padrão 10000. Vale para requisição e leitura da resposta. |

Configuração inválida não permite envio. Campos de URL/token/secret fornecidos no documento não são usados: o host e o recurso do token são fixados pelo código. WABA e segredos de webhook serão tratados quando seus recursos forem implementados; não são necessários ao POST de template desta fundação.

## Credenciais e isolamento

O token fica exclusivamente no Google Secret Manager do projeto DEV:

`projects/crmdoceria-9959e/secrets/whatsapp-dev-{lojaId}-access-token/versions/latest`

Antes do primeiro teste real, um administrador deve provisionar o segredo por canal seguro e conceder `roles/secretmanager.secretAccessor` à identidade de execução somente nesse segredo. O token precisa das permissões Meta aplicáveis ao envio (`whatsapp_business_messaging`) e acesso ao número DEV. Não usar token de produção.

Não enviar token pelo chat, colocá-lo em variável `REACT_APP_*`, documento Firestore, arquivo versionado ou comando com valor literal. A aplicação usa ADC/identidade de execução; não exige arquivo de chave de conta de serviço no repositório.

A identidade de projeto vem de `GCLOUD_PROJECT`, `GCP_PROJECT` e/ou `FIREBASE_CONFIG` do runtime servidor. Ausência, divergência ou projeto diferente de `crmdoceria-9959e` bloqueiam antes de consultar configuração/secret. Os pontos de injeção da factory são exclusivamente para código servidor confiável/testes, nunca parâmetros recebidos do navegador. Não alterar variáveis de runtime para fazer uma execução de produção se passar por DEV.

O Secret Manager é carregado apenas em modo cloud, com prazo e sem retry automático nessa leitura. Configuração e versão latest são lidas a cada chamada; o token não é mantido em cache pelo serviço nem retornado. Rotação: criar nova versão no Secret Manager; novas chamadas usam a nova versão. Desabilitação: `enabled: false` impede chamadas posteriores à releitura; uma chamada já em andamento pode terminar.

## Contrato da tentativa

`sendTemplate({storeId, recipient, bodyParameters})` retorna um resultado sanitizado. Só aceita telefone já em formato internacional de transporte, sem `+`; normalização brasileira e consentimento são Fase 2. Os parâmetros textuais são posicionais, não vazios, até 1024 caracteres cada, máximo 30, sem quebras de linha/tabulação/controles. Essas são guardas locais iniciais, não promessa de compatibilidade de qualquer template; a Fase 3 validará limites e conteúdo do template definitivo.

| Resultado | Significado / tratamento futuro |
| --- | --- |
| `skipped / disabled` | Integração desligada. |
| `simulated / mock_only` | Simulação offline; não houve envio. |
| `accepted / meta_accepted` | Meta retornou ID `wamid`; não comprova envio ou entrega ao aparelho. |
| `failed / provider_rejected` | Resposta Meta 4xx reconhecida; corrigir causa, sem retry automático genérico. |
| `failed / rate_limited` | HTTP 429 com código Meta; permite agendamento posterior. `Retry-After` é interpretado; o serviço não executa retry. |
| `unknown` | Timeout, falha de rede, HTTP 408/5xx ou resposta ambígua. Não reenviar automaticamente sem reconciliação. |
| Outros `failed` | Bloqueio de ambiente, configuração, entrada, destinatário ou credencial; não houve envio quando detectados antes do POST. |

Não há garantia de idempotência nesta camada: cada chamada autorizada cloud realiza no máximo um POST. A idempotência durável será implementada na Fase 4. Chamadas deliberadamente repetidas não são deduplicadas agora. O pedido nunca é cancelado ou modificado por este serviço.

Erros retornam somente códigos estáveis, status HTTP, código numérico Meta e prazo de retry quando aplicável. Corpo de erro Meta, mensagem de exceção, headers, conteúdo do pedido e telefone não são registrados nem retornados. A camada não emite logs; o ledger/logging sanitizado será ligado nas fases de processamento e rastreabilidade.

## Validação e próximos passos

Executar de `functions`: `npm run test:whatsapp`. Não faz build nem acessa Firebase/Meta. `npm run test:all` inclui a suíte, além das verificações previamente existentes.

Fases pendentes: validação brasileira/consentimento (2), template/resumo persistido (3), trigger/worker/retry/idempotência (4), histórico (5), webhook (6), UI/reenvio autenticado (7), homologação (8). A disponibilidade de credenciais não impede esses trabalhos com mocks.

Para desativar esta fundação local, basta mantê-la sem importação pelo index.js; nenhuma migração ou alteração no fluxo atual precisa ser revertida. A divergência de caminho do AGENTS.md registrada no checkpoint permanece pendente antes de qualquer build/deploy.

Referências oficiais consultadas: [Cloud API / coleção Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) e [templates / referência Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/). Nenhum SDK novo foi adicionado; o transporte usa fetch do Node.
