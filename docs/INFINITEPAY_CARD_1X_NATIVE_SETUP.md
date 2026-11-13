# InfinitePay — aplicação nativa da preferência de taxa em 1x

> Estado vigente 12/11/2026: gerenciamento pelo [portal seguro](INFINITEPAY_CREDENTIAL_PORTAL.md), publicado somente DEV. Instruções manuais de Secrets abaixo são históricas e foram substituídas pelo formulário CRM. Aplicação independente por loja pendente das chaves reais e revisão dos dois links. Global97,00%; sem commit/push ou Firebase PROD.

## Retomada — 12/11/2026: Secrets informados, recursos não localizados no DEV

O titular informou que os Secrets DEV estavam configurados e autorizou validar as credenciais no backend, comprovar STORE 1/CUSTOMER 0 em novos links e habilitar o controle por loja somente após a comprovação. Deploy DEV continua permanentemente autorizado; pagamentos reais e serviços PROD continuam proibidos.

A auditoria de metadados usou exclusivamente o projeto **crmdoceria-9959e**. Os dois caminhos previstos nas instruções retornaram **HTTP 404**: Matriz `infinitepay-checkout-0ac34f0f9345e914f3f3` e Garavelo `infinitepay-checkout-a1cccade83b8102c97d1`. A listagem de metadados do projeto respondeu HTTP 200, com 18 Secrets existentes e nenhum candidato InfinitePay/checkout identificado. Isso não prova que o titular não criou chaves: os recursos podem estar sob outros nomes/localização/projeto; não consultar PROD para procurá-los. Solicitados somente nomes exatos, números das versões e Project ID exibido, sem valores ou capturas de credenciais.

Nenhum valor do Secret Manager foi acessado. Nenhuma chave, IAM, binding, preferência financeira, pedido ou dado histórico foi alterado; não houve chamada de criação de link/pagamento/estorno nesta retomada. Configurações DEV auditadas continuam ana_guimares/STORE e sem binding habilitado nas duas lojas. A API permanece ACTIVE em **api-00078-rig**. O PASS visual anterior do link handle-only continua preservado: cartão 1x sem juros de R$1,00, total R$1,00 e taxas R$0,00; isso não ativa o controle independente do CRM.

**Próximo ponto exato:** localizar os dois recursos informados pelo titular, conferir versões/metadata e permissão da conta de execução DEV, validar as chaves sem expô-las e comprovar as políticas 1/0 antes de ativar o binding/opções. Não recriar Secret, substituir chave, conceder IAM ou usar credencial global por suposição. Bloqueio real registrado em `docs/evidence/card-1x-activation-dev/blocked.json` (DEV).

Sem alteração de código executável. Nenhum novo build, teste de aplicação ou deploy é necessário/foi executado para registrar a ausência de recursos. Testes anteriores: 30 unitários / 7 UI / 70 integrações por ambiente preservados, sem apresentá-los como reexecutados. Documentação/evidências equivalentes copiadas apenas ao PROD local. HEAD e índice preservados, sem commit/push. Indicadores mantidos: **Fase 9 100%; Fase 10 87,50%; global 97,00%; Fase 13 0%**.


## Aceite visual técnico — 12/11/2026: cartão 1x de R$ 1,00 sem acréscimo

O titular informou “etapa de pagamento aberta” e o agente conferiu a mesma URL diagnóstica autorizada, sem criar outro link. Checkout ana_guimares em Crédito, opção selecionada **“1x sem juros de R$ 1,00”**, subtotal **R$ 1,00**, taxas **R$ 0,00**, total **R$ 1,00**. **PASS visual de cartão 1x no novo link handle-only**, herdando a configuração geral que o titular alterou para a loja assumir 1x. Não foi usada API Key nem options nesta cobrança diagnóstica. A etapa Contato foi concluída pelo titular, não pelo agente.

Nenhum campo de cartão/validade/CVV/CPF/CEP foi preenchido pelo agente e o botão Fazer Pedido não foi acionado. Não houve pagamento, chamada payment_check, pedido/reserva no Firebase, vínculo, SMS/WhatsApp solicitado pelo agente, Secret/IAM/binding alterado ou acesso a PROD. O teste comprova o valor apresentado em 1x, não liquidação, taxa efetiva do estabelecimento, pagamento real ou comportamento visual de 2x+ (o link de R$1,00 só oferece1x).

