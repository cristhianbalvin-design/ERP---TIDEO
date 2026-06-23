import * as XLSX from 'xlsx';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

const norm = value => String(value ?? '').trim();
const normKey = value => norm(value).toLowerCase();
const generateId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`;

export const BIOMETRICO_PERFIL_DEFAULT = {
  nombre: 'Perfil CSV/TXT generico',
  separador: ',',
  tiene_encabezado: true,
  encoding: 'utf-8',
  formato_fecha: 'DD/MM/YYYY',
  formato_hora: 'HH:mm',
  identificador_tipo: 'dni',
  columna_identificador: 'dni',
  columna_fecha: 'fecha',
  columna_hora: 'hora',
  columna_tipo: 'tipo',
  entrada_valores: 'entrada,in,checkin,0',
  salida_valores: 'salida,out,checkout,1',
  solo_marcas: false,
  estado: 'activo',
};

const splitLine = (line, sep) => {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(v => v.replace(/^"|"$/g, '').trim());
};

const parseDate = (value, format = 'auto') => {
  const raw = norm(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    const dayFirst = format === 'DD/MM/YYYY' || (format === 'auto' && Number(a) > 12);
    const dd = dayFirst ? a : b;
    const mm = dayFirst ? b : a;
    return `${y.padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
};

const parseTime = value => {
  const raw = norm(value);
  const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const colValue = (row, column, idxFallback = null) => {
  if (column == null || column === '') return '';
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  const lower = normKey(column);
  const key = Object.keys(row).find(k => normKey(k) === lower);
  if (key) return row[key];
  if (/^\d+$/.test(String(column))) return row[Number(column)];
  if (idxFallback != null) return row[idxFallback];
  return '';
};

export async function leerArchivoMarcaciones(file, perfil = BIOMETRICO_PERFIL_DEFAULT) {
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!perfil.tiene_encabezado) {
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      return aoa.map(cells => cells.reduce((acc, v, i) => ({ ...acc, [String(i)]: v }), {}));
    }
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  }

  const text = await file.text();
  const sep = perfil.separador === '\\t' ? '\t' : (perfil.separador || ',');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const first = splitLine(lines[0], sep);
  const headers = perfil.tiene_encabezado ? first : first.map((_, i) => String(i));
  const dataLines = perfil.tiene_encabezado ? lines.slice(1) : lines;
  return dataLines.map(line => {
    const cells = splitLine(line, sep);
    return headers.reduce((acc, h, i) => ({ ...acc, [h]: cells[i] ?? '' }), {});
  });
}

const trabajadorDocumento = t => norm(t.documento || t.dni || t.numero_documento);
const resolverTrabajador = (identificador, trabajadores, tipo = 'dni') => {
  const id = norm(identificador);
  if (!id) return null;
  if (tipo === 'codigo_biometrico') {
    return trabajadores.find(t => norm(t.codigo_biometrico) === id) || null;
  }
  return trabajadores.find(t => 
    trabajadorDocumento(t) === id || 
    norm(t.codigo_biometrico) === id ||
    norm(t.nombre).toLowerCase() === id.toLowerCase()
  ) || null;
};

const clasificarTipo = (value, perfil) => {
  if (perfil.solo_marcas || !perfil.columna_tipo) return 'marca';
  const v = normKey(value);
  const entradas = String(perfil.entrada_valores || '').split(',').map(normKey);
  const salidas = String(perfil.salida_valores || '').split(',').map(normKey);
  if (entradas.includes(v)) return 'entrada';
  if (salidas.includes(v)) return 'salida';
  return 'marca';
};

