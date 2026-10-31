# Fase 10 — auditoria de recuperação completa de legado

Data: **31/10/2026**, DEV `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`, base `2507adfdf3c877e41197d885a5d5c85d159c6656`. Revisão de documentos, código e evidências versionadas; nenhum inventário remoto novo, migração, SMS ou deploy. Dados quantitativos de legado abaixo são a fotografia de 24–25/10, não uma contagem atual presumida.

**Fase 10 tornou-se gate obrigatório de produção por decisão do proprietário.** Continua fora da ponderação global histórica. Sua aferição nesta auditoria é **75% de atendimento comprovado (12/16 critérios)**, com quatro critérios ainda não encerrados; **não está concluída nem integralmente homologada**.

## 1. Definição original recuperada

O roadmap original vigente na base registra recuperação de histórico e endereços legados **somente após prova de posse do telefone**, antes opcional. As regras originais complementam: Google/e-mail usam identidade estável; telefone digitado não autoriza histórico, ownership nem auto-merge. Fontes: `INFINITEPAY_PROJECT_PLAN.md`, roadmap e regras de identidade; `CUSTOMER_PHONE_CANONICALIZATION.md`; `CHECKOUT_IDENTITY_CONTRACT.md`; `ADDRESS_VERIFICATION_CONTRACT.md`.

Definição operacional preservada: permitir que a identidade forte correta recupere seu cadastro/dados antigos, mantendo o Customer técnico, referências históricas, valores, ownership e trilha revisável, sem liberar dados a quem apenas conhece o telefone. A decisão atual altera a obrigatoriedade; não autoriza fusões arbitrárias nem modifica a regra aprovada de primeiro cadastro forte com telefone livre sem SMS.

## 2. Critérios de aceite e método de aferição

Não existia rubrica interna numérica detalhada da fase opcional. O antigo 0% não foi tratado como prova de ausência de implementação. A tabela operacionaliza a definição e os contratos já aprovados em **16 critérios binários, com o mesmo peso interno**. Critério comprovado vale 1; parcial/pendente vale 0, sem crédito proporcional presumido. Isso mede cobertura de aceite nesta auditoria, não percentual de clientes migrados nem nova ponderação do projeto.

| ID | Critério | Evidência principal | Resultado |
|---|---|---|---|
| C01 | Normalização única de telefone, formatos equivalentes e rejeição de heurística ambígua | functions/customer-phone.js e customer-phone.test.js | COMPROVADO |
| C02 | Índice privado e writers transacionais sem duplicidade concorrente | customer-registry.js, registry-emulator e registry-api-emulator | COMPROVADO |
| C03 | Google/password resolvidos por identidade estável/UID, incluindo providers do mesmo UID | registry.resolveStrongIdentity/createForStrong e testes de sessão/registry | COMPROVADO |
| C04 | Ownership não concedido por telefone/e-mail; outro proprietário não é incorporado automaticamente | customer-ownership.js, registry/claim e Rules tests | COMPROVADO |
| C05 | Lookup/seleção weak com máscaras/referências opacas e destino resolvido no backend | CHECKOUT_IDENTITY_CONTRACT.md e evidências DEV | COMPROVADO |
| C06 | Recuperação dos modelos comprovados de endereço antigo, IDs/apelidos/padrão preservados | migration-plan.js, testes e aceite Thiago/C02 | COMPROVADO |
| C07 | Canônico/aliases revisados, preservação dos originais e dos UIDs aprovados | consolidação C02, registry.resolveId, entrega DEV f7466d4a | COMPROVADO |
| C08 | Histórico por referências originais, sem cópia ou reescrita financeira | 91/91 hashes iguais no rollout e canonical-history-emulator | COMPROVADO |
| C09 | Histórico privado somente para owners revisados; loja desconhecida sem fallback ou recompra indevida | customer-orders.js e canonical-history-emulator | COMPROVADO |
| C10 | Implementação do claim de legado sem owner após login forte, com prova de telefone ligada ao UID | customer-phone-claim.js, registry.attachVerifiedClaim, teste emulado; UI customer-phone-claim.mjs | COMPROVADO NA IMPLEMENTAÇÃO/TESTES; o aceite real é C15 |
| C11 | Propósitos de SMS/grant segregados, expiração/nonce/consumo e ausência de promoção de endereço para identidade | claim-emulator, address-verification e contratos de confiança | COMPROVADO NA IMPLEMENTAÇÃO/TESTES; o aceite real é C15 |
| C12 | Ferramenta de migração com proposta/aprovação, dry-run, CAS, backup tipado, retry idempotente e rollback protegido | scripts/customer-phone-migrate.cjs, migration-writes/driver tests; rollout DEV com retry zero | COMPROVADO |
| C13 | Processo operacional completo de conflitos/remanescentes, aprovação e auditoria de decisão, incluindo owner distinto | C02 tem proposta/aprovação aplicada; outros casos permanecem bloqueados/revisão, sem aceite geral do processo | PARCIAL, NÃO ENCERRADO |
| C14 | Inventário atualizado e disposição aprovada para cada débito remanescente | Última fotografia 24–25/10; faltam reconferência e decisões finais dos remanescentes | PENDENTE |
| C15 | Claim real pós-Google e pós-e-mail com SMS Enterprise atual, sem troca de UID/Staff/conta, com isolamento demonstrado | Aceite anterior exclui expressamente claim real e novo SMS; fornecedor emulado não prova entrega | PENDENTE |
| C16 | Homologação consolidada da Fase 10 ampliada e regressão final no estado atual | Aceite de canonicalização é delimitado; não cobre todos os critérios desta fase agora obrigatória | PENDENTE |

