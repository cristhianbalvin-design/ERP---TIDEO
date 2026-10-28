import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient.js';
import {
  asignarPosicionesCustodia, calcularLiquidacionCustodia, crearRetiroCustodia, enviarLiquidacionAVentas, guardarTarifaCustodia,
  obtenerResumenCustodia, registrarIngresoCustodia,
} from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { formatoCantidad, formatoMoneda, previsualizarLiquidacion, rangoMesAnterior } from './wmsMultiLogic.js';

const vacio = { almacenes: [], clientes: [], libres: [], stock: [], cuentas: [] };

function BuscarMaterial({ empresaId, sociedadId, valor, onElegir }) {
  const [texto, setTexto] = useState(valor ? `${valor.codigo} · ${valor.descripcion}` : '');
  const [resultados, setResultados] = useState([]);
  useEffect(() => {
    const termino = texto.trim();
    if (!empresaId || termino.length < 2 || (valor && texto === `${valor.codigo} · ${valor.descripcion}`)) { setResultados([]); return undefined; }
    let vigente = true;
    const t = setTimeout(async () => {
      const patron = `%${termino.replace(/[%_,()]/g, ' ')}%`;
      const { data } = await getSupabaseClient().from('materiales').select('id, codigo, descripcion, unidad')
        .eq('empresa_id', empresaId).or(`codigo.ilike.${patron},descripcion.ilike.${patron}`).order('codigo').limit(20);
      if (vigente) setResultados((data || []).map(m => ({ ...m, material_id: m.id })));
    }, 280);
    return () => { vigente = false; clearTimeout(t); };
  }, [texto, empresaId, sociedadId, valor]);
  return <div className="dx-ui-field"><label htmlFor="dx-wcus-mat">Material<span className="dx-ui-required" aria-hidden="true">*</span></label>
    <input id="dx-wcus-mat" type="search" placeholder="Busca por código o descripción" value={texto} onChange={e => { setTexto(e.target.value); if (valor) onElegir(null); }} />
    {resultados.length > 0 && <select className="dx-ui-select dx-w-listbox" size={Math.max(2, Math.min(6, resultados.length))} aria-label="Resultados de materiales" onChange={e => { const m = resultados.find(r => r.material_id === e.target.value); if (m) { onElegir(m); setTexto(`${m.codigo} · ${m.descripcion}`); setResultados([]); } }}>
      {resultados.map(m => <option key={m.material_id} value={m.material_id}>{m.codigo} · {m.descripcion}</option>)}
    </select>}
  </div>;
}