export async function previsualizarImportacionBiometrica({ file, perfil, trabajadores = [], registrosAsistencia = [] }) {
  const rows = await leerArchivoMarcaciones(file, perfil);

  const advertencias = [];
  if (perfil.tiene_encabezado && rows.length) {
    const headerKeys = Object.keys(rows[0]).map(normKey);
    const columnasEsperadas = [
      ['Col. identificador', perfil.columna_identificador],
      ['Col. fecha', perfil.columna_fecha],
      ['Col. hora', perfil.columna_hora],
      ...(perfil.solo_marcas ? [] : [['Col. tipo', perfil.columna_tipo]]),
    ];
    columnasEsperadas.forEach(([label, col]) => {
      if (col && !headerKeys.includes(normKey(col))) {
        advertencias.push(`No se encontro la columna "${col}" (${label}) en el archivo. Se está usando una columna por posición como respaldo; verifica el resultado antes de confirmar.`);
      }
    });
  }

  const marks = rows.map((row, index) => {
    const identificador = colValue(row, perfil.columna_identificador, 0);
    const fecha = parseDate(colValue(row, perfil.columna_fecha, 1), perfil.formato_fecha);
    const hora = parseTime(colValue(row, perfil.columna_hora, 2));
    const tipo = clasificarTipo(colValue(row, perfil.columna_tipo, 3), perfil);
    const trabajador = resolverTrabajador(identificador, trabajadores, perfil.identificador_tipo);
    const error = !identificador ? 'sin_identificador' : !fecha ? 'fecha_invalida' : !hora ? 'hora_invalida' : null;
    return { id: `mark_${index}`, index: index + 1, row, identificador: norm(identificador), fecha, hora, tipo, trabajador, error };
  });

  const grouped = new Map();
  marks.filter(m => !m.error && m.trabajador).forEach(m => {
    const key = `${m.trabajador.id}:${m.fecha}`;
    grouped.set(key, [...(grouped.get(key) || []), m]);
  });

  const ready = [];
  const unresolved = [];
  const errors = [];
  const duplicates = [];
  const blocked = [];

  marks.forEach(m => {
    if (m.error) errors.push({ ...m, clasificacion: 'error', motivo: m.error });
    else if (!m.trabajador) unresolved.push({ ...m, clasificacion: 'no_resuelto', motivo: 'identificador_no_resuelto' });
  });

  grouped.forEach((items) => {
    const sorted = [...items].sort((a, b) => a.hora.localeCompare(b.hora));
    const base = sorted[0];
    const trabajador = base.trabajador;
    if (trabajador?.asistencia_bloqueada) {
      blocked.push({ ...base, marcas: sorted, clasificacion: 'bloqueado', motivo: trabajador.asistencia_bloqueada_motivo || 'Contrato vencido' });
      return;
    }
    const entradas = sorted.filter(m => m.tipo === 'entrada');
    const salidas = sorted.filter(m => m.tipo === 'salida');
    const horaEntrada = entradas[0]?.hora || sorted[0]?.hora;
    const horaSalida = salidas.at(-1)?.hora || (sorted.length > 1 ? sorted.at(-1)?.hora : null);
    const existente = registrosAsistencia.find(r => String(r.trabajador_id) === String(trabajador.id) && r.fecha === base.fecha && r.estado !== 'anulado');
    const row = {
      id: `${trabajador.id}_${base.fecha}`,
      trabajador,
      fecha: base.fecha,
      hora_entrada: horaEntrada,
      hora_salida: horaSalida,
      marcas: sorted,
      existente,
      clasificacion: existente ? 'duplicado' : 'listo',
      motivo: existente ? 'registro_existente_del_dia' : null,
    };
    if (existente) duplicates.push(row);
    else ready.push(row);
  });

  return {
    fileName: file?.name || 'archivo',
    total: marks.length,
    ready,
    duplicates,
    unresolved,
    errors,
    blocked,
    marks,
    advertencias,
    resumen: {
      listos: ready.length,
      duplicados: duplicates.length,
      no_resueltos: unresolved.length,
      errores: errors.length,
      bloqueados: blocked.length,
    },
  };
}

export const biometricoService = {
  async listar(empresaId) {
    if (!isSupabaseConfigured() || !empresaId) return { perfiles: [], lotes: [] };
    const supabase = await getSupabaseClient();
    const [perfiles, lotes] = await Promise.all([
      supabase.from('asistencia_biometrico_perfiles').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('asistencia_biometrico_lotes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    ]);
    if (perfiles.error) throw perfiles.error;
    if (lotes.error) throw lotes.error;
    return { perfiles: perfiles.data || [], lotes: lotes.data || [] };
  },

  async guardarPerfil(empresaId, perfil) {
    if (!isSupabaseConfigured()) return { ...perfil, id: perfil.id || generateId('bio_perfil'), empresa_id: empresaId };
    const supabase = await getSupabaseClient();
    const payload = { ...perfil, empresa_id: empresaId, updated_at: new Date().toISOString() };
    const query = perfil.id
      ? supabase.from('asistencia_biometrico_perfiles').update(payload).eq('id', perfil.id)
      : supabase.from('asistencia_biometrico_perfiles').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data;
  },

  async crearLote(empresaId, lote) {
    if (!isSupabaseConfigured()) return { ...lote, id: lote.id || generateId('bio_lote'), empresa_id: empresaId };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('asistencia_biometrico_lotes').insert({ ...lote, empresa_id: empresaId }).select('*').single();
    if (error) throw error;
    return data;
  },

  async anularLote(loteId, motivo) {
    if (!isSupabaseConfigured()) return { id: loteId, estado: 'anulado', motivo_anulacion: motivo, anulado_en: new Date().toISOString() };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('anular_lote_biometrico', { p_lote_id: loteId, p_motivo: motivo });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },
};