**Cálculo:** 12 comprovados ÷ 16 = **75%**. C13 parcial não recebe meio ponto. SMS existente, lookup isolado ou C02 sozinho não bastam: histórico, ownership, aliases, migração/rollback e controles independentes sustentam os critérios pontuados. Faltam C13–C16 para 100%. A revisão dos critérios pode ser aprovada/ajustada pelo proprietário sem adulterar os pesos históricos globais.

## 3. Funcionalidades implementadas

Normalização BR/E.164; índice privado; criação idempotente; resolução UID/identity; aliases com limite de profundidade/recusa de ciclo; whitelist de owners revisados; leitura mascarada fraca; endereços históricos comprovados; histórico root/loja autorizado por referências; claim de propósito próprio; writer/Rules protegidos; família de cupons; migração e rollback com precondições. O código existe e há evidências de testes/publicação; não se trata de projeto começando do zero.

## 4. Funcionalidades parcialmente implementadas/aceitas

O claim pós-login tem backend, UI e testes, mas não tem aceite real com o SMS Enterprise atual. A revisão manual funciona para a proposta C02 e a ferramenta aceita propostas exatas aprovadas, porém não há comprovação de encerramento operacional dos demais tipos de conflito/remanescentes. O histórico seguro funciona para vínculos comprovados; referência por telefone isolado continua fora. Essas limitações não autorizam relaxar ownership para terminar a fase.

## 5. Funcionalidades/entregas ausentes na evidência

Não foram encontrados: inventário reconciliado atual de todos os remanescentes; decisão final rastreável por débito; homologação real dos claims Google/e-mail no contrato atual; aceite consolidado específico da Fase 10 obrigatória. A existência de uma tela genérica de triagem não é pressuposta nem exigida arbitrariamente: é necessário um processo verificável, que pode reutilizar proposta/dry-run/aprovação e ferramentas existentes. Mudança real de telefone continua bloqueada; não é contada como entrega faltante da recuperação original sem decisão separada de escopo.

## 6. Débitos de dados legados

Fotografia documentada: **3 Customers sem telefone, 1 telefone inválido, 3 endereços globais sem vínculo comprovado e 1 pedido associado apenas por telefone**, além de pedidos root sem loja informada. Precisam ser reconferidos. Resolver por evidência ou registrar exclusão/quarentena deliberada, aprovada e auditável; “100%” não exige inventar proprietários, telefone ou loja para registros irrecuperáveis. Preservar originais e dados pessoais fora do Git/Hosting. A exclusão deliberada de itens na proposta C02 não equivale ao encerramento de todos os remanescentes da Fase 10.

## 7. Customers antigos

Auditoria de 24/10: 18 documentos, 14 linhas principais após consolidação, com originais/aliases preservados. Esses números são históricos. Atualizar a classificação canônico/alias/inválido/revisão sem criar outro Customer por cada login/provedor ou telefone equivalente. Não excluir cadastros antigos para simplificar a métrica.

## 8. Pedidos históricos

Fotografia: 91 pedidos, 53 por loja e 38 root, sem repetição de IDs entre esses documentos; 91/91 hashes preservados na migração. C02 acessa 64 referências diretas revisadas (41 por loja, 23 root). Um vínculo apenas por telefone ficou fora. Root sem loja aparece explicitamente como histórico sem loja determinada, sem fallback Matriz e sem recompra que atribua loja arbitrária. Atualizar o inventário sem copiar pedidos nem alterar status/valores/ownership/snapshots.

## 9. Endereços históricos

Modelos `enderecos[]`, `endereco` e `address` foram comprovados. Thiago/C07 recebeu compatibilidade com um endereço antigo; C02 consolidou 12 IDs e um padrão, preservando fontes/defaults dos aliases. Três documentos globais órfãos não foram atribuídos. Sem SMS, manter máscaras; grant específico autoriza somente os detalhes/ações permitidos. Normalização não pode inventar número, coordenadas ou proximidade para fundir destinos.

## 10. Identities

`customerAuthIdentities` usa provider/subject; registry privado resolve UID e canônico. Mesmo UID com Google/password não é outro Customer. Três UIDs revisados de C02 foram preservados, sem mesclar usuários Firebase. Novo UID com outro owner exige prova da conta/revisão; endereço de e-mail coincidente não basta. Reconferir mappings contraditórios/revogados na auditoria atualizada.

## 11. Canonicalização por telefone