**Próximo bloqueio:** duas API Keys/Secrets DEV por loja, conforme [instruções do titular](INFINITEPAY_CARD_1X_OWNER_SETUP.md). O padrão geral sem API Key foi verificado; o controle independente por link do CRM ainda não está ativo e CUSTOMER permanece bloqueado sem binding. Fonte/runtime permanecem iguais à publicação DEV api-00078-rig / Hosting d1b23d2507ff6204: somente documentação/evidência atualizadas, sem novo build/deploy/commit/push. A regressão já aprovada nesta retomada continua 30 unitários,7 testes de painel e70 integrações por ambiente, com lint e diff-check PASS. Não afirmar que foram reexecutados agora para registrar esta leitura.

Prova sanitizada: docs/evidence/card-1x-owner-confirmed-dev/card1x-visual-pass.json (DEV). Nenhum dado do cartão foi consultado ou registrado. Global formal **97,00%**, Fase9 **100%**, Fase10 **87,50%**, Fase13 **0%**, sem alteração.


## Resultado desta retomada — 12/11/2026: baseline 1 confirmado; credenciais pendentes

Política aprovada pelo titular: STORE utiliza 1 e CUSTOMER utiliza 0 no mecanismo oficial, com cliente assumindo 2x+. Antes o App repassava todas as taxas; a mudança geral para 1 foi feita pelo titular. Matriz e Garavelo mantêm ana_guimares no DEV, sem definir a conta futura de PROD. O lembrete de parcelas foi pausado por já ter sido respondido.

Runtime existente conferido e preservado em ambos os diretórios. A única alteração de código desta retomada é uma regressão de teste, sincronizada ao PROD local: duas lojas na mesma conta mantêm Secrets/preferências/snapshots distintos, com payloads 1/0 e valor original. **30 unitários, 7 testes de painel e 70 integrações por ambiente PASS**; grupos sobrepostos. Lint de taxas: 0 erros/0 avisos; diff-check PASS. Full React/builds anteriores preservados, não apresentados como reexecutados nesta retomada. Sem commit/push.

**DEV permanece publicado e foi revalidado:** API api-00078-rig / Hosting d1b23d2507ff6204. Não foi necessário novo build ou deploy porque não houve mudança de runtime. Deploy DEV permanece permanentemente autorizado, sem nova pergunta. Nenhum serviço PROD foi consultado; PROD local recebeu somente teste/documentação equivalentes.

Um único link diagnóstico real de R$1,00 foi criado no provedor, autorizado pelo titular, sem API Key/options e sem criar pedido/reserva/estoque/cupom/Customer no Firebase. Tela inicial: total R$1,00, taxas R$0,00. **Não é prova de cartão 1x:** o checkout exige Contato antes de mostrar pagamento; etapa entregue ao titular no Chrome, sem dados pessoais enviados pelo agente, SMS/WhatsApp/OTP ou cartão. Não concluir pagamento. Não repetir link ou claim/SMS de fases anteriores. Evidências sanitizadas: docs/evidence/card-1x-owner-confirmed-dev/validation.json (DEV).

**Próximo bloqueio real:** titular configurar os dois Secrets DEV dedicados e suas permissões, conforme [instruções exatas](INFINITEPAY_CARD_1X_OWNER_SETUP.md), informando somente nomes/versões, nunca as chaves. Depois validar chave/merchant e o binding antes de habilitar CUSTOMER no CRM. A política geral foi confirmada; o controle efetivo por link no CRM ainda NÃO está ativado. Nenhuma credencial, IAM ou binding remoto foi criado/alterado nesta retomada. Inspeção do cartão 1x aguarda conclusão privada de Contato; não declarar homologação financeira por resumo inicial.

Indicadores formais mantidos: **Fase 9 100%; Fase 10 87,50%; global 97,00%; Fase 13 0%**. Sem pagamento, estorno, migração, vínculo, SMS ou WhatsApp real executado pelo agente. PROD não autorizada.


## Retomada de 12/11/2026 — política 1x confirmada pelo titular

