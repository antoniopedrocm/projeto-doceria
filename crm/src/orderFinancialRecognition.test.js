import {isRecognizedOrderReceipt,recognizedOrderTotal} from './orderFinancialRecognition';
test('AGREED_LATER pending/fiscal method selection is not payment received; historical offline orders stay compatible',()=>{
 expect(isRecognizedOrderReceipt({status:'Finalizado',paymentMode:'AGREED_LATER',paymentMethod:'PIX',paymentStatus:'PENDING'})).toBe(false);
 expect(isRecognizedOrderReceipt({status:'Finalizado',formaPagamento:'Dinheiro'})).toBe(true);
});
test.each(['PENDING','REFUNDED','CANCELLED','EXPIRED'])('online %s is excluded from receipts even if operationally Finalizado',payment_status=>{
 expect(isRecognizedOrderReceipt({status:'Finalizado',paymentId:'fixture',payment_status})).toBe(false);
});
test('verified PAID is recognized once at original paid amount after an administrative total divergence',()=>{
 const order={status:'Finalizado',paymentId:'fixture',payment_status:'PAID',total:30,adminPaymentAdjustment:{paidCents:1000,orderTotalCents:3000,state:'REVIEW_REQUIRED'}};
 expect(isRecognizedOrderReceipt(order)).toBe(true);expect(recognizedOrderTotal(order)).toBe(10);
 expect(isRecognizedOrderReceipt({...order,requiresReview:true})).toBe(false);
});
test('manual agreed receipt is recognized only after explicit PAID and retains the original received amount',()=>{
 const pending={status:'Finalizado',paymentMode:'AGREED_LATER',paymentStatus:'PENDING',total:14.78};expect(isRecognizedOrderReceipt(pending)).toBe(false);
 const paid={...pending,paymentStatus:'PAID',manualPaymentReceipt:{amountCents:1478}};expect(isRecognizedOrderReceipt(paid)).toBe(true);expect(recognizedOrderTotal({...paid,total:99})).toBe(14.78);
});
