import { useEffect, useMemo, useState } from 'react';
import { useSesionOperativa, SOCIEDAD_TODAS_ID } from '../../lib/sesionOperativa.js';
import { cargarDashboardGerencial } from '../../services/opsDashboardService.js';

const PERIODOS = [
  ['mes', 'Este mes'],
  ['anterior', 'Mes anterior'],
  ['tres', 'Últimos 3 meses'],
];
const TABS = [
  ['resumen', 'Resumen'],
  ['costos', 'Costos y rentabilidad'],
  ['flota', 'Flota y confiabilidad'],
];
const fechaISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function calcularPeriodo(tipo) {
  const hoy = new Date();
  const desde = new Date(
    hoy.getFullYear(),
    hoy.getMonth() - (tipo === 'tres' ? 2 : tipo === 'anterior' ? 1 : 0),
    1,
  );
  const hasta = tipo === 'anterior' ? new Date(hoy.getFullYear(), hoy.getMonth(), 0) : hoy;
  return { desde: fechaISO(desde), hasta: fechaISO(hasta) };
}
const fechaVisible = (fecha) => fecha.split('-').reverse().join('/');
const ratio = (numerador, denominador) =>
  Number(denominador) ? (100 * Number(numerador)) / Number(denominador) : null;
const porcentaje = (n) =>
  n == null || !Number.isFinite(Number(n)) ? 'Sin dato' : `${Number(n).toFixed(1)} %`;
