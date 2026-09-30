import { doc, setDoc } from 'firebase/firestore';
import { db, getDoc } from '../firebaseConfig';

export const EMPTY_FREIGHT_CONFIG = Object.freeze({
  enderecoLoja: '',
  lat: '',
  lng: '',
  valorPorKm: '',
  valorMinimoFrete: 2,
  freteACombinar: false
});

export const validateFreightCoordinates = ({ lat, lng }) => {
  const latitude = Number(String(lat ?? '').trim());
  const longitude = Number(String(lng ?? '').trim());
  if (String(lat ?? '').trim() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Informe uma latitude válida entre -90 e 90.');
  }
  if (String(lng ?? '').trim() === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Informe uma longitude válida entre -180 e 180.');
  }
  return { lat: latitude, lng: longitude };
};

const FREIGHT_FIELDS = ['enderecoLoja', 'lat', 'lng', 'valorPorKm', 'valorMinimoFrete', 'freteACombinar'];

const hasFreightFields = (value) => (
  value
  && typeof value === 'object'
  && FREIGHT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(value, field))
);

const normalizeFreightConfig = (value) => (
  hasFreightFields(value) ? { ...EMPTY_FREIGHT_CONFIG, ...value } : null
);

export const loadStoreFreightConfig = async (
  storeId,
  {
    firestore = db,
    readDoc = getDoc,
    writeDoc = setDoc,
    createDocRef = doc,
    migrateLegacy = true
  } = {}
) => {
  const normalizedStoreId = typeof storeId === 'string' ? storeId.trim() : '';
  if (!normalizedStoreId) return { ...EMPTY_FREIGHT_CONFIG };

  const primaryRef = createDocRef(
    firestore,
    'lojas',
    normalizedStoreId,
    'configuracoes',
    'config'
  );
  const primarySnap = await readDoc(primaryRef);
  if (primarySnap.exists()) {
    const primaryData = primarySnap.data() || {};
    const primaryFreight = normalizeFreightConfig(primaryData.frete)
      || normalizeFreightConfig(primaryData);
    if (primaryFreight) return primaryFreight;
  }

  const legacyFreightRef = createDocRef(
    firestore,
    'lojas',
    normalizedStoreId,
    'configuracoes',
    'frete'
  );
  const legacyFreightSnap = await readDoc(legacyFreightRef);
  if (legacyFreightSnap.exists()) {
    const legacyFreight = normalizeFreightConfig(legacyFreightSnap.data());
    if (legacyFreight) {
      if (migrateLegacy) await writeDoc(primaryRef, { frete: legacyFreight }, { merge: true });
      return legacyFreight;
    }
  }

  const legacyInfoRef = createDocRef(
    firestore,
    'lojas',
    normalizedStoreId,
    'info',
    'dados'
  );
  const legacyInfoSnap = await readDoc(legacyInfoRef);
  if (legacyInfoSnap.exists()) {
    const legacyFreight = normalizeFreightConfig(legacyInfoSnap.data()?.frete);
    if (legacyFreight) {
      if (migrateLegacy) await writeDoc(primaryRef, { frete: legacyFreight }, { merge: true });
      return legacyFreight;
    }
  }

  return { ...EMPTY_FREIGHT_CONFIG };
};
