// As lojas legadas do cardápio público em DEV têm subcoleções em /lojas,
// mas não têm necessariamente um documento raiz. A lista explícita impede
// que um lojaId arbitrário libere a consulta pública de clientes.
const LEGACY_PUBLIC_STORE_IDS = new Set([
  'ana-guimaraes-matriz',
  'ana-guimaraes-garavelo',
]);

const createPublicStoreValidator = (getStoreRef) => async (storeId) => {
  if (LEGACY_PUBLIC_STORE_IDS.has(storeId)) return true;
  const storeDoc = await getStoreRef(storeId).get();
  return storeDoc.exists;
};

module.exports = {createPublicStoreValidator};
