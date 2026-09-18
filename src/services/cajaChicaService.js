import { getSupabaseClient } from '../lib/supabaseClient.js';
import { validarSociedadActivaParaEscritura } from './sociedadEscrituraService.js';

const genId = prefix => `${prefix}_${Math.random().toString(36).slice(2, 14)}`;

const stripUnknownColumn = (error, payload) => {
  const col = error?.message?.match(/column "([^"]+)" of relation/)?.[1]
    || error?.message?.match(/'([^']+)' column/)?.[1];
  if (!col || !(col in payload)) return null;
  const next = { ...payload };
  delete next[col];
  return next;
};

async function insertWithFallback(supabase, table, payload) {
  let current = { ...payload };
  for (let i = 0; i < 10; i += 1) {
    const { data, error } = await supabase.from(table).insert(current).select().single();
    if (!error) return data;
    const next = stripUnknownColumn(error, current);
    if (!next) throw error;
    current = next;
  }
  const { data, error } = await supabase.from(table).insert(current).select().single();
  if (error) throw error;
  return data;
}

async function updateWithFallback(supabase, table, id, payload) {
  let current = { ...payload };
  for (let i = 0; i < 10; i += 1) {
    const { data, error } = await supabase.from(table).update(current).eq('id', id).select().single();
    if (!error) return data;
    const next = stripUnknownColumn(error, current);
    if (!next) throw error;
    current = next;
  }
  const { data, error } = await supabase.from(table).update(current).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

const isActivo = row => !['anulado', 'anulada'].includes(String(row?.estado || '').toLowerCase());

async function obtenerFondoAbierto(supabase, fondoId) {
  if (!fondoId) throw new Error('Seleccione un fondo de caja chica.');
  const { data: fondo, error } = await supabase
    .from('caja_chica_fondos')
    .select('id, empresa_id, nombre, moneda, estado')
    .eq('id', fondoId)
    .single();
  if (error) throw error;
  if (fondo?.estado === 'cerrado') {
    throw new Error('No se pueden registrar movimientos en un fondo de caja chica cerrado.');
  }
  return fondo;
}

function calcularFondos(fondos = [], egresos = [], rendiciones = [], arqueos = [], aportes = []) {
  return fondos.map(fondo => {
    const egresosFondo = egresos.filter(e => e.fondo_id === fondo.id && isActivo(e));
    const rendicionesFondo = rendiciones.filter(r => r.fondo_id === fondo.id);
    const arqueosFondo = arqueos.filter(a => a.fondo_id === fondo.id);
    const aportesFondo = aportes.filter(a => a.fondo_id === fondo.id && isActivo(a));
    const gastado = egresosFondo.reduce((s, e) => s + Number(e.monto || 0), 0);
    const aportado = aportesFondo.reduce((s, a) => s + Number(a.monto || 0), 0);
    const repuesto = rendicionesFondo
      .filter(r => ['aprobada', 'repuesta'].includes(String(r.estado || '').toLowerCase()))
      .reduce((s, r) => s + Number(r.monto_aprobado || 0), 0);
    const disponible = Math.max(0, Number(fondo.monto_asignado || 0) + aportado - gastado + repuesto);
    const rendicion_vigente = rendicionesFondo
      .filter(r => !['rechazada', 'repuesta'].includes(String(r.estado || '').toLowerCase()))
      .sort((a, b) => String(b.creado_en || '').localeCompare(String(a.creado_en || '')))[0] || null;
    const ultimo_arqueo = arqueosFondo
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0] || null;

    return {
      ...fondo,
      saldo_disponible: disponible,
      monto_gastado: gastado,
      monto_aportado: aportado,
      monto_repuesto: repuesto,
      tiene_movimientos: egresosFondo.length > 0 || rendicionesFondo.length > 0 || arqueosFondo.length > 0 || aportesFondo.length > 0,
      requiere_reposicion: disponible <= Number(fondo.monto_minimo || 0),
      rendicion_vigente,
      ultimo_arqueo,
    };
  });
}

