# Checkout visitante — recuperação de tentativa e conflito 409

> **Complemento posterior publicado:** [ciclo de finalização `a2bf20fe`](CHECKOUT_COMPLETION_LIFECYCLE.md) corrige o retorno antecipado do online que preservava carrinho/chave após criação. A política de manter checkout encerrado preso a pagamento PENDING foi substituída pela finalização normal definida pelo Dono; não houve cancelamento, conversão de pagamento ou retirada de idempotência. Este relatório/evidências descrevem a etapa histórica `4a19dba2`.

## Publicação DEV verificada — 07/11/2026

Commit funcional **`4a19dba2d6b575619a1191c14d576b75b3beaf3d`**, push DEV concluído. API **`api-00073-zuv`** ACTIVE e Hosting **`5e6363d665c9bd74`** publicados exclusivamente em `crmdoceria-9959e`. [Evidência remota](evidence/guest-attempt-recovery-dev.json): **62/62 arquivos** iguais, 7 rotas e 4 GETs públicos/config PASS; cache preservado, 145 outras Functions e Rules inalteradas. A primeira preparação falhou lendo metadados do banco antes do upload; repetição do mesmo artefato concluiu, sem criar/alterar banco. **Aceite manual do complemento: PENDENTE.**

Titular confirmou depois da publicação: **Pagar Agora abriu a InfinitePay; fechou a página sem pagar e depois tentou Combinar Pagamento**. Isso confirma a sequência da classe reproduzida. Fechar a página do provider não cancela o pedido/link. A correlação com a chave específica da aba não foi coletada; os limites da consulta abaixo continuam válidos. Não pedir nova compra/pagamento para homologar o aviso.

## Relato e diagnóstico — 07/11/2026

Titular reprovou o aceite de `d87174b6` e forneceu screenshot/stack: ao confirmar **Combinar Pagamento**, `/checkout/confirmar` devolve 409 “O pedido já foi enviado com outros dados. Consulte o pedido existente.”; cliques posteriores param em `ensureCheckoutNotBlocked`.

Condição exata em `functions/index.js`: o documento da tentativa determinística **já existe** e difere no fingerprint, owner ou Customer esperado. A validação não deve ser retirada. O frontend guarda uma única tentativa na aba (`doceria-payment-pending`) e, antes do complemento, reenviava seus novos dados com essa mesma chave sem apresentar o estado da compra anterior. O catch ainda convertia esse conflito em bloqueio persistente da interface.

**Classe de regressão reproduzida antes do patch** em teste do handler real: tentativa online anterior + seleção Combinar → POST divergente, embora devesse orientar a recuperação; 1 envio indevido em vez de 0. Depois do patch, consulta a tentativa e orienta o usuário sem criar outro pedido. O teste HTTP confirma que o backend continua rejeitando trocar o modo/dados da tentativa existente.

Leitura projetada DEV em Firestore STANDARD, últimos 15 pedidos da Matriz, sem solicitar nome/telefone/endereço/UID: um candidato Guest recente tinha ONLINE_NOW/PENDING, subtotal R$ 1,00, total R$ 14,44, link READY e revisão do contexto 4, depois 9. A tela do relato mostra novo total R$ 14,46 e Combinar. **É evidência compatível, não correlação definitiva com a chave da aba**. O campo de storage não estava disponível no escopo DOM do navegador; nenhuma chave/token foi coletada ou alterada. A confirmação posterior do titular está registrada no topo. Observada somente a aba DEV já aberta, sem clicar Confirmar/alterar formulário. Nada de Customer/provedor/PROD consultado; nenhuma escrita de dados remotos.

## Correção delimitada

