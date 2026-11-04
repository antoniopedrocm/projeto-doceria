const sessionError = () => Object.assign(new Error('Sua sessão expirou. Faça login novamente para continuar.'), {code: 'unauthenticated'});

export async function clientApiRequest({auth, baseUrl, path, storeId, method = 'GET', body = null, fetchImpl = fetch}) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw sessionError();
  const url = new URL(baseUrl + path);
  url.searchParams.set('lojaId', storeId);
  const serializedBody = body === null ? undefined : JSON.stringify(body);
  const send = async (forceRefresh) => {
    if (auth.currentUser?.uid !== user.uid) throw sessionError();
    const token = await user.getIdToken(forceRefresh);
    if (!token || auth.currentUser?.uid !== user.uid) throw sessionError();
    return fetchImpl(url.toString(), {
      method,
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
      body: serializedBody,
    });
  };
  let response = await send(false);
  // Authentication is checked before API mutations. Retry only an explicit 401,
  // once, with a refreshed token from the same canonical Firebase user.
  if (response.status === 401) response = await send(true);
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {message = JSON.parse(text).message || '';} catch { /* A legacy response may be plain text. */ }
    const error = new Error(message || 'Não foi possível concluir a operação de clientes.');
    error.status = response.status;
    if (response.status === 401) error.code = 'unauthenticated';
    if (response.status === 403) error.code = 'permission-denied';
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
