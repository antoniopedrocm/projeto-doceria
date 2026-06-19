const QR_ECL_M = 0;

const QR_RS_BLOCKS_M = {
  1: [[1, 26, 16]],
  2: [[1, 44, 28]],
  3: [[1, 70, 44]],
  4: [[2, 50, 32]],
  5: [[2, 67, 43]],
  6: [[4, 43, 27]],
  7: [[4, 49, 31]],
  8: [[2, 60, 38], [2, 61, 39]],
  9: [[3, 58, 36], [2, 59, 37]],
  10: [[4, 69, 43], [1, 70, 44]],
  11: [[1, 80, 50], [4, 81, 51]],
  12: [[6, 58, 36], [2, 59, 37]],
  13: [[8, 59, 37], [1, 60, 38]],
  14: [[4, 64, 40], [5, 65, 41]],
  15: [[5, 65, 41], [5, 66, 42]],
  16: [[7, 73, 45], [3, 74, 46]],
  17: [[10, 74, 46], [1, 75, 47]],
  18: [[9, 69, 43], [4, 70, 44]],
  19: [[3, 70, 44], [11, 71, 45]],
  20: [[3, 67, 41], [13, 68, 42]]
};

const QR_ALIGNMENT_POSITIONS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90]
];

let qrGaloisExp = null;
let qrGaloisLog = null;

const initGaloisTables = () => {
  if (qrGaloisExp && qrGaloisLog) return;
  qrGaloisExp = new Array(512).fill(0);
  qrGaloisLog = new Array(256).fill(0);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    qrGaloisExp[i] = value;
    qrGaloisLog[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) qrGaloisExp[i] = qrGaloisExp[i - 255];
};

const gfMultiply = (left, right) => {
  if (!left || !right) return 0;
  initGaloisTables();
  return qrGaloisExp[qrGaloisLog[left] + qrGaloisLog[right]];
};

const encodeUtf8Bytes = (value) => {
  const text = String(value || '');
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  const encoded = unescape(encodeURIComponent(text));
  return Array.from(encoded, (char) => char.charCodeAt(0));
};

const dataCodewordCapacity = (version) => QR_RS_BLOCKS_M[version].reduce(
  (sum, group) => sum + (group[0] * group[2]),
  0
);

const chooseVersion = (byteLength) => {
  for (let version = 1; version <= 20; version += 1) {
    const lengthBits = version < 10 ? 8 : 16;
    const requiredBits = 4 + lengthBits + (byteLength * 8);
    if (requiredBits <= dataCodewordCapacity(version) * 8) return version;
  }
  throw new Error('QR Code muito grande para o gerador local.');
};

const appendBits = (buffer, value, length) => {
  for (let i = length - 1; i >= 0; i -= 1) buffer.push((value >>> i) & 1);
};

const createDataCodewords = (bytes, version) => {
  const bits = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const capacityBits = dataCodewordCapacity(version) * 8;
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[i + bit];
    codewords.push(byte);
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < dataCodewordCapacity(version)) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }

  return codewords;
};

const createRsGenerator = (degree) => {
  initGaloisTables();
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(result.length + 1).fill(0);
    result.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= gfMultiply(coefficient, qrGaloisExp[i]);
    });
    result = next;
  }
  return result;
};

const createErrorCorrection = (data, ecCount) => {
  const generator = createRsGenerator(ecCount);
  const result = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const factor = result[i];
    if (!factor) continue;
    generator.forEach((coefficient, index) => {
      result[i + index] ^= gfMultiply(coefficient, factor);
    });
  }
  return result.slice(data.length);
};

const createFinalCodewords = (dataCodewords, version) => {
  const blocks = [];
  let offset = 0;
  QR_RS_BLOCKS_M[version].forEach(([count, totalCount, dataCount]) => {
    const ecCount = totalCount - dataCount;
    for (let i = 0; i < count; i += 1) {
      const data = dataCodewords.slice(offset, offset + dataCount);
      offset += dataCount;
      blocks.push({ data, ec: createErrorCorrection(data, ecCount) });
    }
  });

  const result = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    blocks.forEach((block) => {
      if (i < block.data.length) result.push(block.data[i]);
    });
  }

  const maxEcLength = Math.max(...blocks.map((block) => block.ec.length));
  for (let i = 0; i < maxEcLength; i += 1) {
    blocks.forEach((block) => {
      if (i < block.ec.length) result.push(block.ec[i]);
    });
  }

  return result;
};

const maskCondition = (mask, x, y) => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
};

const bitLength = (value) => {
  let length = 0;
  let current = value;
  while (current) {
    length += 1;
    current >>>= 1;
  }
  return length;
};

const bchRemainder = (value, polynomial) => {
  let result = value;
  const polynomialLength = bitLength(polynomial);
  while (bitLength(result) >= polynomialLength) {
    result ^= polynomial << (bitLength(result) - polynomialLength);
  }
  return result;
};

