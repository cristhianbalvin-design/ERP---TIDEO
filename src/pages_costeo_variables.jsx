import React, { useEffect, useMemo, useState } from 'react';
import { I, moneyD } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

const numero = value => Number(value || 0);
const moneyUsd = value => moneyD(numero(value), 'US$');
const porcentaje = value => `${(numero(value) * 100).toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 })}%`;

function DepreciacionActivos() {
  const { empresa, role, addToast } = useApp();
  const [activos, setActivos] = useState([]);
  const [valorizaciones, setValorizaciones] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [valoresManual, setValoresManual] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardandoActivoId, setGuardandoActivoId] = useState(null);
  const [error, setError] = useState('');
  const puedeCrear = Boolean(role?.permisos?.todo || role?.permisos?.crear?.includes('costeo_variables'));
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('costeo_variables'));
  const valorizacionPorActivo = useMemo(() => new Map(valorizaciones.map(item => [item.activo_id, item])), [valorizaciones]);
  const configPorActivo = useMemo(() => new Map(configuraciones.map(item => [item.activo_id, item])), [configuraciones]);

  const cargar = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const sb = await getSupabaseClient();
      const [activosResult, valorizacionesResult, configResult] = await Promise.all([
        sb.from('activos').select('id, codigo, nombre, estado, horas_disponibles_mes').eq('empresa_id', empresa.id).or('estado.is.null,estado.neq.dado_baja').order('nombre'),
        sb.from('vw_depreciacion_mensual_activo').select('activo_id, depreciacion_mensual_usd_calculada, depreciacion_manual, costo_hora_activo_usd, horas_disponibles_mes').eq('empresa_id', empresa.id),
        sb.from('activo_depreciacion_config').select('id, activo_id, depreciacion_manual').eq('empresa_id', empresa.id),
      ]);
      const queryError = [activosResult, valorizacionesResult, configResult].find(result => result.error)?.error;
      if (queryError) throw queryError;
      setActivos(activosResult.data || []);
      setValorizaciones(valorizacionesResult.data || []);
      setConfiguraciones(configResult.data || []);
      setValoresManual(Object.fromEntries((configResult.data || []).map(item => [item.activo_id, item.depreciacion_manual ?? ''])));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la depreciación de activos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async activo => {
    const valorRaw = valoresManual[activo.id] ?? '';
    const depreciacionManual = valorRaw === '' ? null : Number(valorRaw);
    if (depreciacionManual !== null && (!Number.isFinite(depreciacionManual) || depreciacionManual < 0)) {
      addToast('La depreciación manual debe ser un número mayor o igual a cero.', 'error');
      return;
    }
    const existe = configPorActivo.has(activo.id);
    if ((existe && !puedeEditar) || (!existe && !puedeCrear)) {
      addToast('No tienes permiso para guardar esta variable de costeo.', 'error');
      return;
    }
    setGuardandoActivoId(activo.id);
    try {
      const sb = await getSupabaseClient();
      const { data, error: upsertError } = await sb
        .from('activo_depreciacion_config')
        .upsert({ empresa_id: empresa.id, activo_id: activo.id, depreciacion_manual: depreciacionManual, actualizado_en: new Date().toISOString() }, { onConflict: 'activo_id' })
        .select('id, activo_id, depreciacion_manual')
        .single();
      if (upsertError) throw upsertError;
      setConfiguraciones(prev => [...prev.filter(item => item.activo_id !== activo.id), data]);
      setValoresManual(prev => ({ ...prev, [activo.id]: data.depreciacion_manual ?? '' }));
      await cargar();
      addToast('Depreciación por activo guardada.', 'success');
    } catch (err) {
      addToast(`No se pudo guardar la depreciación: ${err?.message || err}`, 'error');
    } finally {
      setGuardandoActivoId(null);
    }
  };

  return <>
    <div className="page-sub" style={{ marginBottom:18 }}>La depreciación manual reemplaza el cálculo mensual. Las horas disponibles al mes son solo una referencia y se editan desde la ficha del Activo.</div>
    {error && <div className="alert alert-danger" style={{ marginBottom:16 }}>{error}</div>}
    <div className="card">
      <div className="card-head"><h3>Activos de la empresa</h3><span className="badge badge-cyan">{activos.length}</span></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Activo</th><th className="num">Deprec. mensual calculada</th><th style={{ minWidth:180 }}>Manual</th><th className="num">Costo/hora resultante</th><th className="num">Horas/mes</th><th style={{ textAlign:'right' }}>Acción</th></tr></thead>
        <tbody>
          {cargando ? <tr><td colSpan="6" className="text-muted" style={{ padding:22 }}>Cargando activos y depreciación...</td></tr> : activos.map(activo => {
            const valorizacion = valorizacionPorActivo.get(activo.id) || {};
            const manualRaw = valoresManual[activo.id] ?? '';
            const existe = configPorActivo.has(activo.id);
            const puedeGuardarFila = existe ? puedeEditar : puedeCrear;
            return <tr key={activo.id}>
              <td><strong>{activo.nombre}</strong>{activo.codigo && <div className="text-muted mono" style={{ fontSize:11 }}>{activo.codigo}</div>}{activo.estado === 'en_mantenimiento' && <span className="badge badge-orange" style={{ marginTop:4 }}>En mantenimiento</span>}</td>
              <td className="num">{valorizacion.depreciacion_mensual_usd_calculada != null ? moneyUsd(valorizacion.depreciacion_mensual_usd_calculada) : '—'}</td>
              <td><input type="number" min="0" step="0.01" className="input num" value={manualRaw} disabled={!puedeGuardarFila || guardandoActivoId === activo.id} onChange={event => setValoresManual(prev => ({ ...prev, [activo.id]: event.target.value }))} placeholder="US$ 0.00" /></td>
              <td className="num">{valorizacion.costo_hora_activo_usd != null ? moneyUsd(valorizacion.costo_hora_activo_usd) : '—'}</td>
              <td className="num">{activo.horas_disponibles_mes != null ? numero(activo.horas_disponibles_mes).toLocaleString('es-PE', { maximumFractionDigits:2 }) : '—'}</td>
              <td style={{ textAlign:'right' }}><button className="btn btn-secondary btn-sm" disabled={!puedeGuardarFila || guardandoActivoId === activo.id} onClick={() => guardar(activo)}>{I.save} {guardandoActivoId === activo.id ? 'Guardando...' : 'Guardar'}</button></td>
            </tr>;
          })}
          {!cargando && activos.length === 0 && <tr><td colSpan="6" className="text-muted" style={{ padding:22 }}>No hay activos vigentes registrados para esta empresa.</td></tr>}
        </tbody>
      </table></div>
    </div>
  </>;
}

