import React, { useMemo, useState } from 'react';
import { formatMoney } from '../../lib/currency.js';
import { buildDebtSummary, estadoFinanciamiento, nextCuota } from '../../services/financiamientosService.js';
import './financiamiento.css';

const TIPO_ACREEDOR = { bancario: 'Banco', tercero: 'Persona o tercero', leasing: 'Leasing', linea_credito: 'Línea de crédito', otro: 'Otro' };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fecha = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const dias = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const tasa = n => `${Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })}%`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const iniciales = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export const modalidadTexto = f => {
  if (f.tipo_cuota === 'interes_saldo') return `Interés sobre saldo · ${tasa(f.tasa_anual)} mensual`;
  const tasaTxt = `${f.tipo_tasa || 'TEA'} ${tasa(f.tasa_anual)}`;
  if (f.tipo_cuota === 'aleman') return `Cuota decreciente · ${tasaTxt}`;
  if (f.tipo_cuota === 'bullet') return `Solo intereses · ${tasaTxt}`;
  return `Cuota fija · ${tasaTxt}`;
};

const ESTADO_PILL = {
  atrasado: e => ({ tone: 'red', text: `Atrasado · ${plural(e.diasAtraso, 'día', 'días')}` }),
  vigente: () => ({ tone: 'green', text: 'Al día' }),
  cancelado: () => ({ tone: 'gray', text: 'Cancelado' }),
};
const pill = e => ESTADO_PILL[e.estado]?.(e) || ESTADO_PILL.vigente();

const sumar = (filas, getter) => filas.reduce((acc, f) => {
  const m = f.moneda || 'PEN';
  const v = Number(getter(f) || 0);
  if (v) acc[m] = (acc[m] || 0) + v;
  return acc;
}, {});
const montos = totales => {
  const entradas = Object.entries(totales).filter(([, v]) => Math.abs(v) > 0.004);
  return entradas.length ? entradas.map(([m, v]) => formatMoney(v, m)) : [];
};

function proximo(f, hoy) {
  const c = nextCuota(f);
  if (!c) return { texto: 'Sin cuotas pendientes', detalle: '' };
  const etiqueta = f.tipo_cuota === 'interes_saldo' ? 'Interés' : `Cuota ${c.numero}`;
  const d = dias(hoy, c.fecha);
  const cuando = d < 0 ? `vencida hace ${plural(-d, 'día', 'días')}` : d === 0 ? 'vence hoy' : `en ${plural(d, 'día', 'días')}`;
  return { texto: `${etiqueta} · ${fecha(c.fecha)}`, detalle: `${formatMoney(c.total, f.moneda || 'PEN')} · ${cuando}`, fecha: c.fecha };
}

function Kpi({ totales, etiqueta, alerta = false, vacio = 'Sin dato' }) {
  const lista = montos(totales);
  const [principal, ...resto] = lista;
  const texto = resto.length ? `${etiqueta} · ${resto.join(' · ')}` : etiqueta;
  return (
    <div className={`dx-ui-kpi${alerta && principal ? ' dx-fin-kpi-alerta' : ''}`} title={texto}>
      <strong className={principal ? '' : 'dx-fin-kpi-vacio'}>{principal || vacio}</strong>
      <span>{texto}</span>
    </div>
  );
}

const activar = fn => e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

