# Visitante — corrigir telefone e confirmar novamente

## Relato confirmado — 07/11/2026

Dono informou: digitou um telefone errado, clicou Confirmar Pedido, recebeu **Informe um telefone brasileiro válido com DDD.** Depois corrigiu o campo e o erro continuou bloqueando a confirmação. Não foi solicitado nem coletado o número real.

Base conferida `c20e0217`, runtime público anterior `83dc6b47` / API `api-00074-fix`, worktree DEV autorizado. O problema é o ciclo da validação corrigível; não foi comprovada falha nos formatos aceitos pelo normalizador.

## Causa e prova

Backend rejeita telefone inválido antes da criação do pedido. Porém `normalizePhoneNumber` descartava o código tipado do normalizador canônico nessa ramificação Guest; o frontend tratava a resposta como bloqueio global `pedido`. `ensureCheckoutNotBlocked` rejeitava o segundo clique antes de enviá-lo ao servidor, mesmo após alterar o campo.

Teste com DOM/handlers e **guardas reais** reproduziu a sequência: antes do patch, somente **1 POST em vez de 2**. Após o patch, erro → edição → nova confirmação chegam ao servidor com **a mesma chave idempotente**, e o fluxo conclui tanto em ONLINE_NOW quanto em AGREED_LATER. Nome, endereço, carrinho e consentimento não são apagados no erro; são limpos somente após confirmação normal do pedido.

## Correção pontual

- Na ramificação Guest do `/checkout/confirmar`, usar diretamente `normalizeCustomerPhone(...).national`, preservando `CUSTOMER_PHONE_INVALID`/HTTP 400. Não altera regex/DDD/prefixos/formato canônico ou regras de titularidade.
- Frontend trata somente esse código como erro do campo telefone, sem registrar bloqueio permanente do pedido. Mensagem junto ao campo, `aria-invalid`, descrição acessível e foco; edição limpa o aviso. Não gera erro global/toast persistente para essa validação esperada.
- Falha não gira a chave, não limpa dados e não cria pedido, reserva ou link. Correção reenvia pela mesma chave; depois de aceite, finalização/novo carrinho continuam conforme [contrato já publicado](CHECKOUT_COMPLETION_LIFECYCLE.md).
- Outros erros críticos, conflitos de tentativa, Auth/Customer, estoque, frete, pagamento e WhatsApp mantêm os seus contratos. Nenhum afrouxamento da validação nem autenticação/consulta de histórico apenas pelo telefone.

## Arquivos

`functions/index.js`; `crm/public/cardapio.html` e três aliases gerados; testes HTTP, Guest e harness de WhatsApp; roteiro visual, checkpoint e evidências. O arquivo `functions/customer-phone.js` **não foi alterado**.

## Verificação e entrega

Testes de formatos brasileiros usuais (nacional, máscara, +55 e fixo válido) e rejeições continuam passando. Novo teste HTTP cobre ambos os modos: telefone inválido → HTTP400 tipado sem pedido/link/estoque; correção com mesma chave → aceite; replay → mesmo pedido, sem duplicidade. Fixtures sintéticas, sem telefone do titular, SMS, pedido/pagamento real ou vínculo.

Infraestrutura local: primeira execução simultânea esgotou memória, interrompendo o build e o emulador; **não contar como PASS**. Testes públicos/unitários passaram; build e integrações afetados são repetidos serialmente, com limites de memória e sem mudar entradas/checks do compilador. Watchers antigos do próprio trabalho foram encerrados; apps do usuário preservados.

[Evidência local](evidence/guest-phone-local/validation.json), [visual sintético desktop/mobile](evidence/guest-phone-local/visual-review.json). Publicação necessária: API + Hosting DEV, preservando Rules/índices/outras Functions e dados. Autorização vigente de publicar os ajustes DEV do checkout; não autoriza transações reais.

Rodada final **248 testes relevantes distintos PASS**: 108 públicos/navegação, 46 unitários/telefone canônico/WhatsApp e 94 emulados (9 arquivos). Sem somar retestes ou a rodada interrompida. Build serial PASS com workers limitados e entradas/checks de compilação preservados; bundle React inalterado (456,38 kB gzip). Lint do delta sem diagnósticos novos, diff-check PASS; fonte/aliases/build idênticos. Seis capturas sintéticas revisadas em desktop/mobile, sem serviços externos. Nenhuma transação real executada pelo agente.

**Aceite manual pendente. Fase 9 100%; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO.**
