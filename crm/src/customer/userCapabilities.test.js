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

test('Staff ready releases only Staff while private Customer lookup is pending',async()=>{
  let finish;const progress=jest.fn();
  const staff={role:'dono'},loadCustomer=jest.fn(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=createCapabilityResolver({loadStaff:async()=>staff,loadCustomer})(user,{onStaffResolved:progress});
  await Promise.resolve();await Promise.resolve();
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({uid:'a',staff,isStaff:true,isCustomer:false,customer:null,customerState:'PENDING'}));
  finish(linked);expect(await pending).toMatchObject({isStaff:true,isCustomer:true});
});
test('Customer-only or rejected Staff never receives a provisional Staff capability',async()=>{
  const progress=jest.fn();
  await createCapabilityResolver({loadStaff:async()=>null,loadCustomer:async()=>linked})(user,{onStaffResolved:progress});
  expect(progress).not.toHaveBeenCalled();
  await expect(createCapabilityResolver({loadStaff:async()=>{throw Error('denied');},loadCustomer:jest.fn()})(user,{onStaffResolved:progress})).rejects.toThrow('denied');
  expect(progress).not.toHaveBeenCalled();
});
