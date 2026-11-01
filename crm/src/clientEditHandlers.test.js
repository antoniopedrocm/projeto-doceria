import fs from 'fs';
import path from 'path';
import {parse} from '@babel/parser';
const source = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
const ast = parse(source, {sourceType:'module',plugins:['jsx']});
function find(scope, name) {
  if (!scope || typeof scope !== 'object') return null;
  if (scope.type === 'VariableDeclarator' && scope.id?.name === name) return scope.init.type === 'CallExpression' ? scope.init.arguments[0] : scope.init;
  for (const value of Object.values(scope)) {
    if (Array.isArray(value)) {for (const item of value) {const found=find(item,name); if(found)return found;}}
    else if(value && typeof value==='object') {const found=find(value,name);if(found)return found;}
  }
  return null;
}
function handler(scope, name, bindings) {
  const expression=find(scope,name);
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(bindings),'return ('+source.slice(expression.start,expression.end)+');')(...Object.values(bindings));
}
test('App customer calls pass canonical auth, selected store and edit payload to the authenticated API helper', async () => {
  const auth={currentUser:{uid:'staff'}};
  const clientApiRequest=jest.fn().mockResolvedValue({ok:true});
  const call=handler(ast,'callClientApi',{auth,clientApiRequest,API_BASE_URL:'https://dev.test/api',resolveActiveStoreForWrite:()=> 'store-a'});
  await call('/clientes/client-a',{method:'PUT',body:{nome:'Nome revisado'}});
  expect(clientApiRequest).toHaveBeenCalledWith({auth,baseUrl:'https://dev.test/api',path:'/clientes/client-a',storeId:'store-a',method:'PUT',body:{nome:'Nome revisado'}});
});
const formData={nome:'Nome revisado',cpf:'529.982.247-25',cep:'74000-000',cidade:'Goiania',uf:'go',codigoIbge:'5208707'};
test('saving an existing client targets its ID, normalizes fields and closes only after success', async () => {
  const updateItem=jest.fn().mockResolvedValue(),setShowModal=jest.fn(),resetForm=jest.fn();
  const submit=handler(find(ast,'Clientes'),'handleSubmit',{formData,editingClient:{id:'client-a'},updateItem,addItem:jest.fn(),setShowModal,resetForm});
  await submit({preventDefault:jest.fn()});
  expect(updateItem).toHaveBeenCalledWith('clientes','client-a',expect.objectContaining({nome:'Nome revisado',cpf:'52998224725',cep:'74000000',uf:'GO'}));
  expect(setShowModal).toHaveBeenCalledWith(false);expect(resetForm).toHaveBeenCalledTimes(1);
});
test('a rejected save keeps editing fields and dialog intact without an unhandled rejection', async () => {
  const setShowModal=jest.fn(),resetForm=jest.fn();
  const submit=handler(find(ast,'Clientes'),'handleSubmit',{formData,editingClient:{id:'client-a'},updateItem:jest.fn().mockRejectedValue(new Error('Sem permissão')),addItem:jest.fn(),setShowModal,resetForm});
  await expect(submit({preventDefault:jest.fn()})).resolves.toBeUndefined();
  expect(setShowModal).not.toHaveBeenCalled();expect(resetForm).not.toHaveBeenCalled();
});
