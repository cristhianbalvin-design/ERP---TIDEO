import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons.jsx';

// Kit visual de la ficha del colaborador (Personal Operativo y Administrativo).
// Componentes solo de presentación: la lógica y los datos vienen de cada pantalla.

const cx = (...parts) => parts.filter(Boolean).join(' ');

export const FICHA_TONOS_BADGE = {
  'badge-green': 'green', 'badge-orange': 'amber', 'badge-yellow': 'amber', 'badge-red': 'red',
  'badge-cyan': 'cyan', 'badge-blue': 'cyan', 'badge-gray': 'gray', 'badge-purple': 'violet',
};
export const fichaTonoDeBadge = (badge, fallback = 'gray') => FICHA_TONOS_BADGE[badge] || fallback;

export function FichaPill({ tone = 'gray', dot = true, title, children }) {
  return (
    <span className={cx('dx-ficha-pill', tone !== 'gray' && `is-${tone}`, dot && 'has-dot')} title={title}>
      <span>{children}</span>
    </span>
  );
}

export function FichaHeader({ onBack, backLabel = 'Volver', initials, eyebrow, nombre, subParts = [], pills = [], actions }) {
  const partes = subParts.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  return (
    <>
      <button type="button" className="dx-ficha-back" onClick={onBack}>{I.chev}{backLabel}</button>
      <header className="dx-ficha-hd">
        <div className="dx-ficha-av" aria-hidden="true">{initials}</div>
        <div className="dx-ficha-hd-main">
          {eyebrow && <div className="dx-ficha-eyebrow">{eyebrow}</div>}
          <h1 className="dx-ficha-name">{nombre}</h1>
          {partes.length > 0 && (
            <div className="dx-ficha-sub">
              {partes.map((parte, idx) => (
                <React.Fragment key={idx}>{idx > 0 && <i aria-hidden="true">·</i>}<span>{parte}</span></React.Fragment>
              ))}
            </div>
          )}
          {pills.length > 0 && (
            <div className="dx-ficha-pills">
              {pills.filter(Boolean).map((p, idx) => <FichaPill key={idx} tone={p.tone} title={p.title}>{p.label}</FichaPill>)}
            </div>
          )}
        </div>
        {actions && <div className="dx-ficha-hd-acts">{actions}</div>}
      </header>
    </>
  );
}

