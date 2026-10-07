const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const isValidFiscalDocument = (value) => {
  const digits = onlyDigits(value);
  if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;
  const checkDigit = (base, weights) => {
    const total = weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (digits.length === 11) {
    const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return first === Number(digits[9]) && second === Number(digits[10]);
  }
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
};

module.exports = {isValidFiscalDocument};
