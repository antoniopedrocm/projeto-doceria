# InfinitePay — taxa de cartão em 1x — preparação local

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


## Atualização vigente — 12/11/2026: integração nativa preparada; credenciais/política pendentes

A implementação inicial foi aprovada pelo Dono. O caminho nativo `options.assured_installments` + `X-Api-Key` foi preparado e testado em DEV e PROD local, sem taxa local ou alteração dos valores originais. [Contrato, arquivos, política de 2x+, limites e instruções seguras](INFINITEPAY_CARD_1X_NATIVE_SETUP.md). As seções anteriores abaixo são histórico da primeira entrega; suas restrições de deploy DEV foram substituídas pela autorização permanente, sem liberar PROD ou commit/push.

DEV publicado: API `api-00078-rig`, `paymentSettingsGet`, `paymentSettingsSave` e Hosting `254526a07aba3209`, main `9da11fa6`. As61 hashes e6 rotas conferidas. Nenhum binding, chave, IAM ou baseline real foi configurado. Matriz e Garavelo usam hoje o mesmo handle `ana_guimares`; política vigente desconhecida, não presumida. A preferência padrão STORE continua **pendente de aplicação financeira real**. CUSTOMER não pode ser ativado sem binding seguro/compatível.

DEV643 React, PROD local623 React,30 Node por ambiente,69 integrações por ambiente PASS; builds/diff-check PASS. Lint de taxas0 erros/0 avisos; combinado DEV0 erros/66 avisos preexistentes. Sem pagamentos/estornos reais, credenciais expostas, commit/push ou PROD remoto. Global97,00%; Fase9 100%; Fase10 87,50%; Fase13 0%.


11/11/2026. Ambiente: **DEV**, branch `feature/infinitepay-customer-auth`, HEAD inicial/final `7e7d7b69`. Sem commit, push ou deploy. [Evidências](evidence/card-1x-fee-local/validation.json).

## Resultado e limite financeiro

**Preferência administrativa implementada; aplicação financeira no provedor PENDENTE.** Não declarar que a conta InfinitePay já absorve a taxa em 1x por causa deste campo. Não foi criada cobrança, nem conferida/alterada configuração remota da conta. O payload dos links mantém o comportamento anterior.

Antes, o painel não possuía preferência por pagador da taxa em 1x. Agora `card1xFeePayer` aceita `STORE`/`CUSTOMER` no contrato interno, com fallback `STORE` sem escrita automática para lojas sem preferência. O formulário exibe “Taxas de pagamento com cartão”, “Quem assume a taxa do cartão em 1x?”, “Loja assume a taxa — padrão” e “Cliente assume a taxa”. **A nova ativação CUSTOMER está desabilitada na UI e rejeitada no backend**, com erro controlado, até solução aprovada das dependências abaixo. O painel e a confirmação de salvamento informam explicitamente a pendência, sem prometer efeito financeiro.

O administrador com a capability financeira existente pode salvar/reabrir a preferência STORE. Validação de Staff, loja autorizada, versão otimista, confirmação de troca de handle e auditoria existentes foram preservadas. Formulários antigos que omitem o novo campo mantêm a preferência válida anterior; uma preferência CUSTOMER previamente cadastrada é preservada, sem afirmar ativação no provedor, e pode ser revertida explicitamente para STORE. Não se presumiu que existam tais registros remotos. Campos internos não relacionados permanecem intactos via merge. Não há inicialização em massa nem migração.

## Contrato oficial e dependências comprovadas

