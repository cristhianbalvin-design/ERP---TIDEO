import React, { useState } from 'react';

export const segmentos = {
  todos: 'Todos',
  flota: 'Flota en alquiler',
  taller: 'Máquinas de taller',
  cliente: 'Equipos de clientes',
};
export const numero = (v, sufijo = '') =>
  v == null || v === '' || !Number.isFinite(Number(v))
    ? 'Sin dato'
    : `${Number(v).toLocaleString('es-PE', { maximumFractionDigits: 2 })}${sufijo}`;
export const fecha = (v) =>
  v ? new Date(String(v).length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('es-PE') : 'Sin dato';
export const dinero = (v) =>
  v == null
    ? 'Sin dato'
    : `${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (moneda no informada)`;
export const dineroConMoneda = (v, moneda) =>
  v == null || !moneda
    ? dinero(v)
    : `${moneda} ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const mes = (v) => {
  if (!v) return 'Sin dato';
  const d = new Date(`${String(v).slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Sin dato';
  const partes = new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric' }).formatToParts(d);
  return `${partes.find((p) => p.type === 'month').value.replace('.', '')} ${partes.find((p) => p.type === 'year').value}`;
};
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function periodoInicial() {
  const d = new Date();
  return { tipo: 'actual', desde: iso(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: iso(d) };
}
export function Periodo({ value, onChange }) {
  const cambiar = (tipo) => {
    const d = new Date();
    let desde = new Date(d.getFullYear(), d.getMonth(), 1),
      hasta = d;
    if (tipo === 'anterior') {
      desde = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      hasta = new Date(d.getFullYear(), d.getMonth(), 0);
    } else if (/^[0-9]+$/.test(tipo)) desde = new Date(d.getFullYear(), d.getMonth() - Number(tipo) + 1, 1);
    onChange({
      tipo,
      desde: tipo === 'personalizado' ? value.desde : iso(desde),
      hasta: tipo === 'personalizado' ? value.hasta : iso(hasta),
    });
  };
  return (
    <div className="dx-ui-form-grid">
      <label className="dx-ui-field">
        <span>Periodo</span>
        <select className="dx-ui-select" value={value.tipo} onChange={(e) => cambiar(e.target.value)}>
          <option value="actual">Mes actual</option>
          <option value="anterior">Mes anterior</option>
          <option value="3">Últimos 3 meses</option>
          <option value="6">Últimos 6 meses</option>
          <option value="12">Últimos 12 meses</option>
          <option value="personalizado">Rango personalizado</option>
        </select>
      </label>
      {value.tipo === 'personalizado' && (
        <>
          <label className="dx-ui-field">
            <span>Desde</span>
            <input type="date" value={value.desde} onChange={(e) => onChange({ ...value, desde: e.target.value })} />
          </label>
          <label className="dx-ui-field">
            <span>Hasta</span>
            <input type="date" value={value.hasta} onChange={(e) => onChange({ ...value, hasta: e.target.value })} />
          </label>
        </>
      )}
    </div>
  );
}
export function Segmentos({ value, onChange, opciones = ['todos', 'flota', 'taller', 'cliente'], prefijo }) {
  return (
    <div>
      <div className={`${prefijo}-segments`} aria-label="Segmento">
        {opciones.map((s) => (
          <button
            key={s}
            type="button"
            className={`dx-btn ${prefijo}-segment ${prefijo}-segment-${s}${value === s ? ' on' : ''}`}
            aria-pressed={value === s}
            onClick={() => onChange(s)}
          >
            {segmentos[s]}
          </button>
        ))}
      </div>
      <p className="dx-ui-field-hint">
        Flota: equipos en alquiler · Taller: tornos, CNC y otras máquinas propias · Cliente: equipos de clientes.
      </p>
    </div>
  );
}
export function AvisoVistaConsolidada({ visible }) {
  return visible ? (
    <p className="dx-conf-aviso" role="status">
      Estás en la vista consolidada del grupo. Para registrar o editar, elige una sociedad en el selector Sociedad de la
      parte superior.
    </p>
  ) : null;
}
export function Kpi({ titulo, valor, anterior, menorEsMejor = false, detalle }) {
  const dif = valor == null || anterior == null ? null : Number(valor) - Number(anterior);
  return (
    <div className="dx-ui-kpi" title={detalle}>
      <strong>
        {valor == null ? 'Sin dato' : valor}
        {dif != null && Number.isFinite(dif) && (
          <small
            className={dif === 0 ? '' : dif > 0 !== menorEsMejor ? 'dx-confk-good' : 'dx-confk-bad'}
            aria-label={`${dif > 0 ? '↑' : dif < 0 ? '↓' : '→'} ${numero(Math.abs(dif))} vs periodo anterior`}
          >
            {' '}
            {dif > 0 ? '↑' : dif < 0 ? '↓' : '→'} {numero(Math.abs(dif))}
          </small>
        )}
      </strong>
      <span
        title={dif != null && Number.isFinite(dif) ? `${titulo}: ${numero(Math.abs(dif))} vs periodo anterior` : titulo}
      >
        {titulo}
      </span>
    </div>
  );
}
export function Barra({ valor }) {
  return valor == null ? (
    <span>Sin dato</span>
  ) : (
    <span>
      <span>{numero(valor, '%')}</span>
      <progress max="100" value={Math.max(0, Math.min(100, Number(valor)))} />
    </span>
  );
}
export function BuscadorEquipo({ activos, value, onChange, invalid }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const elegido = activos.find((a) => String(a.id) === String(value));
  return (
    <div className="dx-ui-field dx-confk-picker">
      <input
        aria-label="Buscar equipo"
        aria-invalid={invalid}
        value={abierto ? texto : elegido ? `${elegido.codigo || ''} · ${elegido.nombre || ''}` : texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange('');
          setAbierto(true);
        }}
      />
      {abierto && (
        <div className="dx-confk-options">
          {activos
            .filter((a) => `${a.codigo} ${a.nombre}`.toLowerCase().includes(texto.toLowerCase()))
            .slice(0, 30)
            .map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => {
                  onChange(a.id);
                  setTexto('');
                  setAbierto(false);
                }}
              >
                {a.codigo} · {a.nombre} ({segmentos[a.segmento] || 'Otro'})
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
