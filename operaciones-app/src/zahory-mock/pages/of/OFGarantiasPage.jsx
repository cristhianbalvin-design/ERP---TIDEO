import React, { useCallback, useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { crearOFGarantia, listarGarantias } from '../../../services/ofGarantiasService.js';
import { formatearFecha } from './ofBandejaLogic.js';
import { etiquetaSituacion, filtrarGarantias, SITUACIONES, textoCostoPorMoneda, tonoSituacion } from './ofGarantiasLogic.js';
import { OFReclamoModal } from './OFReclamoModal.jsx';

export function OFGarantiasPage({ onNav }) {
  const { empresaId, estado } = useSesionOperativa();
  const [datos, setDatos] = useState(null);
  const [texto, setTexto] = useState('');
  const [situacion, setSituacion] = useState('');
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState('');
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setDatos(await listarGarantias(empresaId)); } catch (e) { setError(e?.message || 'No se pudieron cargar las garantías.'); }
    finally { setCargando(false); }
  }, [empresaId]);
  useEffect(() => {
    if (estado === 'listo' && empresaId) cargar();
    else if (estado && estado !== 'cargando') { setCargando(false); setError('No hay una sesión activa con empresa. Inicia sesión e inténtalo de nuevo.'); }
  }, [estado, empresaId, cargar]);
  const filas = filtrarGarantias(datos?.filas, texto, situacion);
  const k = datos?.kpis || {};
  const abrirOf = id => onNav?.('produccion-detalle-of', { id });
  const crear = async r => { setTrabajando(r.id); setError(''); try { const resultado = await crearOFGarantia(r.id); await cargar(); abrirOf(resultado.of_id); } catch (e) { setError(e?.message || 'No se pudo crear la OF.'); } finally { setTrabajando(''); } };
  return <section className="dx-ui dx-ofg-page"><header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Producción</div><h1 className="dx-ui-title">Garantías de producción</h1><p className="dx-ui-sub">Garantía de cada unidad entregada, reclamos y OF de garantía</p></div><div className="dx-ui-actions" /></header>
    <div className="dx-ui-kpi-row">{[[datos ? k.vigentes : '…', 'Vigentes'], [datos ? k.vencen_30 : '…', 'Vencen en 30 días'], [datos ? k.reclamos_abiertos : '…', 'Reclamos abiertos'], [datos ? textoCostoPorMoneda(k.costo_no_facturable) : '…', 'Costo no facturable del año']].map(([v, t]) => <div className="dx-ui-kpi" key={t}><strong>{v}</strong><span>{t}</span></div>)}</div>
    <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Garantías</h2><span className="dx-ui-count">{filas.length}</span><label className="dx-ui-search"><input aria-label="Buscar garantías" placeholder="Buscar serie, cliente u OF" value={texto} onChange={e => setTexto(e.target.value)} /></label></div>
      <div className="dx-ofg-filtros"><button type="button" className="dx-ofg-chip" aria-pressed={!situacion} onClick={() => setSituacion('')}>Todas</button>{Object.entries(SITUACIONES).map(([id, [label]]) => <button key={id} type="button" className="dx-ofg-chip" aria-pressed={situacion === id} onClick={() => setSituacion(id)}>{label}</button>)}</div>
      {error && <div className="dx-ui-empty" role="alert">{error}</div>}{cargando ? <div className="dx-ui-empty">Cargando garantías…</div> : !datos?.filas?.length ? <div className="dx-ui-empty">No hay garantías registradas.</div> : !filas.length ? <div className="dx-ui-empty">No hay resultados para estos filtros.</div> : filas.map(f => <div className="dx-ui-row dx-ofg-row" key={f.id}>
        <div><strong>{f.numero}</strong><div>{f.serie || 'Sin dato'} · {f.cliente || 'Sin dato'}</div></div><div>OF {f.of_numero || 'Sin dato'}</div><div>Vence: {f.fecha_fin ? formatearFecha(f.fecha_fin) : 'Sin dato'}</div><div><span className={`dx-ui-pill is-${tonoSituacion(f.situacion)}`}>{etiquetaSituacion(f.situacion)}</span>{f.reclamo && <div>{f.reclamo.numero}</div>}</div>
        <div className="dx-ofg-acciones">{!f.reclamo && f.situacion !== 'anulada' && <button type="button" className="dx-btn" onClick={() => setModal({ fila: f })}>Registrar reclamo</button>}{f.reclamo?.evaluacion === 'pendiente' && <button type="button" className="dx-btn" onClick={() => setModal({ fila: f, evaluar: true })}>Evaluar</button>}{f.reclamo?.evaluacion === 'procede' && !f.reclamo.of_garantia_id && <button type="button" className="dx-btn primary" disabled={Boolean(trabajando)} onClick={() => crear(f.reclamo)}>Crear OF de garantía</button>}{f.reclamo?.of_garantia_id && <button type="button" className="dx-btn" onClick={() => abrirOf(f.reclamo.of_garantia_id)}>{f.reclamo.of_garantia_numero || 'Ver OF de garantía'}</button>}<button type="button" className="dx-btn" onClick={() => onNav?.('produccion-pasaporte', { id: f.unidad_id })}>Ver pasaporte</button></div>
      </div>)}
    </div>{modal && <OFReclamoModal garantia={modal.fila} empresaId={empresaId} evaluar={modal.evaluar} onClose={() => setModal(null)} onGuardado={r => { setModal(null); cargar(); if (r?.of?.of_id) abrirOf(r.of.of_id); }} />}
  </section>;
}
