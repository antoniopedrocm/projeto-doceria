# InfinitePay — credenciais independentes por loja no CRM

## Garavelo já concluída — não repetir o cadastro

CredencialGaraveloACTIVE,InfiniteTagantoniopedrocm,versão2;STORE1/CUSTOMER0e revisão confirmados nobackend. Não solicitar novamente sua chave,recriarSecretourefazerativação. Matrizana_guimaressemchavefuncionanofluxobásico; chaveopcional para controleavançado. [Estado e próximos gates](INFINITEPAY_PREPROD_STATUS.md).


12/11/2026. Esta decisão substitui a preparação manual de Secrets descrita em entradas históricas. Cada unidade deve ter sua conta, InfiniteTag, API Key e recebimento próprios. O mesmo handle atual das duas lojas é apenas uma exceção temporária DEV; o código não exige compartilhamento.

## Fluxo administrativo

Configurações → Pagamentos Online → InfinitePay, com loja específica e permissão financeira existente. A autorização é refeita no backend: usuário Firebase ativo, perfil Staff ativo, Dono/gerente autorizado e escopo de loja; gerente exige `manage_payment_settings`. Customer, usuário sem Auth e acesso cruzado são negados. As regras Firestore impedem leitura/escrita direta da configuração privada e das operações, inclusive pelo Dono no SDK cliente.

1. Titular gera a chave real no painel oficial da conta InfinitePay. O sistema não gera chaves no provedor.
2. Informa a InfiniteTag e cola a API Key no campo de senha do CRM DEV. A chave é transitória no input/requisição TLS; não vai para estado React, armazenamento do navegador, logs, Firestore ou respostas. O campo é limpo antes de aguardar a resposta.
3. Confirma a política loja assume 1x/cliente assume 2x+ e autoriza dois links diagnósticos de R$1,00, sem pagamento.
4. O backend deriva o nome do Secret do storeId, verifica metadados e cria o recurso se ausente. Caso exista, acrescenta uma versão numérica; não sobrescreve/destrói versões. Recursos preexistentes sem identificação confiável exigem revisão, sem adoção silenciosa.
5. A nova versão é lida pelo backend e submetida à InfinitePay com handle e `X-Api-Key`, usando `assured_installments:1` e `0`, respectivamente. Os dois precisam ser aceitos. Não há endpoint público de consulta de identidade da API Key: a aceitação do par chave/handle, prevista no contrato, é complementada pela conferência humana da conta nos links.
6. O responsável confere a conta destinatária e a política de cada link, sem preencher cartão/pagar, e ativa explicitamente. Somente então o binding privado passa a ser usado nos novos links e o CRM habilita CUSTOMER. A credencial anterior continua em uso durante a preparação ou falha de substituição.

Os links diagnósticos expiram em uma hora e não criam pedidos, reservas, receitas ou pagamentos no CRM. A confirmação humana é registrada; não equivale a pagamento, liquidação ou homologação de taxa efetivamente cobrada. Uma chamada ambígua nunca é repetida automaticamente. Uma operação interrompida em STORING/VALIDATING exige revisão técnica antes de desbloqueio; não apagar o marcador para tentar novamente sem investigar o efeito externo.

## Secret Manager e isolamento

`infinitepay-checkout-` + 20 caracteres de SHA-256 do storeId. Nomes preservados:

| Loja | Secret |
|---|---|
| Matriz | infinitepay-checkout-0ac34f0f9345e914f3f3 |
| Garavelo | infinitepay-checkout-a1cccade83b8102c97d1 |

Payload secreto: schemaVersion, storeId, handle, baselineAssuredInstallments e apiKey. Firestore guarda referência, estado e metadados de validação; não a chave. Referências exigem projeto atual, nome derivado e versão numérica; `latest`, projeto estrangeiro e referência arbitrária são rejeitados. Pagamentos já iniciados conservam sua versão e merchant persistidos.

Uma nova loja utiliza o mesmo mecanismo dinâmico: não requer Secret/IAM/deploy por unidade. Requer a criação normal da loja e configuração operacional apropriada. A nova API Key sempre vem do titular da conta correspondente.

## Permissões da infraestrutura DEV

