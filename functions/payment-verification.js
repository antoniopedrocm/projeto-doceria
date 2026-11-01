const {createHash,randomUUID}=require('node:crypto');
const unavailable=()=>Object.assign(new Error('A consulta está em andamento ou atingiu o limite temporário. Aguarde antes de consultar novamente.'),{httpStatus:503});
function createPaymentVerification({db,provider,now=Date.now}) {
  const inFlight=new Map();
  return async function check(input) {
    const key=createHash('sha256').update(JSON.stringify([input.handle,input.order_nsu,input.transaction_nsu,input.slug])).digest('hex');
    if(inFlight.has(key))return inFlight.get(key);
    const operation=(async()=>{
      const ref=db.doc('integrations/paymentReconciliation/verificationLimits/'+input.order_nsu),nonce=randomUUID();
      await db.runTransaction(async tx=>{
        const old=(await tx.get(ref)).data(),same=old && now()-old.windowAt<60000;
        if(old?.leaseUntil>now() || (same && old.count>=30))throw unavailable();
        tx.set(ref,{windowAt:same?old.windowAt:now(),count:(same?old.count:0)+1,nonce,leaseUntil:now()+20000});
      });
      try{return await provider.check(input);}
      finally{await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();if(old?.nonce===nonce)tx.update(ref,{leaseUntil:0});});}
    })();
    inFlight.set(key,operation);
    try{return await operation;}finally{if(inFlight.get(key)===operation)inFlight.delete(key);}
  };
}
module.exports={createPaymentVerification};
