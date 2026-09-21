import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { I } from '../icons.jsx';
import { maestrosService } from '../services/maestrosService.js';
import { NuevaCuentaModal } from './NuevaCuentaModal.jsx';
import { NuevoProyectoModal } from './NuevoProyectoModal.jsx';

const numero = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nombreCuenta = cuenta => cuenta?.razon_social || cuenta?.nombre_comercial || cuenta?.id || 'Cuenta';
const nombreActivo = activo => [activo?.codigo, activo?.nombre, activo?.marca, activo?.modelo].filter(Boolean).join(' · ') || activo?.id;
const errorTexto = error => error?.message || 'No se pudo cargar el tarifario de Flota & Alquileres.';

export function CotizacionTarifarioFlota({ empresaId, cuentaInicialId = '', crearCuenta, comercialesAsignables = [], onCancel, onContinue, onError }) {
  const [cuentas, setCuentas] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [activos, setActivos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [contratosEquipos, setContratosEquipos] = useState([]);
  const [cuentaId, setCuentaId] = useState(cuentaInicialId || '');
  const [proyectoId, setProyectoId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoContratos, setCargandoContratos] = useState(false);
  const [error, setError] = useState('');
  const [nuevaCuentaAbierta, setNuevaCuentaAbierta] = useState(false);
  const [nuevoProyectoAbierto, setNuevoProyectoAbierto] = useState(false);

  useEffect(() => {
    let activo = true;
    maestrosService.getUnidadesMedida(empresaId).then(data => {
      if (activo) setUnidades(data);
    });
    return () => { activo = false; };
  }, [empresaId]);

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      try {
        const sb = await getSupabaseClient();
        const [cuentasRes, proyectosRes, activosRes] = await Promise.all([
          sb.from('cuentas').select('id,razon_social,nombre_comercial,moneda,estado').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre_comercial'),
          sb.from('proyectos').select('id,cuenta_id,codigo,nombre,estado').eq('empresa_id', empresaId).order('nombre'),
          sb.from('activos').select('id,codigo,nombre,marca,modelo,estado,propietario_tipo').eq('empresa_id', empresaId).eq('propietario_tipo', 'propio').neq('estado', 'dado_baja').order('codigo'),
        ]);
        const primerError = [cuentasRes, proyectosRes, activosRes].find(result => result.error)?.error;
        if (primerError) throw primerError;
        const activosData = activosRes.data || [];
        const tarifasRes = activosData.length
          ? await sb.from('tarifas_estandar_equipos').select('activo_id,tarifa_hora,moneda').in('activo_id', activosData.map(row => row.id))
          : { data: [], error: null };
        if (tarifasRes.error) throw tarifasRes.error;
        if (!activo) return;
        setCuentas(cuentasRes.data || []);
        setProyectos(proyectosRes.data || []);
        setActivos(activosData);
        setTarifas(tarifasRes.data || []);
        setCuentaId(current => current || cuentaInicialId || '');
        setError('');
      } catch (err) {
        if (activo) {
          setError(errorTexto(err));
          onError?.(errorTexto(err));
        }
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [empresaId, cuentaInicialId, onError]);

  const proyectosCuenta = useMemo(
    () => [
      ...proyectos.filter(project => project.cuenta_id === cuentaId && project.estado !== 'cancelado'),
      ...(cuentaId ? [{ id: '__crear_nuevo_proyecto__', codigo: '+', nombre: 'Crear nuevo proyecto' }] : []),
    ],
    [proyectos, cuentaId],
  );
  const tarifasPorActivo = useMemo(() => new Map(tarifas.map(tarifa => [tarifa.activo_id, tarifa])), [tarifas]);
  const activosTarifados = useMemo(() => activos.filter(activo => tarifasPorActivo.has(activo.id)), [activos, tarifasPorActivo]);
  const activosPorId = useMemo(() => new Map(activos.map(activo => [activo.id, activo])), [activos]);
  const opcionesUnidades = useMemo(() => unidades.length ? unidades : [{ id: 'fallback-hora', codigo: 'HORA', nombre: 'Hora' }], [unidades]);
  const contratoPorEquipo = useMemo(() => {
    const mapa = new Map();
    for (const fila of contratosEquipos) {
      const actual = mapa.get(fila.equipo_id) || [];
      const contrato = contratos.find(item => item.id === fila.contrato_alquiler_id);
      if (contrato) actual.push({ ...contrato, tarifa_hora_override: fila.tarifa_hora_override });
      mapa.set(fila.equipo_id, actual);
    }
    return mapa;
  }, [contratos, contratosEquipos]);

  useEffect(() => {
    setProyectoId('');
    setContratos([]);
    setContratosEquipos([]);
  }, [cuentaId]);

  useEffect(() => {
    if (proyectoId !== '__crear_nuevo_proyecto__') return;
    setProyectoId('');
    setNuevoProyectoAbierto(Boolean(cuentaId));
  }, [proyectoId, cuentaId]);

  useEffect(() => {
    if (!proyectoId) {
      setContratos([]);
      setContratosEquipos([]);
      setCargandoContratos(false);
      return undefined;
    }
    let activo = true;
    (async () => {
      setCargandoContratos(true);
      try {
        const sb = await getSupabaseClient();
        const contratosRes = await sb.from('contratos_alquiler')
          .select('id,numero,fecha_inicio,fecha_fin,estado,proyecto_id,cuenta_id')
          .eq('empresa_id', empresaId)
          .eq('cuenta_id', cuentaId)
          .eq('proyecto_id', proyectoId)
          .eq('estado', 'vigente')
          .order('numero');
        if (contratosRes.error) throw contratosRes.error;
        const contratosData = contratosRes.data || [];
        const equiposRes = contratosData.length
          ? await sb.from('contratos_alquiler_equipos').select('contrato_alquiler_id,equipo_id,tarifa_hora_override').in('contrato_alquiler_id', contratosData.map(row => row.id))
          : { data: [], error: null };
        if (equiposRes.error) throw equiposRes.error;
        if (!activo) return;
        setContratos(contratosData);
        setContratosEquipos(equiposRes.data || []);
      } catch (err) {
        if (activo) {
          setContratos([]);
          setContratosEquipos([]);
          setError(errorTexto(err));
          onError?.(errorTexto(err));
        }
      } finally {
        if (activo) setCargandoContratos(false);
      }
    })();
    return () => { activo = false; };
  }, [empresaId, cuentaId, proyectoId, onError]);

  const cuenta = cuentas.find(item => item.id === cuentaId) || null;
  const proyecto = proyectos.find(item => item.id === proyectoId) || null;
  const actualizarLinea = (activoId, patch) => setLineas(actual => actual.map(linea => linea.activoId === activoId ? { ...linea, ...patch } : linea));
  const alternarActivo = activoId => setLineas(actual => actual.some(linea => linea.activoId === activoId)
    ? actual.filter(linea => linea.activoId !== activoId)
    : [...actual, { activoId, horas: 1, unidad: 'HORA', contratoId: '' }]);

  const resumenLineas = lineas.map(linea => {
    const activo = activosPorId.get(linea.activoId);
    const tarifa = tarifasPorActivo.get(linea.activoId);
    const candidatos = proyectoId ? (contratoPorEquipo.get(linea.activoId) || []) : [];
    const contrato = candidatos.length === 1 ? candidatos[0] : candidatos.find(item => item.id === linea.contratoId) || null;
    const precio = contrato?.tarifa_hora_override != null ? numero(contrato.tarifa_hora_override) : numero(tarifa?.tarifa_hora);
    return { ...linea, activo, tarifa, candidatos, contrato, precio };
  });

  const continuar = () => {
    setError('');
    if (!cuentaId) return setError('Selecciona una cuenta para continuar.');
    if (!lineas.length) return setError('Selecciona al menos un equipo con tarifa estándar.');
    const invalidas = resumenLineas.filter(linea => !linea.tarifa || numero(linea.horas) <= 0 || (linea.candidatos.length > 1 && !linea.contratoId));
    if (invalidas.length) return setError('Completa las horas y selecciona un contrato cuando haya más de una coincidencia vigente.');
    const contratosElegidos = [...new Set(resumenLineas.map(linea => linea.contrato?.id).filter(Boolean))];
    if (contratosElegidos.length > 1) return setError('Una cotización solo puede trazarse a un contrato. Selecciona equipos del mismo contrato o genera cotizaciones separadas.');
    const monedas = [...new Set(resumenLineas.map(linea => String(linea.tarifa.moneda || cuenta?.moneda || 'PEN').toUpperCase()))];
    if (monedas.length > 1) return setError('Las tarifas seleccionadas tienen monedas distintas. Selecciona equipos de una misma moneda.');
    const items = resumenLineas.map((linea, index) => ({
      id: `tarifario_${linea.activoId}_${index + 1}`,
      descripcion: nombreActivo(linea.activo),
      tipo: 'servicio',
      detalle_cantidad: 'Horas estimadas',
      cantidad: numero(linea.horas),
      unidad: linea.unidad || 'HORA',
      precio_unitario: linea.precio,
      total: Math.round(numero(linea.horas) * linea.precio * 100) / 100,
      incluido: false,
      codigo: linea.activo?.codigo || '',
      marca: linea.activo?.marca || '',
      modelo: linea.activo?.modelo || '',
      activo_id: linea.activoId,
      contrato_alquiler_id: linea.contrato?.id || null,
    }));
    onContinue?.({ cuenta_id: cuentaId, proyecto_id: proyectoId || null, contrato_alquiler_id: contratosElegidos.length === 1 ? contratosElegidos[0] : null, linea_negocio: 'flota_alquileres', moneda: monedas[0] || cuenta?.moneda || 'PEN', items });
  };

  return <>
    <NuevaCuentaModal open={nuevaCuentaAbierta} empresa={{ id: empresaId }} crearCuenta={crearCuenta} comercialesAsignables={comercialesAsignables} zIndex={1200} onClose={() => setNuevaCuentaAbierta(false)} onCreated={cuentaNueva => { setCuentas(actuales => [cuentaNueva, ...actuales.filter(item => item.id !== cuentaNueva.id)]); setCuentaId(cuentaNueva.id); }} />
    <NuevoProyectoModal open={nuevoProyectoAbierto} empresaId={empresaId} cuentas={cuentas} cuentaInicialId={cuentaId} cuentaFija zIndex={1300} onClose={() => setNuevoProyectoAbierto(false)} onCreated={proyectoNuevo => { setProyectos(actuales => [proyectoNuevo, ...actuales.filter(item => item.id !== proyectoNuevo.id)]); setProyectoId(proyectoNuevo.id); setNuevoProyectoAbierto(false); }} />
    {createPortal(<div className="modal-backdrop"><div className="modal" style={{ maxWidth: 920 }}>
      <div className="modal-head"><div><h2>Cotizar desde Tarifario</h2><div className="text-muted" style={{ fontSize: 12 }}>Flota &amp; Alquileres · tarifa estándar y override vigente por contrato.</div></div><button className="icon-btn" onClick={onCancel}>{I.x}</button></div>
      <div className="modal-body">
        {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
        {cargando ? <div className="text-muted">Cargando cuentas, proyectos y tarifas…</div> : <>
          <div className="grid-2">
            <div className="input-group"><label>Cuenta / cliente *</label><select className="input" value={cuentaId} onChange={event => { if (event.target.value === '__crear_nueva__') { setNuevaCuentaAbierta(true); return; } setCuentaId(event.target.value); }}><option value="">Selecciona una cuenta…</option>{cuentas.map(item => <option key={item.id} value={item.id}>{nombreCuenta(item)}</option>)}<option value="__crear_nueva__">+ Crear nueva cuenta</option></select></div>
            <div className="input-group"><label>Proyecto (opcional)</label><select className="input" value={proyectoId} disabled={!cuentaId} onChange={event => setProyectoId(event.target.value)}><option value="">Sin proyecto — usar tarifa estándar</option>{proyectosCuenta.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select></div>
          </div>
          {proyecto && <div className="alert alert-info" style={{ marginTop: 12 }}>Proyecto: <strong>{proyecto.codigo} · {proyecto.nombre}</strong>. Si un equipo tiene más de un contrato vigente, deberás elegir uno.</div>}
          <div style={{ marginTop: 16 }}><div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h3 style={{ margin: 0 }}>Equipos con tarifa estándar</h3>{cargandoContratos && <span className="text-muted">Consultando contratos…</span>}</div>
            <div className="table-wrap"><table className="tbl"><thead><tr><th style={{ width: 32 }}></th><th>Equipo</th><th>Moneda</th><th className="num">Tarifa / hora</th><th style={{ width: 130 }}>Horas estimadas</th><th>Unidad</th><th>Contrato aplicado</th></tr></thead><tbody>
              {activosTarifados.map(activo => {
                const linea = resumenLineas.find(item => item.activoId === activo.id);
                const tarifa = tarifasPorActivo.get(activo.id);
                return <tr key={activo.id}>
                  <td><input type="checkbox" checked={Boolean(linea)} onChange={() => alternarActivo(activo.id)} /></td>
                  <td><strong>{nombreActivo(activo)}</strong><div className="text-muted" style={{ fontSize: 11 }}>{activo.estado}</div></td>
                  <td>{tarifa.moneda || 'PEN'}</td>
                  <td className="num">{numero(tarifa.tarifa_hora).toFixed(2)}</td>
                  <td>{linea && <input className="input" type="number" min="0.01" step="0.01" value={linea.horas} onChange={event => actualizarLinea(activo.id, { horas: event.target.value })} />}</td>
                  <td>{linea && <select className="input" value={linea.unidad || 'HORA'} onChange={event => actualizarLinea(activo.id, { unidad: event.target.value })}>{opcionesUnidades.map(unidad => <option key={unidad.id || unidad.codigo} value={unidad.codigo}>{unidad.codigo} — {unidad.nombre}</option>)}</select>}</td>
                  <td>{linea?.candidatos?.length > 1 ? <select className="input" value={linea.contratoId} onChange={event => actualizarLinea(activo.id, { contratoId: event.target.value })}><option value="">Selecciona contrato…</option>{linea.candidatos.map(contrato => <option key={contrato.id} value={contrato.id}>{contrato.numero}{contrato.tarifa_hora_override != null ? ` · override ${numero(contrato.tarifa_hora_override).toFixed(2)}` : ' · estándar'}</option>)}</select> : linea?.contrato ? <span className="badge badge-green">{linea.contrato.numero}{linea.contrato.tarifa_hora_override != null ? ` · ${numero(linea.contrato.tarifa_hora_override).toFixed(2)}` : ' · estándar'}</span> : <span className="text-muted">Estándar</span>}</td>
                </tr>;
              })}
              {!activosTarifados.length && <tr><td colSpan="7" className="text-muted" style={{ textAlign: 'center', padding: 24 }}>No hay equipos propios con tarifa estándar registrada.</td></tr>}
            </tbody></table></div>
          </div>
        </>}
      </div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="btn btn-primary" disabled={cargando} onClick={continuar}>Continuar a tipo de cotización</button></div>
    </div></div>, document.body)}
  </>;
}
