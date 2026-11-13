# C15-G — primeiro vínculo Google de legado

## 13/11/2026 — C15 encerrado: primeiro vínculo Google e continuidade aprovados

**C15 PASS; Fase10=93,75% (15/16). C16 permanece PENDENTE. Fase9=100%; global ponderado=97,00%; Fase13=0%; PROD READY:NÃO.** Titular aprovou1endereço/2pedidos/detalhes,refresh,logout/relogin Google sem novoSMS/claim,retornoMatriz e ausência de menus administrativos. Leitura posterior confirmou16pós-condições técnicas, mesmo Customer/20documentos/2pedidos/1endereço,owner Google/mappings corretos e única auditoria, sem duplicidade. E-mail/senha já PASS preservado. [Aceite consolidado do caso](evidence/phase10-c15-google-20261113/acceptance.json).

A trilha preserva2solicitações SMS (10h04 expirada;11h38 solicitada/11h39 consumida). Titular confirmou a solicitação das11h38. O limite inicial era1; diferença registrada, sem autorização retroativa presumida e sem envio/claim por ferramenta. Não reenviar nem refazer vínculo: Customer agora proprietário. C16 não é fechado automaticamente; próximos gates são aceites complementares, consolidação/versionamento DEV e revisão aplicável. Sem novo runtime/build/deploy,commit/push ou acesso PROD para registrar o aceite. Estados anteriores abaixo são históricos.


## Atualização vigente — 13/11/2026, 11h44 Brasília

**PRIMEIRO VÍNCULO GOOGLE TÉCNICO: PASS. ACEITE FINAL UI: PENDENTE.** Titular confirmou SMS recebido, campo exibido e código confirmado na própria aplicação. [16pós-condições PASS](evidence/phase10-c15-google-20261113/after-technical.json): mesmo Customer original, único owner Google, mappingUID/identidade corretos, índice/telefone verificado,20Customers preservados,2pedidos originais/1endereço/loja/campos legados intactos, nenhuma duplicidade/privilégio administrativo, único claim válido consumido e única auditoria.

Trilha completa: primeira solicitação10h04 expirou sem confirmação; segunda11h38 consumida11h39, tentativa1. Sem outro challenge ativo. A autorização inicial era até1SMS; confirmação da origem do segundo envio foi solicitada e permanece pendente. Não ocultar dois registros nem tratar confirmação como autorização retroativa. Agente0solicitações/0claims por ferramenta. O cadastro agora já tem owner: **não repetir recuperação, remover owner ou solicitar outro SMS para teste**.

O diagnóstico auxiliar inicial foi retido em `after-technical-initial-audit.json`: consultava mapping por UID cru, enquanto o contrato usaSHA256, e confundia1claim consumido com1registro total de challenge. A verificação passou a reutilizar `createCustomerRegistry().uidRef`, manter o histórico expirado e verificar1consumo válido/1auditoria; nenhum runtime ou dado remoto foi corrigido para satisfazer o teste.

Aguardar aceite humano de endereço/pedidos/detalhe/refresh/logout/relogin/retornoMatriz/ausência de menusStaff e esclarecimento do segundo envio. C15 geral/C16 seguem pendentes, Fase10=87,50%, global97,00%. Seções anteriores são fotografias históricas; o bloqueio atual não é ausência de vínculo.

## Atualização vigente — 13/11/2026, 10h11 Brasília

**Único envio autorizado solicitado; desafio expirado, sem vínculo.** Backend registrou Status200/Start200 e1challenge Google do Customer original na Matriz, `sent` com0tentativas. Criado10h04min45s, expirado10h09min45s; owner0. Não há confirmação de entrega ao celular ou de campo de código visível. Relato "botão não acontece nada" ainda exige informação do titular; não assumir falha específica do Edge ou do provedor.

Saldo autorizado0: não reenviar, não orientar código antigo nem fabricar claim pelo Admin. Nenhuma nova alteração funcional/deploy ou operação real pelo agente nesta investigação. Aguardar resposta sobre recebimento/campo/mensagem, preparar correção comprovada se necessária e somente depois delimitar autorização para eventual novo SMS. [Metadados](evidence/phase10-c15-google-20261113/claim-request-metadata.json), [estado/orçamento](evidence/phase10-c15-google-20261113/sms-budget.json). C15-G/C16 pendentes; Fase10=87,50%, global97,00%, Fase9=100%, Fase13=0%. Seções anteriores são baseline e execução histórica; não repetir seus passos de envio.

## Estado em 13/11/2026

**PRÉ-CHECK: PASS. VÍNCULO E HOMOLOGAÇÃO: PENDENTES.** Caso `a403670c5b1f4151`, celular final1755, selecionado pelo Dono e confirmado pelo próprio titular. Contato completo, Customer ID e baseline privada permanecem fora do Git.

