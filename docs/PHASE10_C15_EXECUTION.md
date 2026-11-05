# Fase 10 — execução de C15 e fechamento de C16

## Estado em 05/11/2026

**C15 pendente; C16 pendente. Fase 10 = 87,50% (14/16), global formal = 97,00%, Fase 9 = 100%, Fase 13 = 0%. PROD não autorizada.** Esta preparação não substitui os dois claims reais previstos na rubrica de aceite.

Workspace: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`; branch `feature/infinitepay-customer-auth`; único projeto consultado: `crmdoceria-9959e`. O banco `(default)` é STANDARD. Nenhum acesso a PROD.

O repositório estava em `85aa41f2`, sem alterações tracked pendentes e sincronizado com origin. A conferência remota somente leitura confirmou 146 Functions, API `api-00070-jib`, Rules `19bc50df-ace4-453f-8bce-fae33bce3bcf` e Hosting `f960c57c592945d0`/`main.08ad2156.js`, correspondentes ao fechamento anterior. Não houve novo build ou deploy. [Conferência do ambiente](evidence/preprod-current-dev-2026-11-05.json).

## Pré-checagem real dos dados

Fonte: [evidência sanitizada de 05/11 às 15:09 UTC−3](evidence/phase10-c15-preflight-2026-11-05-dev.json), fingerprint `89f027e8be0dcfcd6543a819fef2f4cdf2381bbbde1f32a51d8e1d735fc126f8`. A consulta projetou apenas os campos necessários para telefone/ownership/índices/política; não leu perfis completos, endereços, pedidos, tokens Auth, OTP ou credenciais do provedor.

| Grupo | Quantidade | Consequência para C15 |
|---|---:|---|
| Documentos Customer | 18 | 4 aliases excluídos da seleção de canônicos |
| Canônicos/não classificados | 14 | Precisam de revisão específica antes de qualquer vínculo |
| Com proprietário | 2 | Ambos já estão na allowlist; não remover proprietários para produzir teste |
| Sem proprietário, celular e índice canônico válidos, sem mapping de identidade | 8 | Nenhum está na allowlist atual de SMS da Matriz |
| Sem proprietário, telefone/índice ausente ou inválido | 4 | Não elegíveis para claim automático |
| Casos prontos na pré-checagem da política atual | **0** | Faltam seleção do titular e aprovações específicas |

Foram consultados também 10 índices de telefone, 4 mappings de UID e 4 mappings de identidade. Política SMS configurada não prova disponibilidade ao vivo do provedor nem autoriza envio. A pré-checagem da política foi feita para a **Matriz explicitamente selecionada**; não pressupõe configuração igual no Garavelo ou em outra loja.

Os oito caseIds bloqueados somente pela allowlist nessa fotografia são:

- `72f99a605f6f471b`, `01a721be8c238c0b`, `55909178172b2298`, `1cddb7d70c104969`;
- `a403670c5b1f4151`, `2d89cd75cca089b0`, `d9ee9b15fc864653`, `69a648e5cabea773`.

CaseId é uma referência opaca da auditoria, não uma prova de titularidade. A correspondência com o cadastro escolhido será conferida privadamente no caso concreto; nomes, telefones completos e UIDs não serão publicados em Git. Esta fotografia não reabre a disposição C14 dos 14 remanescentes aprovada pelo Dono.

## Seleção e autorização necessárias

O Dono deve indicar cadastros legados que tenham titulares legítimos disponíveis e a conta DEV de destino de cada cenário. Precisamos de duas execuções independentes:

| Cenário | Identidade de destino | Prova e pós-condição |
|---|---|---|
| C15-G | Login real Google | Claim específico vincula o Customer legado ao UID Google correto |
| C15-E | Login real e-mail/senha | Claim específico vincula outro caso ainda não vinculado ao UID correto |

Reentrar numa conta já proprietária ou adicionar outro provider a um UID já vinculado não demonstra uma segunda recuperação de legado. Não criar identidade Google artificial, trocar UID, desvincular C02/final 0290, substituir telefone legado ou migrar ownership para fabricar o cenário.

Antes de qualquer envio/mutação, preparar para cada caso uma proposta privada revisável: Customer canônico/aliases, loja explícita, telefone canônico mascarado, identidade de destino verificada pelo login humano, estado de ownership e mappings, quantidade/referências de pedidos e endereços esperados, escopo da alteração e evidência anterior. Usar a trilha e proteções existentes em [LEGACY_MANUAL_REVIEW.md](LEGACY_MANUAL_REVIEW.md), sem aplicar migração genérica.

Pedir aprovação específica do Dono/titular para o vínculo permanente daquele cadastro àquela conta e, se necessário, a liberação daquele destinatário na política DEV. Obter limite explícito de SMS para cada execução antes de enviar. As duas autorizações anteriores foram consumidas em sessões temporárias; não autorizam novo envio nem claim permanente. Não ampliar automaticamente a allowlist.

## Execução pela interface existente

1. Revalidar somente o caso escolhido: índice READY, telefone canônico consistente, ausência de owner incompatível/mapping conflitante e loja explícita. Se houver divergência desde a fotografia, interromper esse caso para revisão; não sobrescrever dados.
2. Titular faz o login Google ou e-mail/senha normalmente. Senha, token, código e sessão privada ficam na aplicação; o agente não extrai credenciais do navegador.
3. Conferir o estado `claimRequired` no preenchimento do perfil. O fluxo deve usar o propósito `CUSTOMER_IDENTITY_CLAIM`, vinculado a UID/provider/subject/Customer/phoneKey/storeId. Grant de endereço ou sessão temporária não serve como prova de ownership.
4. Com aprovação do caso e limite de envio registrados, solicitar o código uma única vez pelo fluxo existente. Titular confirma o código somente na aplicação. Não reenviar automaticamente em caso de expiração/falha.
5. Após sucesso, verificar por leitura autorizada: mesmo Customer canônico; alias e referências históricas preservados; UID/identidade corretos; desafio consumido; auditoria existente registrada; nenhum Customer duplicado ou owner indevido.
6. Conferir histórico e endereços esperados, refresh e retorno à loja de origem sem salvar perfil/endereço, criar pedido ou pagar. Se a identidade também for Staff, manter o mesmo UID e suas capabilities. Conferir isolamento de outra identidade com os testes negativos existentes; não conceder acesso a órfãos ou dados privados sem vínculo comprovado.
7. Registrar por caso somente provider, caseId opaco, tempos/status, quantidades, hashes de comparação e resultado. Não registrar telefone completo, nome/e-mail, UID bruto, OTP, grant ou token. Não desfazer claim válido automaticamente ao encerrar a sessão.

O backend existente revalida o escopo durante a transação, aplica cooldown/limites compartilhados de SMS e consome a prova uma vez. Não é necessário reimplementar `customer-phone-claim.js` ou `customer-registry.js` para executar o aceite.

## C16 e percentuais

C15 só recebe PASS depois dos dois cenários reais aprovados e das respectivas pós-condições. Depois consolidar C01–C15, disposição dos remanescentes, evidências de publicação, regressão pertinente e aceite final da Fase 10. Não repetir os gates já aprovados sem mudança ou falha nova. Se surgir correção de runtime, aplicar testes/build/lint/diff, commit/push e deploy DEV somente do necessário antes do novo aceite.

Somente C15 PASS: 15/16 = 93,75% da Fase 10. C15 e C16 PASS: 16/16 = 100%. O global formal permanece 97,00% porque a Fase 10 continua fora da ponderação histórica. Nenhum desses marcos autoriza PROD; revisão final, configurações/backup autorizados e decisão explícita do proprietário continuam necessários.

## Ferramenta de pré-checagem

`scripts/phase10-claim-preflight.cjs` é somente leitura, com guard do workspace/Project ID DEV, loja obrigatória e saída sanitizada nova dentro de `docs/evidence`. Usa a autenticação existente da CLI, sem ler sessão do navegador. Recusa flags de aplicação, envio, claim ou migração; consultas acima de 1.000 documentos falham sem truncar silenciosamente.

Exemplo de comando a partir do workspace acima; substituir o caminho da biblioteca CLI pela instalação local disponível e escolher **novo** nome de saída, preservando evidências anteriores:

```text
node --use-system-ca scripts/phase10-claim-preflight.cjs --project crmdoceria-9959e --store ana-guimaraes-doceria-matriz --firebase-tools-lib <firebase-tools/lib> --out docs/evidence/phase10-c15-preflight-<data>-dev.json
node --test scripts/phase10-claim-preflight.test.cjs
```

O resultado `DATA_PRECHECK_READY` não concede permissão, não valida disponibilidade Enterprise ao vivo e não autoriza claim ou envio. Nesta retomada: **0 escritas remotas, 0 claims, 0 SMS**. Ferramenta e roteiro não entram no bundle da aplicação e não requerem deploy.

[Validação local](evidence/phase10-c15-preparation-local.json): 8/8 testes, sintaxe PASS, lint dos scripts sem erros/avisos e diff-check PASS. Os testes cobrem mascaramento/ausência de aprovação implícita, owners existentes, índice contraditório, mappings conflitantes, aliases/telefone inválido/fixo, política/allowlist, guards DEV e decodificação de projeções Firestore. Não são contabilizados como aceite real de C15.