const numero = (n) => Number(n || 0).toLocaleString('es-PE');
const plural = (n, uno, varios) => (Number(n) === 1 ? uno : varios);
const nombre = (s) =>
  String(s || 'Sin dato')
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
const ETIQUETAS = {
  estado: {
    ejecucion: 'En ejecución',
    programada: 'Programada',
    cerrada: 'Cerrada',
    borrador: 'Borrador',
    pausada: 'Pausada',
    cancelada: 'Cancelada',
    por_programar: 'Por programar',
  },
  tipo: {
    Preventivo_PM: 'Preventivo',
    Correctivo: 'Correctivo',
    Overhaul: 'Overhaul',
    Acondicionamiento: 'Acondicionamiento',
    Reclamo_Rework: 'Retrabajo',
  },
};
const mes = (s) => {
  const [a, m] = s.split('-');
  return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('es-PE', {
    month: 'short',
    year: 'numeric',
  });
};
function Card({ title, caption, children }) {
  return (
    <div className="dx-opsd-card">
      <h3>{title}</h3>
      {caption && <div className="dx-opsd-cap">{caption}</div>}
      {children}
    </div>
  );
}
function KpiResumen({ items }) {
  return (
    <div className="dx-ui-kpi-row">
      {items.map(([label, value, detail]) => (
        <div className="dx-ui-kpi" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {detail && <em>{detail}</em>}
        </div>
      ))}
    </div>
  );
}
function Empty({ children = 'No hay datos para el período seleccionado.' }) {
  return <p className="dx-opsd-empty">{children}</p>;
}
function BarrasConteo({ rows, field }) {
  const max = Math.max(0, ...rows.map((r) => Number(r.n)));
  if (!rows.length) return <Empty />;
  return rows.map((r, i) => (
    <div className="dx-opsd-bar-row" key={`${r[field]}-${i}`}>
      <div>
        <span>{ETIQUETAS[field]?.[r[field]] || nombre(r[field])}</span>
        <b>{numero(r.n)}</b>
      </div>
      <div className="dx-opsd-bar">
        <i
          style={{
            width: `${max ? (100 * r.n) / max : 0}%`,
            background: [
              'var(--opsd-cyan)',
              'var(--opsd-green)',
              'var(--opsd-violet)',
              'var(--opsd-red)',
            ][i % 4],
          }}
        />
      </div>
    </div>
  ));
}
function GraficoIngresoCosto({ rows, dinero, dineroCompacto }) {
  const max = Math.max(1, ...rows.flatMap((r) => [Number(r.ingreso), Number(r.costo)]));
  if (!rows.length) return <Empty />;
  const width = 560 / rows.length;
  return (
    <>
      <svg
        viewBox="0 0 640 230"
        role="img"
        aria-label="Ingreso atribuible y costo operativo por mes"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1="70"
              x2="630"
              y1={200 - 180 * t}
              y2={200 - 180 * t}
              stroke="var(--opsd-line2)"
            />
            <text x="64" y={204 - 180 * t} textAnchor="end" fontSize="10" fill="var(--opsd-muted)">
              {dineroCompacto(max * t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = 70 + width * i + width * 0.15;
          return (
            <g key={r.mes}>
              {[
                ['ingreso', 'var(--opsd-cyan)'],
                ['costo', 'var(--opsd-bar)'],
              ].map(([key, color], j) => (
                <rect
                  key={key}
                  x={x + j * width * 0.34}
                  y={200 - (180 * Number(r[key])) / max}
                  width={width * 0.3}
                  height={(180 * Number(r[key])) / max}
                  rx="4"
                  fill={color}
                >
                  <title>{`${key}: ${dinero(r[key])}`}</title>
                </rect>
              ))}
              <text
                x={70 + width * (i + 0.5)}
                y="218"
                textAnchor="middle"
                fontSize="11"
                fill="var(--opsd-muted)"
              >
                {mes(r.mes)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="dx-opsd-legend">
        <span>
          <i style={{ background: 'var(--opsd-cyan)' }} />
          Ingreso atribuible
        </span>
        <span>
          <i style={{ background: 'var(--opsd-bar)' }} />
          Costo operativo
        </span>
      </div>
    </>
  );
}
function DonaComposicion({ composicion, dinero }) {
  const parts = [
    ['Mano de obra', composicion.mano_obra, 'var(--opsd-bar)'],
    ['Repuestos y materiales', composicion.materiales, 'var(--opsd-cyan)'],
    ['Servicios de terceros', composicion.terceros, 'var(--opsd-violet)'],
    ['Logística', composicion.logistica, '#F59E0B'],
    ['Otros', composicion.otros, 'var(--opsd-green)'],
  ];
  const total = parts.reduce((a, p) => a + Number(p[1] || 0), 0);
  let offset = 0;
  if (!total) return <Empty />;
  return (
    <>
      <svg
        className="dx-opsd-donut"
        viewBox="0 0 220 220"
        role="img"
        aria-label="Composición del costo"
      >
        <circle cx="110" cy="110" r="80" fill="none" stroke="var(--opsd-line2)" strokeWidth="28" />
        {parts.map(([label, value, color]) => {
          const pct = (Number(value || 0) / total) * 100;
          const start = offset;
          offset += pct;
          return (
            <circle
              key={label}
              cx="110"
              cy="110"
              r="80"
              fill="none"
              stroke={color}
              strokeWidth="28"
              pathLength="100"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={-start}
              transform="rotate(-90 110 110)"
            >
              <title>{`${label}: ${dinero(value)}`}</title>
            </circle>
          );
        })}
        <text x="110" y="103" textAnchor="middle" fill="var(--opsd-muted)" fontSize="12">
          Total
        </text>
        <text
          x="110"
          y="124"
          textAnchor="middle"
          fill="var(--opsd-text)"
          fontSize="12"
          fontWeight="700"
        >
          {dinero(total)}
        </text>
      </svg>
      <div className="dx-opsd-donleg">
        {parts.map(([label, value, color]) => (
          <div key={label}>
            <span>
              <i style={{ background: color }} />
              {label}
            </span>
            <b>{porcentaje(ratio(value, total))}</b>
          </div>
        ))}
      </div>
    </>
  );
}
function GraficoDmr({ rows, meta }) {
  const valid = rows.filter((r) => r.dmr != null);
  if (!valid.length) return <Empty />;
  const x = (i) => (valid.length === 1 ? 350 : 90 + (i * 500) / (valid.length - 1));
  const valores = valid.map((r) => Number(r.dmr));
  if (meta != null) valores.push(Number(meta));
  const minimo = Math.max(0, Math.min(95, Math.floor(Math.min(...valores) / 5) * 5 - 5));
  const y = (v) => 200 - ((Math.max(minimo, Math.min(100, Number(v))) - minimo) * 180) / (100 - minimo);
  return (
    <svg viewBox="0 0 640 230" role="img" aria-label="Disponibilidad mecánica por mes">
      {Array.from({ length: 6 }, (_, i) => minimo + ((100 - minimo) * i) / 5).map((v) => (
        <g key={v}>
          <line x1="70" x2="630" y1={y(v)} y2={y(v)} stroke="var(--opsd-line2)" />
          <text x="64" y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--opsd-muted)">
            {Number(v.toFixed(2))}%
          </text>
        </g>
      ))}
      {meta != null && (
        <g>
          <line
            x1="70"
            x2="630"
            y1={y(meta)}
            y2={y(meta)}
            stroke="var(--opsd-red)"
            strokeDasharray="5 4"
          />
          <text x="75" y={y(meta) + 13} fontSize="10" fill="var(--opsd-red)">
            Meta {porcentaje(meta)}
          </text>
        </g>
      )}
      <polyline
        points={valid.map((r, i) => `${x(i)},${y(r.dmr)}`).join(' ')}
        fill="none"
        stroke="var(--opsd-cyan)"
        strokeWidth="3"
      />
      {valid.map((r, i) => (
        <g key={r.mes}>
          <circle
            cx={x(i)}
            cy={y(r.dmr)}
            r="5"
            fill="var(--opsd-card)"
            stroke="var(--opsd-cyan)"
            strokeWidth="3"
          />
          <text
            x={x(i)}
            y={y(r.dmr) - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--opsd-text)"
          >
            {porcentaje(r.dmr)}
          </text>
          <text x={x(i)} y="218" textAnchor="middle" fontSize="11" fill="var(--opsd-muted)">
            {mes(r.mes)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Segmentado({ etiqueta, children }) {
  return (
    <div className="dx-opsd-seg" aria-label={etiqueta}>
      {children}
    </div>
  );
}

function Encabezado({ entidad, rango, periodo, setPeriodo, moneda, setMoneda, tieneTC }) {
  return (
    <header className="dx-opsd-head">
      <div>
        <div className="dx-opsd-eyebrow">Operaciones · Gerencia</div>
        <h1>Dashboard gerencial</h1>
        <div className="dx-opsd-sub">
          {entidad || 'Empresa'} · {fechaVisible(rango.desde)} – {fechaVisible(rango.hasta)}
        </div>
      </div>
      <div className="dx-opsd-actions">
        <Segmentado etiqueta="Período">
          {PERIODOS.map(([id, label]) => (
            <button key={id} aria-pressed={periodo === id} onClick={() => setPeriodo(id)}>
              {label}
            </button>
          ))}
        </Segmentado>
        <Segmentado etiqueta="Moneda">
          {['PEN', 'USD'].map((m) => (
            <button
              key={m}
              aria-pressed={moneda === m}
              disabled={m === 'USD' && !tieneTC}
              title={
                m === 'USD' && !tieneTC
                  ? 'No hay tipo de cambio disponible para el período.'
                  : undefined
              }
              onClick={() => setMoneda(m)}
            >
              {m}
            </button>
          ))}
        </Segmentado>
        <button className="dx-opsd-button" onClick={() => window.print()}>
          Exportar PDF
        </button>
      </div>
    </header>
  );
}

function Esqueleto() {
  return (
    <div className="dx-opsd-skeleton" aria-label="Cargando dashboard" role="status">
      <div />
      <div />
      <div />
    </div>
  );
}

function ErrorCarga({ error, empresaId, sesion, setIntento }) {
  return (
    <Card title="No se pudo cargar el dashboard">
      <p>{error}</p>
      <button
        className="dx-opsd-button"
        onClick={() => {
          if (!empresaId) sesion.recargar();
          else setIntento((n) => n + 1);
        }}
      >
        Reintentar
      </button>
    </Card>
  );
}

function CentroAlertas({ alertas }) {
  return (
    <Card title="Centro de alertas" caption="Calculadas con datos del período">
      {alertas.length ? (
        alertas.map(([nivel, titulo, detalle], i) => (
          <div className="dx-opsd-alert" key={i}>
            <span
              className={`dx-opsd-pill dx-opsd-${
                nivel === 'Crítica' ? 'red' : nivel === 'Atención' ? 'amber' : 'cyan'
              }`}
            >
              {nivel}
            </span>
            <div>
              <b>{titulo}</b>
              <small>{detalle}</small>
            </div>
          </div>
        ))
      ) : (
        <Empty>Todo en orden. No hay alertas en este período.</Empty>
      )}
    </Card>
  );
}

function TablaBacklog({ datos }) {
  return (
    <Card title="Backlog abierto" caption="Por prioridad y antigüedad">
      {datos.backlog?.length ? (
        <table>
          <thead>
            <tr>
              <th>Prioridad</th>
              <th>Ítems</th>
              <th>Más antiguo</th>
            </tr>
          </thead>
          <tbody>
            {datos.backlog.map((r, i) => (
              <tr key={i}>
                <td>{nombre(r.prioridad)}</td>
                <td>{numero(r.n)}</td>
                <td>
                  {numero(r.max_dias)} {plural(r.max_dias, 'día', 'días')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>No hay backlog abierto.</Empty>
      )}
    </Card>
  );
}

function TablaMenorMargen({ datos, dinero }) {
  return (
    <Card
      title="OT con menor margen"
      caption="OT cerradas de clientes · ordenadas de menor a mayor margen"
    >
      {datos.menor_margen?.length ? (
        <div className="dx-opsd-table-wrap">
          <table className="dx-opsd-margen-table">
            <thead>
              <tr>
                <th>OT</th>
                <th>Servicio · cliente</th>
                <th>Ingreso</th>
                <th>Costo</th>
                <th>Margen</th>
              </tr>
            </thead>
            <tbody>
              {datos.menor_margen.map((r) => (
                <tr key={r.id}>
                  <td>{r.numero}</td>
                  <td>
                    <span className="dx-opsd-servicio">{r.servicio || 'Sin servicio'}</span>
                    <small className="dx-opsd-cliente">{r.cliente || 'Sin cliente'}</small>
                  </td>
                  <td>{dinero(r.ingreso)}</td>
                  <td>{dinero(r.costo)}</td>
                  <td>{porcentaje(r.margen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No hay OT de clientes cerradas con ingreso.</Empty>
      )}
    </Card>
  );
}

function TablaDmrEquipo({ datos }) {
  return (
    <Card title="DMR por equipo" caption="Contra la meta de su contrato">
      {datos.dmr_equipo?.length ? (
        <table>
          <thead>
            <tr>
              <th>Equipo</th>
              <th>DMR</th>
              <th>Meta</th>
            </tr>
          </thead>
          <tbody>
            {datos.dmr_equipo.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.equipo} · {r.contrato}
                </td>
                <td
                  className={
                    r.dmr != null && r.meta != null && Number(r.dmr) < Number(r.meta)
                      ? 'dx-opsd-down'
                      : ''
                  }
                >
                  {porcentaje(r.dmr)}
                </td>
                <td>{porcentaje(r.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>No hay datos de DMR por equipo.</Empty>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const sesion = useSesionOperativa();
  const [periodo, setPeriodo] = useState('tres');
  const [moneda, setMoneda] = useState('PEN');
  const [tab, setTab] = useState('resumen');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  const rango = useMemo(() => calcularPeriodo(periodo), [periodo]);
  const empresaId = sesion.empresaId;
  const sociedadId =
    sesion.sociedadActiva?.id === SOCIEDAD_TODAS_ID ? null : sesion.sociedadId || null;
  useEffect(() => {
    if (sesion.cargando) return;
    if (!empresaId) {
      setCargando(false);
      setDatos(null);
      setError(sesion.error || 'No se pudo identificar la empresa operativa.');
      return;
    }
    let vigente = true;
    setCargando(true);
    setError('');
    setDatos(null);
    cargarDashboardGerencial(empresaId, sociedadId, rango.desde, rango.hasta)
      .then((data) => {
        if (vigente) setDatos(data);
      })
      .catch((e) => {
        if (vigente) setError(e.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [empresaId, sociedadId, rango.desde, rango.hasta, intento, sesion.cargando, sesion.error]);
  const tc = Number(datos?.tipo_cambio);
  const tieneTC = Number.isFinite(tc) && tc > 0;
  useEffect(() => {
    if (!tieneTC) setMoneda('PEN');
  }, [tieneTC]);
  const convertir = (valor) => (Number(valor) || 0) * (moneda === 'USD' && tieneTC ? tc : 1);
  const simbolo = moneda === 'USD' && tieneTC ? 'US$' : 'S/';
  const dineroCompacto = (valor) => {
    const monto = convertir(valor);
    const abs = Math.abs(monto);
    const divisor = abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
    const sufijo = divisor === 1e6 ? ' M' : divisor === 1e3 ? ' mil' : '';
    const cifra = (monto / divisor).toLocaleString('es-PE', { maximumFractionDigits: divisor === 1 ? 0 : 1 });
    return `${simbolo}\u00a0${cifra}${sufijo}`;
  };
  const dinero = (valor) =>
    `${simbolo}\u00a0${
      convertir(valor).toLocaleString('es-PE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })
    }`;
  const k = datos?.kpi || {};
  const ingreso = Number(k.ingreso || 0);
  const margen = ratio(ingreso - Number(k.costo_clientes || 0), ingreso);
  const desviacion = ratio(
    Number(k.real_cerradas || 0) - Number(k.estimado_cerradas || 0),
    k.estimado_cerradas,
  );
  const utilizacion = ratio(k.equipos_en_uso, k.equipos_propios);
  const retrabajo = ratio(k.retrabajo_costo, ingreso);
  const preventivo = ratio(k.preventivas_periodo, k.ots_periodo);
  const alertas = [];
  (datos?.dmr_equipo || [])
    .filter((e) => e.dmr != null && e.meta != null && Number(e.dmr) < Number(e.meta))
    .forEach((e) =>
      alertas.push([
        'Crítica',
        `${e.equipo} bajo la meta de disponibilidad`,
        `DMR ${porcentaje(e.dmr)} · meta ${porcentaje(e.meta)} · ${e.contrato || 'Sin contrato'}`,
      ]),
    );
  if (preventivo != null && preventivo < 60)
    alertas.push([
      'Atención',
      `Preventivo en ${porcentaje(preventivo)} del total de OT`,
      `${numero(k.preventivas_periodo)} de ${numero(k.ots_periodo)} OT · meta recomendada ≥ 60.0 %`,
    ]);
  if (Number(k.ots_sobre_estimado) > 0)
    alertas.push([
      'Atención',
      `${numero(k.ots_sobre_estimado)} OT ${
        plural(k.ots_sobre_estimado, 'superó', 'superaron')} su costo estimado en más de 5 %`,
      `Desviación total ${porcentaje(desviacion)}`,
    ]);
  if (Number(k.partes_por_aprobar) > 0)
    alertas.push([
      'Pendiente',
      `${numero(k.partes_por_aprobar)} ${
        plural(k.partes_por_aprobar, 'parte diario por aprobar', 'partes diarios por aprobar')
      }`,
      'En revisión o borrador',
    ]);
  if (Number(k.repuestos_bajo_reorden) > 0)
    alertas.push([
      'Pendiente',
      `${numero(k.repuestos_bajo_reorden)} ${
        plural(
          k.repuestos_bajo_reorden,
          'repuesto bajo el punto de reorden',
          'repuestos bajo el punto de reorden',
        )
      }`,
      'Revisar inventario',
    ]);
  const entidad =
    sesion.vistaConsolidada || !sesion.sociedadActiva
      ? sesion.empresa?.nombre_comercial || sesion.empresa?.razon_social
      : sesion.sociedadActiva.nombre;
  return (
    <main className="dx-opsd dx-ui">
      <Encabezado {...{ entidad, rango, periodo, setPeriodo, moneda, setMoneda, tieneTC }} />
      <div className="dx-opsd-tabs" role="tablist" aria-label="Secciones del dashboard">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {cargando || sesion.cargando ? (
        <Esqueleto />
      ) : error ? (
        <ErrorCarga {...{ error, empresaId, sesion, setIntento }} />
      ) : !datos ? (
        <Card title="Sin datos">
          <Empty />
        </Card>
      ) : (
        <div role="tabpanel">
          {tab === 'resumen' && (
            <>
              <KpiResumen
                items={[
                  [
                    'OT activas',
                    numero(Number(k.ot_ejecucion || 0) + Number(k.ot_programadas || 0)),
                    `${numero(k.ot_ejecucion)} en ejecución · ${numero(k.ot_programadas)} ${
        plural(k.ot_programadas, 'programada', 'programadas')
      }`,
                  ],
                  [
                    'Capital detenido',
                    dinero(k.capital_detenido),
                    `${numero(k.capital_ots)} OT esperando repuestos`,
                  ],
                  [
                    'Utilización de flota',
                    porcentaje(utilizacion),
                    `${numero(k.equipos_en_uso)} de ${numero(k.equipos_propios)} equipos propios`,
                  ],
                  [
                    'Disponibilidad (DMR)',
                    porcentaje(k.dmr),
                    `Meta ponderada ${porcentaje(k.dmr_meta)}`,
                  ],
                  [
                    'Margen bruto',
                    porcentaje(margen),
                    ingreso
                      ? `${dinero(ingreso - Number(k.costo_clientes || 0))} de utilidad`
                      : 'Sin ingreso atribuible',
                  ],
                ]}
              />
              <div className="dx-opsd-grid">
                <Card
                  title="Ingreso atribuible vs. costo operativo"
                  caption="Por mes · ingreso de la OS repartido entre sus OT según su costo · costo operativo total"
                >
                  <GraficoIngresoCosto rows={datos.por_mes || []} dinero={dinero} dineroCompacto={dineroCompacto} />
                </Card>
                <CentroAlertas alertas={alertas} />
              </div>
              <div className="dx-opsd-grid3">
                <Card title="OT por estado" caption={`Al ${fechaVisible(rango.hasta)}`}>
                  <BarrasConteo rows={datos.ot_estado || []} field="estado" />
                </Card>
                <Card title="OT por tipo de trabajo" caption="Período seleccionado">
                  <BarrasConteo rows={datos.ot_tipo || []} field="tipo" />
                </Card>
                <TablaBacklog datos={datos} />
              </div>
            </>
          )}
          {tab === 'costos' && (
            <>
              <KpiResumen
                items={[
                  ['Ingreso atribuible', dinero(k.ingreso), `${numero(k.ots_periodo)} OT del período`],
                  ['Costo operativo', dinero(k.costo), `${dinero(k.costo_clientes)} en OT de clientes`],
                  [
                    'Margen bruto', porcentaje(margen),
                    ingreso ? `${dinero(ingreso - Number(k.costo_clientes || 0))} de utilidad`
                      : 'Sin ingreso atribuible',
                  ],
                  [
                    'Desviación vs. estimado',
                    porcentaje(desviacion),
                    `${numero(k.ots_sobre_estimado)} OT sobre el 5 %`,
                  ],
                  ['Retrabajo', porcentaje(retrabajo), `${dinero(k.retrabajo_costo)} en OT de retrabajo`],
                ]}
              />
              <div className="dx-opsd-grid">
                <TablaMenorMargen datos={datos} dinero={dinero} />
                <Card title="Composición del costo" caption="Período seleccionado">
                  <DonaComposicion composicion={datos.composicion || {}} dinero={dinero} />
                </Card>
              </div>
            </>
          )}
          {tab === 'flota' && (
            <>
              <KpiResumen
                items={[
                  [
                    'Equipos propios',
                    numero(k.equipos_propios),
                    `${numero(k.equipos_mantenimiento)} en mantenimiento`,
                  ],
                  [
                    'En uso',
                    numero(k.equipos_en_uso),
                    `${numero(k.contratos_vigentes)} ${
        plural(k.contratos_vigentes, 'contrato vigente', 'contratos vigentes')
      }`,
                  ],
                  ['DMR del período', porcentaje(k.dmr), `Meta ponderada ${porcentaje(k.dmr_meta)}`],
                  [
                    'Equipos bajo meta', numero(k.equipos_bajo_meta),
                    `de ${numero(datos.dmr_equipo?.length)} ${
                      plural(datos.dmr_equipo?.length, 'equipo', 'equipos')} en contrato`,
                  ],
                ]}
              />
              <div className="dx-opsd-grid">
                <Card
                  title="Disponibilidad mecánica (DMR) vs. meta"
                  caption={
                    'Flota en contrato · (horas programadas − paradas imputables al proveedor) ' +
                    '/ horas programadas'
                  }
                >
                  <GraficoDmr rows={datos.dmr_mes || []} meta={k.dmr_meta} />
                </Card>
                <TablaDmrEquipo datos={datos} />
              </div>
              <div className="dx-opsd-note">
                MTBF y MTTR por equipo quedan para cuando existan los módulos de fallas y paradas
                por equipo.
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
