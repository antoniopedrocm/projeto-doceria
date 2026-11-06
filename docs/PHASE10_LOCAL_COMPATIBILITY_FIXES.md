# Fase 10 — correções pontuais locais para revisão

Atualização posterior: proprietário recebeu os resultados, pediu continuação e autorizou deploy DEV conforme necessário. O registro local abaixo e a evidência de 417 testes são preservados como fotografia anterior à publicação. Continuação em [PHASE10_DEV_RELEASE.md](PHASE10_DEV_RELEASE.md); sem autorização de SMS, vínculo real ou PROD.

05/11/2026. Base `1a0ede75`, branch `feature/infinitepay-customer-auth`, workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. Destino futuro permitido: DEV `crmdoceria-9959e`. **Sem commit, push, deploy, consulta/escrita remota, SMS real ou claim real nesta execução.** Todos os vínculos exercitados nos testes são sintéticos, em memória ou em emuladores locais `demo-*`.

Autorização: proprietário aprovou a OPÇÃO B e as três correções locais; exige revisão dos resultados antes de commit/push/deploy. Esta entrega não reinicia a fase nem substitui a homologação C15.

## Comportamento anterior e corrigido

| Área | Antes | Correção local |
|---|---|---|
| Índice ausente | `resolvePhone` interpretava ausência de índice como telefone novo, mesmo com Customer legado existente | Consulta transacional limitada aos campos de telefone/status; Customer único consistente é reutilizado; ambiguidade/incompletude/falha impede criação |
| Cliente realmente novo | Criação transacional pelo telefone | Continua permitida quando a leitura completa dentro do limite não encontra telefone equivalente; formato nacional/E.164 compartilha a chave |
| Claim de legado sem índice | Cadastro podia ser duplicado antes da prova | Retorna `claimRequired`, sem vínculo ou alteração do Customer; índice é reparado na transação do claim válido. Owner já legítimo pode reparar o índice no onboarding sem mudar o ID |
| Endereços antigos | Perfil/CRUD liam apenas `enderecos` | Reutiliza `historicalAddresses` quando não há array persistido; IDs virtuais estáveis; leitura não escreve; edição autorizada preserva os campos-fonte |
| Endereço excluído | Risco de uma compatibilidade ingênua reintroduzir fonte antiga | Array `enderecos` existente, inclusive `[]`, é autoridade; excluir o último endereço virtual persiste `[]` e impede ressurreição |
| Histórico alternativo | Consulta e autorização exigiam `clienteId` | OR entre `clienteId`, `customerId`, `clientId`, sempre no contexto canônico autorizado; todas as referências presentes devem pertencer à mesma família revisada |
| Pedidos root | Precisavam de referência revisada e vínculo reconhecido | Mantém `legacyOrderPaths` obrigatório e passa a reconhecer os campos alternativos; pedido root não revisado permanece privado |

Nenhum ID legado, pedido, valor financeiro, item ou endereço-fonte é renomeado, copiado ou migrado automaticamente. Não se libera ownership pela digitação de telefone ou pelo e-mail/Google isolado. Owners existentes, leases/consumo da prova, limites de envio e regras de Auth permanecem nas camadas existentes.

## Arquivos

- `functions/customer-registry.js`: fallback transacional de localização/ausência e reparo pontual do índice somente na escrita autorizada.
- `functions/checkout-auth.js`: compatibilidade de leitura e CRUD de endereços virtuais; telefone de contato aceita o campo legado `phone_number` quando `telefone` está ausente.
- `functions/customer-orders.js`: referências alternativas com concordância obrigatória, deduplicação por caminho e preservação dos limites/cursor/owner/loja.
- `firestore.indexes.json`: dois índices de campo de grupo `pedidos`, para `customerId` e `clientId`, equivalentes ao existente de `clienteId`; somente definição local.
- `functions/customer-legacy.test-fixture.js`: double em memória com transações serializáveis/commit atômico e falha injetada; sem rede/cliente SDK/credenciais.
- `functions/customer-legacy-compat.test.js`: 19 testes novos com mocks.
- `functions/customer-phone-claim-emulator.test.js`: três cenários adicionais com SDK real no Firestore emulado (Google, e-mail e corrida de dois UIDs).
- `functions/customer-orders.test.js`: mock de consulta adaptado ao OR real, preservando asserções de autorização/paginação/limites.
- `crm/tests/customer-account-styles.test.cjs`: asserção desatualizada passou a reconhecer somente a exceção CSS exata já homologada em `a4a5cdfe`, com uma única declaração `overflow-wrap:anywhere`. CSS e UI não foram alterados.
- `functions/checkout-addresses-emulator.test.js`: expectativa antiga de bloqueio de Online por telefone foi alinhada ao contrato já publicado em `b5892db3`; requisição sem chave de idempotência deve retornar 400 e não criar pedido. Checkout e integrações financeiras não foram alterados.
- `docs/CHECKPOINT_PREPROD_MISSION.md`, `docs/INFINITEPAY_PROJECT_PLAN.md` e `docs/PHASE10_LEGACY_RECOVERY_AUDIT.md`: estado local para revisão, sem alterar percentuais/aceites anteriores.
- `docs/PHASE10_LOCAL_COMPATIBILITY_FIXES.md`: este relatório de comportamento/arquivos/riscos.
- `docs/evidence/phase10-local-compatibility-2026-11-05.json`: resultados finais, retestes, hashes de fonte e limites da evidência sintética.