const createBaseMatrix = (version) => {
  const size = 17 + (version * 4);
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunction = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = Boolean(dark);
    reserved[y][x] = true;
  };
  const reserve = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    reserved[y][x] = true;
  };

  const drawFinder = (x, y) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
          && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(xx, yy, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  const alignments = QR_ALIGNMENT_POSITIONS[version] || [];
  alignments.forEach((x) => {
    alignments.forEach((y) => {
      if ((x <= 8 && y <= 8) || (x >= size - 9 && y <= 8) || (x <= 8 && y >= size - 9)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    setFunction(6, i, dark);
    setFunction(i, 6, dark);
  }

  setFunction(8, (version * 4) + 9, true);

  for (let i = 0; i < 9; i += 1) {
    reserve(8, i);
    reserve(i, 8);
    reserve(size - 1 - i, 8);
    reserve(8, size - 1 - i);
  }

  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        reserve(size - 11 + j, i);
        reserve(i, size - 11 + j);
      }
    }
  }

  return { size, modules, reserved, setFunction };
};

const drawFormatInfo = (matrix, mask) => {
  const data = (QR_ECL_M << 3) | mask;
  const bits = ((data << 10) | bchRemainder(data << 10, 0x537)) ^ 0x5412;
  const { size, setFunction } = matrix;
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    if (i < 6) setFunction(8, i, dark);
    else if (i < 8) setFunction(8, i + 1, dark);
    else setFunction(8, size - 15 + i, dark);

    if (i < 8) setFunction(size - 1 - i, 8, dark);
    else if (i < 9) setFunction(15 - i, 8, dark);
    else setFunction(14 - i, 8, dark);
  }
  setFunction(8, size - 8, true);
};

const drawVersionInfo = (matrix, version) => {
  if (version < 7) return;
  const bits = (version << 12) | bchRemainder(version << 12, 0x1f25);
  const { size, setFunction } = matrix;
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const x = size - 11 + (i % 3);
    const y = Math.floor(i / 3);
    setFunction(x, y, dark);
    setFunction(y, x, dark);
  }
};

const drawData = (matrix, codewords, mask) => {
  const { size, modules, reserved } = matrix;
  let bitIndex = 0;
  let direction = -1;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = direction === -1 ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        const byte = codewords[bitIndex >>> 3] || 0;
        let dark = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
        bitIndex += 1;
        if (maskCondition(mask, x, y)) dark = !dark;
        modules[y][x] = dark;
      }
    }
    direction *= -1;
  }
};

const getPenaltyScore = (modules) => {
  const size = modules.length;
  let penalty = 0;

  for (let y = 0; y < size; y += 1) {
    let runColor = modules[y][0];
    let runLength = 1;
    for (let x = 1; x < size; x += 1) {
      if (modules[y][x] === runColor) runLength += 1;
      else {
        if (runLength >= 5) penalty += 3 + runLength - 5;
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += 3 + runLength - 5;
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = modules[0][x];
    let runLength = 1;
    for (let y = 1; y < size; y += 1) {
      if (modules[y][x] === runColor) runLength += 1;
      else {
        if (runLength >= 5) penalty += 3 + runLength - 5;
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += 3 + runLength - 5;
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) penalty += 3;
    }
  }

  const patterns = ['10111010000', '00001011101'];
  for (let y = 0; y < size; y += 1) {
    const row = modules[y].map((dark) => (dark ? '1' : '0')).join('');
    patterns.forEach((pattern) => {
      let index = row.indexOf(pattern);
      while (index !== -1) {
        penalty += 40;
        index = row.indexOf(pattern, index + 1);
      }
    });
  }
  for (let x = 0; x < size; x += 1) {
    let column = '';
    for (let y = 0; y < size; y += 1) column += modules[y][x] ? '1' : '0';
    patterns.forEach((pattern) => {
      let index = column.indexOf(pattern);
      while (index !== -1) {
        penalty += 40;
        index = column.indexOf(pattern, index + 1);
      }
    });
  }

  const darkCount = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const ratio = (darkCount * 100) / (size * size);
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return penalty;
};

const createQrModules = (value) => {
  const bytes = encodeUtf8Bytes(value);
  const version = chooseVersion(bytes.length);
  const dataCodewords = createDataCodewords(bytes, version);
  const finalCodewords = createFinalCodewords(dataCodewords, version);
  let best = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = createBaseMatrix(version);
    drawData(matrix, finalCodewords, mask);
    drawFormatInfo(matrix, mask);
    drawVersionInfo(matrix, version);
    const penalty = getPenaltyScore(matrix.modules);
    if (!best || penalty < best.penalty) best = { penalty, modules: matrix.modules };
  }

  return best.modules;
};

export const createLocalQrCodeDataUrl = (value, options = {}) => {
  const source = String(value || '').trim();
  if (!source) return '';
  if (typeof document === 'undefined') return '';

  const modules = createQrModules(source);
  const moduleCount = modules.length;
  const quietZone = Number(options.margin ?? 4);
  const targetSize = Number(options.size ?? 180);
  const scale = Math.max(1, Math.floor(targetSize / (moduleCount + quietZone * 2)));
  const canvasSize = (moduleCount + quietZone * 2) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext('2d');
  if (!context) return '';

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.fillStyle = '#000000';
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) context.fillRect((x + quietZone) * scale, (y + quietZone) * scale, scale, scale);
    });
  });

  return canvas.toDataURL('image/png');
};
