# Validação pré-produção — Fases 9 e 11

Execução de 2026-10-20, base `c518597c`, branch `feature/infinitepay-customer-auth`.
Workspace: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`.
Ambiente de desenvolvimento: `crmdoceria-9959e`; integrações executadas somente nos
emuladores `demo-doceria-checkout`, Auth/Firestore em localhost.
Runtime financeiro corrigido em `af9311f2`; ajuste final do harness HTTP em `7225a219`.

## Resultado formal

- Fase 9: **75%**, pendente o contrato/tratamento operacional dos estados definitivos restantes.
- Fase 11: **100%**, bateria atual e jornada visual já aprovada consolidadas, com preexistências discriminadas.
- Fase 12: **100%**, Marco 4 concluído, sem repetição da homologação manual.
- Fase 13: **0% / NÃO INICIADA**. Produção intacta.
- Global: **93,75% → 95,00%**. Fechar a Fase 9 acrescentaria outros 2,00 p.p., atingindo 97,00%.

## Fase 9: critérios e evidência

Verificação/correlação, idempotência/conferência e recuperação/registro de tentativas
já estavam concluídos. Pix reais Matriz/Garavelo, webhook, consulta server-side,
reservas, estoque, recibo e retomada não foram repetidos.

Novas regressões reproduziram três falhas no código-base, antes da correção:
storeId contraditório com orderPath, pedido de mesmo valor ligado a outro pagamento
e regressão de estado interno REFUNDED para PAID. Corrigidas em `checkout-payment.js`,
sem criar API de reembolso nem autorizar escrita financeira pelo cliente.

O [contrato financeiro](PAYMENT_STATE_CONTRACT.md) distingue resposta do provider,
derivação local e ausência de prova. `paid:false`/erros/abandono não produzem FAILED
ou REFUNDED; pagamento tardio vai para revisão sem reabrir pedido; criação ambígua
não repete cobrança; cancelamento operacional não prova estorno. Um pedido com
vínculo contraditório não é modificado. Reembolso histórico não regride por evento antigo.

**Pendência oficial mantida:** a documentação consultada não define evidência
verificável de FAILED/REFUNDED ou cancelamento remoto do Checkout; também não existe
um mecanismo operacional aprovado de registro dessa comprovação na aplicação.
Não certificar esse último marco com mocks que inventem comportamento do provider.
Solicitado ao usuário eventual contrato oficial adicional. Nenhum novo pagamento,
estorno ou operação no provider é necessário apenas para obter essa documentação;
qualquer ação financeira que venha a ser indispensável exige autorização específica.

## Fase 11: inventário e execução

| Coorte atual | Resultado final | Cobertura / limite |
|---|---|---|
| Contratos financeiros/reservas/configuração e Rules relevantes | **27/27 PASS** | Seis testes novos, checkout-emulator, reservation-emulator e payment-settings-emulator; provider simulado |
| Backend unitário, 31 arquivos | **328 PASS / 2 FAIL preexistentes**,330 testes | Customer6A/6B/6C, Auth/sessão, frete, multiloja, pagamento, diagnósticos, negócio/CRM e doubles WhatsApp; não chamar a coorte inteira de PASS |
| CRM completo | **411/411 PASS**, 35 suítes | Capabilities/gate/menus, UID/generation, ownership/contexto, caixa, fiscal, estoque/frete, ponto, integrações e configuração de pagamento |
| Público/sessão Node | **59/59 PASS** | ESM fonte, canonical Auth/sessão, erros Auth/entrada, cache Hosting, storefront, disponibilidade, hydration e FCM cross-tab; sete cenários internos FCM não somados novamente |
| Integração Auth/Firestore/Rules | **65 verificações distintas PASS ao final** |54/54 dos demais arquivos + HTTP 11/11 após corrigir fixture nova; perfis/endereços, pedidos/cursor/ownership, shell/dual-role, Rules/caixa/Entre Lojas, multiloja futura e contrato FCM DEV |
| ESM do build final | **1/1 PASS** | Linker ESM nativo, seis entradas e dois controles negativos de export ausente; apenas fronteira SDK externo sintética |
| Lint do delta financeiro | **0 erros** | Runtime e dois arquivos de teste alterados |
| Lint ampliado | **22 erros / 79 avisos**, preexistências discriminadas abaixo | Resultado global não declarado PASS |
| Build completo CRM | **PASS**, exit0 com warnings conhecidos | Prebuild canônico + compilação; sem atualização de dependências ou publicação |
| Diff-check | **PASS** | Apenas runtime financeiro/testes e documentação autorizados |

Integração final utilizou processos de teste isolados e concorrência1. A primeira
execução de 65 teve 64 PASS/1 FAIL no teste HTTP novo: a fixture usava chave de idempotência
menor que o contrato mínimo de 16 caracteres. Corrigida somente a fixture e repetido
o arquivo HTTP completo 11/11, sem mudança de runtime para essa falha. Não repetir
as outras 54 verificações sem alteração de seus inputs. A bateria financeira 27/27
permaneceu válida. A execução exploratória inicial 10/10 unitários está contida
na coorte maior; não somar como novos testes.

### Preexistências e testes superseded

| Item | Prova no baseline c518597c | Impacto e classificação |
|---|---|---|
| `catalog-session.test.js` | **6 PASS / 21 FAIL**,27 testes; fixture e três HTMLs idênticos ao baseline, exceto EOL | Harness antigo sem authStateReady e expectativas de bootstrap anteriores; não representa regressão do delta; testes atuais de hydration/sessão/ESM e homologação existente permanecem válidos |
| `whatsapp-checkout.test.js` | **9 PASS / 2 FAIL**,11 testes; teste/index/helper/freight-core idênticos ao baseline | Double sem mínimo de frete explícito necessário ao contrato atual; duas asserções esperam200 e recebem400 Configure explicitamente o mínimo de frete desta loja. Demais casos passam; checkout/frete reais locais cobertos pela suíte HTTP atual. Nenhum WhatsApp real enviado |

Os testes antigos não foram apagados, enfraquecidos, marcados como skip nem
convertidos artificialmente em PASS. A reprodução compilou a versão Git do teste
em memória, após conferir seus inputs contra a árvore atual, sem checkout/reset ou
alteração de arquivos históricos. Não é prova de que toda dívida do projeto foi corrigida.

### Lint: erros e avisos separados

Os 22 erros da varredura ampliada foram reproduzidos por ESLint sobre os arquivos
do baseline, com mesma configuração e diagnósticos idênticos:

- `checkout-environment.js`:1 `no-restricted-globals` (`location`).
- `checkout-payment-client.js`:2 da mesma regra (`location`), já registrados no plano.
- `firebase-messaging-sw.js`:13 da mesma regra (`self`, contexto worker analisado pela configuração React).
- `payment-return.js`:1 da mesma regra (`location`).
- `InfinitePaySettings.test.js`:5 (`import/first` e `testing-library/no-unnecessary-act`).

Os 79 avisos incluem hooks/App, dependências de efeitos, variáveis e estilo de
testes/callbacks já existentes. Nenhum erro novo no delta financeiro. Não alterados
worker FCM, módulos de pagamento público ou teste CRM fora do escopo para mascarar
essa dívida. A primeira invocação de lint tinha um caminho inexistente de storefront;
foi descartada como erro de comando e a varredura com arquivos existentes foi executada.

A primeira varredura válida tinha80 avisos, incluindo um `no-loop-func` novo no teste
HTTP. Esse aviso foi corrigido capturando base/token em referências estáveis do
harness; HTTP11/11 repetido e lint do delta final **0 erros/0 avisos**. A varredura
final ficou22 erros/79 avisos; os oito arquivos com avisos têm inputs idênticos ao
baseline. Não classificar o aviso novo corrigido como preexistente.

Pelo critério autorizado, falhas preexistentes demonstradas não impedem o fechamento
da validação local quando não constituem regressão do projeto atual; a aprovação
da Fase 11 não equivale a dizer que o lint estendido e todas as fixtures estão verdes.

### Build, artefatos e ambiente

- Diretório absoluto `.../infinitepay-auth-worktree/crm` associado ao projeto DEV
  confirmado antes da compilação. Nenhum código ou artefato do diretório de produção utilizado.
- `main.10a3ca43.js`, SHA256
  `2c50e2ac81787f95f28769a8380ef6215b4a1f80236bce5cf45dbc18943cd69c`.
- 52 arquivos no artefato, 35 arquivos de código/config/map examinados; nenhuma
  correspondência dos padrões de endpoint/configuração PROD ou chave privada examinados.
  A inspeção não substitui auditoria exaustiva de secrets. Nenhuma credencial adicionada ao diff.
- Sete arquivos bootstrap/menu fonte/build com hashes iguais; index aponta para
  o bundle atual e o grafo ESM final passa. Temporários/testes novos ausentes do artefato.
- Warnings conhecidos: quatro source maps ausentes de native-audio e bases
  Browserslist/baseline antigas. Sem npm install/update para eliminá-los nesta etapa.
- Java21 existente e opção de socket somente nos processos de emulador. Emuladores
  encerrados pelo CLI ao final; nenhuma configuração permanente do sistema modificada.

## Readiness: bloqueada, relatório final ainda não pronto

A Fase 13 não foi iniciada. Antes de autorizar sua preparação/publicação, falta
fechar formalmente a Fase 9. O inventário abaixo é preliminar, sem consulta/escrita
em produção ou promessa de equivalência com seu estado remoto atual.

| Domínio | Verificação planejada para a etapa futura autorizada |
|---|---|
| Functions | Manifesto seletivo confrontado com PROD; api, Customer, configuração financeira, reserva/status e novas capacidades multiloja conforme diff efetivo. Não publicar globalmente nem carregar workers WhatsApp por consequência |
| Hosting | Build próprio no workspace de produção autorizado. O artefato DEV não é promoção direta: bootstrap/guardas/endpoints atuais exigem crmdoceria-9959e. Preservar cache revalidável e assets hashados |
| Dados/configuração | Auditar dados existentes; aplicar somente configuração legítima por loja, agenda/timezone, storefront/readiness e migração autorizada. Não copiar tarifas/estoques/pedidos/identidades DEV |
| Aliases/canal | Associação explícita dos aliases históricos e canal Festas à loja proprietária, segundo plano multiloja; sem fallback de loja |
| Secrets | Provisionamento/validação no projeto próprio, sem copiar ou expor valores DEV; conferir vinculação do Maps server-side e credenciais pertinentes |
| Índices/Rules | Confrontar versões de índices de pedidos/reservas e autorização Customer/Staff com o remoto; sem publicar Rules DEV automaticamente ou abrir configuração interna |
| CORS/Auth/Maps | Domínios/OAuth/callbacks e origens corretos, chave browser restrita quando aplicável e chave de rotas server-side; cotação definitiva continua no backend |
| InfinitePay | Conta e URLs próprias por loja, contrato de estados excepcional definido, sem fallback e sem nova movimentação automática; ações reais exigem autorização separada |
| WhatsApp | Flags permanecem desligadas; sem mensagens ou habilitação por efeito da promoção |
| Rollback | Registrar release Hosting, versões/backend/configuração anteriores e plano de retorno sem apagar pedidos/recibos/estoque financeiro; ensaiar somente com autorização |
| Smoke pós-deploy | Cardápios/aliases, projeção pública, readiness, Customer/Staff e fluxo até ponto seguro, sem criar cobrança/pagar/refund por padrão |

Nenhuma revisão Astra chamada. Uma revisão final pré-PROD pode ser considerada
em etapa separada, somente depois dos fechamentos e autorizações pertinentes.
