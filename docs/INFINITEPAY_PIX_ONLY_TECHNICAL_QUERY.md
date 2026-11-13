# Consulta técnica preparada — Pix exclusivo no checkout web

**Status:** texto para o proprietário revisar/copiar e enviar ao suporte InfinitePay/CloudWalk na conversa existente. **Não enviado pelo agente.** Não anexar tokens, chaves, dados privados de clientes ou pedidos. Nenhum acesso ao App/Conta Web ou tentativa de criação de cobrança ocorreu para preparar esta consulta.

**Assunto sugerido:** API/fluxo Pix exclusivo para visitantes — confirmação de disponibilidade e contrato técnico

Olá, Ricardo/equipe InfinitePay,

Obrigado pelos esclarecimentos de 06/11. Nosso checkout web já utiliza `POST /links` e confirma aprovações no backend por `POST /payment_check`. Essa integração continuará funcionando sem mudanças para os clientes identificados.

Temos agora um requisito separado: clientes que escolhem continuar como visitante, sem login em nossa aplicação, devem poder pagar **exclusivamente por Pix**, sem cartão disponível no ambiente do provedor. Nosso backend calcula os valores, associa o pagamento ao pedido/loja e precisa confirmar o pagamento automaticamente por um canal confiável.

Consultamos a documentação pública:

- https://www.infinitepay.io/checkout-documentacao
- https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay
- https://www.infinitepay.io/desenvolvedores

Entendemos que, no Checkout Integrado atual, `payment_methods_enabled` não desativa o cartão. Também não encontramos contrato público para obter cobrança Pix exclusiva/QR Code/copia-e-cola por API. Não queremos ocultar cartão apenas na interface, usar endpoint privado do aplicativo ou montar uma confirmação manual de pagamento.

Podem confirmar os pontos abaixo e encaminhar a documentação oficial correspondente?

1. **Disponibilidade:** existe hoje, na InfinitePay/CloudWalk, produto/API oficialmente disponível para criar uma cobrança Pix exclusiva por pedido em um site próprio? Se existir somente como beta, acesso restrito ou roadmap, poderiam distinguir esses estados e os critérios de acesso?
2. **Restrição efetiva:** há suporte Pix-only no `/links` diferente do descrito na documentação atual, ou é outro produto? Precisamos de garantia de que cartão não fica disponível, inclusive no checkout hospedado. Qual parâmetro/contrato efetivamente impõe essa restrição?
3. **Criação e identificação:** quais são a base oficial, endpoints, métodos, versão, payload/resposta, referência externa e identificador único? É possível obter QR Code/copia-e-cola ou URL exclusivamente Pix, com valor fixado no backend e validade?
4. **Credenciais e conta recebedora:** usa a mesma API Key `inchk_`/`X-Api-Key` ou outro mecanismo? Quais escopos, habilitações e limites são necessários? Como garantimos que cada loja utiliza exatamente sua conta/merchant, sem afetar o checkout já existente? Não enviem segredos por e-mail; bastam instruções oficiais de provisionamento seguro.
5. **Confirmação financeira:** qual consulta server-side confirma pagamento, valor, moeda, recebedor e referência da cobrança? O `/payment_check` é oficialmente compatível com esse produto? Se não, qual é o contrato correto? Como consultar uma cobrança usando a referência persistida, mesmo se o comprador fechar a página sem retornar?
6. **Notificações:** quais eventos, schemas e mecanismos de autenticidade estão disponíveis? Há assinatura, consulta de confirmação ou outro mecanismo oficial? Quais regras de retry, duplicidade e ordenação devem ser consideradas?
7. **Idempotência e falhas:** existe chave idempotente, recuperação/consulta após timeout de criação e proteção contra duas cobranças para o mesmo pedido? Quais limites de requisição e proteções contra abuso se aplicam ao checkout sem login?
8. **Estados e expiração:** como consultar pendência, falha, expiração, cancelamento, liquidação e devoluções? É possível pagar após expirar? Existe cancelamento/estorno por API nesse eventual produto, ou continua restrito ao App/Conta Web? Precisamos distinguir validade da cobrança de expiração da reserva do pedido.
9. **Dados do pagador:** quais campos são obrigatórios — nome, telefone, e-mail, CPF ou outros? O fluxo exige conta, cadastro, login ou confirmação de telefone no provider? O acesso ao nosso site será como visitante, sem converter a verificação do provider em autenticação da nossa aplicação.
10. **Testes:** esse produto tem sandbox, credenciais e eventos sintéticos oficiais? A emissão de uma cobrança de teste já cria cobrança real? Não realizaremos testes financeiros reais antes da autorização do proprietário.

Se a InfinitePay não oferece esse fluxo atualmente, pedimos a confirmação explícita. Manteremos a integração existente sem adaptações não documentadas e aguardaremos uma solução oficial, sem pressupor que a API futura já esteja disponível.

Obrigado,
Antonio Pedro

---

Após a resposta: anexar o contrato recebido à documentação, revisar o [plano de compatibilidade](GUEST_PIX_ONLY_PLAN.md) e solicitar aprovação do menor patch antes de qualquer implementação. Esta consulta não é autorização de cobrança, credencial ou PROD.
