# C16 — correção dos relacionamentos cliente–loja

Candidato auditado preservado: `67cf340cbef3b78a5a00cc66626b859903918ef3`.
Scan concluído preservado: `04ad2505-eaec-4583-b13c-343e9e7f42f5`.
Branch de correção: `codex/c16-medium-relationships-20261116`.

## Invariante e implementação

Pedidos e metadados de clientes não concedem autorização. O diretório usa vínculos canônicos ACTIVE de `integrations/customerStoreRelationships/links`, com identificador SHA-256 do par `[storeId,customerId]`, schemaVersion, fonte e evidenceRef. As Rules existentes negam leitura/escrita SDK em integrations, inclusive Staff; os testes demonstram criação, alteração e remoção negadas. Não foi necessário alterar Rules.

Fontes automáticas: cadastro realmente novo, criado na transação do registro canônico (nunca telefone existente); checkout STRONG explicitamente selecionado, após validação server-side de contexto, loja e ownership do Customer na mesma transação. Nenhuma rota permite ao Staff emitir vínculos para clientes existentes. Identidade PHONE, pedidos antigos, lojasVisitadas, flags enviadas no body e recibos não constituem prova suficiente.

Listagem e detalhe/aliases consultam a relação atual a cada requisição; cache de perfis foi removido para não servir autorização revogada. Edição confere novamente o vínculo dentro da transação, além do escopo Staff existente. Cadastro de telefone existente, exclusão e troca de cliente no editor de pedido também exigem vínculo. Respostas Staff de cadastro/edição usam projeção permitida, não o documento global bruto.

## Reconciliação de legados — obrigatória antes de rollout

Nenhum dado real foi consultado ou alterado. Clientes, pedidos, endereços, aliases e vínculos Google permanecem intactos. Geral autorizado continua vendo o conjunto canônico. Loja com vínculo revisado continua vendo o cliente; cliente legitimamente multiloja possui um vínculo por loja.

Um cadastro antigo pode ter relação legítima sem prova distinguível de pedido fabricado. Nesse caso o acesso da loja fica negado até revisão; isso é uma pendência explícita de ativação, não uma migração silenciosa ou exclusão. Não publicar a correção antes de reconciliar a cobertura legítima necessária.

Procedimento proposto, sem execução nesta etapa:

1. Preparar inventário somente leitura autorizado, com IDs canônicos, aliases, lojas candidatas e evidências; não exportar credenciais ou perfis completos.
2. Separar prova independente de dados SDK: evidência financeira server-owned vinculada ao pedido/loja/cliente, registros confiáveis anteriores, ou confirmação documentada do responsável. Pedido ou loja de cadastro isoladamente não bastam.
3. Revisar conflitos e clientes multiloja. Sem prova suficiente, manter pendente e pedir confirmação do responsável; não inferir nem apagar.
4. Aprovar manifesto com pares canônicos, referências de prova, revisor e hash do conjunto; revisar a correspondência dos aliases. Preservar histórico e versões anteriores do manifesto.
5. Somente após autorização, executor Admin controlado grava vínculos REVIEWED_LEGACY com evidenceRef para o manifesto aprovado. Não expor endpoint de concessão ao Staff nem importar pedidos cegamente.
6. Conferir cobertura, negativas e revogações no DEV, revisar independentemente e só então avaliar promoção. Qualquer aplicação PROD exige autorização específica.

## Validação e limites

Erro inicial do emulador: MissingResourceException de JValidationMessages no locale pt_BR. Resolvido exclusivamente com `-Duser.language=en -Duser.country=US` no processo Java. Nenhuma configuração global alterada.

Rodada em inglês: 50/51 PASS; falha no harness VM (Promise de outro realm). Ponte para Promise nativa e adaptador db.doc corrigidos; repetição somente do teste afetado: 1/1 PASS. Asserções incluem acesso negado, edição legítima e revogação entre leitura e transação. Total das 51 verificações coberto; a primeira rodada falha permanece preservada.

Regressões direcionadas: 37/37 PASS. Públicos C16: 34/34 PASS. Lint functions: PASS; lint explícito dos seis arquivos alterados/novos: 0 erros, 1 warning no-loop-func no teste. Build CRM DEV: PASS, artefatos somente no diretório temporário, warnings de dependências/source maps e Browserslist. Syntax e diff-check PASS. Diff contém somente código, testes e este checkpoint; nenhum dotenv, certificado, credencial ou arquivo de Secrets incluído. Revisão final de bypass/regressão sequencial concluída, sem substituir revisão independente.

Riscos: maior custo/latência de leitura sem cache; limite de inventário continua fail-closed. Vínculos legados exigem reconciliação autorizada antes de ativar. Testes sintéticos não equivalem a homologação de dados reais nem auditoria independente. Revisão de bypass/regressão feita sequencialmente pelo agente principal, sem delegação.

Nenhum scan novo, push, deploy, pagamento, SMS ou WhatsApp. C16 PENDENTE. Fase 10 93,75%; global 97%; Fase 13 0%; PROD READY NÃO. Parar antes da auditoria Astra Low.
