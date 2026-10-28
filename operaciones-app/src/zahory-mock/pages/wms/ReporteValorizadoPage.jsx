import { useCallback, useEffect, useMemo, useState } from 'react';
import { obtenerReporteValorizado } from '../../../services/wmsMultipropositoService.js';
import { Encabezado, PaginaPrevia, SelectorAlmacen } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { formatoCantidad } from './wmsMultiLogic.js';
import { CLASES_ABC, filasExcelValorizado, resumenValorizado, textoContador } from './wmsPr2Logic.js';

const soles = n => `S/ ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReporteValorizadoPage() {
  const base = useWmsBase();
  const { empresaId, permisos, almacenes } = base;
  const [almacenId, setAlmacenId] = useState('');
  const [clase, setClase] = useState('todos');
  const [texto, setTexto] = useState('');
  const [datos, setDatos] = useState({ materiales: [], almacenes: [] });
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setDatos(await obtenerReporteValorizado({ empresa_id: empresaId, almacen_id: almacenId })); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver, almacenId]);
  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenValorizado(datos.materiales), [datos.materiales]);
  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return datos.materiales.filter(m => (clase === 'todos' || m.clase === clase) && (!q || `${m.codigo} ${m.descripcion} ${m.familia}`.toLowerCase().includes(q)));
  }, [datos.materiales, clase, texto]);

  const exportar = async () => {
    setExportando(true); setError('');
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.utils.book_new();
      const hoja = XLSX.utils.json_to_sheet(filasExcelValorizado(datos.materiales));
      hoja['!cols'] = [{ wch: 16 }, { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(libro, hoja, 'Valorizado ABC');
      const nombre = almacenes.find(a => a.id === almacenId)?.codigo || 'todos';
      XLSX.writeFile(libro, `valorizado-abc-${nombre.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setError(mensajeError(e)); }
    finally { setExportando(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wrep', nombre: 'el reporte valorizado' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  return <section className="dx-ui dx-wms dx-wrep">
    <Encabezado titulo="Valorizado y rotación ABC" sub="Valor del stock propio (sin custodia de terceros) y clasificación por consumo valorizado de los últimos 12 meses.">
      <SelectorAlmacen id="dx-wrep-almacen" almacenes={almacenes.filter(a => a.proposito !== 'custodia')} valor={almacenId} onCambio={setAlmacenId} />
      <button type="button" className="dx-btn" disabled={exportando || !datos.materiales.length} onClick={exportar}>{exportando ? 'Exportando…' : 'Exportar Excel'}</button>
    </Encabezado>
    {error && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{soles(resumen.valor)}</strong><span>Valor del inventario</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.clases.A.n}</strong><span>Clase A</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.clases.B.n} · {resumen.clases.C.n}</strong><span>Clase B · C</span></div>
      <div className="dx-ui-kpi"><strong>{soles(resumen.sinSalida90)}</strong><span>Sin salidas en 90 días ({resumen.pctSinSalida}%)</span></div>
    </div>
    <div className="dx-w-grid2">
      <div className="dx-ui-card"><div className="dx-w-bar"><h2>Por almacén</h2></div><div className="dx-w-sec">
        {!datos.almacenes.length ? <div className="dx-ui-empty">{cargando ? 'Cargando…' : 'Sin stock propio.'}</div> : <>
          {datos.almacenes.map(a => <div className="dx-w-kv" key={a.almacen_id}><span>{a.codigo} · {a.nombre}</span><b>{soles(a.valor)}</b></div>)}
          <div className="dx-w-total"><span>Total</span><span>{soles(datos.almacenes.reduce((t, a) => t + Number(a.valor || 0), 0))}</span></div>
        </>}
      </div></div>
      <div className="dx-ui-card"><div className="dx-w-bar"><h2>Clases ABC</h2><span className="dx-ui-count">consumo 12 meses: {soles(resumen.consumo)}</span></div><div className="dx-w-sec">
        {Object.entries(CLASES_ABC).map(([id, c]) => <div className="dx-w-kv" key={id}>
          <span><span className={`dx-ui-pill ${c.pill}`}><i />{c.label}</span></span>
          <b>{textoContador(resumen.clases[id].n, 'material', 'materiales')} · {id === 'sin_movimiento' ? `${soles(resumen.clases[id].valor)} en stock` : soles(resumen.clases[id].consumo)}</b>
        </div>)}
      </div></div>
    </div>
    <div className="dx-ui-card dx-w-gap-top">
      <div className="dx-w-bar"><h2>Detalle por material</h2><span className="dx-ui-count">{textoContador(visibles.length, 'material', 'materiales')}</span>
        <div className="dx-w-seg" role="group" aria-label="Filtrar por clase">{[['todos', 'Todos'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['sin_movimiento', 'Sin movimiento']].map(([id, label]) => <button key={id} type="button" className={clase === id ? 'on' : ''} aria-pressed={clase === id} onClick={() => setClase(id)}>{label}</button>)}</div>
        <label className="dx-ui-search" htmlFor="dx-wrep-buscar"><span aria-hidden="true">⌕</span><input id="dx-wrep-buscar" placeholder="Buscar material o familia" value={texto} onChange={e => setTexto(e.target.value)} /></label>
      </div>
      {cargando && !datos.materiales.length ? <div className="dx-ui-empty">Cargando reporte…</div>
        : !visibles.length ? <div className="dx-ui-empty">{datos.materiales.length ? 'Sin coincidencias.' : 'No hay stock propio para valorizar.'}</div>
        : <div className="dx-w-scroll"><table className="dx-w-table">
          <thead><tr><th>Material</th><th>Clase</th><th className="num">Stock</th><th className="num dx-w-hide-m">Costo prom.</th><th className="num">Valor</th><th className="num dx-w-hide-m">Consumo 12m</th><th className="dx-w-hide-m">Última salida</th></tr></thead>
          <tbody>{visibles.map(m => { const c = CLASES_ABC[m.clase] || CLASES_ABC.sin_movimiento; return <tr key={m.material_id}>
            <td className="mat"><b>{m.codigo}</b><small>{m.descripcion}</small></td>
            <td><span className={`dx-ui-pill ${c.pill}`}><i />{c.corto}</span></td>
            <td className="num">{formatoCantidad(m.fisico)} {m.unidad || ''}</td>
            <td className="num dx-w-hide-m">{soles(m.costo_promedio)}</td>
            <td className="num"><b>{soles(m.valor)}</b></td>
            <td className="num dx-w-hide-m">{soles(m.consumo_12m)}</td>
            <td className="dx-w-hide-m">{m.ultima_salida ? String(m.ultima_salida).slice(0, 10) : 'Sin salidas'}</td>
          </tr>; })}</tbody>
        </table></div>}
    </div>
  </section>;
}
