# Módulo Nota Fiscal

O menu **Nota Fiscal** fica entre Financeiro e Configurações e usa a loja selecionada no topo do painel.

## Dados usados

- Pedidos: `lojas/{lojaId}/pedidos`
- Notas: `lojas/{lojaId}/invoices`
- Produtos fiscais: `lojas/{lojaId}/fiscalProducts`
- Configuração do emitente: `lojas/{lojaId}/fiscalConfig/issuer`
- Configuração de emissão da loja: `lojas/{lojaId}/fiscalConfig/settings`
- Metadados do certificado: `lojas/{lojaId}/fiscalConfig/certificate`
- Segredos por loja: Google Secret Manager (`fiscal_{lojaId}_cert_pfx_base64`, senha e CSC)
- Numeração: `lojas/{lojaId}/fiscalCounters`
- Inutilizações: `lojas/{lojaId}/fiscalInutilizations`
- Bloqueio de faixas: `lojas/{lojaId}/fiscalNumberBlocks`

## Cloud Functions

- `fiscalValidateOrder`
- `fiscalIssueInvoice`
- `fiscalCancelInvoice`
- `fiscalGetInvoice`
- `fiscalUploadCertificate`
- `fiscalSaveDraft`, `fiscalCheckDraft`, `fiscalIssueDraft`
- `fiscalInutilizeNumbering`

Enquanto a URL única do serviço fiscal não estiver configurada, a validação roda localmente e a emissão real fica bloqueada. Para emitir de fato, publique `fiscal-service/` no Cloud Run e configure `FISCAL_SERVICE_URL` nas Cloud Functions. Essa URL é global da plataforma, não pertence a cada loja, e só é exibida ao papel **Dono**. O certificado A1, senha e CSC são enviados pela tela **Nota Fiscal > Configuração > Certificado digital A1** e ficam no Secret Manager por loja.

O papel **Contador** pode receber acesso de consulta aos módulos selecionados pelo administrador. Em **Nota Fiscal**, ele visualiza dados fiscais e notas da loja vinculada sem poder emitir, cancelar, editar produtos fiscais ou substituir o certificado.

## Operações da nota

- NF-e (55) e NFC-e (65) são escolhidas explicitamente. O modelo, a série e o contador permanecem separados.
- **Salvar rascunho** grava os campos em `invoices` com `status: draft`, sem número e sem chamada ao serviço fiscal. Rascunhos de pedidos usam o pedido como fonte editável; rascunhos manuais guardam o formulário preenchido. A lista de notas permite reabri-los.
- **Visualizar Nota** mostra uma prévia identificada como documento não emitido. **Checar requisitos** monta o payload real, valida os campos e consulta `/validate` no serviço fiscal sem transmissão à SEFAZ. Erros bloqueiam a emissão; avisos são exibidos separadamente.
- **Confirmar emissão** chama `fiscalIssueDraft`. O backend refaz a checagem, reserva número e marca `validating` na mesma transação. Chamadas simultâneas ou repetidas ao mesmo ID não retransmitem. Retornos inconclusivos permanecem em `pending_return` até consulta/reconciliação.
- Somente nota `authorized` pode iniciar cancelamento. A Function trava pedidos concorrentes, envia `/cancel`, registra justificativa, usuário, código, protocolo do evento, horário e resposta privada. Falhas sem retorno ficam pendentes para consulta.
- **Inutilizar Numeração** é uma operação separada em `/inutilize`, para faixa não usada. O backend confere notas já numeradas, contador e bloqueios de faixa em transação. A faixa e o retorno ficam em `fiscalInutilizations`, incluindo protocolo, usuário e histórico. O serviço usa `sefazInutiliza` da biblioteca NFePHP; o ano deve ser o ano corrente do serviço.
- XML autorizado, XML de evento e resposta de inutilização permanecem em Storage privado; documentos de Firestore guardam apenas metadados e caminhos de artefatos.

- Antes da emissão, o operador pode informar observações da nota; o texto é transmitido como informação complementar e armazenado junto à nota para consulta.
- Notas autorizadas exibem a ação de cancelamento. A justificativa é obrigatória, tem no mínimo 15 caracteres e é gravada no histórico fiscal.
- No cadastro de produtos fiscais, a aplicação oferece opções de NCM e CFOP sem preencher valores automaticamente. NCM, CFOP, CST/CSOSN e demais parâmetros tributários devem ser escolhidos e validados pelo responsável fiscal.

## Atenção operacional

Antes de produção, cadastre os dados fiscais dos produtos, configure o certificado A1 no Cloud Run, homologue NF-e/NFC-e na SEFAZ GO e confira série/numeração com o contador.