O Dono conferiu diretamente no App InfinitePay: a conta ana_guimares repassava todas as taxas (0) e foi alterada pelo próprio titular para assumir somente 1x (1), mantendo o cliente responsável por 2x+. A hipótese anterior de12x foi descartada; não foi usada como configuração. Matriz e Garavelo mantêm a mesma conta no DEV por decisão expressa, sem definição de merchant PROD.

Código de runtime existente preservado e conferido: STORE1/CUSTOMER0 com baseline1 já é suportado pelo binding seguro. O caminho atual sem binding usa a política geral da conta, sem options. A configuração individual pelo CRM continua bloqueada até API Key válida por loja; não apresentar preferência local como aplicação efetiva por link. [Instruções exatas para o titular](INFINITEPAY_CARD_1X_OWNER_SETUP.md). Nenhuma chave real foi criada, substituída, lida ou exposta, nenhum IAM/binding remoto foi modificado.

Foi autorizado/criado exatamente um link diagnóstico real deR$1,00 no provedor, por handle, sem API Key, sem options, sem pedido/estoque/cupom/Customer no Firebase. A primeira tela exibe taxasR$0,00 e totalR$1,00, mas exige Contato antes de mostrar cartão/parcelas. Não homologar cartão1x somente por esse resumo. Etapa privada entregue ao titular no navegador, sem dados de cartão nem pagamento. URL somente em Temp privado; evidência sanitizada em docs/evidence/card-1x-owner-confirmed-dev/diagnostic-link.json (DEV).

Adicionada somente regressão sintética para duas lojas com mesmo merchant e políticas/Secrets distintos; mesmo teste sincronizado ao PROD local, sem mudança de runtime ou configurações. Unitários30/30 e painel7/7 por ambiente aprovados nesta retomada; integrações em validação, não presumir resultado pendente. Evidências/resultado final serão acrescidos ao concluir. Sem novo build/deploy enquanto runtime é idêntico ao já publicado; API api-00078-rig e Hosting d1b23d2507ff6204 conferidos como ACTIVE/iguais ao checkpoint. Autorização permanente de deploy DEV preservada.

Lembrete antigo confirmar-parcelamento-infinitepay pausado porque o titular já confirmou a política. Próximo bloqueio: concluir inspeção de cartão1x após Contato e o titular configurar os dois Secrets dedicados no DEV. Depois validar chave/merchant e binding seguro antes de habilitar CUSTOMER. Não repetir criação ambígua do link, não enviar SMS/WhatsApp, não pagar, não acessar PROD remoto. Sem commit/push. Fase9 100%; Fase10 87,50%; global formal97,00%; Fase13 0%, sem incremento.


## Publicação e bloqueio vigentes — 12/11/2026

DEV publicado e verificado: API **api-00078-rig**, configurações InfinitePay e Hosting **d1b23d2507ff6204**, **main.ae7de988.js** (61/61 arquivos e 6 rotas). Painel real conferido autenticado, sem salvar, para Matriz/Garavelo e viewport 390×800; mostra STORE como preferência administrativa padrão e **aplicação financeira pendente**. CUSTOMER continua indisponível sem binding compatível. Nenhuma chave, política, IAM ou dado financeiro remoto foi alterado.

O Dono acredita que a conta absorve até **12x**, mas confirmará depois. **Não é baseline confirmado**; nada foi ativado com esse número. Lembrete criado para **13/11/2026, 09h**, nesta conversa. Também falta confirmar se as duas lojas mantêm a mesma conta. Se N=12 for confirmado: STORE mantém 12; CUSTOMER=0 alteraria 2x+, portanto continua bloqueado sem decisão específica. Credenciais separadas e homologação real continuam pendentes.

Frontend DEV final **650/650 PASS** após ajustes isolados de estabilidade do modal/refresh de Clientes, não copiados ao PROD local. Frontend PROD local **623/623 PASS**. Os nove arquivos de taxas continuam equivalentes entre os diretórios. Node30 e integrações69 por ambiente PASS; grupos sobrepostos. Builds, lint e diff-check PASS; sem nova dependência. Houve uma falha de recursos no build DEV e um timeout transitório de leitura do Hosting, resolvidos com menor memória e nova conferência GET; não contados como testes aprovados.

PROD local permanece sem acesso/publicação remota. Sem commit/push. Aplicação financeira **NÃO homologada**, progresso formal **97,00%** preservado.


