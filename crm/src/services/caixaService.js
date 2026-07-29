import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig.js';

const call = async (name, payload = {}) => {
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result?.data || {};
};

export const registrarValorInicialCaixa = (payload) => call('registrarValorInicialCaixa', payload);
export const registrarEncerramentoCaixa = (payload) => call('registrarEncerramentoCaixa', payload);
export const registrarRetiradaDespesaCaixa = (payload) => call('registrarRetiradaDespesaCaixa', payload);
export const registrarSangriaCaixa = (payload) => call('registrarSangriaCaixa', payload);
export const ajustarSangriaCaixa = (payload) => call('ajustarSangriaCaixa', payload);
export const listarSangriasCaixa = (payload) => call('listarSangriasCaixa', payload);
export const obterRegistroDiarioCaixa = (payload) => call('obterRegistroDiarioCaixa', payload);
export const listarConferenciasCaixa = (payload) => call('listarConferenciasCaixa', payload);
export const obterConfiguracaoAlertasCaixa = (payload) => call('obterConfiguracaoAlertasCaixa', payload);
export const salvarConfiguracaoAlertasCaixa = (payload) => call('salvarConfiguracaoAlertasCaixa', payload);
export const listarAlertasCaixa = (payload) => call('listarAlertasCaixa', payload);
export const obterDetalhesAlertaCaixa = (payload) => call('obterDetalhesAlertaCaixa', payload);
export const listarNotificacoesCaixa = (payload = {}) => call('listarNotificacoesCaixa', payload);
export const atualizarEstadoNotificacaoCaixa = (payload) => call('atualizarEstadoNotificacaoCaixa', payload);
export const alterarSituacaoAlertaCaixa = (payload) => call('alterarSituacaoAlertaCaixa', payload);
export const excluirAlertaCaixa = (payload) => call('excluirAlertaCaixa', payload);
export const excluirAlertasCaixaEmLote = (payload) => call('excluirAlertasCaixaEmLote', payload);
export const marcarTodasNotificacoesCaixaComoLidas = (payload = {}) => call('marcarTodasNotificacoesCaixaComoLidas', payload);