export const cajaChicaService = {
  async listarFondos(empresaId) {
    const supabase = await getSupabaseClient();
    const fondosReq = supabase
      .from('caja_chica_fondos')
      .select('*, cuentas_bancarias(id, nombre, banco, moneda), responsable:usuarios!caja_chica_fondos_responsable_id_fkey(id, nombre, email), aportante:usuarios!caja_chica_fondos_aportante_id_fkey(id, nombre, email)')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });

    let fondosResult = await fondosReq;
    if (fondosResult.error) {
      fondosResult = await supabase
        .from('caja_chica_fondos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('creado_en', { ascending: false });
    }
    if (fondosResult.error) throw fondosResult.error;

    const [egresosResult, rendicionesResult, arqueosResult, aportesResult] = await Promise.all([
      supabase.from('caja_chica').select('*').eq('empresa_id', empresaId),
      supabase.from('caja_chica_rendiciones').select('*').eq('empresa_id', empresaId),
      supabase.from('caja_chica_arqueos').select('*').eq('empresa_id', empresaId),
      supabase.from('caja_chica_aportes').select('*').eq('empresa_id', empresaId),
    ]);
    if (egresosResult.error) throw egresosResult.error;

    return calcularFondos(
      fondosResult.data || [],
      egresosResult.data || [],
      rendicionesResult.error ? [] : (rendicionesResult.data || []),
      arqueosResult.error ? [] : (arqueosResult.data || []),
      aportesResult.error ? [] : (aportesResult.data || []),
    );
  },

  async listarFondosActivosConSaldo(empresaId) {
    const fondos = await this.listarFondos(empresaId);
    return fondos.filter(f => f.estado === 'activo' && Number(f.saldo_disponible || 0) > 0);
  },

  async listarMovimientos(empresaId) {
    const supabase = await getSupabaseClient();
    const [egresos, rendiciones, aportes, fondos] = await Promise.all([
      supabase.from('caja_chica').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('caja_chica_rendiciones').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }),
      supabase.from('caja_chica_aportes').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('caja_chica_fondos').select('id, nombre').eq('empresa_id', empresaId),
    ]);
    if (egresos.error) throw egresos.error;
    const fondoNombre = new Map((fondos.data || []).map(f => [f.id, f.nombre]));
    const rows = [
      ...(egresos.data || []).map(e => ({
        ...e,
        tipo_movimiento: 'egreso',
        fondo_nombre: fondoNombre.get(e.fondo_id) || null,
        fecha_movimiento: e.fecha,
        monto_movimiento: -Number(e.monto || 0),
      })),
      ...((rendiciones.data || []).filter(r => ['aprobada', 'repuesta'].includes(r.estado)).map(r => ({
        ...r,
        tipo_movimiento: 'reposicion',
        fondo_nombre: fondoNombre.get(r.fondo_id) || null,
        concepto: `Reposicion rendicion ${r.periodo_inicio || ''} - ${r.periodo_fin || ''}`,
        fecha_movimiento: r.aprobado_en || r.creado_en,
        monto_movimiento: Number(r.monto_aprobado || 0),
      }))),
      ...((aportes.data || []).filter(isActivo).map(a => ({
        ...a,
        tipo_movimiento: 'aporte',
        fondo_nombre: fondoNombre.get(a.fondo_id) || null,
        concepto: `Aporte ${String(a.tipo_origen || '').replaceAll('_', ' ')}`,
        fecha_movimiento: a.fecha || a.creado_en,
        monto_movimiento: Number(a.monto || 0),
      }))),
    ];
    return rows.sort((a, b) => String(b.fecha_movimiento || '').localeCompare(String(a.fecha_movimiento || '')));
  },

  async crearFondo(payload) {
    const supabase = await getSupabaseClient();
    const fondo = await insertWithFallback(supabase, 'caja_chica_fondos', {
      id: payload.id || genId('ccf'),
      ...payload,
      estado: payload.estado || 'activo',
      fecha_apertura: payload.fecha_apertura || new Date().toISOString().slice(0, 10),
    });

    // Mientras una instalación antigua aún no tenga la columna, mantenemos el
    // comportamiento bancario existente. Con el esquema actual, un aporte
    // directo nunca crea un movimiento pendiente de conciliación.
    const tipoOrigen = fondo.tipo_origen || payload.tipo_origen || 'cuenta_bancaria';
    if (tipoOrigen === 'aporte_directo') return fondo;

    const movimiento = {
      id: genId('tes'),
      empresa_id: fondo.empresa_id,
      tipo: 'egreso',
      descripcion: `Constitucion fondo caja chica: ${fondo.nombre}`,
      monto: Number(fondo.monto_asignado || 0),
      moneda: fondo.moneda || 'PEN',
      fecha: fondo.fecha_apertura,
      cuenta_bancaria_id: fondo.cuenta_bancaria_id || null,
      categoria: 'caja_chica',
      es_manual: false,
      referencia: payload.referencia_desembolso || null,
      vinculo_tipo: 'caja_chica_fondo',
      vinculo_id: fondo.id,
      estado: 'registrado',
    };
    try {
      await insertWithFallback(supabase, 'movimientos_tesoreria', movimiento);
    } catch (error) {
      console.warn('[cajaChicaService] movimiento desembolso:', error?.message || error);
    }
    return fondo;
  },

  async actualizarFondo(id, payload) {
    const supabase = await getSupabaseClient();
    return updateWithFallback(supabase, 'caja_chica_fondos', id, payload);
  },

  async eliminarFondoSinMovimientos(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('eliminar_fondo_caja_sin_movimientos', {
      p_fondo_id: id,
    });
    if (error) throw error;
  },

  async registrarAporte(fondoId, datos = {}) {
    const supabase = await getSupabaseClient();
    const fondo = await obtenerFondoAbierto(supabase, fondoId);
    const tipoOrigen = datos.tipo_origen;
    if (!['cuenta_bancaria', 'aporte_directo', 'prestamo_tercero'].includes(tipoOrigen)) {
      throw new Error('Selecciona un tipo de origen para el aporte.');
    }
    if (tipoOrigen === 'cuenta_bancaria' && !datos.cuenta_bancaria_id) {
      throw new Error('Selecciona la cuenta bancaria de origen del aporte.');
    }
    if (tipoOrigen === 'aporte_directo' && !datos.aportante_id) {
      throw new Error('Selecciona quién entregó el efectivo.');
    }
    if (tipoOrigen === 'prestamo_tercero' && !String(datos.tercero_nombre || '').trim()) {
      throw new Error('Indica el nombre del tercero que otorgó el préstamo.');
    }
    const monto = Number(datos.monto || 0);
    if (monto <= 0) throw new Error('El monto del aporte debe ser mayor a cero.');

    const aporte = await insertWithFallback(supabase, 'caja_chica_aportes', {
      id: datos.id || genId('cca'),
      empresa_id: fondo.empresa_id,
      fondo_id: fondo.id,
      fecha: datos.fecha || new Date().toISOString().slice(0, 10),
      monto,
      moneda: datos.moneda || fondo.moneda || 'PEN',
      tipo_origen: tipoOrigen,
      cuenta_bancaria_id: tipoOrigen === 'cuenta_bancaria' ? datos.cuenta_bancaria_id : null,
      aportante_id: tipoOrigen === 'aporte_directo' ? datos.aportante_id : null,
      tercero_nombre: tipoOrigen === 'prestamo_tercero' ? String(datos.tercero_nombre).trim() : null,
      tercero_documento: tipoOrigen === 'prestamo_tercero' ? (datos.tercero_documento || null) : null,
      notas: datos.notas || null,
      creado_por: datos.creado_por || null,
      estado: 'registrado',
    });

    if (tipoOrigen === 'cuenta_bancaria') {
      try {
        await insertWithFallback(supabase, 'movimientos_tesoreria', {
          id: genId('tes'),
          empresa_id: aporte.empresa_id,
          tipo: 'egreso',
          descripcion: `Aporte a caja chica: ${fondo.nombre}`,
          monto: Number(aporte.monto || 0),
          moneda: aporte.moneda || fondo.moneda || 'PEN',
          fecha: aporte.fecha,
          cuenta_bancaria_id: aporte.cuenta_bancaria_id,
          categoria: 'caja_chica',
          es_manual: false,
          referencia: datos.referencia || null,
          vinculo_tipo: 'caja_chica_aporte',
          vinculo_id: aporte.id,
          estado: 'registrado',
        });
      } catch (error) {
        console.warn('[cajaChicaService] movimiento aporte:', error?.message || error);
      }
    }
    return aporte;
  },

  async registrarEgresoFondo(payload) {
    if (!payload?.fondo_id) throw new Error('Seleccione un fondo de caja chica.');
    const supabase = await getSupabaseClient();
    await obtenerFondoAbierto(supabase, payload.fondo_id);
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      supabase,
      payload?.empresa_id,
      payload?.sociedad_id,
      'La sociedad es obligatoria para registrar el egreso de caja chica.',
    );
    const { data, error } = await supabase.rpc('registrar_egreso_caja_chica_atomico', {
      p_payload: { ...payload, sociedad_id: sociedadId },
    });
    if (error) throw error;
    return data;
  },

  async solicitarRendicion(payload) {
    const supabase = await getSupabaseClient();
    await obtenerFondoAbierto(supabase, payload?.fondo_id);
    return insertWithFallback(supabase, 'caja_chica_rendiciones', {
      id: payload.id || genId('ccr'),
      estado: 'solicitada',
      ...payload,
    });
  },

  async procesarRendicion(id, { accion, monto_aprobado, aprobado_por, transferencia_reposicion_ref, cuenta_bancaria_id, notas }) {
    const supabase = await getSupabaseClient();
    const { data: actual, error: getError } = await supabase.from('caja_chica_rendiciones').select('*').eq('id', id).single();
    if (getError) throw getError;
    const { data: fondo, error: fondoError } = await supabase
      .from('caja_chica_fondos')
      .select('id, tipo_origen')
      .eq('id', actual.fondo_id)
      .single();
    if (fondoError) throw fondoError;

    const estado = accion === 'aprobar' ? 'aprobada' : 'rechazada';
    if (estado === 'aprobada' && !['cuenta_bancaria', 'aporte_directo'].includes(fondo?.tipo_origen)) {
      throw new Error('Clasifica el origen del fondo antes de aprobar una reposición.');
    }
    const updated = await updateWithFallback(supabase, 'caja_chica_rendiciones', id, {
      estado,
      monto_aprobado: estado === 'aprobada' ? Number(monto_aprobado || actual.monto_solicitado || 0) : 0,
      aprobado_por: aprobado_por || null,
      aprobado_en: new Date().toISOString(),
      transferencia_reposicion_ref: transferencia_reposicion_ref || null,
      cuenta_bancaria_id: cuenta_bancaria_id || actual.cuenta_bancaria_id || null,
      notas: notas || actual.notas || null,
    });

    if (estado === 'aprobada' && fondo.tipo_origen === 'cuenta_bancaria') {
      const monto = Number(updated.monto_aprobado || 0);
      try {
        await insertWithFallback(supabase, 'movimientos_tesoreria', {
          id: genId('tes'),
          empresa_id: updated.empresa_id,
          tipo: 'egreso',
          descripcion: `Reposicion caja chica: ${updated.fondo_id}`,
          monto,
          moneda: updated.moneda || 'PEN',
          fecha: new Date().toISOString().slice(0, 10),
          cuenta_bancaria_id: updated.cuenta_bancaria_id || null,
          categoria: 'caja_chica',
          es_manual: false,
          referencia: updated.transferencia_reposicion_ref || null,
          vinculo_tipo: 'caja_chica_rendicion',
          vinculo_id: updated.id,
          estado: 'registrado',
        });
      } catch (error) {
        console.warn('[cajaChicaService] movimiento reposicion:', error?.message || error);
      }
    }
    return updated;
  },

  async registrarArqueo(payload) {
    const efectivo = Number(payload.efectivo_declarado || 0);
    const comprobantes = Number(payload.comprobantes_pendientes || 0);
    const saldoSistema = Number(payload.saldo_sistema || 0);
    const diferencia = Number((efectivo + comprobantes - saldoSistema).toFixed(2));
    if (Math.abs(diferencia) > 0.009 && !String(payload.justificacion || '').trim()) {
      throw new Error('La justificacion es obligatoria cuando hay diferencia de arqueo.');
    }
    const supabase = await getSupabaseClient();
    return insertWithFallback(supabase, 'caja_chica_arqueos', {
      id: payload.id || genId('cca'),
      ...payload,
      efectivo_declarado: efectivo,
      comprobantes_pendientes: comprobantes,
      saldo_sistema: saldoSistema,
      diferencia,
      fecha: payload.fecha || new Date().toISOString().slice(0, 10),
    });
  },

  async cerrarFondo(id, { remanente = 0, cuenta_bancaria_id = null, referencia = null, cerrado_por = null } = {}) {
    const supabase = await getSupabaseClient();
    const fondo = await updateWithFallback(supabase, 'caja_chica_fondos', id, {
      estado: 'cerrado',
      fecha_cierre: new Date().toISOString().slice(0, 10),
      cerrado_por,
    });
    if (Number(remanente || 0) > 0) {
      try {
        await insertWithFallback(supabase, 'movimientos_tesoreria', {
          id: genId('tes'),
          empresa_id: fondo.empresa_id,
          tipo: 'ingreso',
          descripcion: `Devolucion remanente caja chica: ${fondo.nombre}`,
          monto: Number(remanente),
          moneda: fondo.moneda || 'PEN',
          fecha: fondo.fecha_cierre,
          cuenta_bancaria_id: cuenta_bancaria_id || fondo.cuenta_bancaria_id || null,
          categoria: 'caja_chica',
          es_manual: false,
          referencia,
          vinculo_tipo: 'caja_chica_fondo_cierre',
          vinculo_id: fondo.id,
          estado: 'registrado',
        });
      } catch (error) {
        console.warn('[cajaChicaService] movimiento cierre:', error?.message || error);
      }
    }
    return fondo;
  },
};
