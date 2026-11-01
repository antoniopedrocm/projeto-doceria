import {clientApiRequest} from './clientApi';
const result = (status = 200, body = {id: 'client-1'}) => ({status, ok: status >= 200 && status < 300,
  json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body)});
const fixture = () => {
  const user = {uid: 'staff-a', isAnonymous: false, getIdToken: jest.fn().mockResolvedValue('test-id-token')};
  const auth = {currentUser: user};
  const fetchImpl = jest.fn().mockResolvedValue(result());
  return {user, auth, fetchImpl, request: (options = {}) => clientApiRequest({auth, fetchImpl,
    baseUrl: 'https://us-central1-crmdoceria-9959e.cloudfunctions.net/api', path: '/clientes/client-1', storeId: 'loja-a', method: 'PUT', body: {nome: 'Cliente revisado'}, ...options})};
};
test.each(['GET', 'POST', 'PUT', 'DELETE'])('%s sends the canonical user token and selected store', async (method) => {
  const f = fixture();
  expect(await f.request({method})).toEqual({id:'client-1'});
  expect(f.user.getIdToken).toHaveBeenCalledWith(false);
  const [url, options] = f.fetchImpl.mock.calls[0];
  expect(new URL(url).searchParams.get('lojaId')).toBe('loja-a');
  expect(options.headers.Authorization).toBe('Bearer test-id-token');
  expect(options.method).toBe(method);
  expect(JSON.parse(options.body)).toEqual({nome:'Cliente revisado'});
});
test('401 refreshes once and resends the same store and body with a fresh token', async () => {
  const f = fixture();
  f.user.getIdToken.mockResolvedValueOnce('expired-token').mockResolvedValueOnce('fresh-token');
  f.fetchImpl.mockResolvedValueOnce(result(401,{message:'Sessão inválida.'})).mockResolvedValueOnce(result());
  await f.request();
  expect(f.user.getIdToken.mock.calls).toEqual([[false],[true]]);
  expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  expect(f.fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  expect(f.fetchImpl.mock.calls[1][0]).toBe(f.fetchImpl.mock.calls[0][0]);
  expect(f.fetchImpl.mock.calls[1][1].body).toBe(f.fetchImpl.mock.calls[0][1].body);
});
test('repeated 401 stops after one refresh and exposes a typed session error', async () => {
  const f = fixture(); f.fetchImpl.mockResolvedValue(result(401,{message:'Sessão inválida.'}));
  await expect(f.request()).rejects.toMatchObject({code:'unauthenticated',status:401,message:'Sessão inválida.'});
  expect(f.fetchImpl).toHaveBeenCalledTimes(2);
});
test.each([403,409,500])('%s is never retried and JSON errors are shown as messages', async status => {
  const f = fixture(); f.fetchImpl.mockResolvedValue(result(status,{message:'Alteração não autorizada'}));
  await expect(f.request()).rejects.toMatchObject({status,message:'Alteração não autorizada'});
  expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  expect(f.user.getIdToken).toHaveBeenCalledTimes(1);
});
test.each([null,{uid:'anonymous',isAnonymous:true}])('no staff session sends no request', async currentUser => {
  const f = fixture(); f.auth.currentUser = currentUser;
  await expect(f.request()).rejects.toMatchObject({code:'unauthenticated'});
  expect(f.fetchImpl).not.toHaveBeenCalled();
});
test('sign-out/account switch during token retrieval blocks the pending write', async () => {
  const f = fixture(); f.user.getIdToken.mockImplementation(async () => {f.auth.currentUser={uid:'different-staff'}; return 'old-user-token';});
  await expect(f.request()).rejects.toMatchObject({code:'unauthenticated'});
  expect(f.fetchImpl).not.toHaveBeenCalled();
});
test('session change after the first 401 prevents retry under a different user', async () => {
  const f = fixture(); f.fetchImpl.mockImplementation(async () => {f.auth.currentUser=null; return result(401,{});});
  await expect(f.request()).rejects.toMatchObject({code:'unauthenticated'});
  expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});
test('token failure never sends a write; network failures are not automatically retried', async () => {
  const f = fixture(); f.user.getIdToken.mockRejectedValueOnce(Object.assign(new Error('Token expired'),{code:'auth/user-token-expired'}));
  await expect(f.request()).rejects.toMatchObject({code:'auth/user-token-expired'});
  expect(f.fetchImpl).not.toHaveBeenCalled();
  f.fetchImpl.mockRejectedValueOnce(new Error('Network offline'));
  await expect(f.request()).rejects.toThrow('Network offline');
  expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});
test('204 responses need no JSON; legacy plain text errors remain readable', async () => {
  const f = fixture(); f.fetchImpl.mockResolvedValueOnce(result(204));
  expect(await f.request({method:'DELETE',body:null})).toBeNull();
  expect(f.fetchImpl.mock.calls[0][1].body).toBeUndefined();
  f.fetchImpl.mockResolvedValueOnce(result(400,'Telefone inválido.'));
  await expect(f.request()).rejects.toThrow('Telefone inválido.');
});
test('the explicit store replaces a conflicting query and preserves other filters', async () => {
  const f = fixture(); await f.request({path:'/clientes?lojaId=outra-loja&status=Ativo',storeId:'loja-b',method:'GET',body:null});
  const url = new URL(f.fetchImpl.mock.calls[0][0]);
  expect(url.searchParams.getAll('lojaId')).toEqual(['loja-b']);
  expect(url.searchParams.get('status')).toBe('Ativo');
});
