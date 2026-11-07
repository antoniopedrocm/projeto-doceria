# C15-G — caso Google indicado, final 8602

## Estado vigente — 07/11/2026: acesso Google existente homologado

Titular conectou a conta pelo perfil Chrome separado **Ana Beatriz**. Executor localizou essa instância específica e não operou as sessões do Antonio. [Evidência do navegador](evidence/phase10-google-8602-browser-dev.json): perfil com **2 endereços**, histórico com **1 pedido**, refresh de `/minha-conta` e `/meus-pedidos`, detalhe com item/totais, retorno para `/cardapio-matriz` e atalho dual-role **PASS**. Saída a partir dos pedidos concluiu; refresh permaneceu desautenticado, sem sidebar privada ou loading preso. Reentrada pelo Google, selecionando a própria conta já disponível no seletor autorizado, restaurou 2 endereços/1 pedido/detalhe e atalho CRM, **sem SMS ou novo claim**. Não foram digitadas/extraídas credenciais. Sessão deixada autenticada no cardápio Matriz, carrinho 0 preservado. Nenhuma configuração de viewport foi aplicada.

[Conferência posterior de dados](evidence/phase10-google-8602-data-preservation-dev.json): **8/8 verificações PASS**; Customer original e sua versão integral inalterados, mesmo único owner, índices UID/telefone corretos, versão/referência do pedido idêntica à pré-checagem. As queries projetadas da CLI falharam HTTP 500 nas duas tentativas somente leitura; fallback pelo conector Firebase fez **4 leituras mascaradas pontuais**, sem ler payload completo de endereço/pedido, e concluiu a comparação. O caminho do pedido foi obtido do botão já autorizado na UI, sem supor loja. Não tratar falha de transporte da auditoria como falha de login da aplicação.

Uma abertura de detalhe durante a hidratação inicial voltou à lista antes da espera pelo conteúdo; nova abertura com sessão estabilizada e outra após reentrada, com lista `aria-busy=false`, carregaram corretamente. Causa não estabelecida, sem patch funcional presumido; observação preservada na evidência para C16 caso reapareça. Não chamar a tentativa inicial de PASS nem inventar correção.

Capturas públicas, sem perfil/endereço/pedido: [saída](evidence/phase10-google-8602-signed-out-dev.jpg), [retorno](evidence/phase10-google-8602-return-dev.jpg). Dados privados só foram observados por contagens/estado; contatos completos, tokens, UID e conteúdo de pedidos não foram incluídos em evidência versionada.

**Acesso Google de owner existente: PASS. Primeiro claim Google de legado sem owner: NÃO DEMONSTRADO.** A reentrada não criou uma nova prova de telefone nem evento de claim. Não confundir os dois resultados ou encerrar C15 automaticamente. C15-E permanece integralmente PASS. Para avançar usando o mesmo caso, primeiro delimitar formalmente como demonstrar o claim Google sem remover ownership existente ou alterar a regra de segurança; eventual reverificação do próprio owner deve ser identificada como tal e não como primeira aquisição. Nenhum novo SMS foi executado ou reservado por esta etapa. C15 geral/C16 continuam pendentes; Fase 10 87,50%, global formal 97,00%, Fase 9 100%, Fase 13 0%, PROD não autorizada.

## Pré-checagem anterior em 07/11/2026 — histórico preservado

O Dono indicou telefone final **8602** e conta `a***@gmail.com`, pedindo todos os testes necessários com o mesmo par para evitar outro telefone. A indicação foi aceita para investigação e validação DEV; não autoriza desfazer owners, trocar identificadores, fabricar um novo legado, ignorar conflito, criar pedidos/pagamentos ou publicar PROD. Nenhum SMS/claim foi necessário ou executado nesta preparação.

O cenário e-mail/senha anterior foi aceito integralmente pelo titular com **“PASS demais checks”**: endereço e 2 pedidos, refresh e logout/relogin sem novo claim/SMS; retorno já tinha PASS. [Aceite C15-E](evidence/phase10-c15-email-acceptance-dev.json). Não repetir a prova final 0811, cujo limite está consumido.

## Pré-checagem somente leitura

