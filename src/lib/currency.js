const DEFAULT_LOCALE = 'es-PE';

const CURRENCY_SYMBOLS = {
  PEN: 'S/',
  USD: 'US$',
  EUR: 'EUR',
};

const CURRENCY_LABELS = {
  PEN: 'Soles',
  USD: 'Dolares',
  EUR: 'Euros',
};

export const normalizeCurrency = (currency = 'PEN') => String(currency || 'PEN').trim().toUpperCase();

export const currencySymbol = (currency = 'PEN') => {
  const code = normalizeCurrency(currency);
  return CURRENCY_SYMBOLS[code] || code;
};

export const currencyLabel = (currency = 'PEN') => {
  const code = normalizeCurrency(currency);
  return CURRENCY_LABELS[code] || code;
};

export const formatMoney = (amount = 0, currency = 'PEN', options = {}) => {
  const {
    decimals = 2,
    showCode = false,
    locale = DEFAULT_LOCALE,
  } = options;

  const value = Number(amount || 0);
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const code = normalizeCurrency(currency);
  return `${currencySymbol(code)}\u00a0${formatted}${showCode ? ` ${code}` : ''}`;
};

export const formatMoney0 = (amount = 0, currency = 'PEN', options = {}) =>
  formatMoney(amount, currency, { ...options, decimals: 0 });

export const sumByCurrency = (items = [], valueGetter = item => item?.monto || 0, currencyGetter = item => item?.moneda || 'PEN') =>
  items.reduce((totals, item) => {
    const currency = normalizeCurrency(currencyGetter(item));
    const value = Number(valueGetter(item) || 0);
    return { ...totals, [currency]: (totals[currency] || 0) + value };
  }, {});

export const formatCurrencyTotals = (totals = {}, options = {}) => {
  const entries = Object.entries(totals).filter(([, value]) => Number(value || 0) !== 0);
  if (!entries.length) return formatMoney(0, options.defaultCurrency || 'PEN', options);
  return entries.map(([currency, value]) => formatMoney(value, currency, options)).join(' · ');
};

export const groupByCurrency = (items = [], currencyGetter = item => item?.moneda || 'PEN') =>
  items.reduce((groups, item) => {
    const currency = normalizeCurrency(currencyGetter(item));
    return { ...groups, [currency]: [...(groups[currency] || []), item] };
  }, {});

export { CURRENCY_SYMBOLS, CURRENCY_LABELS };
