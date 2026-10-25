# Customer canônico por telefone — pré-PROD / DEV

Estado: **CONCLUÍDO E HOMOLOGADO NO DEV — ACEITE MANUAL CONSOLIDADO EM25/10/2026**. Fase9=75%, Fase11=100%,
Fase12=100% histórico, Global95,00%, Fase13=0%. Não iniciar produção.
Workspace C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree;
branch feature/infinitepay-customer-auth; somente crmdoceria-9959e.

## Decisões e autorização

- Telefone normalizado é chave de unicidade de negócio; customerId continua
  técnico/imutável. Nenhum telefone público vira autenticação/ownership.
- Resposta do usuário: **primeiro cadastro forte de telefone livre SEM SMS**.
  Não impor OTP adicional nesse primeiro vínculo. Índice e Customer/identity
  novos precisam ser criados atomicamente, sem conflito com contato já existente.
- Telefone existente e identidade ainda não vinculada: SMS com finalidade própria
  antes de reivindicar histórico de Customer sem vínculo. Prova deve estar vinculada
  ao UID forte solicitante, telefone, alvo, nonce e prazo. Grant de endereço/perfil
  básico NÃO possui esse escopo e não pode ser promovido silenciosamente.
- Outro UID já proprietário: não unir automaticamente por telefone/SMS; exigir
  prova da conta existente ou revisão manual. Isso também impede que um primeiro
  cadastro com telefone alheio conserve acesso automático a histórico de outra
  identidade que apareça depois. Link de providers no mesmo UID não cria Customer.
- Grupo final0290: usuário declarou que os5 registros são da mesma pessoa e pediu
  **proposta detalhada para revisão**. Em25/10/2026 aprovou explicitamente sua aplicação no DEV.
  Preservar os3 UIDs; nenhum usuário Auth/provider/role Staff será apagado/mesclado.
- Autorização anterior de UM SMS final8602 para testar edição continua sem envio
  comprovado; não repassá-la a claim de identidade, Thiago ou outro telefone.

## Auditoria somente leitura — 24/10/2026

Firestore(default) STANDARD, main Auth167 usuários (só metadados necessários
examinados; senhas/hashes/tokens nunca salvos). Snapshot privado temporário
fora do Git/Hosting em customer-phone-audit-20261024 na pasta TEMP do operador.
Relatório permanente deve conter máscaras/referências, nunca endereços/documentos
ou e-mails completos. Nenhuma escrita remota realizada nesta auditoria.

| Medida | Resultado |
|---|---:|
| Documentos clientes | 18 |
| Com algum telefone | 15 |
| Sem telefone | 3 |
| Telefone inválido | 1 |
| Registros com telefone Brasil válido | 14 |
| Telefones válidos distintos | 10 |
| Telefones com duplicidade | 1 |
| Registros no grupo duplicado | 5 |
| Telefones sem duplicidade | 9 |
| Clientes com array enderecos | 8 |
| Endereços nesses arrays | 19 |
| Clientes com endereco/address histórico singular | 6 |
| Documentos globais enderecos sem vínculo comprovado | 3 |
| Identity links fortes | 4 |
| Customers com vínculo forte | 4 |
| Pedidos lidos | 91 |
| Pedidos por loja | 53 |
| Pedidos globais antigos | 38 |
| Pedidos globais sem loja informada | 38 |
| Pedidos com ID de Customer | 90 |
| IDs de pedido repetidos entre documentos | 0 |

Modelos encontrados: clientes globais; customerAuthIdentities; enderecos globais;
pedidos globais; lojas/{id}/pedidos. Não foram encontrados Customers em customers,
clients, Customer ou cadastros, nem subcollections sob os18 clientes. Lojas usam
clientes globais; não criar Customer/endereço por loja. Cupom/relacionamentos
adicionais foram conferidos:1 cupomUsos e3 referências em2 clientes. Não somar métricas cegamente.

