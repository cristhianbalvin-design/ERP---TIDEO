import React, { useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { formatCurrencyTotals, formatMoney, sumByCurrency } from './lib/currency.js';
import { resolverFiltroSociedadesVista } from './services/sociedadesService.js';
import FinanciamientoListado from './pages/financiamiento/FinanciamientoListado.jsx';
import FinanciamientoDetalle from './pages/financiamiento/FinanciamientoDetalle.jsx';
import FinanciamientoAsistente from './pages/financiamiento/FinanciamientoAsistente.jsx';
import FinanciamientoPago from './pages/financiamiento/FinanciamientoPago.jsx';
import { cargarAdjuntos, eliminarAdjunto } from './services/storageService.js';
import {
  buildEgresoTesoreria,
  buildDebtSummary,
  buildFinanciamiento,
  buildGastoIntereses,
  buildPagoFinanciamiento,
  cargarVinculosFinanciamiento,
  construirEdicionFinanciamiento,
  crearFinanciamientoConAmortizacion,
  createFinanciamientosDataSource,
  editarFinanciamientoRpc,
  eliminarFinanciamientoRpc,
  esInteresSaldo,
  impactoLocalEliminarFinanciamiento,
  nextCuota,
  recalcularTabla as recalcularTablaService,
  registrarPagoFinanciamientoRpc,
  registrarPagoInteresSaldoRpc,
} from './services/financiamientosService.js';

const tipoLabel = { bancario:'Bancario', tercero:'Tercero', leasing:'Leasing', linea_credito:'Linea credito', otro:'Otro' };
const fmtMoney = (moneda, monto) => formatMoney(monto, moneda);
const finMoney = (f, monto) => fmtMoney(f?.moneda || 'PEN', monto);

function moneyByCurrency(totals) {
  return formatCurrencyTotals(totals);
  return keys.length ? keys.map(m => fmtMoney(m, totals[m])).join(' · ') : fmtMoney('PEN', 0);
}

function EliminarFinanciamientoModal({ data, onClose, onContinuar, onConfirmar }) {
  const { financiamiento, paso, impacto, cargando, error } = data;
  const [entendido, setEntendido] = useState(false);
  const m = impacto?.moneda || financiamiento.moneda || 'PEN';
  const money = v => fmtMoney(m, v);
  const conMovimientos = (impacto?.pagos || 0) + (impacto?.movimientos || 0) + (impacto?.gastos || 0) > 0;
  return (
    <div className="modal-backdrop" onClick={cargando ? undefined : onClose}>
      <div className="modal" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{width:'min(560px, 94vw)'}}>
        <div className="modal-head"><div><div className="eyebrow" style={{color:'var(--red, #dc2626)'}}>{paso === 1 ? 'Eliminar financiamiento' : 'Confirmación final · acción irreversible'}</div><div className="font-display" style={{fontSize:20,fontWeight:700}}>{financiamiento.codigo} · {financiamiento.entidad}</div></div><button className="btn btn-ghost btn-sm" onClick={onClose} disabled={cargando} aria-label="Cerrar">{I.x}</button></div>
        <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:12, overflowY:'auto'}}>
          {paso === 1 && <p style={{margin:0}}>¿Seguro que quieres eliminar el financiamiento <strong>{financiamiento.codigo}</strong> de <strong>{financiamiento.entidad}</strong> por <strong>{finMoney(financiamiento, financiamiento.monto_original)}</strong>? En el siguiente paso verás todo lo que se borrará junto con él.</p>}
          {paso === 2 && cargando && !impacto && <p className="text-muted" style={{margin:0}}>Calculando el impacto de la eliminación...</p>}
          {paso === 2 && impacto && <>
            <p style={{margin:0}}>Al confirmar se borrará <strong>de forma permanente</strong> lo siguiente:</p>
            <ul style={{margin:0, paddingLeft:20, display:'flex', flexDirection:'column', gap:6}}>
              <li>El préstamo <strong>{impacto.codigo}</strong> por {money(impacto.monto_original)} con saldo pendiente de {money(impacto.saldo_pendiente)}.</li>
              <li>Su tabla de amortización: <strong>{impacto.cuotas}</strong> cuota(s){impacto.cuotas_pagadas > 0 ? `, de las cuales ${impacto.cuotas_pagadas} figuran como pagadas` : ''}.</li>
              {impacto.pagos > 0 && <li><strong>{impacto.pagos}</strong> pago(s) registrado(s) por {money(impacto.pagos_total)} (capital {money(impacto.pagos_capital)} · intereses {money(impacto.pagos_interes)}).</li>}
              {impacto.movimientos > 0 && <li><strong>{impacto.movimientos}</strong> egreso(s) de Tesorería por {money(impacto.movimientos_total)}. Al desaparecer, el saldo de estas cuentas <strong>subirá</strong> en ese importe:
                {(impacto.movimientos_por_cuenta || []).length > 0 && <ul style={{marginTop:4, paddingLeft:18}}>{impacto.movimientos_por_cuenta.map(c => <li key={c.cuenta + c.moneda}>{c.cuenta}: +{fmtMoney(c.moneda, c.total)} ({c.cantidad} mov.)</li>)}</ul>}
              </li>}
              {impacto.gastos > 0 && <li><strong>{impacto.gastos}</strong> gasto(s) de intereses por {money(impacto.gastos_total)}; dejarán de aparecer en Compras/Gastos y en el Estado de Resultados.</li>}
            </ul>
            {conMovimientos && <div style={{padding:'10px 12px', borderRadius:8, background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.35)', fontSize:13}}>Si estos pagos ocurrieron realmente en el banco, eliminarlos dejará los saldos del ERP distintos a los del banco. Hazlo solo si el préstamo se registró por error.</div>}
            <label className="row" style={{gap:8, alignItems:'flex-start', cursor:'pointer'}}><input type="checkbox" checked={entendido} onChange={e => setEntendido(e.target.checked)} style={{marginTop:3}}/><span>Entiendo lo que se eliminará y que no se puede deshacer.</span></label>
          </>}
          {error && <div style={{color:'var(--red, #dc2626)'}}>{error}</div>}
        </div>
        <div className="modal-foot" style={{display:'flex', justifyContent:'flex-end', gap:8}}>
          <button className="btn btn-secondary" onClick={onClose} disabled={cargando}>Cancelar</button>
          {paso === 1
            ? <button className="btn btn-danger" onClick={onContinuar} disabled={cargando}>Continuar</button>
            : <button className="btn btn-danger" onClick={onConfirmar} disabled={cargando || !impacto || !entendido}>{cargando && impacto ? 'Eliminando...' : 'Eliminar definitivamente'}</button>}
        </div>
      </div>
    </div>
  );
}

