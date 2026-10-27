import {staffDirectoryKey,reconcileStoreSelection,staffStoreSelectionKey} from './staffDirectory';
import {clearStaffUiState} from '../customer/staffUiState';
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
test('gate cleanup discards shared/private drafts but keeps only per-UID navigation preferences',()=>{
  sessionStorage.clear();sessionStorage.setItem('selectedStoreId',JSON.stringify('foreign-global'));
  sessionStorage.setItem('financeiro_startDate','private-draft');
  sessionStorage.setItem(staffStoreSelectionKey('staff-a'),JSON.stringify('a'));
  sessionStorage.setItem(staffStoreSelectionKey('staff-b'),JSON.stringify('b'));
  clearStaffUiState();
  expect(sessionStorage.getItem('selectedStoreId')).toBeNull();expect(sessionStorage.getItem('financeiro_startDate')).toBeNull();
  const restoredA=JSON.parse(sessionStorage.getItem(staffStoreSelectionKey('staff-a')));
  expect(restoredA).toBe('a');expect(JSON.parse(sessionStorage.getItem(staffStoreSelectionKey('staff-b')))).toBe('b');
  expect(reconcileStoreSelection(restoredA,['b'],{role:'gerente',primary:'b'},'all')).toBe('b');
  expect(staffStoreSelectionKey(null)).toBe('selectedStoreId');sessionStorage.clear();
});
