# Proposta de consolidação DEV — telefone final0290

**PROPOSTA APROVADA E APLICADA NO DEV EM25/10/2026.** Auditoria de24/10/2026.

Autorização humana: “Aprovar aplicação da proposta no DEV”. Aplicação verificada:
12 endereços,1 padrão,3 UIDs,4 aliases,64 referências diretas;91/91 pedidos
inalterados. As seções abaixo preservam a proposta revisada. Aceite visual
consolidado pós-deploy aprovado manualmente com “PASS” em25/10/2026;
ver CUSTOMER_PHONE_CANONICALIZATION.md.
Usuário confirmou que os5 cadastros são da mesma pessoa e solicitou proposta.
Essa confirmação inicial não equivalia à autorização para aplicar. A aplicação
só ocorreu após a aprovação explícita de25/10/2026.
Somente crmdoceria-9959e; PROD, Firebase Auth, pagamentos e WhatsApp intactos.

## Resultado proposto

- C02 será o Customer canônico. É o registro que já sustenta Customer A,
  Google+senha e o fluxo financeiro homologado; manter seu ID técnico e perfil.
- C04, C06, C08 e C18 serão aliases auditáveis de C02. Os documentos originais
  continuarão preservados; a lista principal do CRM passará a representar1 pessoa.
- Telefone normalizado terá1 entrada no índice privado. Telefone não vira ID
  público nem prova de acesso. Nenhum cadastro será escolhido por primeiro match.
- Conservar os3 UIDs já existentes como proprietários revisados desse Customer.
  **Os3 passarão a acessar o mesmo conjunto de64 pedidos ligados por ID e os
  endereços consolidados**, após login forte. Não mesclar nem excluir usuários
  Firebase, não alterar senha/provider/claims/role/Staff. Isso é a decisão de
  acesso que precisa ser aprovada expressamente junto com a consolidação.

## Registros e acesso

| Ref. privada de auditoria | Providers do UID atual | Endereços no array | Pedidos ligados diretamente por ID | Destino proposto |
|---|---|---:|---:|---|
| C02 | Google e senha, mesmo UID | 3 | 9 | Canônico; preservar UID e padrão |
| C04 | Senha; UID diferente | 2 | 0 | Alias; conservar acesso forte ao conjunto consolidado |
| C08 | Senha; UID diferente | 0 | 0 | Alias; conservar acesso forte ao conjunto consolidado |
| C18 | Sem UID | 4 | 32 | Alias legado; nenhum UID inventado |
| C06 | Sem UID | 5 | 23 | Alias legado; nenhum UID inventado |

As referências Cxx identificam os registros no snapshot privado, não são novos
IDs Firestore. UIDs completos, e-mails e endereços residenciais não entram neste
relatório permanente. O mapping operacional exato fica em snapshot privado.

## Endereços

As14 entradas dos arrays e2 representações históricas singulares geram16 fontes.
A proposta identifica4 repetições com os mesmos campos normalizados, incluindo
coordenadas e condição sem número, resultando em12 entradas de seleção.
Não deduplicar por proximidade, nome parecido ou geocoding. Originais e mapping
sourceCustomer/sourceAddress permanecem disponíveis para auditoria/rollback.
Se o recheck apontar qualquer divergência, preservar ambos e regenerar proposta.

| Ref. da proposta | Apelido persistido | Fontes | Ocorrências preservadas no mapping | Padrão proposto |
|---|---|---|---:|---|
| A01 | DEV Homologação A1 editado | C02 | 1 | Não |
| A02 | Casa da Vilma | C02 | 2 | Sim — padrão de C02 |
| A03 | Osceia | C04 | 2 | Não |
| A04 | Casa da Sogra | C06 | 1 | Não |
| A05 | Casa | C06 | 1 | Não |
| A06 | Trabalho | C06 | 1 | Não |
| A07 | Vida vela 2 | C06 | 1 | Não |
| A08 | Teste casa | C06 | 1 | Não |
| A09 | (sem apelido salvo) | C06 | 1 | Não |
| A10 | Osceia | C18 | 2 | Não |
| A11 | Hypera | C18 | 2 | Não |
| A12 | (sem apelido salvo) | C18 | 1 | Não |

