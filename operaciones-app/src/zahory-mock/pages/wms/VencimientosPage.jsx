import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarLotes, moverLoteACuarentena } from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia, SelectorAlmacen } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { formatoCantidad, formatoMoneda } from './wmsMultiLogic.js';
import { estadoLote, filtrarLotes, marcarSalePrimero, resumenLotes, textoContador } from './wmsPr2Logic.js';

export function VencimientosPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, almacenes, sesion, config } = base;
  const [almacenId, setAlmacenId] = useState('');
  const [filtro, setFiltro] = useState('por_vencer');
  const [texto, setTexto] = useState('');
  const [lotes, setLotes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try { setLotes(marcarSalePrimero(await listarLotes({ empresa_id: empresaId, almacen_id: almacenId }))); }
    catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver, almacenId]);
  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenLotes(lotes), [lotes]);
  const visibles = useMemo(() => filtrarLotes(lotes, { filtro, texto }), [lotes, filtro, texto]);

  const aCuarentena = async lote => {
    setOcupado(lote.stock_id); setError(''); setAviso('');
    try {
      await moverLoteACuarentena({ empresa_id: empresaId, stock_id: lote.stock_id });
      setAviso(`Lote ${lote.lote || 'sin lote'} de ${lote.codigo} movido a cuarentena.`);
      await cargar();
    } catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(''); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wven', nombre: 'los vencimientos' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  return <section className="dx-ui dx-wms dx-wven">
    <Encabezado titulo="Vencimientos y lotes" sub="Las salidas toman primero el lote que vence antes (FEFO). Un lote vencido no se reserva ni se despacha.">
      <SelectorAlmacen id="dx-wven-almacen" almacenes={almacenes.filter(a => a.proposito !== 'custodia')} valor={almacenId} onCambio={setAlmacenId} />
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {!config.modulos.lotes && <div className="dx-w-note amber" role="status">El módulo de lotes y vencimientos está apagado en Configuración del WMS. El FEFO igual se aplica a los lotes que ya existen.</div>}
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}<button type="button" className="dx-btn sm" onClick={cargar}>Reintentar</button></div>}
    <div className="dx-ui-kpi-row">
      <div className="dx-ui-kpi"><strong>{resumen.vencidos}</strong><span>{resumen.vencidos === 1 ? 'Lote vencido' : 'Lotes vencidos'}</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.vence30}</strong><span>Vencen en 30 días</span></div>
      <div className="dx-ui-kpi"><strong>{resumen.vence90}</strong><span>Vencen en 31–90 días</span></div>
      <div className="dx-ui-kpi"><strong>{formatoMoneda(resumen.valorRiesgo)}</strong><span>Valor en riesgo (90 días)</span></div>
    </div>
    <div className="dx-ui-card">
      <div className="dx-w-bar">
        <h2>Lotes con stock</h2>
        <span className="dx-ui-count">{textoContador(visibles.length, 'lote', 'lotes')}</span>
        <div className="dx-w-seg" role="group" aria-label="Filtrar lotes">
          {[['por_vencer', 'Por vencer'], ['vencidos', 'Vencidos'], ['todos', 'Todos']].map(([id, label]) => <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{label}</button>)}
        </div>
        <label className="dx-ui-search" htmlFor="dx-wven-buscar"><span aria-hidden="true">⌕</span><input id="dx-wven-buscar" placeholder="Buscar material, lote o ubicación" value={texto} onChange={e => setTexto(e.target.value)} /></label>
      </div>
      {cargando && !lotes.length ? <div className="dx-ui-empty">Cargando lotes…</div>
        : !visibles.length ? <div className="dx-ui-empty">{!lotes.length
          ? 'Aún no hay stock con lote o fecha de vencimiento. Se registran al recibir materiales con control por lote.'
          : filtro === 'vencidos' ? 'No hay lotes vencidos.' : filtro === 'por_vencer' ? 'Ningún lote vence en los próximos 90 días.' : 'Sin coincidencias para tu búsqueda.'}</div>
        : <div className="dx-w-scroll"><table className="dx-w-table">
          <thead><tr><th>Material</th><th>Lote</th><th className="dx-w-hide-m">Ubicación</th><th className="num">Unidades</th><th className="dx-w-hide-m">Vence</th><th>Estado</th><th className="num dx-w-hide-m">Valor</th><th /></tr></thead>
          <tbody>{visibles.map(l => {
            const est = estadoLote(l);
            return <tr key={l.stock_id}>
              <td className="mat"><b>{l.codigo}</b><small>{l.descripcion} · {l.almacen_codigo}</small></td>
              <td>{l.lote || 'Sin dato'}</td>
              <td className="dx-w-hide-m">{l.ubicacion}</td>
              <td className="num">{formatoCantidad(l.fisico)} {l.unidad || ''}</td>
              <td className="dx-w-hide-m">{l.vencimiento || 'Sin dato'}</td>
              <td><span className={`dx-ui-pill ${est.pill}`}><i />{est.label}</span></td>
              <td className="num dx-w-hide-m">{formatoMoneda(l.valor)}</td>
              <td>{est.id === 'vencido' && puede.crear
                ? <button type="button" className="dx-btn sm" disabled={Boolean(ocupado) || !(Number(l.disponible) > 0) || !l.tiene_cuarentena}
                    title={!l.tiene_cuarentena ? 'Crea una ubicación de cuarentena en este almacén' : !(Number(l.disponible) > 0) ? 'Todo el lote está reservado' : undefined}
                    onClick={() => aCuarentena(l)}>{ocupado === l.stock_id ? 'Moviendo…' : 'Mover a cuarentena'}</button>
                : l.sale_primero ? <span className="dx-ui-pill is-cyan"><i />Sale primero</span> : null}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </div>
  </section>;
}
