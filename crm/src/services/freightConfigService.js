import { doc, setDoc } from 'firebase/firestore';
import { db, getDoc } from '../firebaseConfig';

export const EMPTY_FREIGHT_CONFIG = Object.freeze({
  enderecoLoja: '',
  lat: '',
  lng: '',
  valorPorKm: ''
});

const FREIGHT_FIELDS = ['enderecoLoja', 'lat', 'lng', 'valorPorKm'];

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