Preservar o padrão já escolhido em C02. C18 contém2 flags de padrão; registrar
esse conflito sem apagar os flags dos documentos originais. A representação
canônica terá1 padrão. Apelidos válidos não são trocados por Endereço N.
Endereços históricos sem número/coordenada não receberão valores inventados.

## Histórico, valores e cupons

-64 referências diretas: 23 pedidos globais antigos e 41 por loja.
  Documentos dos pedidos permanecem no local original; **zero cópias ou alterações**
  de preço, status, pagamento, frete, desconto, data ou snapshot residencial.
-1 pedido adicional corresponde somente ao telefone. Ficará fora da liberação
  automática até revisão de ownership; saber o telefone não prova propriedade.
- Pedidos globais antigos sem loja devem ser apresentados como origem histórica
  sem loja determinada. Não atribuir Matriz e não oferecer recompra com loja
  inventada. Loja desconhecida não apaga o pedido do histórico.
- Cupons já usados: unir referências comprovadas para impedir novo uso indevido;
  não alterar documentos financeiros nem somar contadores de fontes sem prova.
  Métricas devem ser recalculadas de referências únicas pelo contrato existente,
  sem confundir reserva, pedido cancelado e compra confirmada.
-3 documentos enderecos globais não possuem vínculo comprovado com Customer;
  não atribuí-los a este grupo nem a Thiago.

## Segurança preservada

- LEGACY_PHONE lista máscara/seleciona/salva novo endereço conforme contrato atual.
  Dados completos, edição, exclusão, padrão e perfil básico continuam exigindo
  grant SMS específico, com binding ao contexto, Customer, telefone, loja e prazo.
- Telefone+SMS não concede Strong, histórico privado, Staff ou pagamento online.
- Google/senha já ligados ao mesmo UID reutilizam o Customer sem SMS repetido.
- Primeiro cadastro forte para telefone realmente livre: **SEM SMS**, decisão do
  usuário. Criar Customer+índice+identity atomicamente. Telefone fica marcado como
  não verificado; não alegar que Google/senha provam posse desse número.
- Telefone existente e UID novo: provar controle do telefone antes de reivindicar
  registro ainda sem owner. Se já houver outro UID proprietário, exigir prova da
  conta existente/revisão; não unir automaticamente somente por telefone/SMS.
- Troca real de telefone exige fluxo próprio e atualização atômica do índice;
  formatação equivalente não é troca de chave. Não fazer auto-merge por e-mail.

## Execução proposta e rollback

1. Finalizar integração de writers/resolver/claims/histórico/CRM e Rules; executar
   testes locais. Componentes atuais são preparação isolada, ainda não ativada.
2. Refazer captura e dry-run com precondições updateTime. Se dados mudarem,
   regenerar mapping/conflitos antes de aplicar. Backup privado tipado por ID.
3. Aplicar grupos seguros separadamente; este grupo depende da aprovação final.
4. Uma transação revista aplica índice, aliases, ownership/mapping e projeção
   canônica de endereços; nenhum documento de pedido ou usuário Auth é alterado.
5. Reexecução precisa reconhecer migrationId aplicado e não duplicar itens.
6. Rollback lógico com before snapshot e precondições; recusar sobrescrever dados
   alterados depois da migração. Preservar auditoria e histórico financeiro.
7. Deploy/homologação apenas DEV, seletivos, com evidência real; nenhum SMS novo
   ou operação financeira real por implicação desta proposta.

## Decisão aprovada

Escopo aprovado: **C02 canônico +4 aliases; conservar os3 UIDs com acesso
forte ao histórico consolidado de64 pedidos;12 endereços na representação
canônica com originais/mapping preservados; manter padrão de C02; deixar1 pedido
apenas por telefone e3 endereços órfãos fora da associação automática.**

A aprovação não dispensa implementação, testes, recheck de dados e precondições.
Este grupo saiu de MANUAL_REVIEW_REQUIRED após aprovação e migração. Nenhum
privilégio Staff ou usuário Auth foi criado/alterado; os3 acessos fortes aprovados
resolvem o Customer canônico. Outros conflitos futuros continuam em revisão.
Fase9=75%; Fase11=100%; Fase12=100% histórico; Global=95,00%; Fase13=0%.