function GastoAdministrativo() {
  const { empresa, role, addToast } = useApp();
  const [configuracion, setConfiguracion] = useState(null);
  const [porcentajeCalculado, setPorcentajeCalculado] = useState(null);
  const [porcentajeManual, setPorcentajeManual] = useState('');
  const [metodoActivo, setMetodoActivo] = useState('calculado');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const puedeCrear = Boolean(role?.permisos?.todo || role?.permisos?.crear?.includes('costeo_variables'));
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('costeo_variables'));
  const puedeGuardar = configuracion ? puedeEditar : puedeCrear;

  const cargar = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const sb = await getSupabaseClient();
      const [configResult, calculadoResult] = await Promise.all([
        sb.from('gasto_administrativo_config').select('id, metodo_activo, porcentaje_manual').eq('empresa_id', empresa.id).maybeSingle(),
        sb.from('vw_gasto_administrativo_pct_grupo').select('porcentaje_calculado').eq('empresa_id', empresa.id).maybeSingle(),
      ]);
      if (configResult.error) throw configResult.error;
      if (calculadoResult.error) throw calculadoResult.error;
      const config = configResult.data || null;
      setConfiguracion(config);
      setPorcentajeCalculado(calculadoResult.data?.porcentaje_calculado ?? null);
      setPorcentajeManual(config?.porcentaje_manual != null ? String(numero(config.porcentaje_manual) * 100) : '');
      setMetodoActivo(config?.metodo_activo || 'calculado');
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el gasto administrativo.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    const manualNumerico = porcentajeManual === '' ? null : Number(porcentajeManual);
    if (manualNumerico !== null && (!Number.isFinite(manualNumerico) || manualNumerico < 0)) {
      addToast('El porcentaje manual debe ser un número mayor o igual a cero.', 'error');
      return;
    }
    if (metodoActivo === 'manual' && !(manualNumerico > 0)) {
      addToast('Ingresa un porcentaje manual mayor a cero para usar el método manual.', 'error');
      return;
    }
    if (!puedeGuardar) {
      addToast('No tienes permiso para guardar esta variable de costeo.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const sb = await getSupabaseClient();
      const { error: upsertError } = await sb
        .from('gasto_administrativo_config')
        .upsert({
          empresa_id: empresa.id,
          metodo_activo: metodoActivo,
          porcentaje_manual: manualNumerico === null ? null : manualNumerico / 100,
          actualizado_en: new Date().toISOString(),
        }, { onConflict: 'empresa_id' });
      if (upsertError) throw upsertError;
      await cargar();
      addToast('Gasto administrativo guardado.', 'success');
    } catch (err) {
      addToast(`No se pudo guardar el gasto administrativo: ${err?.message || err}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const hayCalculado = numero(porcentajeCalculado) > 0;
  return <>
    <div className="page-sub" style={{ marginBottom:18 }}>Define el porcentaje de gasto administrativo que Hoja de Costeo aplicará por defecto. El valor manual se ingresa como porcentaje y se guarda como proporción.</div>
    {error && <div className="alert alert-danger" style={{ marginBottom:16 }}>{error}</div>}
    <div className="card">
      <div className="card-head"><h3>Gasto administrativo de la empresa</h3></div>
      {cargando ? <div className="text-muted" style={{ padding:22 }}>Cargando porcentaje de gasto administrativo...</div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:18, padding:18 }}>
        <div style={{ padding:16, border:'1px solid var(--border)', borderRadius:8 }}>
          <div className="eyebrow" style={{ marginBottom:8 }}>% calculado</div>
          {hayCalculado ? <strong style={{ fontSize:24 }}>{porcentaje(porcentajeCalculado)}</strong> : <div className="text-muted">Sin datos; verifica la información o usa un valor manual.</div>}
        </div>
        <label style={{ display:'grid', gap:8 }}>
          <span className="eyebrow">% manual</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="number" min="0" step="0.01" className="input num" value={porcentajeManual} disabled={!puedeGuardar || guardando} onChange={event => setPorcentajeManual(event.target.value)} placeholder="Ej. 18.30" />
            <span className="text-muted">%</span>
          </div>
        </label>
        <label style={{ display:'grid', gap:8 }}>
          <span className="eyebrow">Método activo</span>
          <select className="input" value={metodoActivo} disabled={!puedeGuardar || guardando} onChange={event => setMetodoActivo(event.target.value)}>
            <option value="calculado">Calculado</option>
            <option value="manual">Manual</option>
          </select>
        </label>
      </div>}
      {!cargando && <div style={{ display:'flex', justifyContent:'flex-end', padding:'0 18px 18px' }}><button className="btn btn-primary" disabled={!puedeGuardar || guardando} onClick={guardar}>{I.save} {guardando ? 'Guardando...' : 'Guardar gasto administrativo'}</button></div>}
    </div>
  </>;
}

export default function CosteoVariables() {
  const { empresa, role, addToast } = useApp();
  const [vista, setVista] = useState('costo_hora');
  const [cargos, setCargos] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [valoresManual, setValoresManual] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardandoCargoId, setGuardandoCargoId] = useState(null);
  const [error, setError] = useState('');
  const puedeCrear = Boolean(role?.permisos?.todo || role?.permisos?.crear?.includes('costeo_variables'));
  const puedeEditar = Boolean(role?.permisos?.todo || role?.permisos?.editar?.includes('costeo_variables'));

  const tarifaPorCargo = useMemo(() => new Map(
    tarifas
      .filter(item => item?.cargo_id)
      .map(item => [item.cargo_id, numero(item.costo_hora_planilla)])
  ), [tarifas]);
  const configPorCargo = useMemo(() => new Map(configuraciones.map(item => [item.cargo_id, item])), [configuraciones]);

  const cargar = async () => {
    if (!empresa?.id || !isSupabaseConfigured()) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    try {
      const sb = await getSupabaseClient();
      const [cargosResult, tarifasResult, configResult] = await Promise.all([
        sb.from('cargos_empresa').select('id, codigo, nombre, estado').eq('empresa_id', empresa.id).order('nombre'),
        sb.from('vw_costo_hora_planilla_por_cargo').select('cargo_id, costo_hora_planilla').eq('empresa_id', empresa.id),
        sb.from('costo_hora_cargo_config').select('id, cargo_id, costo_hora_manual, metodo_activo').eq('empresa_id', empresa.id),
      ]);
      const queryError = [cargosResult, tarifasResult, configResult].find(result => result.error)?.error;
      if (queryError) throw queryError;
      setCargos(cargosResult.data || []);
      setTarifas(tarifasResult.data || []);
      setConfiguraciones(configResult.data || []);
      setValoresManual(Object.fromEntries((configResult.data || []).map(item => [item.cargo_id, item.costo_hora_manual ?? ''])));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar Costo hora por cargo.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async cargo => {
    const valorRaw = valoresManual[cargo.id] ?? '';
    const costoManual = valorRaw === '' ? null : Number(valorRaw);
    if (costoManual !== null && (!Number.isFinite(costoManual) || costoManual < 0)) {
      addToast('El costo manual debe ser un número mayor o igual a cero.', 'error');
      return;
    }
    const existe = configPorCargo.has(cargo.id);
    if ((existe && !puedeEditar) || (!existe && !puedeCrear)) {
      addToast('No tienes permiso para guardar esta variable de costeo.', 'error');
      return;
    }
    setGuardandoCargoId(cargo.id);
    try {
      const sb = await getSupabaseClient();
      const { data, error: upsertError } = await sb
        .from('costo_hora_cargo_config')
        .upsert({
          empresa_id: empresa.id,
          cargo_id: cargo.id,
          costo_hora_manual: costoManual,
          metodo_activo: costoManual && costoManual > 0 ? 'manual' : 'planilla',
          actualizado_en: new Date().toISOString(),
        }, { onConflict: 'empresa_id,cargo_id' })
        .select('id, cargo_id, costo_hora_manual, metodo_activo')
        .single();
      if (upsertError) throw upsertError;
      setConfiguraciones(prev => {
        const sinActual = prev.filter(item => item.cargo_id !== cargo.id);
        return [...sinActual, data];
      });
      setValoresManual(prev => ({ ...prev, [cargo.id]: data.costo_hora_manual ?? '' }));
      addToast('Costo hora por cargo guardado.', 'success');
    } catch (err) {
      addToast(`No se pudo guardar el costo hora: ${err?.message || err}`, 'error');
    } finally {
      setGuardandoCargoId(null);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="eyebrow">Variables Comerciales de Costeo</div>
          <h1 className="page-title">{vista === 'costo_hora' ? 'Costo hora por cargo' : vista === 'depreciacion' ? 'Depreciación de activos' : 'Gasto administrativo'}</h1>
          <div className="page-sub">Variables comerciales que alimentan el cálculo de Hoja de Costeo.</div>
        </div>
      </div>
      <nav aria-label="Variables de costeo" style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
        <button type="button" className={vista === 'costo_hora' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setVista('costo_hora')}>Costo hora por cargo</button>
        <button type="button" className={vista === 'depreciacion' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setVista('depreciacion')}>Depreciación de activos</button>
        <button type="button" className={vista === 'gasto_administrativo' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setVista('gasto_administrativo')}>Gasto administrativo</button>
      </nav>
      <div style={{ marginBottom:18, padding:'11px 14px', borderRadius:8, background:'rgba(6,182,212,.08)', border:'1px solid rgba(6,182,212,.2)', fontSize:13, color:'var(--fg-muted)' }}>
        Esta sección agrupa variables comerciales de costeo y se gestiona separada de Maestros Base.
      </div>
      {vista === 'depreciacion' ? <DepreciacionActivos /> : vista === 'gasto_administrativo' ? <GastoAdministrativo /> : <>
      {error && <div className="alert alert-danger" style={{ marginBottom:16 }}>{error}</div>}
      <div className="card">
        <div className="card-head"><h3>Cargos de la empresa</h3><span className="badge badge-cyan">{cargos.length}</span></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Cargo</th><th className="num">Según planilla</th><th style={{ minWidth:180 }}>Manual</th><th>Método usado</th><th style={{ textAlign:'right' }}>Acción</th></tr></thead>
            <tbody>
              {cargando ? <tr><td colSpan="5" className="text-muted" style={{ padding:22 }}>Cargando cargos y tarifas...</td></tr> : cargos.map(cargo => {
                const planilla = tarifaPorCargo.get(cargo.id) || 0;
                const manualRaw = valoresManual[cargo.id] ?? '';
                const manual = numero(manualRaw);
                const usaManual = manual > 0;
                const puedeGuardarFila = configPorCargo.has(cargo.id) ? puedeEditar : puedeCrear;
                return <tr key={cargo.id}>
                  <td><strong>{cargo.nombre}</strong>{cargo.codigo && <div className="text-muted mono" style={{ fontSize:11 }}>{cargo.codigo}</div>}{cargo.estado !== 'activo' && <span className="badge badge-gray" style={{ marginTop:4 }}>Inactivo</span>}</td>
                  <td className="num">{planilla > 0 ? moneyUsd(planilla) : '—'}</td>
                  <td><input type="number" min="0" step="0.01" className="input num" value={manualRaw} disabled={!puedeGuardarFila || guardandoCargoId === cargo.id} onChange={event => setValoresManual(prev => ({ ...prev, [cargo.id]: event.target.value }))} placeholder="US$ 0.00" /></td>
                  <td>{usaManual ? <span className="badge badge-purple">Manual</span> : planilla > 0 ? <span className="badge badge-cyan">Planilla</span> : <span className="badge badge-gray">Sin tarifa</span>}</td>
                  <td style={{ textAlign:'right' }}><button className="btn btn-secondary btn-sm" disabled={!puedeGuardarFila || guardandoCargoId === cargo.id} onClick={() => guardar(cargo)}>{I.save} {guardandoCargoId === cargo.id ? 'Guardando...' : 'Guardar'}</button></td>
                </tr>;
              })}
              {!cargando && cargos.length === 0 && <tr><td colSpan="5" className="text-muted" style={{ padding:22 }}>No hay cargos registrados para esta empresa.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  );
}
