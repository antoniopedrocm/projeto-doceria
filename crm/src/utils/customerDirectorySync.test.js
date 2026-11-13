import {createCustomerDirectorySync} from './customerDirectorySync';
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
beforeEach(()=>jest.useFakeTimers());afterEach(()=>jest.useRealTimers());
test('refreshes after a new order; coalesces a burst and disposes every timer',async()=>{
  const load=jest.fn().mockResolvedValueOnce({clients:[{id:'a',numeroDeCompras:1}]}).mockResolvedValue({clients:[{id:'a',numeroDeCompras:2}]}),onData=jest.fn(),onError=jest.fn();
  const s=createCustomerDirectorySync({load,onData,onError});await s.start();
  expect(load).toHaveBeenCalledTimes(1);for(let i=0;i<20;i++)s.queue();
  jest.advanceTimersByTime(5250);await flush();expect(load).toHaveBeenCalledTimes(2);
  expect(onData).toHaveBeenCalledTimes(2);expect(onError).not.toHaveBeenCalled();
  s.dispose();jest.advanceTimersByTime(60000);expect(load).toHaveBeenCalledTimes(2);
});
test('store/user switch discards late response rather than leaking previous-store rows',async()=>{
  let complete;const onData=jest.fn();
  const s=createCustomerDirectorySync({load:()=>new Promise(r=>complete=r),onData,onError:jest.fn()});
  const pending=s.start();s.dispose();complete({clients:[{id:'old-store'}]});await pending;
  expect(onData).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
});
test('error is surfaced and retries on the next interval, never silently retaining stale private rows',async()=>{
  const error=new Error('403'),onError=jest.fn(),onData=jest.fn(),load=jest.fn().mockRejectedValueOnce(error).mockResolvedValue({clients:[]});
  const s=createCustomerDirectorySync({load,onData,onError});await s.start();expect(onError).toHaveBeenCalledWith(error);
  jest.advanceTimersByTime(30000);await flush();expect(onData).toHaveBeenCalledWith({clients:[]});s.dispose();
});
test('overlapping polls queue one followup request without parallel history scans',async()=>{
  let resolve;const load=jest.fn().mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({clients:[]});
  const s=createCustomerDirectorySync({load,onData:jest.fn(),onError:jest.fn()});const p=s.start();await s.start();await s.start();
  expect(load).toHaveBeenCalledTimes(1);resolve({clients:[]});await p;
  jest.advanceTimersByTime(5250);await flush();expect(load).toHaveBeenCalledTimes(2);s.dispose();
});
test('hidden browser tab does not poll or scan after order bursts; returning refreshes immediately',async()=>{
  let visible=true;const load=jest.fn().mockResolvedValue({clients:[]});
  const s=createCustomerDirectorySync({load,onData:jest.fn(),onError:jest.fn(),isVisible:()=>visible});
  await s.start();visible=false;for(let i=0;i<20;i++)s.queue();
  jest.advanceTimersByTime(120000);await flush();expect(load).toHaveBeenCalledTimes(1);
  visible=true;await s.start();expect(load).toHaveBeenCalledTimes(2);s.dispose();expect(jest.getTimerCount()).toBe(0);
});
test('initial hidden tab defers the request and disposal cancels the deferred retry',async()=>{
  const load=jest.fn();const s=createCustomerDirectorySync({load,onData:jest.fn(),onError:jest.fn(),isVisible:()=>false});
  await s.start();jest.advanceTimersByTime(60000);await flush();expect(load).not.toHaveBeenCalled();s.dispose();expect(jest.getTimerCount()).toBe(0);
});
test('unchanged polling and visibility refresh revalidate access without resetting open administrative forms',async()=>{
 const load=jest.fn().mockImplementation(async()=>({clients:[{id:'a',valorEmCompras:12}],issues:[],canViewHistoryIssues:true,generatedAt:Date.now()})),onData=jest.fn();
 const s=createCustomerDirectorySync({load,onData,onError:jest.fn()});await s.start();await s.start();jest.advanceTimersByTime(30000);await flush();expect(load).toHaveBeenCalledTimes(3);expect(onData).toHaveBeenCalledTimes(1);s.dispose();
});
test('changed pending totals and revoked diagnostic permission update the UI even with the same Customer IDs',async()=>{
 const load=jest.fn().mockResolvedValueOnce({clients:[{id:'a',valorPendente:10}],canViewHistoryIssues:true,issues:[{reason:'SYNTHETIC'}]}).mockResolvedValueOnce({clients:[{id:'a',valorPendente:20}],canViewHistoryIssues:true,issues:[{reason:'SYNTHETIC'}]}).mockResolvedValueOnce({clients:[{id:'a',valorPendente:20}],canViewHistoryIssues:false,issues:[]}),onData=jest.fn();
 const s=createCustomerDirectorySync({load,onData,onError:jest.fn()});await s.start();await s.start();await s.start();expect(onData).toHaveBeenCalledTimes(3);expect(onData.mock.calls[2][0].canViewHistoryIssues).toBe(false);s.dispose();
});
test('authorization error clears data and an identical successful projection can restore it after recovery',async()=>{
 const row={clients:[{id:'a'}]},error=new Error('403'),load=jest.fn().mockResolvedValueOnce(row).mockRejectedValueOnce(error).mockResolvedValueOnce(row),onData=jest.fn(),onError=jest.fn();
 const s=createCustomerDirectorySync({load,onData,onError});await s.start();await s.start();await s.start();expect(onError).toHaveBeenCalledWith(error);expect(onData).toHaveBeenCalledTimes(2);s.dispose();
});
