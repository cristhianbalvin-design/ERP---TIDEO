import { getSupabaseClient } from '../lib/supabaseClient.js';

export function fechaLima(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha);
  const valor = tipo => partes.find(parte => parte.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function sumarDias(fecha, dias) {
  const valor = new Date(`${fecha}T12:00:00Z`);
  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

export function saludoHora(hora) {
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function calcularKpis(ordenes, partes, activos, hoy) {
  const ejecucion = ordenes.filter(ot => ot.estado === 'ejecucion');
  const programadas = ordenes.filter(ot => ot.estado === 'programada' && ot.fecha_programada === hoy);
  return {
    ejecucion: ejecucion.length,
    avance: ejecucion.length ? Math.round(ejecucion.reduce((suma, ot) => suma + Number(ot.avance_pct || 0), 0) / ejecucion.length) : 0,
    programadas,
    partes: partes.length,
    mantenimiento: activos.filter(activo => activo.estado === 'en_mantenimiento').length,
    propios: activos.length,
  };
}

export function otsSinParte(ordenes, partesRecientes, hoy) {
  const limite = sumarDias(hoy, -3);
  const recientes = new Set(partesRecientes.filter(parte => parte.fecha > limite).map(parte => parte.orden_trabajo_id));
  return ordenes.filter(ot => ot.estado === 'ejecucion' && ot.created_at?.slice(0, 10) <= limite && !recientes.has(ot.id));
}

export function certificacionesPorVencer(certificaciones, hoy) {
  const limite = sumarDias(hoy, 30);
  return certificaciones.filter(cert => cert.estado !== 'anulada' && cert.fecha_vencimiento >= hoy && cert.fecha_vencimiento <= limite);
}

export function agruparBacklog(filas) {
  const grupos = new Map();
  filas.forEach(fila => {
    const descripcion = (fila.descripcion || '').trim();
    const clave = descripcion.toLocaleLowerCase('es');
    if (!clave) return;
    const grupo = grupos.get(clave) || { descripcion, cantidad: 0 };
    grupo.cantidad += 1;
    grupos.set(clave, grupo);
  });
  return [...grupos.values()];
}

function alcance(query, sesion, columna = 'sociedad_id') {
  if (!sesion.vistaConsolidada && sesion.sociedadId) return query.eq(columna, sesion.sociedadId);
  if (sesion.empresa?.multisociedad_habilitado && Array.isArray(sesion.sociedadesIdsAlcance)) return query.in(columna, sesion.sociedadesIdsAlcance);
  if (sesion.empresa?.multisociedad_habilitado && !sesion.vistaConsolidada && !sesion.sociedadId) return query.in(columna, []);
  return query;
}

async function leer(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function cargarInicioOperativo(sesion, hoy = fechaLima()) {
  const db = getSupabaseClient();
  const empresa = sesion.empresaId;
  const puedeVerArea = sesion.esAdminEmpresa || sesion.permisos.some(p => ['planner', 'ot'].includes(p.pantalla) && p.puede_ver);
  const personal = puedeVerArea ? [] : await leer(db.from('personal_operativo').select('id').eq('empresa_id', empresa).eq('auth_user_id', sesion.usuario.id));
  let asignacionesQuery = alcance(db.from('planner_asignaciones').select('id,ot_id,tecnico_id,puesto_id,horas_estimadas').eq('empresa_id', empresa).eq('fecha', hoy).neq('estado', 'cancelado'), sesion);
  if (!puedeVerArea && personal.length) asignacionesQuery = asignacionesQuery.in('tecnico_id', personal.map(p => p.id));
  const filtraBacklog = Boolean(sesion.sociedadId || (sesion.empresa?.multisociedad_habilitado && Array.isArray(sesion.sociedadesIdsAlcance)));
  const camposBacklog = filtraBacklog ? 'id,descripcion,os_clientes!inner(sociedad_id)' : 'id,descripcion';
  const backlogQuery = db.from('backlog').select(camposBacklog).eq('empresa_id', empresa).eq('estado', 'pendiente');
  const consultas = await Promise.all([
    leer(alcance(db.from('ordenes_trabajo').select('id,numero,servicio,estado,avance_pct,fecha_programada,created_at').eq('empresa_id', empresa).or(`estado.eq.ejecucion,and(estado.eq.programada,fecha_programada.eq.${hoy})`), sesion)),
    leer(alcance(db.from('partes_diarios').select('id,ordenes_trabajo!inner(sociedad_id)').eq('empresa_id', empresa).eq('estado', 'en_revision'), sesion, 'ordenes_trabajo.sociedad_id')),
    leer(db.from('activos').select('id,estado').eq('empresa_id', empresa).eq('propietario_tipo', 'propio').or('estado.is.null,estado.neq.dado_baja')),
    leer(asignacionesQuery),
    leer(alcance(db.from('partes_diarios').select('orden_trabajo_id,fecha,ordenes_trabajo!inner(sociedad_id)').eq('empresa_id', empresa).gt('fecha', sumarDias(hoy, -3)).lte('fecha', hoy), sesion, 'ordenes_trabajo.sociedad_id')),
    leer(db.from('activo_certificaciones').select('id,estado,fecha_vencimiento,tipo:flota_certificacion_tipos(nombre),activo:activos(codigo,nombre)').eq('empresa_id', empresa).neq('estado', 'anulada').gte('fecha_vencimiento', hoy).lte('fecha_vencimiento', sumarDias(hoy, 30))),
    leer(filtraBacklog ? alcance(backlogQuery, sesion, 'os_clientes.sociedad_id') : backlogQuery),
    leer(alcance(db.from('flota_liquidaciones').select('id,numero').eq('empresa_id', empresa).eq('estado', 'en_revision'), sesion)),
  ]);
  const [ordenes, partes, activos, asignaciones, partesRecientes, certificaciones, backlog, liquidaciones] = consultas;
  const otIds = [...new Set(asignaciones.map(a => a.ot_id).filter(Boolean))];
  const tecnicoIds = [...new Set(asignaciones.map(a => a.tecnico_id).filter(Boolean))];
  const puestoIds = [...new Set(asignaciones.map(a => a.puesto_id).filter(Boolean))];
  const [otsDia, tecnicos, puestos] = await Promise.all([
    otIds.length ? leer(alcance(db.from('ordenes_trabajo').select('id,numero,servicio').eq('empresa_id', empresa).in('id', otIds), sesion)) : [],
    tecnicoIds.length ? leer(db.from('personal_operativo').select('id,nombre').eq('empresa_id', empresa).in('id', tecnicoIds)) : [],
    puestoIds.length ? leer(db.from('planner_puestos').select('id,nombre').eq('empresa_id', empresa).in('id', puestoIds)) : [],
  ]);
  const porId = filas => new Map(filas.map(fila => [fila.id, fila]));
  const mapaOt = porId(otsDia);
  const mapaTecnico = porId(tecnicos);
  const mapaPuesto = porId(puestos);
  return {
    kpis: calcularKpis(ordenes, partes, activos, hoy),
    asignaciones: asignaciones.filter(a => mapaOt.has(a.ot_id)).map(a => ({ ...a, ot: mapaOt.get(a.ot_id), tecnico: mapaTecnico.get(a.tecnico_id), puesto: mapaPuesto.get(a.puesto_id) })),
    sinVinculo: !puedeVerArea && !personal.length,
    sinParte: otsSinParte(ordenes, partesRecientes, hoy),
    certificaciones: certificacionesPorVencer(certificaciones, hoy),
    backlog: agruparBacklog(backlog),
    liquidaciones,
  };
}
