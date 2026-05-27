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

## Atenção operacional

Antes de produção, cadastre os dados fiscais dos produtos, configure o certificado A1 no Cloud Run, homologue NF-e/NFC-e na SEFAZ GO e confira série/numeração com o contador.
