import { doc } from 'firebase/firestore';
import { db, getDoc } from '../firebaseConfig';

export const EMPTY_FREIGHT_CONFIG = Object.freeze({
  enderecoLoja: '', lat: '', lng: '', valorPorKm: '', valorMinimoFrete: 2, freteACombinar: false
});

export const validateFreightCoordinates = ({ lat, lng }) => {
  const latitude = Number(String(lat ?? '').trim());
  const longitude = Number(String(lng ?? '').trim());
  if (String(lat ?? '').trim() === '' || !Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    throw new Error('Informe uma latitude válida entre -90 e 90.');
  }
  if (String(lng ?? '').trim() === '' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new Error('Informe uma longitude válida entre -180 e 180.');
  }
  return { lat: latitude, lng: longitude };
};

export const loadStoreFreightConfig = async (storeId, { firestore = db, readDoc = getDoc, createDocRef = doc } = {}) => {
  if (!storeId) return { ...EMPTY_FREIGHT_CONFIG };
  for (const path of [['configuracoes', 'config'], ['configuracoes', 'frete'], ['info', 'dados']]) {
    const snapshot = await readDoc(createDocRef(firestore, 'lojas', storeId, ...path));
    if (!snapshot.exists()) continue;
    const data = snapshot.data() || {};
    const config = data.frete || (path[0] === 'info' ? {} : data);
    if (Object.keys(EMPTY_FREIGHT_CONFIG).some((field) => Object.prototype.hasOwnProperty.call(config, field))) {
      return { ...EMPTY_FREIGHT_CONFIG, ...config };
    }
  }
  return { ...EMPTY_FREIGHT_CONFIG };
};
