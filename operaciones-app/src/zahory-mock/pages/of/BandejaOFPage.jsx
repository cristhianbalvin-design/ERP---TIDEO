import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { useCompactWorkMode } from '../../../useCompactWorkMode.js';
import { listarOrdenesFabricacion } from '../../../services/ordenFabricacionService.js';
import { fechaLocalISO } from '../fechaLocal.js';
import {
  ESTADOS_OF,
  ETIQUETA_ESTADO_OF,
  filtrarBandejaOF,
  formatearFecha,
  formatearMonto,
  resumenBandejaOF,
  situacionCompromiso,
  textoOperaciones,
  textoSinBahia,
} from './ofBandejaLogic.js';

const TAM_PAGINA = 25;

const ICONOS = {
  curso: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  borrador: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  atrasadas: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  vencen: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  of: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  mas: <path d="M12 5v14M5 12h14" />,
  flecha: <path d="m9 18 6-6-6-6" />,
};

const Svg = ({ id }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONOS[id]}</svg>;

export function BandejaOFPage({ onNav, setCurrentOF }) {
  useCompactWorkMode(true);
  const sesion = useSesionOperativa();
  const { empresaId, sociedadId, sociedadesIdsAlcance, estado: estadoSesion } = sesion;
  const [ofs, setOfs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState({ buscar: '', estado: '', kpi: '' });
  const [pagina, setPagina] = useState(1);
  const solicitud = useRef(0);
  const hoy = fechaLocalISO();
  const alcanceClave = (sociedadesIdsAlcance || []).join(',');

  useEffect(() => {
    if (estadoSesion !== 'listo' || !empresaId) {
      if (estadoSesion && estadoSesion !== 'cargando') setCargando(false);
      return undefined;
    }
    const id = ++solicitud.current;
    setCargando(true);
    setError('');
    listarOrdenesFabricacion({ empresaId, sociedadId, sociedadesIdsAlcance })
      .then(filas => { if (id === solicitud.current) setOfs(filas); })
      .catch(err => { if (id === solicitud.current) { setOfs([]); setError(err?.message || 'No se pudieron cargar las órdenes de fabricación.'); } })
      .finally(() => { if (id === solicitud.current) setCargando(false); });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, sociedadId, alcanceClave, estadoSesion]);

  const resumen = useMemo(() => resumenBandejaOF(ofs, hoy), [ofs, hoy]);
  const filtradas = useMemo(() => filtrarBandejaOF(ofs, filtros, hoy), [ofs, filtros, hoy]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / TAM_PAGINA));
  const paginaActual = Math.min(pagina, paginas);
  const visibles = filtradas.slice((paginaActual - 1) * TAM_PAGINA, paginaActual * TAM_PAGINA);
  const estadosConOF = ESTADOS_OF.filter(([k]) => resumen.porEstado[k] > 0 || filtros.estado === k);
  const hayFiltros = Boolean(filtros.buscar || filtros.estado || filtros.kpi);

  const setFiltro = (clave, valor) => { setPagina(1); setFiltros(actual => ({ ...actual, [clave]: valor })); };
  const abrir = of => { setCurrentOF?.(of.id); onNav?.('produccion-detalle-of'); };
  const teclaFila = (evento, of) => {
    if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrir(of); }
  };

  const kpis = [
    { id: 'curso', titulo: 'En curso', valor: resumen.enCurso, nota: 'Ingeniería, producción, calidad o lista', ico: 'is-cyan' },
    { id: 'borrador', titulo: 'Borrador', valor: resumen.borrador, nota: 'Por revisar antes de producir', ico: 'is-gray' },
    { id: 'atrasadas', titulo: 'Atrasadas', valor: resumen.atrasadas, nota: 'Compromiso vencido sin entregar', ico: 'is-red', tono: resumen.atrasadas ? 'is-danger' : '' },
    { id: 'vencen', titulo: 'Vencen en 7 días', valor: resumen.vencen, nota: 'Compromiso dentro de una semana', ico: 'is-amber', tono: resumen.vencen ? 'is-alert' : '' },
  ];

  return (
    <section className="dx-ofb">
      <div className="dx-ofb-in">
        <div className="dx-ofb-top">
          <div>
            <div className="dx-ofb-eyebrow">Producción</div>
            <h1 className="dx-ofb-title">Órdenes de Fabricación</h1>
            <p className="dx-ofb-sub">Fabricación y recuperación de componentes desde la OS, con la ruta y los materiales de la Hoja de Costeo.</p>
          </div>
          <button type="button" className="dx-ofb-primary" onClick={() => onNav?.('produccion-crear-of')}>
            <Svg id="mas" />Nueva OF
          </button>
        </div>

        <div className="dx-ofb-kpis">
          {kpis.map(k => (
            <button
              type="button"
              key={k.id}
              className={`dx-ofb-kpi ${k.tono || ''} ${filtros.kpi === k.id ? 'is-on' : ''}`}
              aria-pressed={filtros.kpi === k.id}
              onClick={() => setFiltro('kpi', filtros.kpi === k.id ? '' : k.id)}
            >
              <span className="dx-ofb-kpi-top">{k.titulo}<span className={`dx-ofb-ico ${k.ico}`}><Svg id={k.id} /></span></span>
              <span className="dx-ofb-kpi-val">{cargando ? '…' : k.valor}</span>
              <span className="dx-ofb-kpi-note">{k.nota}</span>
            </button>
          ))}
        </div>

        <div className="dx-ofb-card">
          <div className="dx-ofb-bar">
            <h2>Órdenes de fabricación <span className="dx-ofb-count">{filtradas.length} OF</span></h2>
            <label className="dx-ofb-search">
              <Svg id="buscar" />
              <input
                aria-label="Buscar OF, OS, cliente o componente"
                placeholder="Buscar OF, OS, cliente o componente"
                value={filtros.buscar}
                onChange={e => setFiltro('buscar', e.target.value)}
              />
            </label>
          </div>
          <div className="dx-ofb-filters">
            <div className="dx-ofb-chips">
              <button type="button" className={`dx-ofb-chip ${!filtros.estado ? 'is-on' : ''}`} onClick={() => setFiltro('estado', '')}>
                Todas <b>{resumen.total}</b>
              </button>
              {estadosConOF.map(([clave, etiqueta]) => (
                <button
                  type="button"
                  key={clave}
                  className={`dx-ofb-chip ${filtros.estado === clave ? 'is-on' : ''}`}
                  onClick={() => setFiltro('estado', filtros.estado === clave ? '' : clave)}
                >
                  <i className={`is-${clave}`} />{etiqueta} <b>{resumen.porEstado[clave] || 0}</b>
                </button>
              ))}
            </div>
            {hayFiltros && (
              <button type="button" className="dx-ofb-clear" onClick={() => { setPagina(1); setFiltros({ buscar: '', estado: '', kpi: '' }); }}>
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="dx-ofb-head dx-ofb-cols" aria-hidden="true">
            <span>OF</span><span>Cliente y componente</span><span>Estado</span><span>Avance</span>
            <span>Operaciones</span><span className="is-r">Costo est.</span><span className="is-r">Compromiso</span><span />
          </div>

          {cargando && <div className="dx-ofb-empty">Cargando órdenes de fabricación…</div>}
          {!cargando && error && <div className="dx-ofb-empty is-error" role="alert">{error}</div>}
          {!cargando && !error && !ofs.length && (
            <div className="dx-ofb-empty">Aún no hay órdenes de fabricación. Créalas desde una OS de fabricación o con «Nueva OF».</div>
          )}
          {!cargando && !error && ofs.length > 0 && !filtradas.length && (
            <div className="dx-ofb-empty">Ninguna OF coincide con los filtros.</div>
          )}

          {!cargando && !error && visibles.map(of => {
            const situacion = situacionCompromiso(of, hoy);
            const sinBahia = textoSinBahia(of);
            return (
              <div
                key={of.id}
                className="dx-ofb-row dx-ofb-cols"
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${of.numero}`}
                onClick={() => abrir(of)}
                onKeyDown={e => teclaFila(e, of)}
              >
                <div className="dx-ofb-of dx-ofb-a-of">
                  <span className="dx-ofb-ofi"><Svg id="of" /></span>
                  <div className="dx-ofb-cell">
                    <span className="dx-ofb-num">{of.numero}</span>
                    <span className="dx-ofb-muted">{of.os_numero || 'Sin OS'}</span>
                  </div>
                </div>
                <div className="dx-ofb-cell dx-ofb-a-cli">
                  <span className="dx-ofb-strong">{of.cliente || 'Sin dato'}</span>
                  <span className="dx-ofb-muted">{of.componente || 'Sin dato'}</span>
                </div>
                <div className="dx-ofb-a-st">
                  <span className={`dx-ofb-pill is-${of.estado}`}><i />{ETIQUETA_ESTADO_OF[of.estado] || of.estado}</span>
                </div>
                <div className="dx-ofb-prog dx-ofb-a-prog">
                  <b>{Math.round(of.avance_pct)} %</b>
                  <span className="dx-ofb-bar2"><i style={{ width: `${of.avance_pct}%` }} /></span>
                </div>
                <div className="dx-ofb-cell dx-ofb-a-ops">
                  <span className="dx-ofb-strong">{textoOperaciones(of)}</span>
                  {sinBahia
                    ? <span className="dx-ofb-tag is-warn">{sinBahia}</span>
                    : of.operaciones_total > 0 && <span className="dx-ofb-muted">Todas con bahía</span>}
                </div>
                <div className="dx-ofb-money dx-ofb-a-cost">{formatearMonto(of.costo_estimado, of.moneda)}</div>
                <div className="dx-ofb-cell dx-ofb-date dx-ofb-a-date">
                  <span className={`dx-ofb-strong ${situacion.tono ? `is-${situacion.tono}` : ''}`}>{formatearFecha(of.fecha_compromiso)}</span>
                  <span className={`dx-ofb-muted ${situacion.tono ? `is-${situacion.tono}` : ''}`}>{situacion.nota}</span>
                </div>
                <span className="dx-ofb-arrow dx-ofb-a-arrow"><Svg id="flecha" /></span>
              </div>
            );
          })}

          {!cargando && !error && filtradas.length > 0 && (
            <div className="dx-ofb-pag">
              <span>Mostrando {visibles.length} de {filtradas.length}</span>
              {paginas > 1 && (
                <div>
                  <button type="button" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}>Anterior</button>
                  <span>Página {paginaActual} de {paginas}</span>
                  <button type="button" disabled={paginaActual >= paginas} onClick={() => setPagina(paginaActual + 1)}>Siguiente</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