Chave de negócio única normalizada; customerId continua técnico e imutável. Primeiro cadastro forte com telefone livre sem SMS é decisão vigente, com telefone não verificado. Número já existente não recebe ownership pela digitação. Índice e escrita são transacionais; registro ausente, conflito ou canônico contraditório falham fechado.

## 12. Aliases

C04/C06/C08/C18 foram revisados como aliases de C02, com documentos originais preservados e mappings privados. Resolução amplia apenas a família comprovada; não publica índice nem confia no payload do browser. Novos grupos/conflitos requerem proposta e autorização; quatro aliases não provam saneamento de toda a base.

## 13. Recuperação por telefone

`LEGACY_PHONE` permite resumo/seleção e criação de endereço novo não padrão conforme regra aprovada. Isso não é login forte nem recuperação completa do histórico. A prova de endereço/perfil básico também não cria identidade forte. Claim permanente exige identidade Google/password válida e propósito `CUSTOMER_IDENTITY_CLAIM` no backend.

## 14. Recuperação após Google/e-mail

`customerCompleteProfile` devolve claimRequired para telefone existente sem vínculo; a UI abre confirmação explícita por SMS. Outro owner devolve identityReviewRequired e não inicia o claim automático. Após prova válida, o mesmo Customer é vinculado ao UID correto, sem duplicação. Falta homologar os caminhos reais de Google e senha, mantendo sessão, carrinho, loja e acesso de uma segunda conta isolados.

## 15. SMS/grants

Claim tem UID/provider/subject/Customer/telefone/loja, nonce, prazo, tentativa e consumo único. Endereço/perfil têm grant temporário distinto. A migração de CAPTCHA para Enterprise tem gate próprio ainda aberto: não reaproveitar autorização antiga de um SMS para outro destinatário/finalidade. Nenhum SMS real foi enviado nesta auditoria.

## 16. Conflitos manuais

Cobrir múltiplos UIDs, telefone reciclado/compartilhado, ausência de prova, mapping divergente e duplicação parcial. Documento C02 é evidência concreta de uma revisão aprovada; não é regra de auto-merge. Fechar procedimento de responsável, prova, proposta, consentimento sobre acesso ao histórico, aplicação idempotente, auditoria, rejeição e rollback. Casos negados devem continuar negados, sem ocultar o motivo operacional.

## 17. Migrações necessárias

Não foi comprovada necessidade de migração em massa adicional. Primeiro refazer inventário/dry-run e comparar markers/updateTime; depois planejar somente deltas elegíveis aprovados. Reexecuções já demonstraram ALREADY_APPLIED/zero escritas. Validar backups tipados acessíveis e restauração em fixture; nunca sobrescrever alteração posterior do cliente. Plano PROD exige revisão/autorização própria depois dos gates, não execução nesta fase DEV.

## 18. Testes necessários

Reutilizar os testes de registry/API/Rules, claim, canonical-history, migrations e UI. Cobrir novo owner/owner diferente, Google/password/same UID, alias inválido/ciclo, telefone equivalente/inválido, grants de propósito trocado/expirado/replay, concorrência, troca de UID/loja, negativa Guest/Staff/Customer alheio, histórico root sem loja, defaults/IDs, cupom e idempotência/rollback. A bateria final deve exercer os gaps implementados no HEAD que será homologado, sem confundir teste sintético com SMS real.

Nesta revisão, **12/12 testes locais** de `customer-phone.test.js`, `customer-migration-writes.test.js` e `crm/tests/customer-phone-claim.test.mjs` passaram. UI/provider são simulados, sem emulador novo, rede de pagamento ou SMS. A evidência anterior registra 134 casos emulados e 60 CRM no rollout, com preexistências identificadas; não foram todos repetidos agora nem são provas do gate C15.

## 19. Homologação necessária

Após fechar os pequenos gates e a Fase 9, executar roteiro dedicado DEV com dados sintéticos controlados: legado sem owner → Google → prova própria → mesmo Customer/histórico/endereços; repetir com e-mail/senha; outra conta e outros owners negados; refresh/logout/multiloja; exceções/manuais e retry/rollback em fixtures. Validar desktop/mobile, SMS Enterprise e auditoria sem tokens/endereços expostos. Envio real depende de autorização específica de destinatário/finalidade. Pagamento/estorno/WhatsApp e PROD não são necessários por implicação do aceite.

## 20. Percentual e decisão

**Fase 10 = 75% auditado (12/16), obrigatória pré-PROD, contribuição global atual 0 p.p.** Não é 0% por falta de investigação nem 100% pela existência de SMS/C02. Critérios C13–C16 continuam bloqueadores. Só após implementação dos gaps, testes, atualização DEV necessária e aceite integral pode atingir 100%.

Fase 9 = 75%; global formal = 95,00%; Fase 13 = 0%. Se Fase 9 chegar a 100%, o global será 97,00%, mas PROD continua bloqueada enquanto Fase 10 ou qualquer outro gate não estiver encerrado. Rebaseline global somente por decisão explícita futura do proprietário. [Revisão dos gates](PREPROD_GATE_REVIEW.md).