export function FinanciamientoDeuda() {
  const { financiamientos, setFinanciamientos, comprasGastos = [], setComprasGastos, movimientosTesoreria = [], setMovimientosTesoreria, cuentasBancarias = [], tipoCambioHoy, empresa, role, activeParams, navigate, addNotificacion, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles = [] } = useApp();
  // Misma regla que usuario_puede(empresa, 'financiamiento', 'editar' | 'eliminar') en el servidor
  // ('eliminar' usa el permiso de anular de la pantalla).
  const tienePermiso = accion => Boolean(role?.es_admin_empresa || role?.es_superadmin || role?.permisos?.todo || role?.permisos?.plataforma
    || role?.permisos?.[accion] === true || role?.permisos?.[accion]?.includes?.('financiamiento'));
  const puedeEditar = tienePermiso('editar');
  const puedeEliminar = tienePermiso('anular');
  const [asistente, setAsistente] = useState(null);
  const [eliminarOpen, setEliminarOpen] = useState(null);
  const modoVistaSociedad = resolverFiltroSociedadesVista({ multisociedadHabilitado: empresa?.multisociedad_habilitado, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles });
  const mensajeSeleccionSociedad = 'Selecciona una sociedad concreta en el selector superior para crear un financiamiento.';
  const [tab, setTab] = useState('todos');
  const [pagoOpen, setPagoOpen] = useState(null);
  const sociedadActivaId = typeof sociedadActiva === 'string' ? sociedadActiva : sociedadActiva?.id;
  const detalle = activeParams?.detail ? financiamientos.find(f => f.id === activeParams.detail) : null;
  const dataSource = createFinanciamientosDataSource({
    empresa,
    getFinanciamientos: () => financiamientos,
    setFinanciamientos,
    getComprasGastos: () => [],
    setComprasGastos,
    getMovimientosTesoreria: () => [],
    setMovimientosTesoreria,
  });
  const empresaFinanciamientos = financiamientos.filter(f => f.empresa_id === empresa.id);
  const { activos, deudaTotalPorMoneda, cuotasMesPorMoneda, interesesMesPorMoneda, interesesPagadosPorMoneda } = buildDebtSummary(empresaFinanciamientos);

  // Trae del servidor los egresos/ingresos y gastos del préstamo (tras un alta o un pago calculado allá).
  const refrescarVinculos = async financiamientoId => {
    try {
      const { movimientos, gastos } = await cargarVinculosFinanciamiento({ empresaId: empresa.id, financiamientoId });
      setMovimientosTesoreria(prev => [...movimientos, ...prev.filter(m => !(m.vinculo_tipo === 'financiamiento' && m.vinculo_id === financiamientoId))]);
      setComprasGastos(prev => [...gastos, ...prev.filter(g => g.financiamiento_id !== financiamientoId)]);
    } catch (error) {
      console.warn('[financiamiento] no se pudieron refrescar los movimientos vinculados:', error?.message || error);
    }
  };

  const guardarFinanciamiento = async form => {
    if (!modoVistaSociedad.permiteEscritura) throw new Error(mensajeSeleccionSociedad);
    const nuevo = buildFinanciamiento({
      form: { ...form, sociedad_id: empresa?.multisociedad_habilitado ? form.sociedad_id : null, cuenta_bancaria_destino: form.cuenta?.nombre || '' },
      empresa,
      sequence: financiamientos.length + 1,
    });
    delete nuevo.cuenta;
    if (dataSource.mode === 'supabase') {
      const persistido = await crearFinanciamientoConAmortizacion({
        empresa,
        nuevo: { ...nuevo, codigo: null },
        registrarIngreso: Boolean(form.registrar_ingreso && form.cuenta),
        tcAplicado: form.tc_aplicado ? Number(form.tc_aplicado) : null,
        referencia: form.referencia || null,
      });
      setFinanciamientos(prev => [...prev, persistido]);
      if (form.registrar_ingreso && form.cuenta) await refrescarVinculos(persistido.id);
      setAsistente(null);
      navigate('financiamiento', { detail: persistido.id });
      addNotificacion(`Préstamo ${persistido.codigo} registrado.`);
    } else {
      dataSource.financiamientos.create(nuevo);
      setAsistente(null);
      addNotificacion(`Préstamo ${nuevo.codigo} registrado.`);
    }
  };

  const guardarEdicion = async form => {
    const financiamiento = asistente.financiamiento;
    const calculo = construirEdicionFinanciamiento(financiamiento, { ...form, cuenta_bancaria_destino: form.cuenta?.nombre || financiamiento.cuenta_bancaria_destino || '' });
    if (calculo.error) throw new Error(calculo.error);
    const datos = {
      ...calculo.datos,
      cuenta_bancaria_id: form.cuenta_bancaria_id || null,
      ...(form.cuenta ? { cuenta_bancaria_destino: form.cuenta.nombre } : {}),
      sociedad_id: empresa?.multisociedad_habilitado ? (form.sociedad_id || null) : (financiamiento.sociedad_id ?? null),
    };
    const actualizado = dataSource.mode === 'supabase'
      ? { ...financiamiento, ...(await editarFinanciamientoRpc({ empresa, id: financiamiento.id, datos, cuotas: calculo.tabla })), pagos_realizados: financiamiento.pagos_realizados || [] }
      : { ...financiamiento, ...datos, tabla_amortizacion: calculo.tabla };
    setFinanciamientos(prev => prev.map(f => f.id === financiamiento.id ? actualizado : f));
    if ((actualizado.sociedad_id || null) !== (financiamiento.sociedad_id || null)) {
      setComprasGastos(prev => prev.map(g => g.financiamiento_id === financiamiento.id ? { ...g, sociedad_id: actualizado.sociedad_id || null } : g));
    }
    setAsistente(null);
    addNotificacion(`Préstamo ${financiamiento.codigo} actualizado.`);
  };

  const continuarEliminar = async () => {
    const financiamiento = eliminarOpen.financiamiento;
    if (dataSource.mode !== 'supabase') {
      setEliminarOpen(v => ({ ...v, paso: 2, impacto: impactoLocalEliminarFinanciamiento(financiamiento, movimientosTesoreria, comprasGastos), error: '' }));
      return;
    }
    setEliminarOpen(v => ({ ...v, paso: 2, cargando: true, error: '' }));
    try {
      const impacto = await eliminarFinanciamientoRpc({ empresa, id: financiamiento.id, ejecutar: false });
      setEliminarOpen(v => v && ({ ...v, impacto, cargando: false }));
    } catch (error) {
      setEliminarOpen(v => v && ({ ...v, cargando: false, error: error?.message || 'No se pudo calcular el impacto de la eliminación.' }));
    }
  };

  const confirmarEliminar = async () => {
    const financiamiento = eliminarOpen.financiamiento;
    setEliminarOpen(v => ({ ...v, cargando: true, error: '' }));
    try {
      if (dataSource.mode === 'supabase') {
        await eliminarFinanciamientoRpc({ empresa, id: financiamiento.id, ejecutar: true });
        // Documentos adjuntos del préstamo: se borran del almacenamiento junto con él.
        try {
          const docs = await cargarAdjuntos({ empresaId: empresa.id, entidadTipo: 'financiamientos', entidadId: financiamiento.id });
          await Promise.all(docs.map(doc => eliminarAdjunto(doc)));
        } catch (errorDocs) {
          console.warn('[financiamiento] no se pudieron borrar los documentos adjuntos:', errorDocs?.message || errorDocs);
        }
      }
      setFinanciamientos(prev => prev.filter(f => f.id !== financiamiento.id));
      setMovimientosTesoreria(prev => prev.filter(m => !(m.vinculo_tipo === 'financiamiento' && m.vinculo_id === financiamiento.id)));
      setComprasGastos(prev => prev.filter(g => g.financiamiento_id !== financiamiento.id));
      setEliminarOpen(null);
      if (activeParams?.detail === financiamiento.id) navigate('financiamiento');
      addNotificacion(`Financiamiento ${financiamiento.codigo} eliminado junto con sus cuotas, pagos y movimientos vinculados.`);
    } catch (error) {
      setEliminarOpen(v => v && ({ ...v, cargando: false, error: error?.message || 'No se pudo eliminar el financiamiento.' }));
    }
  };

  // Interés sobre saldo: el servidor calcula interés, saldo, egreso y gasto financiero.
  const registrarPagoInteresSaldo = async (financiamiento, datos) => {
    const actualizado = await registrarPagoInteresSaldoRpc({
      empresa,
      financiamientoId: financiamiento.id,
      datos: {
        fecha: datos.fecha,
        periodo_numero: datos.modo === 'capital' ? null : datos.periodo?.numero ?? null,
        capital: datos.resumen.capital,
        cuenta_bancaria_id: datos.cuenta_bancaria_id,
        tc_aplicado: datos.tc_aplicado,
        referencia: datos.referencia,
        comprobante: datos.comprobante,
      },
    });
    setFinanciamientos(prev => prev.map(f => f.id === financiamiento.id ? { ...f, ...actualizado } : f));
    await refrescarVinculos(financiamiento.id);
  };

  // Cuota fija, decreciente o bullet: misma lógica de siempre, ahora con la cuenta real y el TC.
  const registrarPagoCuota = async (financiamiento, entrada) => {
    const datos = { ...entrada, cuota: entrada.modo === 'cuota' ? entrada.periodo : null, cuenta_bancaria: entrada.cuenta?.nombre || '' };
    const esCuota = datos.modo === 'cuota';
    const capital = +datos.resumen.capital || 0;
    const interes = +datos.resumen.interes || 0;
    const nuevoSaldo = Math.max(0, (financiamiento.saldo_pendiente || 0) - capital);
    const nuevoEstado = nuevoSaldo <= 0 ? 'cancelado' : financiamiento.estado;
    const nuevasCuotasPagadas = esCuota ? (financiamiento.cuotas_pagadas || 0) + 1 : (financiamiento.cuotas_pagadas || 0);
    const nuevosInteresesPagados = (financiamiento.intereses_pagados_total || 0) + interes;
    const pago = { ...buildPagoFinanciamiento({ financiamiento, datos, nuevoSaldo }), cuenta_bancaria_id: datos.cuenta_bancaria_id };
    const tablaMarcada = (financiamiento.tabla_amortizacion || []).map(c => esCuota && c.numero === datos.cuota?.numero ? { ...c, estado:'pagada', fecha_pago_real:datos.fecha, referencia:datos.referencia, comprobante:datos.comprobante } : c);
    const tabla = esCuota ? tablaMarcada : recalcularTablaService(financiamiento, tablaMarcada, nuevoSaldo, datos.fecha);
    const movimiento = buildEgresoTesoreria({ financiamiento, pago, datos, empresa });
    const gasto = (esCuota && interes > 0) ? buildGastoIntereses({ financiamiento, cuota: datos.cuota, interes, fecha: datos.fecha, empresa }) : null;

    if (dataSource.mode === 'supabase') {
      const resultado = await registrarPagoFinanciamientoRpc({
        empresa,
        financiamientoId: financiamiento.id,
        saldoPendiente: nuevoSaldo,
        estado: nuevoEstado,
        cuotasPagadas: nuevasCuotasPagadas,
        interesesPagadosTotal: nuevosInteresesPagados,
        tabla,
        pago,
        movimiento,
        gasto,
      });
      setFinanciamientos(prev => prev.map(f => f.id === financiamiento.id ? { ...f, ...resultado, pagos_realizados:[...(f.pagos_realizados || []), pago] } : f));
      await refrescarVinculos(financiamiento.id);
      return;
    }
    setFinanciamientos(prev => prev.map(f => f.id === financiamiento.id ? { ...f, saldo_pendiente:nuevoSaldo, estado:nuevoEstado, tabla_amortizacion:tabla, cuotas_pagadas:nuevasCuotasPagadas, intereses_pagados_total:nuevosInteresesPagados, pagos_realizados:[...(f.pagos_realizados || []), pago] } : f));
    setMovimientosTesoreria(prev => [movimiento, ...prev]);
    if (gasto) setComprasGastos(prev => [gasto, ...prev]);
  };

  const registrarPago = async datos => {
    const financiamiento = pagoOpen.financiamiento;
    if (esInteresSaldo(financiamiento)) await registrarPagoInteresSaldo(financiamiento, datos);
    else await registrarPagoCuota(financiamiento, datos);
    setPagoOpen(null);
    addNotificacion(`Pago de ${finMoney(financiamiento, datos.resumen.total)} registrado en ${financiamiento.codigo}.`);
  };

  if (asistente) {
    return (
      <>
        <FinanciamientoAsistente
          key={asistente.financiamiento?.id || 'nuevo'}
          edicion={asistente.financiamiento || null}
          empresa={empresa}
          sociedadesDisponibles={sociedadesDisponibles}
          sociedadInicial={sociedadActivaId && sociedadesDisponibles.some(x => x.id === sociedadActivaId) ? sociedadActivaId : ''}
          cuentasBancarias={cuentasBancarias}
          tcUsdPorPen={tipoCambioHoy?.usd || null}
          onCancelar={() => setAsistente(null)}
          onGuardar={asistente.financiamiento ? guardarEdicion : guardarFinanciamiento}
        />
      </>
    );
  }

  if (detalle) {
    return (
      <>
        <FinanciamientoDetalle
          financiamiento={detalle}
          empresaId={empresa.id}
          puedeEditar={puedeEditar}
          puedeEliminar={puedeEliminar}
          onVolver={() => navigate('financiamiento')}
          onEditar={() => setAsistente({ financiamiento: detalle })}
          onEliminar={() => setEliminarOpen({ financiamiento:detalle, paso:1 })}
          onPagar={cuota => setPagoOpen({ financiamiento:detalle, cuota: cuota || nextCuota(detalle) })}
        />
        {pagoOpen && <FinanciamientoPago financiamiento={pagoOpen.financiamiento} cuotaInicial={pagoOpen.cuota} cuentasBancarias={cuentasBancarias} empresaId={empresa.id} tcUsdPorPen={tipoCambioHoy?.usd || null} onCerrar={() => setPagoOpen(null)} onConfirmar={registrarPago}/>}
        {eliminarOpen && <EliminarFinanciamientoModal data={eliminarOpen} onClose={()=>setEliminarOpen(null)} onContinuar={continuarEliminar} onConfirmar={confirmarEliminar}/>}
      </>
    );
  }

  const abrirNuevo = () => { if (modoVistaSociedad.permiteEscritura) setAsistente({ financiamiento: null }); };
  const modales = (
    <>
      {eliminarOpen && <EliminarFinanciamientoModal data={eliminarOpen} onClose={()=>setEliminarOpen(null)} onContinuar={continuarEliminar} onConfirmar={confirmarEliminar}/>}
    </>
  );

  if (tab !== 'reporte') {
    return (
      <>
        <FinanciamientoListado
          financiamientos={empresaFinanciamientos}
          puedeCrear={modoVistaSociedad.permiteEscritura}
          mensajeSinEscritura={mensajeSeleccionSociedad}
          onNuevo={abrirNuevo}
          onAbrir={id => navigate('financiamiento', { detail: id })}
          onReporte={() => setTab('reporte')}
        />
        {modales}
      </>
    );
  }

  const porTipo = ['bancario','leasing','tercero'].map(tipo => {
    const rows = activos.filter(f => f.tipo === tipo);
    const totals = sumByCurrency(rows, f => f.saldo_pendiente);
    const pct = Object.fromEntries(Object.entries(totals).map(([m,total]) => [m, deudaTotalPorMoneda[m] ? Math.round(total / deudaTotalPorMoneda[m] * 100) : 0]));
    return { tipo, totals, pct };
  });
  const meses = Array.from({length:12}, (_,i) => {
    const d = new Date('2026-05-01T00:00:00'); d.setMonth(d.getMonth()+i);
    const ym = d.toISOString().slice(0,7);
    const totals = activos.reduce((acc, f) => {
      const total = (f.tabla_amortizacion || []).filter(c => (c.estado === 'pendiente' || c.estado === 'futura') && c.fecha.slice(0,7) === ym).reduce((s,c)=>s+c.total,0);
      if (total) acc[f.moneda || 'PEN'] = (acc[f.moneda || 'PEN'] || 0) + total;
      return acc;
    }, {});
    return { label:d.toLocaleDateString('es-PE',{month:'short', year:'numeric'}), totals, visual:Object.values(totals).reduce((s,v)=>s+v,0) };
  });
  const maxMes = Math.max(...meses.map(m => m.visual), 1);

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setTab('vigentes')}>Volver a Financiamiento y Deuda</button>
      <div className="page-header mt-4"><div><h1 className="page-title">Reporte de deuda</h1><div className="page-sub">Los importes se muestran por moneda; no se mezclan PEN y USD sin tipo de cambio.</div></div></div>
      <div className="card"><div className="card-head"><h3>Reporte de deuda financiera</h3><button className="btn btn-secondary btn-sm">{I.download} Exportar reporte Excel</button></div><div className="card-body"><div className="grid-2" style={{gap:20}}><div style={{padding:16, border:'1px solid var(--border)', borderRadius:8}}><h3 style={{marginTop:0}}>Resumen ejecutivo por moneda</h3><p>Deuda total vigente: <strong>{moneyByCurrency(deudaTotalPorMoneda)}</strong></p><p>Cuotas del mes: <strong>{moneyByCurrency(cuotasMesPorMoneda)}</strong></p><p>Intereses del mes: <strong>{moneyByCurrency(interesesMesPorMoneda)}</strong></p><p>Intereses acumulados 2026: <strong>{moneyByCurrency(interesesPagadosPorMoneda)}</strong></p></div><div style={{padding:16, border:'1px solid var(--border)', borderRadius:8}}><h3 style={{marginTop:0}}>Deuda por tipo de acreedor</h3>{porTipo.map(x => <div key={x.tipo} style={{marginBottom:10}}><div className="row" style={{justifyContent:'space-between'}}><span>{tipoLabel[x.tipo]}</span><strong>{moneyByCurrency(x.totals)}</strong></div>{Object.entries(x.totals).map(([m]) => <div key={m} className="text-muted" style={{fontSize:12}}>{m}: {x.pct[m]}% de la deuda en {m}</div>)}</div>)}</div></div><div className="mt-6"><h3>Calendario de pagos - proximos 12 meses</h3>{meses.map(m => <div key={m.label} className="row" style={{gap:12, margin:'8px 0'}}><span style={{width:90}}>{m.label}</span><strong style={{width:190}}>{moneyByCurrency(m.totals)}</strong><div className="bar" style={{flex:1}}><div style={{width:(m.visual/maxMes*100)+'%', background:'var(--orange)'}}/></div></div>)}<div className="mt-4"><strong>Total comprometido 12 meses: {moneyByCurrency(meses.reduce((acc,m)=>{Object.entries(m.totals).forEach(([moneda,total])=>{acc[moneda]=(acc[moneda]||0)+total;});return acc;},{}))}</strong></div></div><div className="grid-2 mt-6">{activos.map(f => <div key={f.id} style={{border:'1px solid var(--border)', borderRadius:8, padding:14}}><div className="row" style={{justifyContent:'space-between'}}><strong>{f.entidad}</strong><span>{finMoney(f, f.saldo_pendiente)}</span></div><div className="text-muted" style={{fontSize:12}}>Moneda: {f.moneda || 'PEN'} · Interes mes: {finMoney(f, nextCuota(f)?.interes || 0)}</div><div className="bar mt-4"><div style={{width:Math.min(100,(f.cuotas_pagadas || 0)/(f.plazo_meses || 1)*100)+'%', background:'var(--green)'}}/></div></div>)}</div></div></div>
      {modales}
    </>
  );
}
