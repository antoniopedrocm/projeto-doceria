import {staffDirectoryKey,reconcileStoreSelection} from './staffDirectory';
const user={auth:{uid:'staff-a'},role:'gerente',lojaId:'b',lojaIds:['a','b'],canAccessAllStores:false};
test('directory key ignores schedule/Customer/notification updates but changes on authorization scope',()=>{
  const key=staffDirectoryKey(user);
  expect(staffDirectoryKey({...user,jornadaTrabalho:{changed:true},customer:{id:'private'},permissions:{'entre-lojas':false}})).toBe(key);
  for(const change of [{auth:{uid:'staff-b'}},{lojaIds:['a']},{role:'dono'},{canAccessAllStores:true},{lojaId:'a'}])expect(staffDirectoryKey({...user,...change})).not.toBe(key);
  expect(staffDirectoryKey(null)).toBeNull();expect(staffDirectoryKey({})).toBeNull();
});
test('selection survives refresh and general/store transitions; revoked store is removed',()=>{
  const access=JSON.parse(staffDirectoryKey(user));
  expect(reconcileStoreSelection('a',['a','b'],access,'all')).toBe('a');
  expect(reconcileStoreSelection('revoked',['a','b'],access,'all')).toBe('b');
  expect(reconcileStoreSelection('all',['a'],access,'all')).toBe('a');
  expect(reconcileStoreSelection('a',[],access,'all')).toBeNull();
  const owner={role:'dono'};
  expect(reconcileStoreSelection('all',['a'],owner,'all')).toBe('all');
  expect(reconcileStoreSelection('a',['a'],owner,'all')).toBe('a');
  expect(reconcileStoreSelection('revoked',['a'],owner,'all')).toBe('all');
});