- Novo helper `crm/public/guest-payment-attempt.mjs`: consulta a tentativa já conhecida usando somente a capability de retorno já existente. Não usa telefone como prova, Auth ambiente, nova API financeira ou payload Customer.
- Ao abrir o modal/trocar escolha, preview mostra a orientação **antes de Confirmar Pedido**, sem enviar novo pedido nem retirar chave. Resposta atrasada não reaplica aviso após mudar a escolha/contexto/fechar modal.
- PENDING + Combinar: mantém a chave e mostra **Consultar pagamento existente**. Não converte silenciosamente pedido online, cancela link, libera estoque ou cria pedido substituto.
- PENDING + Pagar Agora: mantém a mesma chave e preserva a retomada pelo backend, que continua conferindo fingerprint/contexto/loja e reutilizando o link. Dado divergente segue bloqueado.
- PAID/revisão/desconhecido/falha/ausência da prova: não descartam a tentativa. Falha de consulta permite nova consulta, sem inventar conclusão do pagamento.
- EXPIRED/CANCELLED/REFUNDED **confirmados pelo endpoint existente**, sem revisão: somente na confirmação da compra atual, retira a chave anterior se ela ainda é a mesma e permite uma nova tentativa. Preserva carrinho e prova do pagamento antigo. Reutiliza a política de expiração já existente de `/checkout/payment-status`; não cria política de cancelamento/estorno.
- Resposta perdida sem paymentId: preserva a chave, reenviando sob idempotência existente. Não inventa conclusão nem troca UUID cegamente. Conflito continua exigindo consulta do pedido/loja.
- Backend adiciona apenas o código `CHECKOUT_ATTEMPT_CONFLICT` ao 409 existente. Frontend Guest mostra aviso contextual em vez de torná-lo bloqueio permanente. Condições de autorização/idempotência e campos financeiros permanecem iguais.
- Fresh Guest + Combinar continua funcionando sem Google/e-mail, com pagamento pendente/método indefinido e sem link online. Autenticado/Phone, consentimento e WhatsApp preservados.

## Testes e qualidade local

**198 testes distintos PASS**, sem somar retestes nem os 182 históricos: **47** unitários/WhatsApp, **92** integração emulada (9 arquivos, HTTP 32), **41** públicos (5 arquivos), **18** React. **16 testes novos** em relação à rodada de 182. Todos usam dados sintéticos/provider simulado, Auth/Firestore locais `demo-doceria-checkout`, sem cobrança/SMS/vínculo.

Provas incluem: recuperação antes do POST; nova compra Combinar; mesma tentativa online/link; erro 409 tipado sem travar permanentemente; falta de proof/timeout; estado terminal local forjado ignorado; respostas atrasadas; preview não apaga chave durante confirmação; backend mantém conflito de mudança de modo; expiração autorizada em emulador seguida de nova compra offline, estoque 8→7→8→7, retry sem duplicação e apenas um link para a compra online anterior. G1/G2/G3 e demais regressões financeiras preservados.

Build DEV guardado `crmdoceria-9959e` PASS; bundle `main.e4b94788.js`, 456,38 kB gzip, sem dependência nova. Avisos existentes de sourcemaps/Browserslist permanecem. Lint dos 18 arquivos backend/públicos/testes **sem erros/avisos novos**; 6 diagnósticos preexistentes de index.js preservados. React anterior 0 erros/avisos; diff-check PASS. [Validação local](evidence/guest-attempt-recovery-local/validation.json).

[Desktop 1920×889/mobile 390×800](evidence/guest-attempt-recovery-local/visual-review.json): fixtures reais de template/CSS com tentativa sintética PENDING; aviso/link visíveis, sem overflow horizontal. [Mobile](evidence/guest-attempt-recovery-local/agreed_later-390.png), [desktop](evidence/guest-attempt-recovery-local/agreed_later-1920.png). Não são screenshots do Customer nem homologação remota.

## Arquivos do complemento

`functions/index.js` (código de conflito); `functions/checkout-http.test.js` (regressão/expiração/estoque); `crm/public/guest-payment-attempt.mjs` (novo helper); `crm/public/cardapio.html` e aliases gerados (preview/recuperação/aviso); `crm/tests/guest-payment-attempt.test.mjs` (novo); `crm/tests/guest-checkout-payment.test.mjs`; `crm/tests/guest-checkout-visual-review.cjs`; checkpoint e evidências desta entrega. Nenhum componente autenticado, Rules, IDs históricos ou integração de provider foi reescrito.

## Estado de entrega

Commit/push e API/Hosting DEV concluídos conforme evidência no topo. **O FAIL anterior do titular não é substituído por testes locais; novo aceite permanece pendente.** Não solicitar compra/pagamento real para validar. Fluxos financeiros de mudança de método em link online ainda ativo não estão autorizados: o usuário deve consultar a tentativa/loja, não criar uma segunda cobrança silenciosamente.

**Fase 9 100% formal histórico; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO.**
