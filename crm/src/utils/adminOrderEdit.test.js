import {adminOrderRequest} from './adminOrderEdit';
const order={id:'order',lojaId:'store',status:'Pendente',adminRevision:3,updatedAt:{toMillis:()=>123},paymentId:'payment',ownerUid:'customer'};
test('requisição completa transmite apenas campos editáveis e versão; não transmite provider/owner/total cliente',()=>{
 const req=adminOrderRequest({order,requestId:'id',mode:'FULL',form:{...order,clienteId:'a',status:'Finalizado',categoria:'Delivery',formaPagamento:'Pix online',observacao:'ok',itens:[{id:'product',quantity:2,preco:999}],desconto:1,total:9999}});
 expect(req.mode).toBe('FULL');expect(req.expectedRevision).toBe(3);expect(req.expectedUpdatedAt).toBe(123);expect(req.patch.itens).toEqual([{produtoId:'product',quantity:2}]);
 for(const key of ['paymentId','ownerUid','payment_status','total','subtotal','provider'])expect(req.patch).not.toHaveProperty(key);
});
test('atalho transmite exclusivamente status mesmo se formulário contiver itens/valores',()=>{
 const req=adminOrderRequest({order,requestId:'id',mode:'STATUS',form:{status:'Finalizado',total:100,itens:[{}],desconto:20}});expect(req.patch).toEqual({status:'Finalizado'});
});
