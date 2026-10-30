const {test}=require('node:test'),assert=require('node:assert/strict');
const {renderToStaticMarkup}=require('../node_modules/react-dom/server');
const {JSDOM}=require('jsdom');
const {fixture,paymentTotal}=require('./helpers/order-edit-modal.cjs');
test('Editar Pedido de pedido PAID preserva formulário completo com limites de método/cliente',()=>{
 const {element}=fixture(),dom=new JSDOM(renderToStaticMarkup(element)),body=dom.window.document;
 for(const text of ['Editar Pedido','Cliente','Status','Categoria do Pedido','Forma de Pagamento','Observação','Adicionar Produtos','Itens no Pedido','Aplicar Desconto','Histórico de alterações','Salvar Alterações'])assert.ok(body.body.textContent.includes(text),text);
 assert.equal(body.querySelector('textarea').value,'Observação de demonstração');assert.ok(body.querySelector('[aria-label="Quantidade de Achadinho de brownie"]'));
 assert.equal(body.querySelector('select:disabled').value,'Pix online');assert.equal(body.querySelector('input:disabled').value,'Cliente de demonstração');dom.window.close();
});
test('Atualizar Status é ação explícita e mantém somente seletor operacional',()=>{
 const {element}=fixture({mode:'STATUS'}),dom=new JSDOM(renderToStaticMarkup(element));assert.ok(dom.window.document.body.textContent.includes('Atualizar status do pedido'));assert.equal(dom.window.document.querySelectorAll('select').length,1);assert.equal(dom.window.document.querySelectorAll('input,textarea').length,0);dom.window.close();
});
test('pedido a combinar conserva seleção de método e formulário completo',()=>{
 const {element}=fixture({paid:false}),dom=new JSDOM(renderToStaticMarkup(element));assert.equal(dom.window.document.querySelectorAll('select:disabled,input:disabled').length,0);assert.ok(dom.window.document.body.textContent.includes('A combinar'));dom.window.close();
});
test('lista não apresenta total alterado após PAID sem aviso de conciliação',()=>{assert.match(renderToStaticMarkup(paymentTotal({total:19,adminPaymentAdjustment:{state:'REVIEW_REQUIRED'}})),/Diferença de pagamento a conciliar/);assert.doesNotMatch(renderToStaticMarkup(paymentTotal({total:10,adminPaymentAdjustment:{state:'BALANCED'}})),/Diferença de pagamento/);});
