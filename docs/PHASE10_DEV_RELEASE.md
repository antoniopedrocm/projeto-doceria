# Fase 10 — publicação DEV da compatibilidade de legado

05/11/2026. Workspace confirmado: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, projeto exclusivo `crmdoceria-9959e`. PROD não autorizada.

Após a apresentação dos resultados locais, o proprietário pediu continuação e autorizou: **“pode fazer o deploy em dev sempre que necessário”**. Prosseguir com commit/push DEV, índices e Functions necessários. Esta autorização não inclui PROD, SMS real, atribuição permanente de Customer, migração de dados, operação financeira/fiscal ou WhatsApp.

## Pré-checagem

- Base Git `1a0ede75`; diff corresponde aos 10 hashes de código/config/testes da evidência local. 417 testes aprovados, sem repetir suítes sem necessidade; detalhes em [PHASE10_LOCAL_COMPATIBILITY_FIXES.md](PHASE10_LOCAL_COMPATIBILITY_FIXES.md).
- 146 Functions encontradas; as 15 selecionadas estão ACTIVE. API anterior `api-00070-jib`; Hosting `f960c57c592945d0` e Rules `19bc50df-ace4-453f-8bce-fae33bce3bcf` preservados.
- Fonte da API atual comparada com a árvore de dependências local: 58 arquivos de runtime/pacotes; 55 idênticos após normalizar quebras de linha e somente os três módulos autorizados diferentes. Nenhuma alteração publicada em paralelo será sobrescrita.
- 22 índices compostos e 5 field overrides existentes conferidos. Staging dos índices preserva integralmente essas definições e acrescenta somente os campos `pedidos.customerId` e `pedidos.clientId` necessários à consulta OR. Nenhuma exclusão/force.
- Variáveis de negócio diferem por grupo: API/lookup possuem duas variáveis fiscais; os 13 callables Customer não possuem essas variáveis. Usar dois stagings de Functions para preservar cada grupo; bindings de secrets por função devem permanecer iguais. Não registrar valores/credenciais em evidências públicas.

## Escopo seletivo

1. Publicar índices e aguardar estado READY antes das Functions.
2. Grupo API: `api`, `lookupClientByPhone`.
3. Grupo Customer: `customerAccount`, `customerCompleteProfile`, `customerPhoneClaimStatus`, `customerPhoneClaimStart`, `customerPhoneClaimConfirm`, `customerUpdate`, `customerOrders`, `customerOrderDetail`, `customerReorderPreview`, `customerAddAddress`, `customerDeleteAddress`, `customerUpdateAddress`, `customerSetDefaultAddress`.
4. Conferir os hashes dos arquivos efetivamente publicados, estado/revisões das 15 Functions, variáveis/bindings preservados e as outras 131 Functions inalteradas.
5. Confirmar Hosting/Rules inalterados e negativas sem Auth sem criar Customer/pedido/prova. Não usar perfil/telefone real para testar o fallback publicado.

Hosting e Rules não fazem parte do deploy. Nenhuma mudança de front-end exige build novo; o backend foi carregado/validado em mocks e no SDK real emulado. Arquivos de teste e fixtures ficam fora do pacote de runtime.

## Gate seguinte

Depois da publicação verificada, C15 continua dependendo de titulares/casos Google e e-mail legítimos, com autorização própria de vínculo permanente/SMS. C16 exige aceite consolidado efetivo. Publicar código não equivale a homologar esses critérios.

**Fase 9 = 100%; Fase 10 = 87,50% (14/16); global formal = 97,00%; Fase 13 = 0%; PROD READY: NÃO.**

## Publicação concluída e verificada

Runtime **`a36d558c7130815e9f3dcdde6862ae0c38a5c7af`** commitado/enviado à branch DEV e publicado exclusivamente em `crmdoceria-9959e`. Dois índices READY antes das Functions; as definições anteriores (22 compostos e 5 overrides) foram preservadas, sem exclusão.

As **15 Functions estão ACTIVE**, com 58 hashes de runtime conferidos em cada uma das 15 fontes baixadas. API **`api-00071-qeh`**, lookup **`lookupclientbyphone-00047-niz`**. Variáveis de negócio e bindings de secrets iguais aos anteriores em todos os alvos; os dois grupos impediram propagar env fiscal para os callables Customer. **Outras 131 Functions inalteradas.**

**15 negativas remotas PASS:** os 13 callables Customer rejeitaram ausência de Auth com 401/UNAUTHENTICATED; lookup vazio retornou 400/INVALID_ARGUMENT antes de consultar cadastro; API sem Auth retornou 401. Não foram enviados telefone/Customer/prova reais nem criado pedido, pagamento, nota, SMS ou WhatsApp.

Hosting permanece **`f960c57c592945d0`** e Rules **`19bc50df-ace4-453f-8bce-fae33bce3bcf`**, sem deploy desses recursos. [Evidência sanitizada da publicação](evidence/phase10-compatibility-release-dev.json). A evidência local dos 417 testes continua preservada; não soma novamente os retestes. Publicação técnica concluída, C15/C16 reais ainda pendentes.
