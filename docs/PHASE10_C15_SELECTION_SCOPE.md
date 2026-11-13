# C15-G — seleção e proposta de execução segura

12/11/2026, noite UTC−3. Somente DEV. O próprio cadastro indicado pelo Dono já tem owner, mappingGoogle e providersGoogle/password ativos; não serve como primeira vinculação. Nada será desvinculado. C15-E e Google existente PASS preservados.

## Inventário de seleção

Leitura limitada a1.000 documentos por consulta e somente campos necessários; fotografia20 Customers / 16 canônicos / 4 aliases.7 candidatos com celular válido, índice READY, zero owner, zero UID/identidade e referências sem conflito. Nomes/telefones mascarados foram solicitados pelo Dono para escolha privada; ficam fora do Git. Evidência sanitizada: [seleção](evidence/infinitepay-garavelo-active-dev/c15-candidate-selection.json).

| CaseId | Pedidos históricos autorizáveis | Compras concluídas | Endereços | Propriedade/identidade | SMS DEV |
|---|---:|---:|---:|---|---|
| a403670c5b1f4151 | 2 | 2 | 1 | Sem vínculo | Fora da allowlist |
| 2d89cd75cca089b0 | 2 | 2 | 1 | Sem vínculo | Fora da allowlist |
| 69a648e5cabea773 | 3 | 3 | 0 | Sem vínculo | Fora da allowlist |
| 01a721be8c238c0b | 1 | 1 | 0 | Sem vínculo | Fora da allowlist |
| 1cddb7d70c104969 | 1 | 1 | 0 | Sem vínculo | Fora da allowlist |
| d9ee9b15fc864653 | 1 | 1 | 0 | Sem vínculo | Fora da allowlist |
| 55909178172b2298 | 0 | 0 | 2 | Sem vínculo | Fora da allowlist |

Prioridade: os dois primeiros casos têm2 pedidos e1 endereço; permitem demonstrar ambos os tipos de histórico. O caso de teste sem pedidos não é a primeira recomendação. A ausência de owner no Customer não prova ausência da conta Google no Auth; o destino será conferido separadamente depois da seleção.

As contagens usam clienteId/customerId/clientId concordantes, família canônica revisada, limites defensivos, owner compatível, caminho físico e legacyOrderPaths autorizado para raiz. Não ligam pedido por coincidência de nome/telefone nem inferem loja. Enderecos[] persistido prevalece, sem ressuscitar endereço excluído. A fotografia é pré-checagem e será revalidada antes de qualquer operação.

## Escopo proposto após escolha do titular

1. Dono seleciona um dos casos e informa conta Google legítima do próprio titular. Nenhuma senha/código no chat.
2. Conferir em leitura identidade/provider/UID de destino e Customer original sem owner/mappingconflitante. Titular usa login Google normal, preservando eventual papelStaff; não forjar Auth/criar identidade pelo Admin.
3. Preparar baseline privado: versão/fingerprint do Customer/índice,2 pedidos/referências e1 endereço (se escolhido um dos prioritários), sem expor conteúdo.
4. Pedir autorização exata para liberar somente esse destinatário DEV Matriz, **até 1 SMS** e vínculo permanente ao UID Google legítimo após código correto. A escolha de candidato não concede essa autorização. Nenhum envio/claim agora.
5. Usar fluxo existente: completartelefone→claimRequired→modal→reCAPTCHA Enterprise→SMS único→titular confirma código somente na aplicação→attachVerifiedClaim transacional. Não refazer cadastro, alterarIDs/pedidos/endereços, remover owner ou inferir posse porGoogle/e-mail. Se conflito/conta já vinculada/prova expirada, interromper com estado controlado.
6. Conferir pós-condições de mesmoCustomer, owner/mappings/provider/subject corretos, nenhuma duplicidade, desafio consumido/auditoria, fingerprints preservados. Titular confere2 pedidos/1 endereço,refresh,logout/relogin sem novo vínculo/SMS,retornoàloja; sem compras/recompra/pagamento/edição.
7. Fechar C15 somente com aceite real e técnico. Depois C16: consolidarC01–C15, pacoteDEVfinal, testes pertinentes/limites e aceite final do Dono. Não repetir14critérios aceitos.

Fluxo esperado em PROD é o mesmo, com configuração deSMS legítima de produção/políticas de destinatários próprias, sem copiar restrições da allowlistDEV. A primeira prova de telefone é necessária; compras futuras pela mesma identidade não repetem o vínculo. API KeyInfinitePay não participa da recuperação cadastral.

**Estado atual:** seleção/destino/autorização específica pendentes;0 SMS, 0 claim, 0 escrita remota. C15 e C16 pendentes; Fase 10 = 87,50% (14/16), global formal = 97,00%, Fase 9 = 100%, Fase 13 = 0%; PROD READY: NÃO.
