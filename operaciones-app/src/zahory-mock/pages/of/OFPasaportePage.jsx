import React, { useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { buscarPasaportes, obtenerPasaporte } from '../../../services/ofGarantiasService.js';
import { listarPartesOF, obtenerCalidadOF, obtenerOF, obtenerReservasOF } from '../../../services/ordenFabricacionService.js';
import { urlsFirmadasEntrega } from '../../../services/ofEntregaService.js';
import { formatearFecha } from './ofBandejaLogic.js';
import { etiquetaEvaluacion, etiquetaEstadoGarantia, etiquetaReclamo } from './ofGarantiasLogic.js';

const dato = v => v == null || v === '' ? 'Sin dato' : v;
const fecha = v => v ? formatearFecha(v) : 'Sin dato';
export function OFPasaportePage({ onNav, routeParams = {} }) {
  const { empresaId, estado } = useSesionOperativa();
  const id = routeParams.id;
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState(null);
  const [datos, setDatos] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (estado !== 'listo' || !empresaId) {
      if (estado && estado !== 'cargando') setError('No hay una sesión activa con empresa. Inicia sesión e inténtalo de nuevo.');
      return undefined;
    }
    let activo = true; setCargando(false); setError(''); setDatos(null); setDetalle(null);
    if (!id) setLista(null);
    const cargar = async () => {
      setCargando(true);
      try {
        if (!id) { const filas = await buscarPasaportes(empresaId, texto); if (activo) setLista(filas || []); }
        else {
          const p = await obtenerPasaporte(id);
          const [of, partes, reservas, calidad] = await Promise.all([obtenerOF(p.of.id), listarPartesOF(p.of.id), obtenerReservasOF(p.of.id), obtenerCalidadOF(p.of.id)]);
          if (activo) { setDatos(p); setDetalle({ of, partes, reservas, calidad }); }
        }
      } catch (e) { if (activo) setError(e?.message || 'No se pudo cargar el pasaporte.'); }
      finally { if (activo) setCargando(false); }
    };
    const espera = id ? null : setTimeout(cargar, 300);
    if (id) cargar();
    return () => { activo = false; if (espera) clearTimeout(espera); };
  }, [estado, empresaId, id, texto]);
  const abrirActa = async () => { try { const urls = await urlsFirmadasEntrega([datos.entrega.pdf_path]); const url = urls.get(datos.entrega.pdf_path); if (!url) throw new Error('No se pudo abrir el acta.'); window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { setError(e?.message || 'No se pudo abrir el acta.'); } };
  const abrirOf = ofId => onNav?.('produccion-detalle-of', { id: ofId });
  const unidad = datos?.unidad?.unidad;
  const mediciones = (detalle?.calidad?.mediciones || []).filter(m => Number(m.unidad) === Number(unidad));
  const ncs = (detalle?.calidad?.no_conformidades || []).filter(n => Number(n.unidad) === Number(unidad));
  return <section className="dx-ui dx-ofg-page"><header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Producción</div><h1 className="dx-ui-title">Pasaporte por serie</h1><p className="dx-ui-sub">{id && datos ? `Serie ${dato(datos.unidad.serie)} · Unidad ${dato(unidad)}` : 'Trazabilidad de cada unidad fabricada, por número de serie'}</p></div><div className="dx-ui-actions">{id && <button type="button" className="dx-btn" onClick={() => onNav?.('produccion-pasaporte')}>Buscar otra unidad</button>}</div></header>
    {!id && <div className="dx-ui-card"><div className="dx-ui-toolbar"><h2>Buscar unidad</h2><label className="dx-ui-search"><input aria-label="Buscar por serie, OF o cliente" placeholder="Serie, OF o cliente" value={texto} onChange={e => setTexto(e.target.value)} /></label></div>{!cargando && lista && !lista.length && <div className="dx-ui-empty">Sin resultados.</div>}{lista?.map(u => <div className="dx-ui-row dx-ofg-busqueda" key={u.id} role="button" tabIndex={0} onClick={() => onNav?.('produccion-pasaporte', { id: u.id })} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onNav?.('produccion-pasaporte', { id: u.id }); } }}><span><strong>{dato(u.serie)}</strong> · {dato(u.descripcion)} · {dato(u.cliente)} · {dato(u.of_numero)}</span><button type="button" className="dx-btn" onClick={e => { e.stopPropagation(); onNav?.('produccion-pasaporte', { id: u.id }); }}>Ver pasaporte</button></div>)}</div>}
    {cargando && <div className="dx-ui-empty">Cargando…</div>}{error && <div className="dx-ui-empty" role="alert">{error}</div>}
    {datos && detalle && <div className="dx-ofg-detalle">
      <div className="dx-ui-card dx-ofg-bloque"><h2>Datos de la unidad</h2><dl><dt>Componente</dt><dd>{dato(datos.of.descripcion)}</dd><dt>Cliente</dt><dd>{dato(datos.of.cliente)}</dd><dt>OF / OS</dt><dd><button type="button" className="dx-btn" onClick={() => abrirOf(datos.of.id)}>{dato(datos.of.numero)}</button> / {dato(datos.of.os_numero)}</dd><dt>Fabricado (apertura de OF)</dt><dd>{fecha(datos.of.fecha_apertura)}</dd><dt>Liberado</dt><dd>{fecha(datos.of.calidad_liberado_en)}</dd><dt>Entregado</dt><dd>{fecha(datos.of.entregada_en)}</dd></dl></div>
      <div className="dx-ui-card dx-ofg-bloque"><h2>Ruta ejecutada</h2>{detalle.of?.operaciones?.length ? detalle.of.operaciones.map(op => <p key={op.id}><strong>{op.tarea}</strong> · {op.horas_reales} h de {op.horas} h estimadas · Técnicos: {dato(detalle.partes.filter(p => p.operacion_id === op.id).map(p => p.tecnico).filter(Boolean).join(', '))}</p>) : <p>Sin dato</p>}</div>
      <div className="dx-ui-card dx-ofg-bloque"><h2>Materiales consumidos</h2>{detalle.reservas?.lineas?.filter(l => l.despachada > 0).length ? detalle.reservas.lineas.filter(l => l.despachada > 0).map((l, i) => <p key={l.of_material_id || i}>{dato(detalle.of?.materiales?.find(m => m.id === l.of_material_id)?.descripcion)} · {l.despachada} {dato(detalle.of?.materiales?.find(m => m.id === l.of_material_id)?.unidad)}</p>) : <p>Sin dato</p>}</div>
      <div className="dx-ui-card dx-ofg-bloque"><h2>Calidad de esta unidad</h2>{mediciones.length ? mediciones.map((m, i) => { const c = detalle.calidad.caracteristicas?.find(x => x.id === m.caracteristica_id); return <p key={m.id || i}>{dato(c?.nombre || c?.descripcion || c?.numero)} · {dato(m.valor ?? (m.conforme == null ? null : m.conforme ? 'Conforme' : 'No conforme'))}</p>; }) : <p>Sin dato</p>}<h3>No conformidades</h3>{ncs.length ? ncs.map((n, i) => <p key={n.id || i}>{dato(n.numero)} · {dato(n.descripcion)} · {n.estado === 'abierta' ? 'Abierta' : n.estado === 'cerrada' ? 'Cerrada' : dato(n.estado)}</p>) : <p>Sin dato</p>}</div>
      <div className="dx-ui-card dx-ofg-bloque"><h2>Entrega</h2><p>Acta: {dato(datos.entrega?.numero)} · Guía: {dato(datos.entrega?.guia_numero)} · Recibe: {dato(datos.entrega?.recibe_nombre)}</p>{datos.entrega?.pdf_path && <button type="button" className="dx-btn" onClick={abrirActa}>Ver acta PDF</button>}</div>
      <div className="dx-ui-card dx-ofg-bloque"><h2>Garantía y reclamos</h2><p>{dato(datos.garantia?.numero)} · Vence: {fecha(datos.garantia?.fecha_fin)} · {etiquetaEstadoGarantia(datos.garantia?.estado)}</p>{datos.reclamos?.length ? datos.reclamos.map(r => <p key={r.id}>{r.numero} · {etiquetaReclamo(r.estado)} · {etiquetaEvaluacion(r.evaluacion)} · {dato(r.falla)} {r.of_garantia_id && <button type="button" className="dx-btn" onClick={() => abrirOf(r.of_garantia_id)}>{r.of_garantia_numero || 'Ver OF de garantía'}</button>}</p>) : <p>Sin dato</p>}</div>
    </div>}
  </section>;
}
