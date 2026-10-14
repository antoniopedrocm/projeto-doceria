import {createCapabilityResolver,permittedContext} from './userCapabilities';
import {normalizeRole,isActiveStaffProfile} from './staffRole';
const user={uid:'a',providerData:[{providerId:'google.com'}]};
const linked={customer:{id:'own',accountLinked:true}};
test.each([[true,true],[true,false],[false,true],[false,false]])('capabilities Staff=%s Customer=%s',async(staff,customer)=>{
  const loadStaff=jest.fn(async()=>staff?{role:'dono'}:null);
  const loadCustomer=jest.fn(async()=>customer?linked:{needsPhone:true});
  const result=await createCapabilityResolver({loadStaff,loadCustomer})(user);
  expect(result).toMatchObject({uid:'a',isStaff:staff,isCustomer:customer});
  expect(permittedContext(result)).toBe(staff?'staff':customer?'customer':null);
});
test('needsPhone is onboarding, never a linked Customer or an automatic write',async()=>{
  const result=await createCapabilityResolver({loadStaff:async()=>null,loadCustomer:async()=>({needsPhone:true})})(user);
  expect(result.customerState).toBe('NEEDS_PHONE');expect(result.isCustomer).toBe(false);expect(result.customer).toBeNull();
});
test('Customer transport errors are distinct and cannot grant capability; Staff can still work',async()=>{
  const result=await createCapabilityResolver({loadStaff:async()=>({role:'dono'}),loadCustomer:async()=>{throw Error('offline');}})(user);
  expect(result).toMatchObject({isStaff:true,isCustomer:false,customerState:'ERROR'});
});
test('anonymous/phone do not acquire a private Customer from their provider',async()=>{
  const loadCustomer=jest.fn();const resolve=createCapabilityResolver({loadStaff:async()=>null,loadCustomer});
  await expect(resolve({...user,isAnonymous:true})).rejects.toThrow('unauthenticated');
  expect((await resolve({...user,providerData:[{providerId:'phone'}]})).isCustomer).toBe(false);
  expect(loadCustomer).not.toHaveBeenCalled();
});
test.each(['admin','ADMIN','administrador_master','administrador master','gerente','funcionario','contador'])('reuse CRM role normalization: %s',role=>{
  expect(isActiveStaffProfile({role})).toBe(true);expect(normalizeRole(role)).not.toBeNull();
});
test('inactive, client, missing and unknown roles never authorize Staff',()=>{
  for(const profile of [null,{role:'cliente'},{role:'unknown'},{role:'admin',ativo:false},{role:'admin',status:'inativo'},{role:'admin',authDisabled:true}]) expect(isActiveStaffProfile(profile)).toBe(false);
});
