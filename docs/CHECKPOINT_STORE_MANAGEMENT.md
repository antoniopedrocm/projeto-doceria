# Checkpoint — gerenciamento de lojas exclusivo Dono

## Estado atual para retomada

**Entrega técnica concluída no DEV; homologação manual Dono PENDENTE.** Não repetir implementação, build ou deploy sem falha nova. PROD não autorizada.

Workspace absoluto: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree.
Branch: feature/infinitepay-customer-auth. Firebase: crmdoceria-9959e.
Base b4cd6b67; commit funcional c3a7bb63cb9210ccd87b383382d7f3fbcadc6612 enviado ao origin.

## Implementado

manage_stores exige papel ORIGINAL dono/owner e não revogado. Admin normalizado como Dono não recebe gestão. Leitura/seleção Staff preservadas por escopo. Nova loja DRAFT/inativa; edição estrutural e de publicação; confirmação de inativação/reativação com readiness; ID imutável; slugs anteriores preservados como aliases. Visão Geral virtual e canais/legado não são entidades editáveis. Telefone/endereço básicos reutilizam info/dados e preservam objetos legados. Configurações próprias de frete/agenda/provider/fiscal não são duplicadas.

Hard delete somente rascunho novo, nunca publicado, vazio e sem dependências comprovadas; nome digitado, revisão/lock, consultas limitadas com falha fechada, sem recursiveDelete, tombstone e auditoria preservada. Documentados limites frente a scripts privilegiados fora dos contratos. Eventos STORE_CREATED/UPDATED/DEACTIVATED/REACTIVATED/DELETE_ATTEMPTED/DELETED append-only server-side. Rules bloqueiam bypass direto/lock e novas vendas em loja inativa; histórico permanece. Proteções estreitas impedem escalada de Admin via criação/edição/reset de Dono nos endpoints Staff. Disponibilidade estrutural agora exclusiva Dono; leitura Staff permanece.

## Verificação local

53 casos na regressão de emuladores; 19 focados finais, sobrepostos; 9 React e 26 Node PASS. Lint sem erros/avisos novos: 65 avisos App.js e um no-control-regex preexistentes; backend focado zero. Rules compiladas com avisos legados, fonte corresponde ao arquivo testado. Build main.60d6a111.js/CSS main.cda549b5.css; sourcemap corresponde à fonte. Sem dependências novas; delta JS gzip 2.382 bytes. Diff-check PASS. Doze capturas reais do componente com respostas fictícias desktop 1920×889/mobile390×800, menu corrigido e sem overflow. Não são sessão Staff autenticada DEV.

## Publicação DEV concluída

Pacotes: .deploy-store-management-c3a7bb63-1/2; Rules .deploy-store-management-rules-c3a7bb63; Hosting .deploy-crm-store-baseline-c3a7bb63. Todos com projeto explícito e guarda de workspace DEV. CLI exit0.

Dez exports ACTIVE, 52 arquivos de runtime conferidos por fonte remota: api, createStore, createUser, updateUser, deleteUser, updateUserPassword, staffGetFulfillment, staffSaveFulfillment, storeManagementRead, storeManagementWrite. Env/secrets iguais ao baseline de cada export; 132 Functions não relacionadas inalteradas. API api-00068-xis. Callables anônimos testados retornam 401, sem escrita. Rules 674db1b8-5757-44cb-b256-5eb25b367e2b, SHA256 8bfe5e618a5c62277fbb30a3fa180ebf0db7fa0ed3f732b3494108e192e5b48a.

Hosting 61/61 hashes, 28 fontes de sourcemap, 52 públicas, cache correto (HTML/stable revalidação, assets hash immutable). Chrome público real Matriz/Garavelo desktop/mobile, direto/refresh sem overflow/pageerror e zero mutações PASS. Dados estruturais das três lojas inalterados; documentos de disponibilidade antecedem o inventário inicial deste workstream. Garavelo entrega já estava habilitada por evento CRM_FREIGHT_SETTINGS em 19:36 UTC, antes do inventário às 20:05 UTC. Estado atual preservado, nenhuma restauração da flag antiga.

Evidências: [validação local](evidence/store-management/local-validation.json), [Functions/Rules](evidence/store-management/functions-dev.json), [Hosting](evidence/store-management/hosting-dev.json), [dados](evidence/store-management/data-dev.json), [Chrome público](evidence/store-management/dev-public-report.json), [capturas locais](evidence/store-management/local-report.json). Baseline remoto privado e logs em %TEMP%/store-management-*; nunca copiar envs/secrets aos docs.

## Única próxima ação

Solicitar aceite visual Dono em Gerenciar lojas desktop/mobile: nomes/ID/status/menu, formulário/readiness e cancelar; abrir confirmação de inativação e cancelar. Visão Geral sem ações e legado/canal protegido. Sem salvar/criar/inativar/excluir lojas reais, pedido, pagamento, nota, SMS/WhatsApp. Se houver conta Admin já disponível, consulta/seleção apenas; negação de mutações comprovada nos emuladores. Após PASS registrar aceite documental e push, sem novo runtime/deploy.

Fase9 75%, Fase11/12 100%, Global95,00%, Fase13 0% preservados. Mercado Pago futuro. Aceite fiscal anterior separado. PROD intacta.
