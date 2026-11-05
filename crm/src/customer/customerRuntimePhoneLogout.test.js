import {endPhoneSession} from './customerRuntime';
import {auth} from '../firebaseConfig';
import {signOut} from 'firebase/auth';
import {unregisterDeviceForPush} from '../utils/notifications';

jest.mock('firebase/app',()=>({getApps:()=>[{name:'cardapioPublic'}],initializeApp:jest.fn()}));
jest.mock('firebase/auth',()=>({getAuth:()=>({currentUser:null}),signOut:jest.fn()}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('../firebaseConfig',()=>({app:{options:{projectId:'crmdoceria-9959e'}},auth:{currentUser:{uid:'staff-a'}},functions:{}}));
jest.mock('../utils/notifications',()=>({unregisterDeviceForPush:jest.fn()}));

const session={purpose:'CUSTOMER_PRIVATE_SESSION',storeId:'phone-store',checkoutIdentityToken:'a'.repeat(64),checkoutIdentityRevision:1,addressSessionToken:'b'.repeat(64),expiresAt:Date.now()+600000};
let previousFetch;
beforeEach(()=>{previousFetch=global.fetch;sessionStorage.clear();sessionStorage.setItem('customerPhoneSession_v1',JSON.stringify({...session,expiresAt:Date.now()+600000}));sessionStorage.setItem('staff-preference','keep');jest.clearAllMocks();});
afterEach(()=>{global.fetch=previousFetch;jest.useRealTimers();});

test.each(['success','network failure'])('temporary cleanup %s clears proof without Firebase/FCM logout',async outcome=>{
  const user=auth.currentUser;
  global.fetch=jest.fn(()=>outcome==='success'?Promise.resolve({ok:true}):Promise.reject(Error('offline')));
  const flight=endPhoneSession();expect(sessionStorage.getItem('customerPhoneSession_v1')).toBeNull();await flight;
  expect(auth.currentUser).toBe(user);expect(signOut).not.toHaveBeenCalled();expect(unregisterDeviceForPush).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('staff-preference')).toBe('keep');expect(global.fetch).toHaveBeenCalledTimes(1);
  await endPhoneSession();expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('pending remote cleanup is bounded and concurrent clicks coalesce without altering Staff',async()=>{
  jest.useFakeTimers();global.fetch=jest.fn(()=>new Promise(()=>{}));
  const first=endPhoneSession(),second=endPhoneSession();expect(first).toBe(second);
  jest.advanceTimersByTime(2001);await first;
  expect(global.fetch).toHaveBeenCalledTimes(1);expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(signOut).not.toHaveBeenCalled();expect(auth.currentUser.uid).toBe('staff-a');
});
