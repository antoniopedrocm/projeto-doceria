import {createPublicDirectoryReader,storeDeadline,STORE_REQUEST_TIMEOUT_MS} from './storeRequests';
afterEach(()=>jest.useRealTimers());
test('concurrent mounts share only in-flight requests; completed reload fetches fresh metadata',async()=>{
  let finish;const fetcher=jest.fn(()=>new Promise(done=>{finish=done;})),read=createPublicDirectoryReader(fetcher);
  const first=read('https://dev'),second=read('https://dev');expect(first).toBe(second);expect(fetcher).toHaveBeenCalledTimes(1);
  finish({ok:true,status:200,json:async()=>({stores:[{storeId:'a',name:'A'}]})});await first;
  const next=read('https://dev');expect(fetcher).toHaveBeenCalledTimes(2);
  finish({ok:true,status:200,json:async()=>({stores:[]})});expect((await next).stores).toEqual([]);
});
test('failure clears single-flight entry and permits a successful retry',async()=>{
  const fetcher=jest.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,json:async()=>({stores:[]})});
  const read=createPublicDirectoryReader(fetcher);await expect(read('dev')).rejects.toThrow();expect(await read('dev')).toEqual({stores:[]});
});
test('HTTP timeout aborts only the public request, and malformed payload is not success',async()=>{
  jest.useFakeTimers();let aborted=false;
  const read=createPublicDirectoryReader((_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})));
  const pending=read('dev'),check=expect(pending).rejects.toThrow('aborted');
  jest.advanceTimersByTime(STORE_REQUEST_TIMEOUT_MS);await check;expect(aborted).toBe(true);
  const bad=createPublicDirectoryReader(async()=>({ok:true,json:async()=>({privateData:'not-directory'})}));await expect(bad('dev')).rejects.toThrow('STORE_DIRECTORY_INVALID');
});
test('Firestore deadline releases the UI without canceling or applying a late operation',async()=>{
  jest.useFakeTimers();let finish;
  const operation=new Promise(done=>{finish=done;}),result=storeDeadline(operation),check=expect(result).rejects.toThrow('STORE_REQUEST_TIMEOUT');
  jest.advanceTimersByTime(STORE_REQUEST_TIMEOUT_MS);await check;finish('late');await operation;
  expect(await storeDeadline(Promise.resolve('fresh'))).toBe('fresh');
});