Fonte primária consultada: [Documentação oficial InfinitePay](https://www.infinitepay.io/checkout-documentacao), seção “Personalize o link com options”, em 11/11/2026.

- Existe suporte nativo: `options.assured_installments`, inteiro de 0 a 12, determina até quantas parcelas o vendedor absorve a taxa. 0 repassa todas; 1 absorve até 1x. Não limita o número de parcelas.
- `options` requer chave `inchk_` no header `X-Api-Key`, somente backend. Se chave e handle forem enviados, devem corresponder à mesma conta.
- A integração atual cria links somente com handle; não há binding de API Key por loja implementado no caminho de criação auditado. Não foram acessados Secrets remotos ou provisionadas credenciais.
- A política atual de parcelamentos da Dashboard não está representada com autoridade neste fluxo. Substituí-la cegamente por 0/1 pode alterar 2x+ (por exemplo, vendedor que absorvia até 3x).
- Por isso, não se adicionou `assured_installments`, taxa local calculada, item fictício ou flag financeira enviada pelo frontend. Também não se usou `discounts` como simulação de taxa.

Próximo plano mínimo para aprovação: conferir a política real de cada merchant e a compatibilidade do requisito “somente 1x”; autorizar configuração segura de chave por loja/ambiente, vinculada ao merchant; definir payload nativo que preserve 2x+ e snapshot por tentativa; validar a apresentação do total/encargo pelo checkout hospedado e os dados de confirmação/reconciliação antes de habilitar CUSTOMER. Se a política atual absorver 2x+, o parâmetro de limiar isolado não comprova repasse exclusivo de 1x com preservação das demais parcelas: requer esclarecimento/decisão específica. Nenhuma taxa percentual foi presumida.

## Preservação funcional

Nenhuma alteração no núcleo de criação/consulta/reconciliação dos pagamentos, no valor de pedido/frete/desconto, métodos Pix/Combinar/visitantes, webhooks, payment_check, idempotência, merchant persistido ou dados históricos. O formulário também ignora respostas tardias de salvamento após trocar de loja, evitando contaminar visualmente a preferência da próxima loja. Esse controle não substitui a autorização server-side.

Somente os seis arquivos de código abaixo foram integrados entre DEV e PROD local; a correção anterior de Gestão de Clientes e outras alterações locais do DEV não foram transportadas. As configurações específicas/guardas de publicação de PROD foram preservadas. O teste React de PROD manteve seu prólogo de lint específico.

## Arquivos desta tarefa

- functions/card-1x-fee-policy.js
- functions/payment-settings.js
- crm/src/payments/InfinitePaySettings.js
- functions/card-1x-fee-policy.test.js
- functions/card-1x-fee-settings-emulator.test.js
- crm/src/payments/InfinitePaySettings.test.js
- docs/INFINITEPAY_CARD_1X_FEES.md
- docs/evidence/card-1x-fee-local/*
- docs/CHECKPOINT_PREPROD_MISSION.md (acréscimo, histórico preservado)

## Validação executada

| Grupo | Resultado |
|---|---|
| React completo | 632/632 PASS, 62 suítes |
| React específico após último ajuste visual | 5/5 PASS |
| Node unitário/regressão de pagamento | 24/24 PASS |
| Integração Auth/Firestore/API/checkout local | 64/64 PASS |
| Lint dos seis arquivos de código | 0 erros / 0 avisos |
| Build local | PASS; main.7d196dcb.js |
| Diff-check | PASS; arquivos novos também verificados; HEAD e index preservados |

Os grupos se sobrepõem; não somar como testes distintos. Mocks e emuladores locais foram usados, com apps demo, sem cobranças reais, SMS, e-mail ou WhatsApp. Emuladores encerrados. Os dois ajustes finais de UI foram cobertos novamente pela suíte específica, lint e builds; não se alegou repetição da suíte completa depois deles. Avisos de Browserslist/baseline desatualizados permanecem no build; nenhuma dependência foi atualizada fora do escopo.

Casos comprovados: default sem escrita, salvar/reabrir por loja, preservação de preferência antiga, isolamento Matriz/Garavelo sintéticos, permissões, rejeição de CUSTOMER/flags forjadas, auditoria e ausência de alteração local de valores/options. Teste do provider usa mock e verifica amount/merchant/events/idempotência: **não comprova absorção da taxa nem total real com repasse**. Casos financeiros 1x de loja/cliente no provedor ainda PENDENTES; não marcados PASS indevidamente. Pix e 2x+ mantidos por ausência de mudança no caminho financeiro, com regressões existentes aprovadas.

## Checkpoint e autorização

Próximo ponto: revisão do Dono desta implementação parcial e das dependências financeiras. Nenhum commit, push ou deploy autorizado nesta tarefa. Uma futura publicação, quando aprovada, demandará backend de configurações e CRM dos respectivos ambientes; deploy isoladamente não resolve API Key/política de parcelas. Não publicar PROD nesta etapa.

Indicadores mantidos: **Fase 9 = 100%; Fase 10 = 87,50%; global formal = 97,00%; Fase 13 = 0%.** C15/C16 e aceites anteriores preservados. Nenhum novo aceite financeiro ou remoto inventado.