12/11/2026. Código preparado em DEV e integrado somente ao PROD local. **Aplicação financeira real pendente**: não foram criadas credenciais, alteradas configurações remotas de loja ou gerados pagamentos. Nenhum commit/push. Este documento atualiza o estado da implementação inicial descrita em INFINITEPAY_CARD_1X_FEES.md; as evidências anteriores continuam históricas.

## Contrato e preservação de 2x+

Fonte: [documentação oficial InfinitePay](https://www.infinitepay.io/checkout-documentacao), seção de options. `assured_installments` é o limite até o qual o vendedor absorve as taxas, não a quantidade máxima de parcelas. `0` repassa todas; `1` absorve 1x; valores superiores absorvem até o respectivo limite. Options exige `X-Api-Key` no backend; a chave deve corresponder ao handle.

O código não calcula acréscimo, não adiciona item de taxa, não altera valor/frete/desconto e não usa descontos para simular taxas. A InfinitePay apresenta os encargos no seu checkout. O método e o valor pagos continuam dependendo da confirmação por `/payment_check`; retorno do navegador e webhook não assinado não comprovam recebimento.

| Política vigente confirmada N | Loja assume 1x | Cliente assume 1x |
|---|---|---|
| 0 | Envia 1; mantém repasse de 2x+ | Envia 0; mantém 2x+ |
| 1 | Envia 1 | Envia 0; mantém repasse de 2x+ |
| 2 a 12 | Mantém N, preservando a absorção anterior de 2x+ | BLOQUEADO: 0 também mudaria 2x+; requer decisão específica do Dono |
| Desconhecida | Não ativar a nova política | Não ativar a nova política |

Default administrativo `STORE`, sem inicialização em massa. Preferências válidas anteriores são preservadas; omissão do campo não as sobrescreve. Uma configuração anterior `options.assured_installments`/`assured_installments` válida que conflite com o baseline bloqueia a ativação. Não se troca merchant nem se assume baseline 0/1 por falta de dado.

## Resultado da leitura DEV

Matriz e Garavelo estão com InfinitePay habilitada e ambas usam `ana_guimares`. Nenhuma possui preferência explícita, baseline comprovado ou binding desta credencial. Não se conclui que não existam chaves em outros locais: os valores reais de Secrets não foram consultados. Não há chave vinculada neste caminho auditado.

É necessária a confirmação do Dono sobre a política atual na Conta Web/App e sobre o compartilhamento da mesma conta de recebimento pelas duas unidades. Não presumir que devem ser merchants diferentes nem que chaves distintas representam contas distintas. O mapeamento loja/handle é verificado localmente; a correspondência efetiva da chave com a conta é validada pela InfinitePay e ainda não foi comprovada com credenciais reais.

## Preparação segura de credencial — instruções, NÃO executadas

1. Na Conta Web/App InfinitePay da conta correta, abrir **Configurações do Checkout**, conferir **Parcelamento e taxas** e informar o limite atual N. Se o painel não mostrar essa informação claramente, confirmar com o suporte antes de definir o baseline.
2. Na configuração do Checkout, na área de chaves de integração/API, o titular poderá gerar uma chave `inchk_`, identificada para a unidade e ambiente. A geração/exibição deve ocorrer somente no painel oficial. Não enviar a chave ao chat, formulário do CRM, arquivo versionado, terminal/histórico ou logs. **A geração não foi autorizada/executada pelo agente.**
3. No [Secret Manager do projeto DEV](https://console.cloud.google.com/security/secret-manager?project=crmdoceria-9959e), criar um Secret separado por unidade. Usar o editor seguro de valor do Console, mantendo a chave somente no Secret. O formato é JSON com `schemaVersion: 1`, `storeId`, `handle`, `baselineAssuredInstallments: N` e `apiKey` (valor real fornecido somente nesse editor).

| Loja | Secret DEV dedicado |
|---|---|
| ana-guimaraes-doceria-matriz | infinitepay-checkout-0ac34f0f9345e914f3f3 |
| ana-guimaraes-doceria-garavelo | infinitepay-checkout-a1cccade83b8102c97d1 |

4. Conceder **Secret Manager Secret Accessor somente no respectivo Secret** à conta de execução da API DEV: `389481198252-compute@developer.gserviceaccount.com`. Não conceder acesso público nem usar uma credencial global como fallback. Revisar IAM antes de efetuar essa alteração; nenhuma permissão foi concedida nesta execução.
5. Após autorização específica para configuração remota, vincular o metadata privado em `lojas/{storeId}/configuracoesInternas/infinitepay`, preservando o documento existente por merge. Campo `card1xFeeBinding`:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "storeId": "ID_CANONICO_DA_UNIDADE",
  "handle": "HANDLE_CONFIRMADO_DESSA_CONTA",
  "baselineAssuredInstallments": 1,
  "secretVersion": "projects/crmdoceria-9959e/secrets/SECRET_DEDICADO_DA_UNIDADE/versions/1"
}
```

O `1` do exemplo de baseline NÃO é uma recomendação para as lojas reais: substituir pelo N comprovado. A versão do Secret deve ser numérica e fixada, nunca `latest`. Não colocar `apiKey` no Firestore. A API pública de configurações rejeita a tentativa de escrever esse binding pelo frontend. Preparar o binding é uma operação administrativa controlada separada, ainda não executada.

6. Conferir a preferência por unidade no CRM e homologar um checkout real somente com autorização financeira específica. Rotação de chave/política demanda nova versão e binding revisado; não alterar valores de versões existentes. Alterações de handle invalidam binding incompatível. Links já criados não são recriados nem alterados retroativamente.

Essas instruções são exclusivamente DEV. **Não criar/bindar Secret, conceder IAM nem abrir serviços de PROD nesta tarefa.** O código PROD local utiliza seu próprio projectId quando futuramente publicado com autorização; referências DEV não serão aceitas naquele ambiente.

## Comportamento controlado

- Sem binding: os links mantêm o contrato homologado handle-only; a preferência aparece como pendente, não como taxa aplicada. CUSTOMER novo permanece indisponível.
- Binding habilitado inconsistente: falha controlada antes de iniciar a nova cobrança.
- Binding válido, mas chave ausente/inacessível/incorreta: sem chamada de criação à InfinitePay; permite retry da mesma tentativa após regularização, sem duplicar pedido.
- Chave e metadata são conferidos por projeto, loja, handle, versão e baseline. A chave só existe em memória na chamada a `/links`; não é enviada a `/payment_check`, corpo do payload, frontend ou diagnóstico. Redirect HTTP é bloqueado para não encaminhar o header a outro destino.
- Falha depois de iniciar a chamada ao provedor continua exigindo a conciliação existente; não se repete uma criação ambígua.
- Snapshot da política por tentativa e registro não secreto `card1xFeeApplied` preservam rastreabilidade/idempotência. Isso indica payload aplicado ao link, **não homologação financeira real**.
- Pix, Combinar Pagamento, visitantes, webhooks e reconciliação mantêm seus contratos. Nenhum novo provider ou endpoint Pix-only foi implementado.

## Testes e limites da evidência

DEV: **643 React, 30 Node e 69 integrações de pagamento PASS**. PROD local: **623 React, 30 Node e 69 integrações PASS**. Grupos se sobrepõem. Mocks/emuladores verificam padrão, persistência/isolamento, matriz completa N=0..12, segredo separado, header, ausência de chave, manipulação, payload, URLs existentes e regressões. Não demonstram taxas reais cobradas pela conta.

Build dos dois ambientes PASS; lint de taxas 0 erros/0 avisos; lint combinado DEV 0 erros/66 avisos antigos do App. Sem nova dependência. [Evidências DEV](evidence/card-1x-fee-native/validation.json). Aplicação real depende de política, credenciais e aceite financeiro; global formal **97,00%**, Fase9 **100%**, Fase10 **87,50%**, Fase13 **0%**.

## Arquivos de código equivalentes nos dois diretórios

`functions/card-1x-fee-policy.js`, `card-1x-fee-credentials.js`, `checkout-payment.js`, `payment-settings.js`, `card-1x-fee-policy.test.js`, `card-1x-fee-native.test.js`, `card-1x-fee-settings-emulator.test.js`; `crm/src/payments/InfinitePaySettings.js` e seu teste. Somente esses nove arquivos de taxas foram sincronizados; configurações/env/guardas de PROD e os demais trabalhos DEV foram preservados.
