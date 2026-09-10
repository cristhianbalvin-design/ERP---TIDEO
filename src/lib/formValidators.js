export const PHONE_PATTERN = '^9\\d{8}$';
export const RUC_PATTERN = '^[12]\\d{10}$';
export const TIPO_DOCUMENTO_RUC = 'RUC';
export const TIPO_DOCUMENTO_TAX_ID_EXTRANJERO = 'TAX_ID_EXTRANJERO';
export const TAX_ID_EXTRANJERO_MIN_LENGTH = 3;
export const TAX_ID_EXTRANJERO_MAX_LENGTH = 30;

export function sanitizePhone(value = '') {
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('51') && digits[2] === '9') {
    digits = digits.slice(2);
  }
  if (digits && digits[0] !== '9') return '';
  return digits.slice(0, 9);
}

export function sanitizeRuc(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (digits && !['1', '2'].includes(digits[0])) return '';
  return digits.slice(0, 11);
}

export function sanitizeDocumentoCliente(value = '', tipoDocumento = TIPO_DOCUMENTO_RUC) {
  if (tipoDocumento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO) {
    return String(value).replace(/\s+/g, ' ').trimStart().slice(0, TAX_ID_EXTRANJERO_MAX_LENGTH);
  }
  return sanitizeRuc(value);
}

export function isValidPhone(value = '') {
  return !value || /^9\d{8}$/.test(String(value));
}

export function isValidRuc(value = '') {
  const ruc = String(value || '');
  if (!ruc) return true;
  return /^[12]\d{10}$/.test(ruc);
}

export function isValidDocumentoCliente(value = '', tipoDocumento = TIPO_DOCUMENTO_RUC) {
  if (tipoDocumento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO) {
    const taxId = String(value).trim();
    return taxId.length >= TAX_ID_EXTRANJERO_MIN_LENGTH && taxId.length <= TAX_ID_EXTRANJERO_MAX_LENGTH;
  }
  return isValidRuc(value);
}