- DEV `crmdoceria-9959e`, worktree `infinitepay-auth-worktree`, HEAD `7e7d7b69` mais delta anterior preservado.
- Customer canônico original, nenhum owner/UID/identidade; telefone válido e índice READY.
- 2 pedidos finalizados Matriz de R$ 12 e R$ 16, 1 endereço legado; nenhuma referência conflitante na pré-checagem.
- Conta Google legítima indicada ainda ausente no Firebase Auth DEV antes do login interativo.
- Titular autorizou login Google, liberação somente desse destinatário, até1SMS e primeiro vínculo ao Customer original após prova correta. Sem pedido/pagamento/alteração de perfil/endereço/PROD.
- Baseline privada em Temp e [evidência sanitizada](evidence/phase10-c15-google-20261113/before-and-authorization.json). Uma escrita transacional da allowlist Matriz (3→4), demais dados preservados; Enterprise confirmado pelo helper de proteção existente.
- 0 SMS/0 claims pelo agente. Não existe autorização para reenvio automático.

## Login Google conferido — vínculo ainda não realizado

Titular entrou na própria máquina. Leitura Auth confirmou provider `google.com`, conta ativa e nenhum perfil/claim administrativo. Nenhum mapping UID/identidade apontava a Customer; o Customer original continuava sem owner e o total permaneceu em 20 documentos. Zero challenges SMS encontrados. Esse estado comprova autenticação Google, **não** aquisição de ownership; nenhum PASS C15 foi concedido.

Orientado o fluxo existente Minha Conta → Nome/Celular com DDD → Salvar e continuar → Confirme seu número. Somente o titular pode solicitar o único SMS autorizado e confirmar o código na aplicação. Se a UI não apresentar essa etapa, registrar diagnóstico antes de qualquer alternativa. Imagens não são necessárias salvo impedimento; não receber credenciais/código pelo chat.

## Sequência restante

### Impedimento encontrado no Edge e correção local

O titular abriu `/area-cliente?returnTo=%2Fcardapio-matriz`, completou telefone e encontrou "Selecione uma loja para continuar" sem seletor. O modal não consumia o return path público validado; sem carrinho, perdia o storeId. A listagem relativa `/api/store/public-list` retornava HTML da SPA no Hosting. Falha anterior ao SMS, sem challenge ou aquisição de ownership; não atribuir a causa aos avisos de popup do console ou ao Edge sem evidência.

Correção mínima em `crm/public/customer-phone-claim.mjs`: reutiliza allowlist/resolução de origem existentes; consulta listagem pela base de API do ambiente; contexto sem loja falha seguro, sem fallback Matriz; storage indisponível e respostas tardias tratados. Nenhuma alteração de Auth/OTP/ownership/backend financeiro.34testes locais, lint/sintaxe/diff PASS. Artefato isolado preserva21arquivos runtime do overlay anterior; build/publicação Hosting DEV em andamento. [Diagnóstico e limites](evidence/phase10-c15-google-20261113/origin-fix-validation.json).

**Aguardar publicação antes de repetir o clique.** O orçamento continua até1SMS; o envio não foi iniciado. Não repetir login Google/seleção do titular/allowlist/vínculo. Validação física Edge e mobile pendentes; não declarar todas as marcas/modelos homologados por testes jsdom.

### Publicação verificada — reteste do titular pendente

Hosting DEV `22c9613fe531a63f`, em13/11/2026,61/61arquivos conferidos remotamente. Build isolado completo PASS; para restringir a publicação à correção, o pacote usa os61arquivos verificados do release anterior com substituição apenas do módulo ESM público.60arquivos/bundle `main.0ada6298.js` preservados; nova referência a `store-links.mjs`/`checkout-environment.js` já consta no pacote. API `api-00079-xid` e Rules inalteradas, três rotas públicas HTTP200. Sem commit/push, backend novo, Rules, PROD ou SMS pelo agente.

Titular orientado a recarregar a mesma aba Edge comCtrl+F5, completar telefone e solicitar uma única vez o SMS já autorizado; a resolução deve usar Matriz, sem seletor. Aguardar prova e pós-condições; não marcar C15 por publicar. [Verificação](evidence/phase10-c15-google-20261113/origin-fix-validation.json), [61arquivos](evidence/phase10-c15-google-20261113/origin-fix-published-files.json).

1. Titular entra com Google em sessão separada pelo cardápio Matriz e para antes de enviar SMS.
2. Conferir provider/UID, ausência de vínculos cruzados ou privilégios administrativos e Customer original ainda sem owner; nenhuma associação só por e-mail/nome/telefone.
3. Orientar um único envio autorizado; código digitado/confirmado exclusivamente pelo titular na aplicação. Consultar challenges antes de qualquer retomada; não repetir start por ambiguidade.
4. Conferir owner/UID/identidade/índice/challenge consumido/auditoria e preservação de campos, pedidos/endereço/loja; nenhum Customer/pedido duplicado.
5. Titular aprova1endereço/2pedidos, refresh, logout/relogin Google sem novo SMS/claim e retorno Matriz. Não salvar nem executar compra.
6. Somente com evidências técnica e humana completas: C15-G/C15 PASS, Fase10=93,75% (15/16). C16 permanece separado; global=97,00%.

## Indicadores preservados

Fase9=100%; Fase10=87,50% (14/16); global formal=97,00%; Fase13=0%; PROD READY:NÃO. Nenhum novo código funcional/build/deploy é necessário apenas para essa prova. C15-E e acesso Google já proprietário continuam PASS.
