const text=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const {normalizeCustomerPhone}=require('./customer-phone');
function paymentPrefill(config,customer,delivery,email) {
 const result={};
 if(config.sendCustomerData!==false) {
  const phone=normalizeCustomerPhone(customer.normalizedPhone || customer.phone_number || customer.telefone).e164;
  result.customer={name:text(customer.nome,120),phone_number:phone};
  const validEmail=value=>typeof value==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const buyerEmail=validEmail(email)?email:customer.email;
  if(validEmail(buyerEmail))result.customer.email=text(buyerEmail,254);
 }
 if(config.sendDeliveryAddress!==false&&delivery?.pickup===false) {
  const a=delivery.address||{};const address={cep:text(a.cep).replace(/\D/g,''),street:text(a.street),number:text(a.number,40),neighborhood:text(a.neighborhood),complement:text(a.complement)};
  // Historical free-text addresses are not parsed or fabricated.
  if(/^\d{8}$/.test(address.cep)&&address.street&&address.number&&address.neighborhood) result.address=address;
 }
 return result;
}
module.exports={paymentPrefill};
