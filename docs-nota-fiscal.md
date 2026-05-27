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

## Cloud Functions

- `fiscalValidateOrder`
- `fiscalIssueInvoice`
- `fiscalCancelInvoice`
- `fiscalGetInvoice`
- `fiscalUploadCertificate`

Enquanto a URL única do serviço fiscal não estiver configurada, a validação roda localmente e a emissão real fica bloqueada. Para emitir de fato, publique `fiscal-service/` no Cloud Run e configure `FISCAL_SERVICE_URL` nas Cloud Functions. Essa URL é global da plataforma, não pertence a cada loja, e só é exibida ao papel **Dono**. O certificado A1, senha e CSC são enviados pela tela **Nota Fiscal > Configuração > Certificado digital A1** e ficam no Secret Manager por loja.

O papel **Contador** pode receber acesso de consulta aos módulos selecionados pelo administrador. Em **Nota Fiscal**, ele visualiza dados fiscais e notas da loja vinculada sem poder emitir, cancelar, editar produtos fiscais ou substituir o certificado.

## Operações da nota

- Antes da emissão, o operador pode informar observações da nota; o texto é transmitido como informação complementar e armazenado junto à nota para consulta.
- Notas autorizadas exibem a ação de cancelamento. A justificativa é obrigatória, tem no mínimo 15 caracteres e é gravada no histórico fiscal.
- No cadastro de produtos fiscais, a aplicação oferece seleção de NCM com padrão `1905.90.90` para itens típicos de confeitaria/pastelaria, além de opções para doces/confeitos sem cacau e produtos de chocolate/cacau. O CFOP é selecionado na operação de emissão, com padrão `5101 - Produção própria dentro de GO`, e ambos devem ser validados pelo responsável fiscal.

## Atenção operacional

Antes de produção, cadastre os dados fiscais dos produtos, configure o certificado A1 no Cloud Run, homologue NF-e/NFC-e na SEFAZ GO e confira série/numeração com o contador.