## Segurança e limites residuais

1. O fallback só roda quando o índice não existe. Faz uma projeção de `telefone`, `phone_number`, `normalizedPhone`, `canonicalStatus`, limitada a 1.001 candidatos para detectar excesso, na mesma transação. Até 1.000 documentos completos permitem concluir a ausência. Acima disso ou em falha de leitura retorna regularização controlada; não declara um telefone novo sem cobertura. Não há scan ilimitado nem migração em massa. A leitura adicional tem custo e latência; telefones já indexados mantêm o caminho direto.
2. Número ausente/inválido sem correspondência comprovável não é inferido. Aliases sem índice, múltiplos candidatos ou campos contraditórios exigem revisão; não escolhemos o primeiro resultado. Os remanescentes C14 permanecem preservados sem atribuição.
3. O protocolo pressupõe escritores canônicos existentes. Alterações externas que ignorem os mecanismos do registry exigem nova conferência; não se promete integridade de uma base PROD não consultada.
4. O array de endereços existente é autoridade. Fontes `endereco`/`address` são apresentadas somente sem esse array; não são atribuídos endereços órfãos nem inventadas coordenadas/número/default.
5. O histórico continua limitado a 30 IDs revisados, páginas de 20 e 1.000 candidatos físicos. Referências incompatíveis, `ownerUid` estrangeiro, caminho inválido ou root não revisado são recusados. A busca nunca usa telefone como autorização e ignora IDs de Customer fornecidos na requisição.
6. Emuladores não provam disponibilidade/índices/latência no DEV remoto e não substituem o titular real ou SMS Enterprise de C15. A publicação futura precisa aguardar os novos índices antes das Functions afetadas. Hosting e Rules não foram alterados.

## Validação

Resultados finais e limites em [evidence/phase10-local-compatibility-2026-11-05.json](evidence/phase10-local-compatibility-2026-11-05.json): **164 unidades, 153 públicos e 100 emulados = 417 testes aprovados**, considerando o último resultado de cada teste e sem somar repetições. Incluem **22 cenários novos** (19 com mocks, 3 com SDK real emulado). As execuções iniciais identificaram duas expectativas antigas (escopo CSS e Online por telefone), atualizadas sem alterar os respectivos runtimes; os retestes focados passaram (1 teste CSS e 9 testes de endereços/checkout). Lint/sintaxe/diff-check PASS; avisos de idade de metadados das dependências preexistentes não exigem atualizar bibliotecas nesta tarefa.

Emuladores iniciados exclusivamente em localhost, projeto `demo-doceria-checkout` e namespaces de testes `demo-*`. Java 25 e a primeira tentativa com Java 21 falharam no socket Unix local do Windows; seleção de Java 21 e fallback TCP limitados ao processo de teste permitiram a execução. Nenhuma configuração persistente do sistema/firewall foi alterada. Serviços de teste encerrados ao final. Não houve build frontend: nenhum fonte/bundle de UI foi alterado; a validação do backend inclui carregamento/sintaxe e testes reais do SDK emulado.

Reproduções de Google/e-mail comprovam Customer original único, prova com propósito próprio, preservação dos dados e resolução posterior por UID; as corridas comprovam um vencedor, sem duplicidade de ownership/auditoria. Falha de commit não altera Customer/mappings/índice; a tentativa controlada posterior pode concluir. Históricos e fontes de endereços são comparados antes/depois. Não declarar login/OTP real por causa de mocks.

## Próximo ponto

**Aguardar revisão do proprietário antes de commit, push ou deploy.** Para disponibilizar a correção, futuramente serão necessários índices e Functions DEV que importam os módulos afetados; a lista seletiva deve ser conferida na preparação desse release. Sem necessidade de Hosting por este patch.

C15 ainda exige casos/titulares legítimos, aprovação específica de vínculo permanente e novo SMS. C16 depende do aceite consolidado efetivo. **Fase 9 = 100%; Fase 10 = 87,50% (14/16); global formal = 97,00%; Fase 13 = 0%; PROD READY: NÃO.** Os 14 critérios concluídos e suas evidências permanecem registrados.