Worktree DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, base `565e3d53`, sem delta tracked inicial. Conector Firebase confirmou Project ID **`crmdoceria-9959e`**. Consultas da CLI usaram projeção de campos para não recuperar credenciais ou payloads completos. Os contatos completos e referências privadas ficam fora de Git; evidências contêm sufixo, caseId opaco, fingerprints e contagens.

| Verificação | Resultado |
|---|---|
| Customer selecionado | CaseId `577ace8fc6bcfb4d`, CANONICAL, registry e índice READY, telefone consistente |
| Ownership | **1 proprietário, a própria conta indicada**; associação já existente antes desta missão |
| Auth | Conta habilitada, providers Google e password no mesmo UID; isso não significa dois claims independentes |
| Registry | 1 mapping UID e 1 mapping de identidade **Google**, apontando ao mesmo Customer |
| Subject Google | Conferido com o identificador do provider, não com o UID Firebase; mapping correto |
| Dados históricos | **2 endereços, 1 pedido por loja**, sem referências conflitantes nas consultas projetadas |
| SMS DEV Matriz | Configuração presente e destinatário já liberado; sem alteração da allowlist e sem teste de envio |
| Prova permanente por SMS | Nenhum challenge/audit de claim encontrado para o UID; `phoneOwnership` e `phone_verified_at` ausentes |
| Customer original | Não foi alterado, desvinculado ou recriado |

[Cadastro](evidence/phase10-c15-candidate-8602-dev.json), [destino Auth](evidence/phase10-c15-destination-8602-dev.json), [proveniência do vínculo](evidence/phase10-c15-8602-existing-link-dev.json). Ausência de metadados de prova não é motivo para apagar ownership legítimo já existente nem para conceder acesso a outro UID. No helper inicial de proveniência, a chave Google foi procurada usando UID Firebase; a conclusão de ausência foi descartada e substituída por query por UID e comparação com o subject real do provider. Não houve escrita remota ou mudança funcional para essa correção do diagnóstico.

A primeira consulta do helper de cadastro terminou sem resultado registrado; a repetição somente leitura concluiu com as contagens acima. Nenhuma operação mutante, requisição de SMS ou tentativa de claim foi repetida.

## Cobertura possível com o mesmo caso

Validar login real com Google, mesmo Customer, histórico/endereço, refresh, logout/relogin e origem do cardápio; comparar fingerprints dos dados antes/depois. Preservar sessões de outras contas. O Chrome disponível apresentou outro Customer, e o navegador integrado apresentou outra conta; ambos foram preservados, sem logout/troca. A tab temporária criada pelo agente foi fechada.

Foi solicitado ao titular login Google em sessão separada e confirmação de 2 endereços/1 pedido, sem salvar dados, SMS ou compra. **Login do caso indicado e aceite de UI ainda não observados.** A primeira vinculação de um legado sem owner **não é reproduzida** por reentrar neste cadastro já vinculado. Testes sintéticos Google/password já existentes continuam válidos, sem serem promovidos a claim real.

O backend de claim admite prova do próprio UID proprietário (`customer-phone-claim.js`/`attachVerifiedClaim`), mas o onboarding normal reconhece o vínculo e não exige esse fluxo (`createForStrong`/`account`). Não foi criada tela de teste, chamada autenticada artificial, bypass ou alteração de Auth para forçar uma prova. Mesmo uma reverificação do mesmo owner não demonstra a primeira aquisição de ownership; não apresentar esse resultado como tal.

## Próximo ponto exato

1. Receber login Google/resultado do titular e validar o acesso existente no caso 8602.
2. Conferir preservação de Customer, endereço/pedido e mappings sem reaplicar vínculo ou enviar SMS desnecessário.
3. Registrar a cobertura real e a lacuna do primeiro claim Google de forma separada. Se a rubrica C15 continuar exigindo primeira recuperação independente de legado sem owner, este caso preexistente não a satisfaz. Qualquer proposta de revisão formal do aceite deve preservar essa limitação e depender de decisão do Dono; não alterar o critério ou ownership silenciosamente.
4. C16 continua posterior ao aceite integral de C15. Não declarar produção pronta nem iniciar Fase 13 com base na indicação do caso.

**Fase 9 = 100%; Fase 10 = 87,50% (14/16); global formal = 97,00%; Fase 13 = 0%; PROD READY: NÃO.** E-mail/senha concluído é um subcenário de C15, não um novo critério inteiro.
