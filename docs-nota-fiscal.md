# Módulo Nota Fiscal

O menu **Nota Fiscal** fica entre Financeiro e Configurações e usa a loja selecionada no topo do painel.

## Dados usados

- Pedidos: `lojas/{lojaId}/pedidos`
- Notas: `lojas/{lojaId}/invoices`
- Produtos fiscais: `lojas/{lojaId}/fiscalProducts`
- Configuração do emitente: `lojas/{lojaId}/fiscalConfig/issuer`
- Configuração de emissão: `lojas/{lojaId}/fiscalConfig/settings`
- Numeração: `lojas/{lojaId}/fiscalCounters`

## Cloud Functions

- `fiscalValidateOrder`
- `fiscalIssueInvoice`
- `fiscalCancelInvoice`
- `fiscalGetInvoice`

Enquanto a URL do serviço fiscal não estiver configurada, a validação roda localmente e a emissão real fica bloqueada. Para emitir de fato, publique `fiscal-service/` no Cloud Run e preencha **Nota Fiscal > Configuração > URL do serviço fiscal** ou configure `FISCAL_SERVICE_URL` nas Cloud Functions.

## Atenção operacional

Antes de produção, cadastre os dados fiscais dos produtos, configure o certificado A1 no Cloud Run, homologue NF-e/NFC-e na SEFAZ GO e confira série/numeração com o contador.
