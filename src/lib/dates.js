const DAY_MS = 24 * 60 * 60 * 1000;

export const toDate = value => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const formatDateISO = value => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
};

export const diffDays = (from, to) => {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return null;
  const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUTC = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUTC - startUTC) / DAY_MS);
};

export const isBetweenDates = (value, start, end) => {
  const date = toDate(value);
  const from = toDate(start);
  const to = toDate(end);
  if (!date || !from || !to) return false;
  return date >= from && date <= to;
};

export const addMonths = (value, months = 0) => {
  const date = toDate(value);
  if (!date) return null;
  const copy = new Date(date);
  const originalDay = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + Number(months || 0));
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(originalDay, lastDay));
  return copy;
};

export const monthKey = value => {
  const date = toDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
};

export const sameMonth = (left, right) => monthKey(left) === monthKey(right);

export const nextMonths = (start = new Date(), count = 12) =>
  Array.from({ length: count }, (_, index) => addMonths(start, index)).filter(Boolean);

export const isDueInDays = (date, days = 7, from = new Date()) => {
  const remaining = diffDays(from, date);
  return remaining != null && remaining >= 0 && remaining <= Number(days || 0);
};