export function FichaTabs({ tabs, active, onChange, label = 'Secciones de la ficha' }) {
  const refs = useRef({});
  useEffect(() => {
    const el = refs.current[active];
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  const onKeyDown = (e) => {
    const idx = tabs.findIndex(t => t.key === active);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      onChange(next.key);
      refs.current[next.key]?.focus();
    }
  };
  return (
    <nav className="dx-ficha-tabs" aria-label={label}>
      <div className="dx-ficha-tabs-in" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map(t => (
          <button
            key={t.key}
            ref={el => { refs.current[t.key] = el; }}
            type="button"
            role="tab"
            aria-selected={t.key === active}
            tabIndex={t.key === active ? 0 : -1}
            className={cx('dx-ficha-tab', t.key === active && 'is-on')}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {t.count ? <span className={cx('dx-ficha-ct', t.countTone && `is-${t.countTone}`)} aria-label={t.countLabel || undefined}>{t.count}</span> : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function FichaCard({ icon, title, meta, extra, flush = false, className, children, labelledBy }) {
  const tituloId = useRef(`dxf-${Math.random().toString(36).slice(2, 9)}`).current;
  return (
    <section className={cx('dx-ficha-card', flush && 'is-flush', className)} aria-labelledby={title ? (labelledBy || tituloId) : undefined}>
      {(title || extra) && (
        <div className="dx-ficha-card-h">
          {icon && <span className="dx-ficha-card-ic" aria-hidden="true">{icon}</span>}
          {title && <h2 className="dx-ficha-card-title" id={labelledBy || tituloId}>{title}</h2>}
          {meta !== undefined && meta !== null && meta !== '' && <span className="dx-ficha-card-meta">{meta}</span>}
          {extra && <><span className="dx-ficha-sp" />{extra}</>}
        </div>
      )}
      {flush ? children : <div className="dx-ficha-card-body">{children}</div>}
    </section>
  );
}

// items: [{ label, value, wide, nil }] — value vacío muestra "Sin registrar"
export function FichaDL({ items, cols = 2 }) {
  return (
    <dl className={cx('dx-ficha-dl', cols === 3 && 'is-c3')}>
      {items.filter(Boolean).map(({ label, value, wide, key }) => {
        const vacio = value === null || value === undefined || value === '' || value === '—';
        return (
          <div key={key || label} className={wide ? 'is-wide' : undefined}>
            <dt>{label}</dt>
            <dd className={vacio ? 'is-nil' : undefined}>{vacio ? 'Sin registrar' : value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function FichaKV({ items }) {
  return (
    <div className="dx-ficha-kv">
      {items.filter(Boolean).map(({ label, value, nil }) => (
        <div key={label}><span>{label}</span>{React.isValidElement(value) ? value : <b className={nil ? 'is-nil' : undefined}>{value}</b>}</div>
      ))}
    </div>
  );
}

export function FichaAlert({ tone, icon, title, children, actions, dashed = false, role }) {
  const ico = icon || (tone === 'danger' || tone === 'warn' ? I.alert : I.alertCircle);
  return (
    <div className={cx('dx-ficha-alert', tone && `is-${tone}`, dashed && 'is-dashed')} role={role}>
      <span className="dx-ficha-ico" aria-hidden="true">{ico}</span>
      <div className="dx-ficha-alert-body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {actions && <div className="dx-ficha-alert-acts">{actions}</div>}
    </div>
  );
}

export function FichaStats({ items, cols }) {
  const n = cols || items.length;
  return (
    <div className={cx('dx-ficha-stats', n === 2 && 'is-c2')}>
      {items.map(s => (
        <div className="dx-ficha-stat" key={s.label}>
          <span>{s.label}</span>
          <strong className={s.tone ? `is-${s.tone}` : undefined}>{s.value}</strong>
          {s.note && <em>{s.note}</em>}
        </div>
      ))}
    </div>
  );
}

export function FichaEmpty({ icon, title, text, action, compact = false }) {
  return (
    <div className={cx('dx-ficha-empty', compact && 'is-compact')}>
      {!compact && <span className="dx-ficha-empty-ic" aria-hidden="true">{icon || I.file}</span>}
      {title && <h3>{title}</h3>}
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function FichaTable({ columns, children, empty }) {
  return (
    <div className="dx-ficha-tablewrap">
      <table className="dx-ficha-table">
        <thead><tr>{columns.map(c => <th key={c.label || c} className={c.num ? 'is-num' : undefined}>{c.label ?? c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

// Menú "Más acciones" de una fila de documento
export function FichaMenu({ label, items }) {
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = e => { if (!wrapRef.current?.contains(e.target)) setAbierto(false); };
    const esc = e => { if (e.key === 'Escape') { setAbierto(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  const visibles = (items || []).filter(Boolean);
  if (!visibles.length) return null;
  return (
    <div className="dx-ficha-menuw" ref={wrapRef}>
      <button ref={btnRef} type="button" className="dx-ficha-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
      </button>
      {abierto && (
        <div className="dx-ficha-menu" role="menu">
          {visibles.map((it, idx) => it === 'sep'
            ? <hr key={`sep-${idx}`} />
            : (
              <button key={it.label} type="button" role="menuitem" className={it.danger ? 'is-danger' : undefined} disabled={it.disabled} onClick={() => { setAbierto(false); it.onClick?.(); }}>
                {it.icon}{it.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

const TONO_DOC_ICONO = { green: I.check, amber: I.clock, red: I.alert, cyan: I.clock, gray: I.file };

// Fila de documento: requisito del cargo, documento adicional o adenda vinculada
// footers: [{ tone: 'rej'|'sig'|'val'|'note', content }]
export function FichaDocRow({ tone = 'gray', titulo, estado, meta = [], archivo, hint, hintTone, actions, footers = [], missing, highlight, historico, linked = false, icon }) {
  const metas = meta.filter(Boolean);
  const pies = footers.filter(f => f && f.content);
  return (
    <div className={cx(linked ? 'dx-ficha-linkd' : 'dx-ficha-doc', missing && 'is-missing', highlight && 'is-hl', historico && 'is-hist')}>
      <div className="dx-ficha-doc-in" style={linked ? { padding: 0, width: '100%' } : undefined}>
        <span className={cx('dx-ficha-dic', tone !== 'gray' && `is-${tone}`, linked && 'is-sm')} aria-hidden="true">{icon || (missing ? I.upload : TONO_DOC_ICONO[tone] || I.file)}</span>
        <div className="dx-ficha-dbody">
          <div className="dx-ficha-dtitle"><strong>{titulo}</strong>{estado}</div>
          {metas.length > 0 && <div className="dx-ficha-dmeta">{metas.map((m, idx) => <span key={idx}>{m}</span>)}</div>}
          {archivo && <div className="dx-ficha-file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg><span title={archivo}>{archivo}</span></div>}
          {hint && <div className={cx('dx-ficha-dhint', hintTone && `is-${hintTone}`)}>{hint}</div>}
        </div>
        {actions && <div className="dx-ficha-dacts">{actions}</div>}
      </div>
      {pies.map((f, idx) => <div key={idx} className={cx('dx-ficha-dfoot', f.tone && `is-${f.tone}`)}>{f.content}</div>)}
    </div>
  );
}

// Barra de estado de habilitación documental (motor calcular_habilitaciones_personal)
const HAB_SEGMENTOS = [
  ['vigente', 'var(--dx-ficha-green)', 'vigente', 'vigentes'],
  ['por_vencer', 'var(--dx-ficha-amber)', 'por vencer', 'por vencer'],
  ['en_revision', 'var(--dx-ficha-cyan)', 'en revisión', 'en revisión'],
  ['incompleto', 'var(--dx-ficha-amber)', 'incompleto', 'incompletos'],
  ['vencido', 'var(--dx-ficha-red)', 'vencido', 'vencidos'],
  ['rechazado', 'var(--dx-ficha-red)', 'rechazado', 'rechazados'],
  ['falta', 'var(--dx-ficha-border)', 'falta', 'faltan'],
];
const HAB_GLOBAL_TONO = { no_habilitado: 'red', alerta: 'amber', habilitado: 'green', sin_configurar: 'gray' };
export function FichaHabilitacion({ estadoGlobal, etiqueta, docs = [], problemas = [] }) {
  const tono = HAB_GLOBAL_TONO[estadoGlobal] || 'gray';
  const total = docs.length;
  const cargados = docs.filter(d => d.doc).length;
  const segmentos = HAB_SEGMENTOS.map(([estado, color, sing, plur]) => {
    const n = docs.filter(d => d.estado === estado).length;
    return n ? { estado, color, n, texto: `${n} ${n === 1 ? sing : plur}` } : null;
  }).filter(Boolean);
  const icono = tono === 'green' ? I.shield : I.alert;
  return (
    <section className="dx-ficha-hab" aria-label="Estado de habilitación para campo">
      <span className={cx('dx-ficha-hab-ic', tono !== 'gray' && `is-${tono}`)} aria-hidden="true">{icono}</span>
      <div className="dx-ficha-hab-t">
        <div className="dx-ficha-hab-k">Habilitación para campo</div>
        <h3>{etiqueta}</h3>
        <p>
          {estadoGlobal === 'habilitado' && 'Todos los documentos habilitantes están en regla.'}
          {estadoGlobal === 'sin_configurar' && 'No hay requisitos documentales que evaluar para este colaborador.'}
          {estadoGlobal !== 'habilitado' && estadoGlobal !== 'sin_configurar' && (problemas.length > 0
            ? <>Requieren atención: {problemas.map((n, idx) => <React.Fragment key={idx}>{idx > 0 && ' · '}<b>{n}</b></React.Fragment>)}</>
            : 'Revisa los requisitos del cargo.')}
        </p>
      </div>
      {total > 0 && (
        <div className="dx-ficha-prog">
          <div className="dx-ficha-prog-top"><span>Requisitos cargados</span><b>{cargados} de {total}</b></div>
          <div className="dx-ficha-bar" role="img" aria-label={segmentos.map(s => s.texto).join(', ')}>
            {segmentos.map(s => <i key={s.estado} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} />)}
          </div>
          <div className="dx-ficha-legend">{segmentos.map(s => <span key={s.estado} style={{ '--c': s.color }}>{s.texto}</span>)}</div>
        </div>
      )}
    </section>
  );
}

// Encabezado de una ventana (modal) con el estilo de la ficha
export function FichaModalHead({ icon, tone = 'cyan', eyebrow, title, sub, onClose, closeDisabled }) {
  return (
    <div className="dx-ficha-mh">
      {icon && <span className={cx('dx-ficha-dic', `is-${tone}`)} aria-hidden="true">{icon}</span>}
      <div className="dx-ficha-mh-t">
        {eyebrow && <div className="dx-ficha-eyebrow">{eyebrow}</div>}
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {onClose && <button type="button" className="dx-ficha-icon-btn" aria-label="Cerrar" onClick={onClose} disabled={closeDisabled}>{I.x}</button>}
    </div>
  );
}

export function fichaIniciales(nombre = '') {
  return String(nombre).trim().split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}