export function CustodiaPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, sesion, config, sociedadId } = base;
  const [almacenId, setAlmacenId] = useState('');
  const [datos, setDatos] = useState(vacio);
  const [clienteId, setClienteId] = useState('');
  const [modal, setModal] = useState(null);
  const [rango, setRango] = useState(rangoMesAnterior);
  const [liq, setLiq] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try {
      const r = await obtenerResumenCustodia({ empresa_id: empresaId });
      setDatos(r);
      setAlmacenId(actual => (r.almacenes.some(a => a.id === actual) ? actual : r.almacenes[0]?.id || ''));
    } catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver]);
  useEffect(() => { cargar(); }, [cargar]);

  const clientes = useMemo(() => datos.clientes.filter(c => c.almacen_id === almacenId), [datos.clientes, almacenId]);
  const cliente = clientes.find(c => c.cuenta_id === clienteId) || null;
  const stockCliente = useMemo(() => datos.stock.filter(s => s.cuenta_id === clienteId && s.almacen_id === almacenId), [datos.stock, clienteId, almacenId]);
  const libres = datos.libres.filter(l => l.almacen_id === almacenId);
  const resumen = useMemo(() => clientes.reduce((r, c) => ({ clientes: r.clientes + 1, posiciones: r.posiciones + Number(c.posiciones), ocupadas: r.ocupadas + Number(c.ocupadas) }), { clientes: 0, posiciones: 0, ocupadas: 0 }), [clientes]);

  useEffect(() => { setLiq(null); }, [clienteId, almacenId, rango.desde, rango.hasta]);

  const ejecutar = async (operacion, textoOk) => {
    setOcupado(true); setErrorModal('');
    try { await operacion(); setModal(null); setAviso(textoOk); await cargar(); }
    catch (e) { setErrorModal(mensajeError(e)); }
    finally { setOcupado(false); }
  };
  const abrir = m => { setErrorModal(''); setAviso(''); setModal(m); };

  const calcular = async () => {
    setOcupado(true); setError('');
    try { setLiq(await calcularLiquidacionCustodia({ empresa_id: empresaId, cuenta_id: clienteId, almacen_id: almacenId, desde: rango.desde, hasta: rango.hasta })); }
    catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };
  const enviar = async () => {
    setOcupado(true); setError('');
    try {
      await enviarLiquidacionAVentas({ empresa_id: empresaId, cuenta_id: clienteId, almacen_id: almacenId, desde: rango.desde, hasta: rango.hasta, sociedad_id: sociedadId });
      setAviso(`Liquidación enviada a Ventas como venta en borrador por ${formatoMoneda(liq?.importe, liq?.moneda)} (+ IGV).`);
      await calcular();
    } catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wcus', nombre: 'la custodia de terceros' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  const pre = liq ? previsualizarLiquidacion(liq) : null;

  return <section className="dx-ui dx-wms dx-wcus">
    <Encabezado titulo="Custodia de terceros" sub="Mercadería de clientes guardada en tus posiciones: no se valoriza como tuya y se cobra por posición-día y por movimiento.">
      {datos.almacenes.length > 1 && <select className="dx-ui-select" aria-label="Almacén de custodia" value={almacenId} onChange={e => { setAlmacenId(e.target.value); setClienteId(''); }}>{datos.almacenes.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}</select>}
      {puede.editar && almacenId && <button type="button" className="dx-btn primary" onClick={() => abrir({ tipo: 'asignar', cuenta_id: clienteId || '', ubicaciones: [] })}>Asignar posiciones</button>}
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {!config.modulos.custodia && <div className="dx-w-note amber" role="status">El módulo de custodia está desactivado en Configuración del WMS.</div>}
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    {cargando && !datos.almacenes.length ? <div className="dx-ui-empty">Cargando custodia…</div>
      : !datos.almacenes.length ? <div className="dx-ui-card"><div className="dx-ui-empty">No hay almacenes con propósito «Custodia de terceros». Asígnalo en Configuración del WMS para empezar a guardar mercadería de clientes.</div></div>
      : <>
        <div className="dx-ui-kpi-row">
          <div className="dx-ui-kpi"><strong>{resumen.clientes}</strong><span>Clientes</span></div>
          <div className="dx-ui-kpi"><strong>{resumen.ocupadas}/{resumen.posiciones}</strong><span>Posiciones ocupadas</span></div>
          <div className="dx-ui-kpi"><strong>{libres.length}</strong><span>Posiciones libres</span></div>
        </div>
        <div className="dx-w-side">
          <div className="dx-ui-card">
            <div className="dx-w-bar"><h2>Clientes en custodia</h2><span className="dx-ui-count">{clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}</span></div>
            {!clientes.length ? <div className="dx-ui-empty">Aún no hay posiciones asignadas a clientes en este almacén.</div>
              : <div className="dx-w-scroll"><table className="dx-w-table">
                <thead><tr><th>Cliente</th><th className="num">Posiciones</th><th className="num dx-w-hide-m">Materiales</th><th className="num dx-w-hide-m">Unidades</th><th className="num">Tarifa / pos-día</th></tr></thead>
                <tbody>{clientes.map(c => <tr key={c.cuenta_id} className={`click${c.cuenta_id === clienteId ? ' sel' : ''}`} tabIndex={0} onClick={() => setClienteId(c.cuenta_id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setClienteId(c.cuenta_id); } }}>
                  <td><b>{c.razon_social}</b><small>{c.ruc || ''}</small></td>
                  <td className="num">{c.ocupadas}/{c.posiciones}</td>
                  <td className="num dx-w-hide-m">{c.materiales}</td>
                  <td className="num dx-w-hide-m">{formatoCantidad(c.unidades)}</td>
                  <td className="num">{c.tarifa ? formatoMoneda(c.tarifa.tarifa_posicion_dia, c.tarifa.moneda) : <span className="dx-ui-pill is-amber"><i />Sin tarifa</span>}</td>
                </tr>)}</tbody>
              </table></div>}
            {cliente && <div className="dx-w-sec">
              <h3>Mercadería de {cliente.razon_social}</h3>
              <p className="sub">Posiciones: {cliente.ubicaciones.map(u => u.codigo).sort().join(', ')}</p>
              {!stockCliente.length ? <div className="dx-ui-empty">Sin mercadería registrada.</div>
                : <div className="dx-w-scroll"><table className="dx-w-table"><thead><tr><th>Ubicación</th><th>Material</th><th className="num">Unidades</th><th className="num dx-w-hide-m">Comprometido</th></tr></thead>
                  <tbody>{stockCliente.map(s => <tr key={`${s.ubicacion_id}-${s.material_id}`}><td><b>{s.ubicacion}</b></td><td className="mat"><b>{s.codigo}</b><small>{s.descripcion}</small></td><td className="num">{formatoCantidad(s.fisico)} {s.unidad || ''}</td><td className="num dx-w-hide-m">{formatoCantidad(s.reservado)}</td></tr>)}</tbody></table></div>}
              <div className="dx-w-tools">
                {puede.crear && <button type="button" className="dx-btn" onClick={() => abrir({ tipo: 'ingreso', ubicacion_id: cliente.ubicaciones[0]?.id || '', material: null, cantidad: '', documento: '' })}>Registrar ingreso</button>}
                {puede.crear && stockCliente.length > 0 && <button type="button" className="dx-btn" onClick={() => abrir({ tipo: 'retiro', cantidades: {}, observacion: '' })}>Solicitar retiro</button>}
                {puede.editar && <button type="button" className="dx-btn" onClick={() => abrir({ tipo: 'tarifa', tarifa_posicion_dia: cliente.tarifa?.tarifa_posicion_dia ?? '', tarifa_movimiento: cliente.tarifa?.tarifa_movimiento ?? '', moneda: cliente.tarifa?.moneda || 'PEN' })}>Tarifa</button>}
              </div>
            </div>}
          </div>

          <div className="dx-ui-card">
            {!cliente ? <div className="dx-ui-empty">Selecciona un cliente para ver su mercadería y liquidar el almacenaje.</div> : <div className="dx-w-sec">
              <h3>Liquidación de almacenaje</h3>
              <p className="sub">Posiciones ocupadas cada día × tarifa, más los movimientos de ingreso y salida × tarifa.</p>
              <div className="dx-ui-form-grid is-2">
                <div className="dx-ui-field"><label htmlFor="dx-wcus-desde">Desde<span className="dx-ui-required" aria-hidden="true">*</span></label><input id="dx-wcus-desde" type="date" value={rango.desde} onChange={e => setRango({ ...rango, desde: e.target.value })} /></div>
                <div className="dx-ui-field"><label htmlFor="dx-wcus-hasta">Hasta<span className="dx-ui-required" aria-hidden="true">*</span></label><input id="dx-wcus-hasta" type="date" value={rango.hasta} onChange={e => setRango({ ...rango, hasta: e.target.value })} /></div>
              </div>
              <button type="button" className="dx-btn" disabled={ocupado || !rango.desde || !rango.hasta} onClick={calcular}>Calcular</button>
              {liq && <>
                <div className="dx-w-kv"><span>Posiciones-día</span><b>{formatoCantidad(liq.posiciones_dia)} × {formatoMoneda(liq.tarifa_posicion_dia, liq.moneda)}</b></div>
                <div className="dx-w-kv"><span>Almacenaje</span><b>{formatoMoneda(pre.almacenaje, liq.moneda)}</b></div>
                <div className="dx-w-kv"><span>Movimientos</span><b>{liq.movimientos} × {formatoMoneda(liq.tarifa_movimiento, liq.moneda)}</b></div>
                <div className="dx-w-kv"><span>Por movimientos</span><b>{formatoMoneda(pre.movimientos, liq.moneda)}</b></div>
                <div className="dx-w-total"><span>Total (sin IGV)</span><span>{formatoMoneda(pre.total, liq.moneda)}</span></div>
                {!cliente.tarifa && <div className="dx-w-note amber">Este cliente no tiene tarifa: regístrala antes de liquidar.</div>}
                {liq.liquidacion ? <div className="dx-w-note green">Este período ya se envió a Ventas.</div>
                  : <button type="button" className="dx-btn primary" disabled={ocupado || !(pre.total > 0) || !sesion.permiteEscritura} onClick={enviar}>Enviar a Ventas</button>}
              </>}
            </div>}
          </div>
        </div>
      </>}

    {modal && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setModal(null); }}>
      {modal.tipo === 'asignar' && <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wcus-asig-t" onSubmit={e => { e.preventDefault(); if (!modal.cuenta_id || !modal.ubicaciones.length) { setErrorModal('Elige el cliente y al menos una posición libre.'); return; } ejecutar(() => asignarPosicionesCustodia({ empresa_id: empresaId, almacen_id: almacenId, cuenta_id: modal.cuenta_id, ubicaciones: modal.ubicaciones }), `${modal.ubicaciones.length} posiciones asignadas.`); }}>
        <h3 id="dx-wcus-asig-t">Asignar posiciones a un cliente</h3>
        <div className="dx-ui-field"><label htmlFor="dx-wcus-cuenta">Cliente<span className="dx-ui-required" aria-hidden="true">*</span></label><select id="dx-wcus-cuenta" value={modal.cuenta_id} onChange={e => setModal({ ...modal, cuenta_id: e.target.value })}><option value="">Selecciona un cliente</option>{datos.cuentas.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></div>
        <div className="dx-ui-field"><span className="dx-ui-label">Posiciones libres ({libres.length})</span>
          {!libres.length ? <div className="dx-ui-empty">No hay posiciones libres. Crea ubicaciones en el almacén.</div>
            : <div className="dx-w-lines">{libres.map(l => <label key={l.id} className="dx-w-toggle"><input type="checkbox" className="dx-w-check" checked={modal.ubicaciones.includes(l.id)} onChange={() => setModal({ ...modal, ubicaciones: modal.ubicaciones.includes(l.id) ? modal.ubicaciones.filter(x => x !== l.id) : [...modal.ubicaciones, l.id] })} />{l.codigo}</label>)}</div>}
        </div>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Asignar'}</button></div>
      </form>}
      {modal.tipo === 'tarifa' && <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wcus-tar-t" onSubmit={e => { e.preventDefault(); const pd = Number(String(modal.tarifa_posicion_dia).replace(',', '.')); const mv = Number(String(modal.tarifa_movimiento).replace(',', '.')); if (!(pd >= 0) || !(mv >= 0)) { setErrorModal('Las tarifas deben ser cero o mayores.'); return; } ejecutar(() => guardarTarifaCustodia({ empresa_id: empresaId, cuenta_id: clienteId, almacen_id: almacenId, tarifa_posicion_dia: pd, tarifa_movimiento: mv, moneda: modal.moneda }), 'Tarifa guardada.'); }}>
        <h3 id="dx-wcus-tar-t">Tarifa de {cliente?.razon_social}</h3>
        <div className="dx-ui-form-grid is-2">
          <div className="dx-ui-field"><label htmlFor="dx-wcus-tpd">Por posición-día<span className="dx-ui-required" aria-hidden="true">*</span></label><input id="dx-wcus-tpd" inputMode="decimal" value={modal.tarifa_posicion_dia} onChange={e => setModal({ ...modal, tarifa_posicion_dia: e.target.value })} /></div>
          <div className="dx-ui-field"><label htmlFor="dx-wcus-tmv">Por movimiento<span className="dx-ui-required" aria-hidden="true">*</span></label><input id="dx-wcus-tmv" inputMode="decimal" value={modal.tarifa_movimiento} onChange={e => setModal({ ...modal, tarifa_movimiento: e.target.value })} /></div>
        </div>
        <div className="dx-ui-field"><label htmlFor="dx-wcus-mon">Moneda</label><select id="dx-wcus-mon" value={modal.moneda} onChange={e => setModal({ ...modal, moneda: e.target.value })}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select></div>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar tarifa'}</button></div>
      </form>}
      {modal.tipo === 'ingreso' && <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wcus-ing-t" onSubmit={e => { e.preventDefault(); const q = Number(String(modal.cantidad).replace(',', '.')); if (!modal.material || !(q > 0) || !modal.ubicacion_id) { setErrorModal('Elige posición, material y una cantidad mayor a cero.'); return; } ejecutar(() => registrarIngresoCustodia({ empresa_id: empresaId, ubicacion_id: modal.ubicacion_id, material_id: modal.material.material_id, cantidad: q, sociedad_id: sociedadId, documento: modal.documento.trim() || null }), `Ingreso de ${formatoCantidad(q)} ${modal.material.codigo} registrado.`); }}>
        <h3 id="dx-wcus-ing-t">Ingreso de mercadería · {cliente?.razon_social}</h3>
        <div className="dx-ui-field"><label htmlFor="dx-wcus-ubi">Posición<span className="dx-ui-required" aria-hidden="true">*</span></label><select id="dx-wcus-ubi" value={modal.ubicacion_id} onChange={e => setModal({ ...modal, ubicacion_id: e.target.value })}>{cliente?.ubicaciones.map(u => <option key={u.id} value={u.id}>{u.codigo}</option>)}</select></div>
        <BuscarMaterial empresaId={empresaId} sociedadId={sociedadId} valor={modal.material} onElegir={m => setModal(actual => ({ ...actual, material: m }))} />
        <div className="dx-ui-form-grid is-2">
          <div className="dx-ui-field"><label htmlFor="dx-wcus-cant">Cantidad<span className="dx-ui-required" aria-hidden="true">*</span></label><input id="dx-wcus-cant" inputMode="decimal" value={modal.cantidad} onChange={e => setModal({ ...modal, cantidad: e.target.value })} /></div>
          <div className="dx-ui-field"><label htmlFor="dx-wcus-doc">Guía del cliente · opcional</label><input id="dx-wcus-doc" maxLength={40} value={modal.documento} onChange={e => setModal({ ...modal, documento: e.target.value })} /></div>
        </div>
        <p className="dx-ui-sub">Entra a costo cero: no suma a tu inventario valorizado.</p>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Registrando…' : 'Registrar ingreso'}</button></div>
      </form>}
      {modal.tipo === 'retiro' && <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wcus-ret-t" onSubmit={e => {
        e.preventDefault();
        const porMaterial = new Map();
        for (const s of stockCliente) {
          const q = Number(String(modal.cantidades[s.material_id] ?? '').replace(',', '.'));
          if (q > 0 && !porMaterial.has(s.material_id)) porMaterial.set(s.material_id, q);
        }
        const lineas = [...porMaterial].map(([material_id, cantidad]) => ({ material_id, cantidad }));
        if (!lineas.length) { setErrorModal('Indica la cantidad a retirar de al menos un material.'); return; }
        ejecutar(() => crearRetiroCustodia({ empresa_id: empresaId, almacen_id: almacenId, cuenta_id: clienteId, sociedad_id: sociedadId, lineas, observacion: modal.observacion.trim() || null }), 'Retiro creado: ya está en la cola de Despachos para prepararlo.');
      }}>
        <h3 id="dx-wcus-ret-t">Retiro de mercadería · {cliente?.razon_social}</h3>
        <table className="dx-w-table"><thead><tr><th>Material</th><th className="num">En custodia</th><th className="num">Retirar</th></tr></thead>
          <tbody>{[...new Map(stockCliente.map(s => [s.material_id, s])).values()].map(s => {
            const total = stockCliente.filter(x => x.material_id === s.material_id).reduce((a, x) => a + Number(x.disponible), 0);
            return <tr key={s.material_id}><td><b>{s.codigo}</b><small>{s.descripcion}</small></td><td className="num">{formatoCantidad(total)}</td><td className="num"><input className="dx-w-in" inputMode="decimal" aria-label={`Cantidad a retirar de ${s.codigo}`} value={modal.cantidades[s.material_id] ?? ''} onChange={e => setModal({ ...modal, cantidades: { ...modal.cantidades, [s.material_id]: e.target.value } })} /></td></tr>;
          })}</tbody></table>
        <div className="dx-ui-field"><label htmlFor="dx-wcus-obs">Observación · opcional</label><input id="dx-wcus-obs" maxLength={200} value={modal.observacion} onChange={e => setModal({ ...modal, observacion: e.target.value })} /></div>
        {errorModal && <div className="dx-w-note red" role="alert">{errorModal}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setModal(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear retiro'}</button></div>
      </form>}
    </div>}
  </section>;
}
