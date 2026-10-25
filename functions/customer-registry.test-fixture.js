// Fixture setup only. Never bundled/deployed; never connects to a live database.
const {normalizeCustomerPhone}=require('./customer-phone');
async function seedRegistry(db) {
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local demo emulator required');
  const groups=new Map();
  for(const customer of (await db.collection('clientes').get()).docs){
    let phone;try{phone=normalizeCustomerPhone(customer.data().telefone || customer.data().phone_number);}catch{continue;}
    const group=groups.get(phone.key) || {phone,ids:[]};group.ids.push(customer.id);groups.set(phone.key,group);
  }
  const batch=db.batch();batch.set(db.doc('integrations/customerRegistry'),{state:'READY',version:1});
  for(const [key,group]of groups)batch.set(db.doc('integrations/customerRegistry/phones/'+key),{state:group.ids.length===1?'READY':'MANUAL_REVIEW_REQUIRED',normalizedPhone:group.phone.e164,customerId:group.ids.length===1?group.ids[0]:null});
  await batch.commit();
}
module.exports={seedRegistry};