export default function FinanciamientoListado({
  financiamientos = [],
  loading = false,
  puedeCrear = true,
  mensajeSinEscritura = '',
  onNuevo,
  onAbrir,
  onReporte,
}) {
  const [vista, setVista] = useState('vigentes');
  const [q, setQ] = useState('');
  const [cerrados, setCerrados] = useState(() => new Set());
  const hoy = hoyLima();
  const resumen = buildDebtSummary(financiamientos, hoy);

  const grupos = useMemo(() => {
    const terminos = norm(q).split(/\s+/).filter(Boolean);
    const visibles = financiamientos.filter(f => {
      const cancelado = f.estado === 'cancelado';
      if (vista === 'vigentes' && cancelado) return false;
      if (vista === 'cancelados' && !cancelado) return false;
      const texto = norm(`${f.entidad} ${f.codigo} ${f.contacto_nombre} ${f.cuenta_bancaria_destino} ${f.proposito}`);
      return terminos.every(t => texto.includes(t));
    });
    const mapa = new Map();
    visibles.forEach(f => {
      const clave = norm(f.entidad) || f.id;
      if (!mapa.has(clave)) mapa.set(clave, { clave, entidad: f.entidad || 'Sin acreedor', filas: [] });
      mapa.get(clave).filas.push(f);
    });
    return [...mapa.values()]
      .map(g => ({ ...g, filas: g.filas.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true })) }))
      .sort((a, b) => a.entidad.localeCompare(b.entidad, 'es'));
  }, [financiamientos, vista, q]);

  const totalPrestamos = grupos.reduce((s, g) => s + g.filas.length, 0);
  const alternar = clave => setCerrados(prev => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });
  const mesLargo = new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(new Date(`${hoy}T12:00:00Z`));
  const acreedoresActivos = new Set(resumen.activos.map(f => norm(f.entidad))).size;

  const celdas = (f, hoyRef) => {
    const p = proximo(f, hoyRef);
    const e = pill(estadoFinanciamiento(f, hoyRef));
    const venceMes = (f.tabla_amortizacion || [])
      .filter(c => c.estado !== 'pagada' && c.estado !== 'cancelada' && c.fecha?.slice(0, 7) === hoyRef.slice(0, 7))
      .reduce((s, c) => s + Number(c.total || 0), 0);
    return { p, e, venceMes };
  };

  return (
    <section className="dx-ui dx-fin">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Finanzas</div>
          <h1 className="dx-ui-title">Financiamiento y Deuda</h1>
          <p className="dx-ui-sub">Préstamos que recibió la empresa, agrupados por acreedor. Montos separados por moneda.</p>
        </div>
        <div className="dx-ui-actions">
          <button type="button" className="dx-btn" onClick={onReporte}>Reporte de deuda</button>
          <button type="button" className="dx-btn primary" onClick={onNuevo} disabled={!puedeCrear} title={puedeCrear ? undefined : mensajeSinEscritura}>
            + Nuevo préstamo
          </button>
        </div>
      </header>
      {!puedeCrear && mensajeSinEscritura && <div className="dx-fin-aviso" role="status">{mensajeSinEscritura}</div>}

      <div className="dx-fin-kpis">
        <div className="dx-ui-kpi-row">
          <Kpi totales={resumen.deudaTotalPorMoneda} etiqueta="Capital pendiente" />
          <Kpi totales={resumen.cuotasMesPorMoneda} etiqueta={`Vence en ${mesLargo}`} vacio="Nada" />
          <Kpi totales={resumen.interesesMesPorMoneda} etiqueta={`Intereses de ${mesLargo}`} vacio="Nada" />
          <Kpi totales={resumen.vencidoPorMoneda} etiqueta={resumen.atrasados ? `Vencido · ${plural(resumen.atrasados, 'préstamo', 'préstamos')}` : 'Cuotas o intereses vencidos'} alerta vacio="Ninguno" />
          <div className="dx-ui-kpi">
            <strong>{resumen.activos.length}</strong>
            <span>{`${resumen.activos.length === 1 ? 'Préstamo activo' : 'Préstamos activos'} · ${plural(acreedoresActivos, 'acreedor', 'acreedores')}`}</span>
          </div>
        </div>
      </div>

      <div className="dx-ui-card">
        <div className="dx-ui-toolbar">
          <h2>Préstamos</h2>
          <span className="dx-ui-count">{plural(grupos.length, 'acreedor', 'acreedores')} · {plural(totalPrestamos, 'préstamo', 'préstamos')}</span>
          <div className="dx-ui-tabs dx-fin-tabs" role="tablist" aria-label="Estado de los préstamos">
            {[['vigentes', 'Vigentes'], ['cancelados', 'Cancelados'], ['todos', 'Todos']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={vista === k} className={`dx-ui-tab${vista === k ? ' on' : ''}`} onClick={() => setVista(k)}>{l}</button>
            ))}
          </div>
          <label className="dx-ui-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" aria-label="Buscar préstamos" placeholder="Buscar acreedor, código o banco" value={q} onChange={e => setQ(e.target.value)} />
          </label>
        </div>
        <div className="dx-ui-head dx-fin-cols" aria-hidden="true">
          <span>Acreedor / préstamo</span><span>Modalidad</span><span className="dx-fin-num">Saldo capital</span>
          <span className="dx-fin-num">Vence este mes</span><span>Próximo vencimiento</span><span>Estado</span><span />
        </div>

        {!loading && grupos.map(g => {
          const unico = g.filas.length === 1;
          const abierto = !unico && !cerrados.has(g.clave);
          const f0 = g.filas[0];
          const datos = g.filas.map(f => ({ f, ...celdas(f, hoy) }));
          const saldo = montos(sumar(g.filas.filter(f => f.estado !== 'cancelado'), f => f.saldo_pendiente));
          const venceMes = montos(datos.reduce((acc, d) => {
            const m = d.f.moneda || 'PEN';
            if (d.venceMes) acc[m] = (acc[m] || 0) + d.venceMes;
            return acc;
          }, {}));
          const modalidades = [...new Set(g.filas.map(modalidadTexto))];
          const peor = datos.find(d => d.e.tone === 'red') || datos.find(d => d.e.tone === 'green') || datos[0];
          const proximoGrupo = datos.filter(d => d.p.fecha).sort((a, b) => a.p.fecha.localeCompare(b.p.fecha))[0];
          const monedas = [...new Set(g.filas.map(f => f.moneda || 'PEN'))].join(' · ');
          const abrirGrupo = () => (unico ? onAbrir?.(f0.id) : alternar(g.clave));
          return (
            <React.Fragment key={g.clave}>
              <div
                className={`dx-ui-row dx-fin-cols${unico ? '' : ' dx-fin-grupo'}`}
                role="button"
                tabIndex={0}
                aria-expanded={unico ? undefined : abierto}
                aria-label={unico ? `Abrir ${f0.codigo} de ${g.entidad}` : `${abierto ? 'Contraer' : 'Expandir'} ${g.entidad}`}
                onClick={abrirGrupo}
                onKeyDown={activar(abrirGrupo)}
              >
                <div className="dx-fin-quien">
                  <span className={`dx-ui-icon ${f0.tipo === 'bancario' || f0.tipo === 'leasing' ? 'is-cyan' : 'is-violet'}`} aria-hidden="true">{iniciales(g.entidad)}</span>
                  <div>
                    <strong title={g.entidad}>{g.entidad}</strong>
                    <span className="dx-fin-small">
                      {unico ? `${f0.codigo} · ${TIPO_ACREEDOR[f0.tipo] || 'Otro'} · desembolso ${fecha(f0.fecha_desembolso)}` : `${TIPO_ACREEDOR[f0.tipo] || 'Otro'} · ${plural(g.filas.length, 'préstamo', 'préstamos')} · ${monedas}`}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="dx-fin-label">Modalidad</span>
                  <span className={`dx-ui-pill ${f0.tipo_cuota === 'interes_saldo' ? 'is-violet' : 'is-cyan'}`} title={modalidades.join(' / ')}>
                    {modalidades.length === 1 ? modalidades[0] : 'Varias modalidades'}
                  </span>
                </div>
                <div className="dx-fin-num">
                  <span className="dx-fin-label">Saldo capital</span>
                  {saldo.length ? saldo.map(s => <strong key={s} className="dx-fin-monto">{s}</strong>) : <span className="dx-fin-small">Sin dato</span>}
                </div>
                <div className="dx-fin-num">
                  <span className="dx-fin-label">Vence este mes</span>
                  {venceMes.length ? venceMes.map(s => <strong key={s} className="dx-fin-monto">{s}</strong>) : <span className="dx-fin-small">Nada este mes</span>}
                </div>
                <div>
                  <span className="dx-fin-label">Próximo vencimiento</span>
                  {proximoGrupo ? <>{proximoGrupo.p.texto}<span className="dx-fin-small">{proximoGrupo.p.detalle}</span></> : <span className="dx-fin-small">Sin cuotas pendientes</span>}
                </div>
                <div>
                  <span className="dx-fin-label">Estado</span>
                  <span className={`dx-ui-pill is-${peor.e.tone}`}><i />{peor.e.text}</span>
                </div>
                <span className={unico ? 'dx-ui-arrow' : 'dx-fin-chev'} aria-hidden="true">{unico ? '›' : abierto ? '▾' : '▸'}</span>
              </div>

              {abierto && datos.map(({ f, p, e, venceMes: vm }) => {
                const abrir = () => onAbrir?.(f.id);
                const amortizado = Number(f.monto_original || 0) - Number(f.saldo_pendiente || 0);
                return (
                  <div key={f.id} className="dx-ui-row dx-fin-cols dx-fin-hijo" role="button" tabIndex={0} aria-label={`Abrir ${f.codigo} de ${g.entidad}`} onClick={abrir} onKeyDown={activar(abrir)}>
                    <div className="dx-fin-quien">
                      <div>
                        <strong>{f.codigo}</strong>
                        <span className="dx-fin-small">
                          Desembolso {fecha(f.fecha_desembolso)} · {formatMoney(f.monto_original, f.moneda || 'PEN')}
                          {amortizado > 0.004 && f.estado !== 'cancelado' ? ` · amortizado ${formatMoney(amortizado, f.moneda || 'PEN')}` : ''}
                        </span>
                      </div>
                    </div>
                    <div><span className="dx-fin-label">Modalidad</span><span className="dx-fin-texto" title={modalidadTexto(f)}>{modalidadTexto(f)}</span></div>
                    <div className="dx-fin-num"><span className="dx-fin-label">Saldo capital</span>{formatMoney(f.saldo_pendiente, f.moneda || 'PEN')}</div>
                    <div className="dx-fin-num"><span className="dx-fin-label">Vence este mes</span>{vm ? formatMoney(vm, f.moneda || 'PEN') : <span className="dx-fin-small">Nada este mes</span>}</div>
                    <div><span className="dx-fin-label">Próximo vencimiento</span>{p.texto}<span className="dx-fin-small">{p.detalle}</span></div>
                    <div><span className="dx-fin-label">Estado</span><span className={`dx-ui-pill is-${e.tone}`}><i />{e.text}</span></div>
                    <span className="dx-ui-arrow" aria-hidden="true">›</span>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}

        {loading ? (
          <div className="dx-ui-empty">Cargando préstamos…</div>
        ) : !grupos.length && (
          <div className="dx-ui-empty">
            {financiamientos.length
              ? (q ? 'No se encontraron préstamos con esa búsqueda.' : `No hay préstamos ${vista === 'cancelados' ? 'cancelados' : 'vigentes'}.`)
              : 'Aún no hay préstamos registrados. Usa «Nuevo préstamo» para registrar el primero.'}
          </div>
        )}
        <div className="dx-fin-foot">Agrupado por acreedor · los montos no se convierten entre monedas</div>
      </div>
    </section>
  );
}
