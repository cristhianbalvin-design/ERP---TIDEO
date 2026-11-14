import React, { useState } from 'react';
import { urlsFirmadasEntrega } from '../../../services/ofEntregaService.js';
import { generarYRegistrarPdfEntrega } from './OFEntregaPdf.jsx';
import { formatearFecha } from './ofBandejaLogic.js';

const fecha = v => v ? formatearFecha(v) : 'Sin dato';
const ESTADO_GARANTIA = { vigente: 'Vigente', anulada: 'Anulada' };
export function OFEntregaUnidades({ datos }) {
  return <div className="dx-ui dx-ofe-unidades">{(datos?.unidades || []).length ? datos.unidades.map(u => <div className="dx-ofe-unidad" key={u.id}>
    <span>Unidad {u.unidad}</span><span>Serie: {u.serie || 'Sin dato'}</span><span>Inicio: {fecha(u.garantia?.fecha_inicio)}</span><span>Fin: {fecha(u.garantia?.fecha_fin)}</span><span>Garantía: {u.garantia ? ESTADO_GARANTIA[u.garantia.estado] || u.garantia.estado : 'Sin garantía'}</span>
  </div>) : <p>Sin dato</p>}</div>;
}
export function OFEntregaPanel({ datos, of, empresaId, puedeEditar, onActualizado }) {
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const e = datos?.entrega;
  const garantia = datos?.unidades?.find(u => u.garantia)?.garantia;
  const actuar = async () => {
    setTrabajando(true); setError('');
    try {
      if (e.pdf_path) {
        const urls = await urlsFirmadasEntrega([e.pdf_path]);
        const url = urls.get(e.pdf_path);
        if (!url) throw new Error('No se pudo abrir el acta.');
        window.open(url, '_blank', 'noopener,noreferrer');
      } else { await generarYRegistrarPdfEntrega(empresaId, of); await onActualizado(); }
    } catch (err) { setError(err?.message || 'No se pudo procesar el acta.'); }
    finally { setTrabajando(false); }
  };
  return <>
    <div className="dx-ofd-card dx-ofd-box"><h2>Entrega</h2><dl className="dx-ofd-dl">
      <dt>Acta</dt><dd>{e?.numero || 'Sin dato'}</dd><dt>Fecha</dt><dd>{fecha(e?.fecha)}</dd><dt>Recibe</dt><dd>{e?.recibe_nombre || 'Sin dato'}</dd><dt>Conformidad</dt><dd>{e?.conformidad === 'conforme' ? 'Conforme' : e?.conformidad === 'con_observaciones' ? 'Con observaciones' : 'Sin dato'}</dd><dt>Guía</dt><dd>{e?.guia_numero || 'Sin dato'}</dd><dt>Llegada</dt><dd>{e?.llegada || 'Sin dato'}</dd>
    </dl>{e && (e.pdf_path || puedeEditar) && <button type="button" className="dx-ofd-ghost" disabled={trabajando} onClick={actuar}>{trabajando ? 'Procesando…' : e.pdf_path ? 'Ver acta PDF' : 'Reintentar PDF'}</button>}
    {e && !e.pdf_path && <p role="status">El acta aún no tiene PDF.</p>}{error && <p role="alert">{error}</p>}</div>
    <div className="dx-ofd-card dx-ofd-box"><h2>Garantía</h2><dl className="dx-ofd-dl"><dt>Meses</dt><dd>{of.garantia_meses ?? 'Sin dato'}</dd><dt>Vence</dt><dd>{garantia ? fecha(garantia.fecha_fin) : Number(of.garantia_meses) === 0 ? 'Sin garantía' : 'Sin dato'}</dd></dl></div>
  </>;
}