### Thiago / final1755

Um Customer (referência de auditoria C07), sem UID vinculado. Campo endereco e
address.street contêm o mesmo logradouro; address também tem zip/city/cityCode/
district/state. Dois pedidos por ID. Não possui array enderecos. O lookup atual
lê apenas esse array, portanto ignora o endereço histórico. Não há justificativa
para criar outro Customer ou exigir recadastro. Recuperar pelo modelo comprovado,
com ID determinístico, máscara e destino completo somente no backend.

### Grupo final0290 — proposta aprovada e aplicada em25/10/2026

| Ref. da auditoria | Identity | Endereços no array | Pedidos por ID |
|---|---|---:|---:|
| C02 | UID f8c3811e79e7, Google + senha | 3 | 9 |
| C04 | UID 1edb24d4de68, senha | 2 | 0 |
| C08 | UID f0a2495855cd, senha | 0 | 0 |
| C18 | Sem UID | 4 | 32 |
| C06 | Sem UID | 5 | 23 |

UIDs acima são fingerprints, não credenciais/IDs completos. Todos existem no
Auth principal e estão ativos. Há65 pedidos relacionados por ID OU telefone;
64 têm referência direta a algum desses Customers. A referência apenas por
telefone não é autorização para liberar o pedido restante sem revisão.
C18 possui dois flags de default. Campos históricos singulares também devem
ser preservados, com deduplicação somente inequívoca.

Candidato para proposta: C02, por já suportar Customer A/fluxo forte homologado,
Google+senha e pedidos com ownership forte. Não escolher só por quantidade ou
data. Preservar default canônico atual e registrar defaults divergentes; não
apagar flags/originais dos aliases. Proposta final precisa detalhar todos os
endereços/aliases/UIDs/métricas/conflitos antes de qualquer aplicação nesse grupo.

## Modelo / normalização

Função única implementada: normalizeCustomerPhone, chave E.164 +55 e forma nacional
de compatibilidade. Validar DDD alocado, celular9 dígitos começando9 e fixo8
dígitos começando2–5. Não acrescentar dígito9, DDD ou país por heurística; não
aceitar países estrangeiros/troncos/ramais como formato equivalente.

