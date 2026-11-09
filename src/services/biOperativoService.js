const num = value => Number(value) || 0;

export const fechaLima = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

export function limitesMes(periodo) {
  const [year, month] = periodo.split('-').map(Number);
  const ultimoDia = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0');
  return { inicio: `${periodo}-01`, fin: `${periodo}-${ultimoDia}` };
}

const dia = value => {
  if (!value) return '';
  const texto = String(value);
  return texto.includes('T') && !Number.isNaN(Date.parse(texto))
    ? fechaLima(new Date(texto)) : texto.slice(0, 10);
};
const validaParte = p => !['anulado', 'rechazado'].includes(String(p.estado || '').toLowerCase());
const idOT = p => p.orden_trabajo_id || p.ot_id;

export function diasSinParte(ot, partes, hoy) {
  const ultimo = partes.filter(p => idOT(p) === ot.id && validaParte(p) && dia(p.fecha) <= hoy)
    .map(p => dia(p.fecha)).sort().at(-1);
  const referencia = ultimo || dia(ot.fecha_inicio_real || ot.fecha_programada);
  if (!referencia || referencia > hoy) return { ultimo: ultimo || null, dias: null };
  const dias = Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${referencia}T00:00:00Z`)) / 86400000);
  return { ultimo: ultimo || null, dias };
}

export function calcularBIOperativo({ ots = [], partes = [], partesActuales = partes, costos = [], tareas = [], os = [] }, periodo, hoy = fechaLima()) {
  const { inicio, fin } = limitesMes(periodo);
  const vigentes = ots.filter(o => o.estado !== 'anulada' && o.estado !== 'anulado');
  const actividad = vigentes.filter(o => {
    const inicioOT = dia(o.fecha_inicio_real || o.fecha_programada);
    return inicioOT && inicioOT <= fin && (!o.fecha_fin || dia(o.fecha_fin) >= inicio);
  });
  const cerradas = vigentes.filter(o => o.estado === 'cerrada' && dia(o.fecha_fin) >= inicio && dia(o.fecha_fin) <= fin);
  const abiertas = actividad.filter(o => ['ejecucion', 'programada'].includes(o.estado));
  const partesMes = partes.filter(p => validaParte(p) && dia(p.fecha) >= inicio && dia(p.fecha) <= fin);
  const conOS = cerradas.map(o => ({ ot: o, os: os.find(x => x.id === o.os_cliente_id) })).filter(x => x.os?.fecha_fin);
  const aTiempo = conOS.filter(x => dia(x.ot.fecha_fin) <= dia(x.os.fecha_fin)).length;
  const idsCerradas = new Set(cerradas.map(o => o.id));
  const costosCerrados = costos.filter(c => idsCerradas.has(idOT(c)));
  const real = costosCerrados.reduce((s, c) => s + num(c.total), 0);
  const estimado = cerradas.reduce((s, o) => s + num(o.costo_estimado), 0);
  const normales = partesMes.reduce((s, p) => s + num(p.horas_normales), 0);
  const extra = partesMes.reduce((s, p) => s + num(p.horas_extra), 0);
  const sinParte = vigentes.filter(o => o.estado === 'ejecucion')
    .map(o => ({ ...o, ...diasSinParte(o, partesActuales, hoy) }))
    .filter(o => o.dias !== null && o.dias >= 3);
  return {
    actividad, cerradas, abiertas, partesMes, sinParte,
    avance: abiertas.length ? abiertas.reduce((s, o) => s + num(o.avance_pct), 0) / abiertas.length : null,
    aTiempo, conOS: conOS.length, normales, extra, real, estimado,
    manoObra: costosCerrados.reduce((s, c) => s + num(c.mano_obra), 0),
    horasEstimadas: tareas.reduce((s, t) => s + num(t.horas_estimadas), 0),
    horasReales: tareas.reduce((s, t) => s + num(t.horas_reales), 0),
  };
}

export async function cargarBIOperativo(empresaId, scope, periodo, client) {
  const db = client || await (await import('../lib/supabaseClient.js')).getSupabaseClient();
  const [year, month] = periodo.split('-').map(Number);
  const inicio = new Date(Date.UTC(year, month - 6, 1)).toISOString().slice(0, 10);
  const { fin } = limitesMes(periodo);
  const hoy = fechaLima();

  async function leer(tabla, columnas, filtrar = query => query) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const query = filtrar(db.from(tabla).select(columnas).eq('empresa_id', empresaId));
      const { data, error } = await query.range(offset, offset + 999);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function porIds(tabla, columnas, campo, ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    const rows = [];
    for (let i = 0; i < unicos.length; i += 200) {
      const lote = unicos.slice(i, i + 200);
      rows.push(...await leer(tabla, columnas, q => q.in(campo, lote)));
    }
    return rows;
  }

  const [ots, partesVentana, backlog, certificaciones] = await Promise.all([
    leer('ordenes_trabajo', 'id,sociedad_id,estado,fecha_inicio_real,fecha_programada,fecha_fin,os_cliente_id,costo_estimado,avance_pct,cuenta_id,linea_negocio,tipo_trabajo,servicio,numero,backlog_id',
      q => q.or(`estado.in.(ejecucion,programada),and(fecha_fin.gte.${inicio},fecha_fin.lte.${fin}),and(fecha_programada.gte.${inicio},fecha_programada.lte.${fin})`)),
    leer('partes_diarios', 'id,orden_trabajo_id,fecha,estado,horas_normales,horas_extra,tecnico_id',
      q => q.gte('fecha', inicio).lte('fecha', fin)),
    leer('backlog', 'id,os_cliente_id,descripcion,prioridad,estado', q => q.eq('estado', 'pendiente')),
    leer('activo_certificaciones', 'id,activo_id,tipo_id,estado,fecha_vencimiento',
      q => q.eq('estado', 'activa').gte('fecha_vencimiento', hoy)
        .lte('fecha_vencimiento', new Date(Date.parse(`${hoy}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10))),
  ]);
  const permitido = row => scope.sinFiltro || scope.sociedadesIds.includes(row.sociedad_id);
  const otsScope = ots.filter(permitido);
  const ids = otsScope.map(o => o.id);
  const idsSet = new Set(ids);
  const abiertas = otsScope.filter(o => ['ejecucion', 'programada'].includes(o.estado));
  async function ultimosPartes() {
    const ultimos = new Map();
    for (let i = 0; i < abiertas.length; i += 200) {
      const idsAbiertas = abiertas.slice(i, i + 200).map(o => o.id);
      const partes = await leer('partes_diarios', 'id,orden_trabajo_id,fecha,estado',
        q => q.in('orden_trabajo_id', idsAbiertas).lte('fecha', hoy)
          .order('fecha', { ascending: false }).order('id', { ascending: false }));
      for (const parte of partes) {
        if (validaParte(parte) && !ultimos.has(parte.orden_trabajo_id)) ultimos.set(parte.orden_trabajo_id, parte);
      }
    }
    return [...ultimos.values()];
  }
  const [costos, tareas, os, cuentas, activos, tipos, partesActuales] = await Promise.all([
    porIds('costos_ot', 'orden_trabajo_id,total,mano_obra', 'orden_trabajo_id', ids),
    porIds('ot_tareas', 'ot_id,horas_estimadas,horas_reales', 'ot_id', ids),
    porIds('os_clientes', 'id,sociedad_id,fecha_fin', 'id', [...otsScope.map(o => o.os_cliente_id), ...backlog.map(b => b.os_cliente_id)]),
    porIds('cuentas', 'id,razon_social', 'id', otsScope.map(o => o.cuenta_id)),
    porIds('activos', 'id,codigo,nombre,centro_costo_id', 'id', certificaciones.map(c => c.activo_id)),
    porIds('flota_certificacion_tipos', 'id,nombre', 'id', certificaciones.map(c => c.tipo_id)),
    ultimosPartes(),
  ]);
  const centros = await porIds('centros_costo', 'id,sociedad_id', 'id', activos.map(a => a.centro_costo_id));
  const centrosScope = new Set(centros.filter(permitido).map(c => c.id));
  const activosScope = activos.filter(a => scope.sinFiltro || centrosScope.has(a.centro_costo_id));
  const activoIds = new Set(activosScope.map(a => a.id));
  const osScope = new Set(os.filter(permitido).map(o => o.id));
  return {
    ots: otsScope,
    partes: partesVentana.filter(p => idsSet.has(p.orden_trabajo_id)),
    partesActuales,
    costos,
    tareas,
    os,
    cuentas,
    activos: activosScope,
    certificaciones: certificaciones.filter(c => activoIds.has(c.activo_id)),
    tiposCertificacion: tipos,
    backlog: backlog.filter(b => scope.sinFiltro || osScope.has(b.os_cliente_id)),
  };
}
