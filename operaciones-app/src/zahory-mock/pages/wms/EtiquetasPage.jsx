import { useEffect, useMemo, useState } from 'react';
import { buscarMaterialesEtiqueta, listarUbicacionesEtiqueta } from '../../../services/wmsMultipropositoService.js';
import { Encabezado, PaginaPrevia } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { FORMATOS_ETIQUETA, contenidoQR, paginarEtiquetas, textoContador } from './wmsPr2Logic.js';

const R = <span className="dx-ui-required" aria-hidden="true">*</span>;
const USOS = { almacenaje: 'Almacenaje', recepcion: 'Recepción', cuarentena: 'Cuarentena', despacho: 'Despacho', merma: 'Merma' };

export function EtiquetasPage() {
  const base = useWmsBase();
  const { empresaId, permisos, almacenes, config } = base;
  const [tipo, setTipo] = useState('ubicaciones');
  const [almacenId, setAlmacenId] = useState('');
  const [texto, setTexto] = useState('');
  const [formatoId, setFormatoId] = useState('a24');
  const [filas, setFilas] = useState([]);
  const [marcadas, setMarcadas] = useState({});
  const [copias, setCopias] = useState({});
  const [qrs, setQrs] = useState({});
  const [cargando, setCargando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!almacenId && almacenes.length) setAlmacenId(almacenes[0].id); }, [almacenes, almacenId]);

  useEffect(() => {
    let vigente = true;
    if (!empresaId || !permisos.ver || (tipo === 'ubicaciones' && !almacenId)) return () => { vigente = false; };
    setCargando(true); setError(''); setFilas([]); setMarcadas({}); setCopias({});
    const t = setTimeout(async () => {
      try {
        const datos = tipo === 'ubicaciones'
          ? (await listarUbicacionesEtiqueta({ empresa_id: empresaId, almacen_id: almacenId })).filter(u => !u.es_general)
            .map(u => ({ id: u.id, codigo: u.codigo, nombre: u.nombre || '', detalle: USOS[u.uso] || u.uso }))
          : (await buscarMaterialesEtiqueta({ empresa_id: empresaId, texto })).map(m => ({ id: m.id, codigo: m.codigo, nombre: m.descripcion || '', detalle: m.unidad || '', codigo_barras: m.codigo_barras }));
        if (vigente) { setFilas(datos); setMarcadas(Object.fromEntries(datos.slice(0, tipo === 'ubicaciones' ? datos.length : 0).map(f => [f.id, true]))); }
      } catch (e) { if (vigente) setError(mensajeError(e)); }
      finally { if (vigente) setCargando(false); }
    }, tipo === 'materiales' ? 300 : 0);
    return () => { vigente = false; clearTimeout(t); };
  }, [empresaId, permisos.ver, tipo, almacenId, texto]);

  const formato = FORMATOS_ETIQUETA[formatoId];
  const almacen = almacenes.find(a => a.id === almacenId);
  const elegidas = useMemo(() => filas.filter(f => marcadas[f.id]).map(f => ({
    ...f, contenido: contenidoQR(f), copias: copias[f.id] ?? 1,
    detalle: tipo === 'ubicaciones' ? `${almacen?.codigo || ''}${f.detalle ? ` · ${f.detalle}` : ''}` : f.detalle,
  })), [filas, marcadas, copias, tipo, almacen]);
  const paginas = useMemo(() => paginarEtiquetas(elegidas, formato), [elegidas, formato]);
  const vistaPrevia = paginas.hojas[0] || [];

  useEffect(() => {
    let vigente = true;
    const faltan = [...new Set(vistaPrevia.map(it => it.contenido))].filter(c => c && !qrs[c]);
    if (!faltan.length) return () => { vigente = false; };
    import('qrcode').then(async QR => {
      const toDataURL = QR.toDataURL || QR.default?.toDataURL;
      const nuevos = Object.fromEntries(await Promise.all(faltan.map(async c => [c, await toDataURL(c, { margin: 0, width: 120 })])));
      if (vigente) setQrs(actual => ({ ...actual, ...nuevos }));
    }).catch(() => {});
    return () => { vigente = false; };
  }, [vistaPrevia, qrs]);

  const todas = filas.length > 0 && filas.every(f => marcadas[f.id]);
  const descargar = async () => {
    if (!paginas.total) { setError('Marca al menos una etiqueta.'); return; }
    setGenerando(true); setError('');
    try {
      const { generarPdfEtiquetas } = await import('./EtiquetasPdf.jsx');
      const titulo = tipo === 'ubicaciones' ? `Etiquetas de ubicaciones ${almacen?.codigo || ''}` : 'Etiquetas de materiales';
      const blob = await generarPdfEtiquetas({ items: elegidas, formato, titulo });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${titulo.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setError(mensajeError(e)); }
    finally { setGenerando(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-weti', nombre: 'las etiquetas' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  return <section className="dx-ui dx-wms dx-weti">
    <Encabezado titulo="Etiquetas" sub="Hoja A4 en PDF con código QR para ubicaciones y materiales. El QR contiene el código que leen Despachos y Conteos.">
      <button type="button" className="dx-btn primary" disabled={generando || !paginas.total} onClick={descargar}>{generando ? 'Generando PDF…' : `Descargar PDF (${textoContador(paginas.total, 'etiqueta', 'etiquetas')})`}</button>
    </Encabezado>
    {!config.modulos.codigos && <div className="dx-w-note amber" role="status">El módulo de códigos de barras / QR está apagado en Configuración del WMS.</div>}
    {error && <div className="dx-w-note red" role="alert">{error}</div>}
    <div className="dx-w-side">
      <div className="dx-ui-card">
        <div className="dx-w-sec">
          <div className="dx-ui-form-grid">
            <div className="dx-ui-field"><span className="dx-ui-label">Tipo{R}</span>
              <div className="dx-w-seg" role="group" aria-label="Tipo de etiqueta">{[['ubicaciones', 'Ubicaciones'], ['materiales', 'Materiales']].map(([id, label]) => <button key={id} type="button" className={tipo === id ? 'on' : ''} aria-pressed={tipo === id} onClick={() => setTipo(id)}>{label}</button>)}</div>
            </div>
            {tipo === 'ubicaciones'
              ? <div className="dx-ui-field"><label htmlFor="dx-weti-alm">Almacén{R}</label><select id="dx-weti-alm" value={almacenId} onChange={e => setAlmacenId(e.target.value)}>{almacenes.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}</select></div>
              : <div className="dx-ui-field"><label htmlFor="dx-weti-buscar">Buscar material</label><input id="dx-weti-buscar" type="search" placeholder="Código o descripción" value={texto} onChange={e => setTexto(e.target.value)} /></div>}
            <div className="dx-ui-field"><label htmlFor="dx-weti-formato">Tamaño</label><select id="dx-weti-formato" value={formatoId} onChange={e => setFormatoId(e.target.value)}>{Object.values(FORMATOS_ETIQUETA).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
          </div>
        </div>
        {cargando ? <div className="dx-ui-empty">Cargando…</div>
          : !filas.length ? <div className="dx-ui-empty">{tipo === 'ubicaciones' ? 'Este almacén no tiene ubicaciones (además de General).' : 'No hay materiales con ese texto.'}</div>
          : <div className="dx-w-scroll"><table className="dx-w-table">
            <thead><tr><th><input type="checkbox" className="dx-w-check" aria-label="Marcar todas" checked={todas} onChange={() => setMarcadas(todas ? {} : Object.fromEntries(filas.map(f => [f.id, true])))} /></th><th>Código</th><th className="dx-w-hide-m">{tipo === 'ubicaciones' ? 'Nombre' : 'Descripción'}</th><th className="num">Copias</th></tr></thead>
            <tbody>{filas.map(f => <tr key={f.id}>
              <td><input type="checkbox" className="dx-w-check" aria-label={`Marcar ${f.codigo}`} checked={Boolean(marcadas[f.id])} onChange={() => setMarcadas({ ...marcadas, [f.id]: !marcadas[f.id] })} /></td>
              <td><b>{f.codigo}</b><small>{f.detalle}</small></td>
              <td className="dx-w-hide-m">{f.nombre || 'Sin dato'}</td>
              <td className="num"><input className="dx-w-in" inputMode="numeric" aria-label={`Copias de ${f.codigo}`} value={copias[f.id] ?? 1} disabled={!marcadas[f.id]} onChange={e => setCopias({ ...copias, [f.id]: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
      <div className="dx-ui-card">
        <div className="dx-w-bar"><h2>Vista previa</h2><span className="dx-ui-count">{paginas.hojas.length ? `Hoja 1 de ${paginas.hojas.length}` : 'Sin etiquetas'}</span></div>
        <div className="dx-w-sec">
          {!vistaPrevia.length ? <div className="dx-ui-empty">Marca las etiquetas que quieres imprimir.</div>
            : <div className={`dx-w-hoja is-${formato.id}`} aria-label="Vista previa de la primera hoja">
              {vistaPrevia.map((it, i) => <div key={`${it.id}-${i}`} className="dx-w-etiq">
                {qrs[it.contenido] ? <img src={qrs[it.contenido]} alt={`QR ${it.contenido}`} /> : <span className="dx-w-qr-vacio" aria-hidden="true" />}
                <span><b>{it.codigo}</b><small>{it.detalle ? `${it.detalle} · ` : ''}TIDEO</small></span>
              </div>)}
            </div>}
        </div>
      </div>
    </div>
  </section>;
}
