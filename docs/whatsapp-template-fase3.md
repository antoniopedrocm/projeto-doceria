# Template de confirmação — Fase 3

Template preparado localmente, ainda não submetido nem aprovado pela Meta. Nenhuma mensagem enviada. Categoria proposta: UTILITY; a classificação e aprovação finais dependem da Meta. Não contém promoções ou afirmação de pagamento aprovado.

## Texto para cadastro

Nome: `confirmacao_pedido_v1`. Idioma: Português (Brasil), `pt_BR`. Parâmetros posicionais, somente corpo textual; sem cabeçalho, rodapé ou botões nesta versão.

```text
Olá! Recebemos seu pedido {{1}} na Ana Guimarães Doceria.

Resumo do pedido: {{2}}

Total: {{3}}

Agradecemos a sua preferência!
```

| Variável | Fonte |
| --- | --- |
| 1 | numeroPedido, codigo ou numero persistido; na ausência, ID completo do documento. |
| 2 | Resumo dos campos disponíveis do pedido salvo, com separadores entre informações. |
| 3 | total persistido, formatado em reais. Não é valor do carrinho nem prova de pagamento. |

Payload para cadastro e exemplos inteiramente fictícios: [whatsapp-template-v1.json](whatsapp-template-v1.json). O arquivo não contém credencial e não foi enviado à Meta.

Exemplo de mensagem resultante:

```text
Olá! Recebemos seu pedido pedido-exemplo-123 na Ana Guimarães Doceria.

Resumo do pedido: Cliente: Cliente exemplo | Itens: 2x Bolo de chocolate (R$ 30,00 un.); 3x Brigadeiro (R$ 5,00 un.) | Subtotal: R$ 75,00 | Desconto (PEDIDO5): R$ 5,00 | Frete: R$ 8,00 | Endereço: Rua Exemplo, 10 | Pagamento: Pix | Status: Pendente | Observações: Entregar na portaria

Total: R$ 78,00

Agradecemos a sua preferência!
```

## Como cadastrar e aprovar

1. Acessar o WhatsApp Manager da conta WABA destinada aos testes DEV. Conferir que é a conta/número de teste, sem utilizar credenciais de produção.
2. Na área de modelos de mensagem, criar modelo com categoria Utilidade/UTILITY, nome e idioma acima. Escolher variáveis posicionais e copiar exatamente o corpo, inclusive as três variáveis na ordem indicada.
3. Preencher as amostras de cada variável com os três valores em `example.body_text` do JSON. Não usar dados reais de clientes para revisão do template.
4. Submeter e aguardar aprovação. Se a Meta recusar ou recategorizar, registrar o motivo e revisar texto/contrato antes de ativar. Não alterar silenciosamente a categoria para marketing.
5. Depois de aprovado e quando a fase de teste real estiver autorizada, configurar o documento privado DEV `integrations/whatsapp/stores/{lojaId}` com `templateName: confirmacao_pedido_v1` e `templateLanguage: pt_BR`, além das demais configurações da Fase 1. A disponibilidade do modelo, número de teste e token ainda precisa ser validada na conta real.

Alternativa para um administrador que utilize a API de gerenciamento: o JSON corresponde ao corpo de criação em `/{WABA-ID}/message_templates`, com versão Graph suportada explicitamente escolhida. Nenhuma chamada de gerenciamento é executada pelo código desta fase. Configurar o nome local não comprova aprovação na Meta.