Fontes: [Plano brasileiro](https://www.gov.br/anatel/pt-br/regulado/numeracao/plano-de-numeracao-brasileiro),
[perguntas da Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/perguntas-frequentes),
[códigos nacionais](https://www.gov.br/anatel/pt-br/regulado/numeracao/codigos-nacionais).

Índice implementado em integrations/customerRegistry/phones/{SHA256(E164)}, com
state READY ou MANUAL_REVIEW_REQUIRED, normalizedPhone e customerId. Raiz
integrations já é privada nas Rules, sem abrir índice ao visitante/Customer/Staff.
Aliases e UIDs de resolução também privados, não dados controláveis pelo browser.
Não substituir customerId por telefone e não pesquisar identidade forte por e-mail.

## Criação, resolução e vínculos

- Índice + Customer novo + vínculo forte (quando primeiro cadastro) em transação.
  Segunda criação concorrente reutiliza/recusa o existente, nunca gera duplicado.
- Customer existente: resolver ID canônico/aliases; não sobrescrever perfil com
  payload de quem apenas digitou o telefone. Auth forte só recebe histórico após
  vínculo comprovado/autorizado. Primeiro UID não verificado não ganha acesso a
  dados futuros de outro UID automaticamente.
- Mudança real de telefone fica bloqueada até fluxo seguro próprio: strong Auth,
  prova do novo número e troca atômica do índice. Formatação equivalente é a mesma
  chave. Auditar caminhos Customer/CRM/callables, não apenas esconder input.
- Rules precisam impedir escrita direta de Customer/telefone/aliases que contorne
  a transação. CRM já usa API para CRUD; preservar permissões Staff, sem API pública
  de alteração de cadastro. Não publicar Rules antes dos testes relevantes.

## Endereços, aliases, histórico e privacidade

Adicionar compatibilidade somente para campos comprovados. Preservar arrays e
apelidos válidos/defaults/IDs. Sem SMS, apenas projeção mascarada e seleção por ID
opaco; destino real resolvido server-side. Não atribuir os3 enderecos globais sem
vínculo. Não apagar endereços parecidos nem deduplicar por geocoding aproximado.

Pedidos ficam nos documentos originais: root pedidos e lojas/{id}/pedidos.
Nenhum preço/frete/desconto/status/data/pagamento/snapshot será reescrito. Aliases
confiáveis ampliam resolução de histórico após ownership, nunca por telefone puro.
Os38 root não têm loja: exibir origem histórica sem inventar Matriz; recompra não
pode atribuir loja desconhecida silenciosamente. Pedidos sem vínculo inequívoco
dependem de revisão. Não criar cópias de pedidos para migrar identidade.

LEGACY_PHONE e telefone+SMS não têm Online ou Área do Cliente privada. Strong
continua exigido, com ownership. Grant de claim não é grant de pagamento nem
substitui a escolha explícita de modo Strong no checkout.

## Migração DEV / rollback / PROD

1. Relatório e snapshot privado; dry-run repetível e grupos isolados.
2. Finalizar resolver/writers/claim/compatibilidade/Rules e testes antes de aplicar.
3. Bloquear criação concorrente durante ativação da cobertura inicial do índice.
4. Aplicar somente grupos seguros com updateTime/precondições/backup por migration ID.
5. Grupo0290 depende de proposta e autorização final; sem telefone/inválido/orfãos
   permanecem em revisão, sem inferir dados nem destruir originais.
6. Reexecutar dry-run: nenhum endereço/alias/pedido/vínculo duplicado.
7. Validar lookup Thiago, criação concorrente, claims, Customer/CRM/histórico,
   privacidade, multiloja, cart e pagamento via mocks/emuladores. Sem pagamento real.
8. Rollback lógico usa before snapshots/mapping/updateTime; recusar sobrescrever
   mudanças posteriores do cliente. Nunca apagar pedidos nem users Auth.

Plano PROD apenas documental: backup/export → auditoria/dry-run → revisão manual
→ índice → aliases → compatibilidade → CRM canônico → smoke → rollback preparado.
Não executar nenhuma dessas ações em ana-guimaraes nesta entrega.

## Entrega DEV — 25/10/2026

- Runtime f7466d4a; correção da ferramenta c6993f9f; ambos no origin da branch DEV.
-17 Functions selecionadas (14 updates/3 novas), Rules e Hosting59 arquivos.
  Nenhum índice, Storage, trigger/schedule ou recurso PROD foi publicado.
-18/18 hashes remotos iguais ao staging. main.10aa0dd8.js:
  2289fe962ffb6f478b8e4c4e29c32707cd37e8f4272552691e0c4cd082caf17a.
  HTML/SPA/bootstrap/worker revalidáveis; assets hashados e maps immutable.
- Migrações customer-phone-b050e9629e3a0440 (22 escritas) e
  reviewed-phone-dc87cd6e840f6b1a (17 escritas), cada uma com backup tipado privado
  e precondições. Reexecuções ALREADY_APPLIED/0 escritas; rollback local recusa
  sobrescrever alteração posterior. Não executar rollback remoto sem conferir
  backup/updateTime e sem preservar mudanças novas.
-18 clientes originais mantidos;4 aliases,14 linhas principais no CRM incluindo
  os4 registros históricos sem telefone válido,10 telefones com índice READY,
  4 mappings de UID. Grupo0290:12 endereços/IDs únicos,1 padrão canônico,3 UIDs;
  originais dos aliases preservados.64 pedidos por IDs (23 globais/41 por loja).
-91/91 pedidos com os mesmos hashes antes/depois. Sem reescrita de valor, frete,
  desconto, pagamento, data, snapshot, estoque ou recibo. Nenhum usuário Auth
  criado, removido ou mesclado pela migração. Root antigo sem loja é apresentado
  como histórico sem loja determinada, sem recompra ou fallback Matriz.
- Cupom usado/reservado é consultado na família de aliases em tempo real,
  inclusive para atualização tardia de pagamento anterior; não copiar/somar
  reservas ou alterar a conciliação financeira. Escrita em alias com referência
  antiga em voo é rejeitada, e pedido novo PHONE resolve o ID canônico no servidor.
- Thiago final1755:1 endereço histórico recuperado; campos fiscais originais
  preservados, sem número/coordenada/default inventados. Lookup público Matriz
  retornou1 resumo; grupo0290 retornou12 tanto Matriz como Garavelo. Garavelo
  delivery continua BLOCKED; nenhum fallback Matriz.
- Sem grant: endereço completo/perfil403. Claim sem strong Auth401. Projeções
  HTTP têm apenas allowlist mascarada, nunca rua/número/CEP/coords completos.
  Primeiro vínculo forte de telefone livre SEM SMS; histórico existente exige
  prova ligada ao UID; outro owner exige revisão. Auth DEFAULT/Staff e Online
  não são concedidos por telefone/SMS. Claim não reutiliza grant de endereço.
- Bateria local ampla:283 PASS/6 falhas preexistentes da fixture freight-pages,
  reproduzidas identicamente em1f75ed78.134 casos emulados distintos,60 CRM,
  deltas sobrepostos50/50 e7/7, ESM nativo e build PASS. Lint sem erros/avisos
  novos;1 aviso antigo no editor público e metadados browser antigos.4 avisos
  sourcemap native-audio preexistentes. Diff-check PASS.
- Primeira tentativa do driver parou antes de escrever por bug no argumento
  opcional da biblioteca CLI; corrigido/testado por transporte somente localhost
  e versionado separadamente. Primeiro comando de Rules estava sem variável do
  emulador: corrigida a execução,27/27 PASS. Reexecução de claim com dados residuais
  falhou por fixture residual; reset somente do demo e5/5 PASS. Não ocultar tentativas.
- Pendências de dados, sem associação arbitrária:3 clientes sem telefone,
  1 inválido,3 endereços globais sem owner e1 pedido só por telefone. Permanecem
  preservados para revisão de dados; não são Customers extras do mesmo telefone
  canônico nem autorização para revelar histórico.
- ACEITE MANUAL CONSOLIDADO APROVADO em25/10/2026: usuário respondeu “PASS”
  ao roteiro completo em390 CSS px e desktop1920x889. Confirmados endereço
  histórico mascarado de Thiago final1755;12 endereços/apelidos/1 padrão no
  grupo0290; Ver completo/Editar solicitando SMS e cancelamento sem envio;
  histórico após Google/e-mail e indicação explícita de loja desconhecida nos
  pedidos antigos. Evidência é declaração manual do usuário, sem print gerado
  pelo agente. A indisponibilidade da automação do browser não invalida esse aceite.
- CUSTOMER PHONE CANONICALIZATION: CONCLUÍDA E HOMOLOGADA NO DEV. Este aceite
  não inclui novo SMS, claim real de UID por SMS, pagamento ou a homologação
  positiva separada da extensão anterior Editar Perfil/Enterprise após OTP.
- Evidência: docs/evidence/customer-phone-delivery-dev-2026-10-25.json. Snapshots,
  backups e tokens opacos de smoke privados ficam fora de Git/Hosting. Nenhum
  SMS, pagamento/refund/cancelamento financeiro ou WhatsApp foi executado.
- Fase9=75%, Fase11=100%, Fase12=100% histórico, Global95,00%, Fase13=0%.
  Contrato externo InfinitePay preservado. Readiness final continua condicionada
  aos aceites internos remanescentes e à resposta técnica do provider.
