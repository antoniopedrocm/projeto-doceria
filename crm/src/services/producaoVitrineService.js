import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig.js';

const call = async (name, payload = {}) => {
  const response = await httpsCallable(functions, name)(payload);
  return response.data;
};

export const listarProducoesVitrine = (filtros) => call('listProductionShowcase', filtros);
export const listarProdutosProducaoVitrine = (lojaId) => call('listProductionShowcaseProducts', { lojaId });
export const criarProducaoVitrine = (dados) => call('createProductionShowcase', dados);
export const enviarProducaoVitrine = (producaoId) => call('sendProductionShowcase', { producaoId });
export const receberProducaoVitrine = (dados) => call('receiveProductionShowcase', dados);
export const cancelarProducaoVitrine = (producaoId, motivo) => call('cancelProductionShowcase', { producaoId, motivo });

export const getProducaoVitrineErrorMessage = (error) => String(
  error?.details?.message || error?.message || 'Não foi possível concluir a operação.',
).replace(/^FirebaseError:\s*/i, '');