Referências: [coleção oficial Meta de templates](https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates), [orientações oficiais de gerenciamento](https://whatsappbusiness.com/blog/manage-message-templates-whatsapp-business-api/) e [política de mensagens](https://business.whatsapp.com/policy). Os exemplos antigos de versão API nessas páginas não definem a versão a usar no projeto.

## Fonte dos dados e compatibilidade

`createOrderConfirmationPreparer({db}).prepare({storeId, orderId})` em `functions/whatsapp-order-summary.js` consulta somente `lojas/{storeId}/pedidos/{orderId}`. Não aceita conteúdo do carrinho nem busca cadastro atualizado do cliente ou catálogo. O formatter puro separado existe para testes e composição interna; não deve receber dados de frontend na integração futura.

A preparação exige projeto DEV, referência válida, consentimento explícito/versionado e telefone consistente entre o campo original e o snapshot normalizado. Converte `+55…` para os dígitos esperados pelo transporte. Não prova titularidade do telefone; tampouco substitui autorização, proteção contra abuso e filtros de origem/status a implementar no worker.

Campos reaproveitados do resumo administrativo: clienteNome, itens, desconto/cupom, frete, total, endereço, pagamento, status e observacao. Quantidade usa quantity ou quantidade, sem assumir 1; preço unitário só aparece se persistido. Subtotal só aparece se persistido. Valor de desconto usa cupom.valorDesconto ou desconto e frete usa valorFrete ou frete, seguindo a precedência já existente. Não reescreve valores nem recalcula regras comerciais. A validação de integridade comercial do checkout permanece um risco registrado, separado da fidelidade ao documento salvo.

Retirada é reconhecida pelo valor persistido `Retirar na Loja`. Sem endereço, não inventa modo de entrega. Não inclui CPF, telefone ou dados bancários no resumo. Observações persistidas são preservadas, e por isso podem conter texto pessoal fornecido no pedido; não registrar preview ou parâmetros em logs. A futura auditoria deverá avaliar a política de minimização dessas observações antes de envio real.

O formato do botão manual foi adaptado no backend, preservando sua intenção e campos. O botão atual não foi refatorado nesta fase: ele ainda abre wa.me; ajuste de reenvio pertence à Fase 7.

## Limites e resultados

Limite conservador da aplicação: corpo renderizado completo até 1024 caracteres. Espaços/quebras/tabulações dos campos são condensados para parâmetros de uma linha. O texto não é truncado. A aprovação e os limites efetivos do modelo devem ser confirmados no teste real.

- `ready`: retorna template/version, bodyParameters, preview, destinatário e referência; nenhum envio ocorreu.
- `summary_too_long`: não cortar itens, endereço ou total. O futuro worker deve registrar pendência e manter contingência manual. Se houver necessidade de entrega automática de resumos maiores, preparar outra versão aprovada (por exemplo documento), mediante decisão de conteúdo, antes de habilitar esses casos.
- `unsupported_item_options`: há estrutura opcoes/adicionais/complementos/variacao não mapeada. O checkout atual persiste nome/quantity/preco/produtoId; variantes já incluídas no nome e observações do item são preservadas. Não inventar ou omitir silenciosamente estruturas de outra origem.
- `invalid_order_data`, `invalid_recipient`, `consent_missing`, `order_not_found` e outros códigos não incluem dados sensíveis.

O transporte compara `expectedTemplate` do preparo com nome/idioma configurados, falhando em `template_mismatch` antes de acessar secrets/rede. Deve-se passar o resultado preparado completo, não descartar esse contrato.

## Preparação para as próximas fases

Não existe trigger, agendamento, escrita de histórico, webhook ou endpoint público novo. A preparação é somente leitura. O worker da Fase 4 deverá armazenar um snapshot durável da mensagem preparada para retries consistentes, com acesso restrito/retencão adequada, sem permitir duas confirmações automáticas do mesmo evento. Preparar outra vez pode refletir uma edição posterior do pedido; a camada desta fase não promete congelamento durável nem idempotência.

Mock funciona com o mesmo nome/idioma, sem aprovação Meta, token ou rede. Não foi criado documento remoto de configuração. A aprovação externa não impede avançar nos testes locais. Testes via `npm run test:whatsapp` em functions; as dependências de desenvolvimento de crm são necessárias para testes de DOM da fase anterior.

Rollback desta fase: retirar uso futuro do preparador; não há migration ou dado remoto a reverter. Manter o serviço desligado até a implementação e homologação das fases seguintes.
