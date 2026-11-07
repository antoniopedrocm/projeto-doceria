# Checkout visitante + InfinitePay G1/G2/G3 — publicação DEV

## Autorização e preparação — 07/11/2026

Proprietário solicitou **“publique em dev as alterações para eu validar”**, autorizando a etapa de commit/push/publicação após revisão da entrega local. Substitui a pausa anterior somente para estas alterações; PROD continua não autorizada.

Workspace absoluto confirmado: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`; branch `feature/infinitepay-customer-auth`; somente Firebase `crmdoceria-9959e`. Origin conferido 0/0 em `34510679` antes do commit. Hashes das fontes correspondem à [validação local de 182 testes](evidence/guest-checkout-local/validation.json); sem alteração funcional posterior. Guard de configuração DEV, build, lint do delta e diff-check preservados.

Escopo: **functions:api**, depois **Hosting**. Nenhum deploy de Rules, índices, outras Functions, dados ou configurações de lojas. Pacote isolado deve conter runtime versionado, dependências atuais e build conferido; untracked antigos/functions.yaml ficam fora. Usada [skill Hosting](C:/Users/antonio.pedro/.codex/plugins/cache/openai-curated-remote/firebase/1.2.0/skills/firebase-hosting-basics/SKILL.md). Conector Firebase falhou por timeout na inicialização; fallback CLI instalada com projeto explícito, sem troca de ambiente por inferência de domínio.

Pré-checagem remota somente DEV: API ACTIVE `api-00071-qeh`; inventário Cloud Functions v2 de todas as regiões **146**, v1 **0**; Rules release `19bc50df-ace4-453f-8bce-fae33bce3bcf`; Hosting anterior `75f46bb8c26f95e6`. O número 146 é inventário atual all-locations, não substitui retrospectivamente os recortes regionais anteriores de 133. Metadados capturados sem secrets/payload Customer. Nenhuma consulta a pagamento/Customer nem escrita de pedido/contexto.

Estado nesta preparação: commit/publicação ainda não concluídos. Ao terminar, registrar hashes/versão/revisão efetivos, push e conferência remota aqui/checkpoint, sem chamar os testes sintéticos de homologação do titular.

## Validação manual após publicação

Abrir cardápio Matriz, adicionar item apenas ao carrinho local, escolher Continuar como visitante. Em desktop/mobile, conferir duas opções, helpers, ausência dos botões de autenticação na entrega e dados/endereço editáveis. Alternar Pagar Agora → Combinar → Pagar Agora, sem confirmar pedido. Cancelar e conferir checkout autenticado com as opções habituais. Não efetuar compra, pagamento, estorno, SMS ou WhatsApp. A execução real dos dois modos permanece comprovada por mocks/emuladores, sem cobrança de homologação.

Fase 9 100% formal histórico; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO. Sem aumento por publicação.
