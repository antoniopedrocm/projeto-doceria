# InfinitePay — configuração segura pelo titular no CRM DEV

## Garavelo já concluída — não repetir o cadastro

CredencialGaraveloACTIVE,InfiniteTagantoniopedrocm,versão2;STORE1/CUSTOMER0e revisão confirmados nobackend. Não solicitar novamente sua chave,recriarSecretourefazerativação. Matrizana_guimaressemchavefuncionanofluxobásico; chaveopcional para controleavançado. [Estado e próximos gates](INFINITEPAY_PREPROD_STATUS.md).


12/11/2026. O procedimento manual antigo de criar Secrets no Console foi substituído por decisão do titular. Leia [o contrato do portal](INFINITEPAY_CREDENTIAL_PORTAL.md). Não crie JSON/arquivos locais com as chaves e não as envie ao chat.

## O que o titular fará

1. Na conta InfinitePay correta de cada loja, abrir Configurações do Checkout e gerar/copiar sua API Key real. Se já existir uma chave dedicada válida, reutilizá-la. Não excluir chaves em uso para abrir espaço sem analisar dependências. O agente não cria credenciais na InfinitePay.
2. No CRM DEV https://crmdoceria-9959e.web.app/, entrar com Staff autorizado e selecionar a loja. Abrir Configurações → Pagamentos Online → InfinitePay.
3. Conferir a InfiniteTag da conta que receberá os pagamentos. Matriz e Garavelo usam temporariamente ana_guimares no DEV; cada campo e Secret permanecem independentes. Novas lojas poderão utilizar contas próprias sem alteração de código/deploy.
4. Colar a chave somente no campo protegido “API Key InfinitePay”. Ela não será exibida após salvar. Marcar a confirmação da política loja assume 1x/cliente assume 2x+ e, se desejar iniciar a validação, a autorização dos dois links diagnósticos de R$1,00, sem pagamento.
5. Clicar “Salvar e validar credencial” uma única vez. O backend cria o Secret correspondente ou acrescenta uma versão e solicita os links oficiais STORE1/CUSTOMER0. A credencial anterior permanece em uso até ativar a nova.
6. Em “Revise antes de ativar”, conferir os dois links: conta de recebimento correta, cartão em 1x no valor normal para STORE e repasse oficial para CUSTOMER. Se o checkout exigir Contato, o titular preenche somente seus dados na aplicação. Não informar cartão/CVV/validade nem pagar. Não enviar códigos ou chaves ao agente.
7. Somente se ambas as conferências passarem, marcar o aceite e “Ativar credencial validada”. Agora a preferência de taxa do CRM poderá ser aplicada aos novos links da loja. Repetir separadamente na outra loja.
8. Se aparecer erro, informar apenas loja e mensagem, sem chave. Não repetir salvamento ambíguo nem ativar uma política não conferida.

## Limites e estado

Sem API Key real e revisão dos dois links por loja, o controle independente continua pendente; a opção Cliente assume não fica ativa. O padrão geral da conta já foi conferido anteriormente em um link sem API Key: 1x R$1,00, taxa0. Isso não substitui a validação das duas opções deste portal.

Secrets DEV automáticos: Matriz infinitepay-checkout-0ac34f0f9345e914f3f3; Garavelo infinitepay-checkout-a1cccade83b8102c97d1. Nenhum acesso manual ao Secret Manager é necessário para o fluxo normal. Recursos antigos sem identificação confiável exigem revisão, sem sobrescrita automática. Nenhuma chave DEV será copiada para PROD.

Pagamentos reais, estornos, SMS/WhatsApp e Firebase PROD permanecem fora da autorização. Não fazer commit/push antes da revisão. Global formal97,00%; Fase9 100%; Fase10 87,50%; Fase13 0%.