As duas Functions de credenciais usam `payment-credentials@crmdoceria-9959e.iam.gserviceaccount.com`, separada da API compartilhada. Foram criados papéis específicos: criar Secret; obter metadados/adicionar/acessar versão; verificar usuário Firebase. Acesso a versões/metadados é condicionado ao prefixo dos Secrets InfinitePay neste projeto. Criação depende de permissão no projeto-pai; o código limita o ID e os rótulos. Sem permissão nova para excluir Secret/versão, alterar IAM, listar Secrets ou criar chaves de conta de serviço. A identidade precisa de acesso a Firestore para autorização, configuração e auditoria.

A conta compartilhada antiga da API já possuía Editor e Secret Manager Admin antes desta tarefa. Essas permissões não foram concedidas pelo novo fluxo nem removidas para não quebrar fiscal/outros módulos; sua redução é um débito separado. Não afirmar que todo o ambiente já tem privilégio mínimo. O incremento de leitura para a API é restrito ao prefixo InfinitePay.

A liberação depende do gate privado `integrations/paymentCredentialManagement`: enabled, controlsVersion1 e projectId atual. Ausência/incompatibilidade bloqueia o fluxo. PROD local recebe somente código/testes/documentação; não recebe IAM, gate, Secrets ou chaves DEV.

## Política financeira e preservação

STORE → `options.assured_installments:1`; CUSTOMER → `0`. O padrão é STORE. Nenhuma taxa é calculada/acrescida pelo CRM. Ambas mantêm repasse de 2x+ conforme a política aprovada. Configuração legada que absorva 2x+ e conflite com o baseline continua bloqueada para decisão específica; não é sobrescrita silenciosamente. Valores, frete, descontos, Pix, Combinar Pagamento, política de visitantes, webhook, payment_check, reconciliação e idempotência são preservados.

## Evidências e limites

Testes usam somente SDK/provedor mock e Firestore/Auth emuladores. Cobrem criação, versionamento, nomes, projeto/loja, rejeição de Secret alheio, autorização, concorrência/repetição, erro ambíguo, preservação da versão anterior, troca de merchant, expiração, payloads oficiais e ausência de chave nas respostas/auditoria. A execução real requer que o titular forneça as chaves pelo formulário e revise os dois links de cada loja. Não declarar a política financeiramente ativa antes dessa etapa.

Fontes: [InfinitePay Checkout](https://www.infinitepay.io/checkout-documentacao), [Secret Manager IAM](https://docs.cloud.google.com/secret-manager/docs/access-control). Evidências de execução: `docs/evidence/infinitepay-credential-portal-dev/` (exclusivamente DEV).

Indicadores preservados: Fase9 100%; Fase10 87,50%; global97,00%; Fase13 0%. Sem commit/push e sem Firebase PROD.

## Arquivos de código e testes desta etapa (DEV e PROD local)

- `functions/card-1x-fee-policy.js`
- `functions/card-1x-fee-policy.test.js`
- `functions/card-1x-fee-native.test.js`
- `functions/card-1x-fee-credentials.js`
- `functions/card-1x-fee-settings-emulator.test.js`
- `functions/checkout-payment.js`
- `functions/payment-settings.js`
- `crm/src/payments/InfinitePaySettings.js`
- `crm/src/payments/InfinitePaySettings.test.js`
- `functions/infinitepay-secret-store.js`
- `functions/infinitepay-secret-store.test.js`
- `functions/payment-credential-status.js`
- `functions/payment-credentials.js`
- `functions/payment-credentials-emulator.test.js`
- `crm/src/payments/InfinitePayCredentialForm.js`
- `crm/src/payments/InfinitePayCredentialForm.test.js`
- `functions/index.js`

O index.js de PROD local recebeu somente a inserção dirigida das duas callables; não foi substituído pelo index.js DEV. Documentação: INFINITEPAY_CREDENTIAL_PORTAL.md, INFINITEPAY_CARD_1X_OWNER_SETUP.md, notas de estado em INFINITEPAY_CARD_1X_FEES.md/INFINITEPAY_CARD_1X_NATIVE_SETUP.md e checkpoints próprios de cada diretório.
