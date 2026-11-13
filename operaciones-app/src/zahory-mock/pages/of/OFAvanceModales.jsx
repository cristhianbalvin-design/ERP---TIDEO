import React, { useMemo, useRef, useState } from 'react';
import { formatearFecha } from './ofBandejaLogic.js';
import { hayCambios, primerError } from './ofFichaLogic.js';
import { CAMPOS_AVANCE, avanceVacio, datosAvance, hoyISO, textoOperacion, validarAvance, validarRevision } from './ofAvanceLogic.js';
import { Campo, ModalBase } from './OFModales.jsx';

const IcoCheck = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;

// Registrar avance: el parte queda en revisión hasta que lo apruebe el jefe de taller.
export function AvanceModal({ of, tecnicos, onGuardar, onClose }) {
  const inicial = useMemo(() => avanceVacio(), []);
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const raiz = useRef(null);
  const sucio = hayCambios(form, inicial);
  const set = campo => valor => {
    setForm(f => ({ ...f, [campo]: valor }));
    setErrores(e => ({ ...e, [campo]: undefined }));
    setErrorServidor('');
  };
  const abiertas = (of.operaciones || []).filter(o => o.estado !== 'terminada');
  const op = abiertas.find(o => o.id === form.operacion_id);

  const guardar = async e => {
    e.preventDefault();
    const errs = validarAvance(form);
    setErrores(errs);
    if (Object.keys(errs).length) {
      const campo = primerError(errs, CAMPOS_AVANCE);
      raiz.current?.querySelector(`#ofa-${campo}`)?.focus();
      return;
    }
    setGuardando(true);
    setErrorServidor('');
    try {
      onClose(await onGuardar(datosAvance(form)));
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo registrar el avance.');
      setGuardando(false);
    }
  };

  const desc = c => (errores[c] ? `ofa-${c}-err` : undefined);
  return (
    <ModalBase titulo="Registrar avance" ayuda="El parte queda en revisión hasta que lo apruebe el jefe de taller."
      sucio={sucio && !guardando} onClose={() => onClose()}
      pie={cerrar => (
        <>
          {errorServidor && <div className="dx-ofd-server" role="alert">{errorServidor}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" form="dx-ofd-form-avance" className="dx-ofd-primary" disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar a revisión'}</button>
          </div>
        </>
      )}>
      <form id="dx-ofd-form-avance" ref={raiz} className="dx-ui-form-grid" noValidate onSubmit={guardar}>
        <Campo id="ofa-operacion_id" label="Operación" requerido error={errores.operacion_id} ayuda={op ? textoOperacion(op) : abiertas.length ? undefined : 'Todas las operaciones están terminadas.'}>
          <select id="ofa-operacion_id" className="dx-ui-select" value={form.operacion_id} onChange={e => set('operacion_id')(e.target.value)}
            aria-invalid={Boolean(errores.operacion_id)} aria-describedby={desc('operacion_id')}>
            <option value="">Elige…</option>
            {abiertas.map(o => <option key={o.id} value={o.id}>{`${o.secuencia} · ${o.tarea}`}</option>)}
          </select>
        </Campo>
        <Campo id="ofa-tecnico_id" label="Técnico" requerido error={errores.tecnico_id}>
          <select id="ofa-tecnico_id" className="dx-ui-select" value={form.tecnico_id} onChange={e => set('tecnico_id')(e.target.value)}
            aria-invalid={Boolean(errores.tecnico_id)} aria-describedby={desc('tecnico_id')}>
            <option value="">Elige…</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Campo>
        <Campo id="ofa-fecha" label="Fecha" requerido error={errores.fecha}>
          <input id="ofa-fecha" type="date" max={hoyISO()} value={form.fecha} onChange={e => set('fecha')(e.target.value)}
            aria-invalid={Boolean(errores.fecha)} aria-describedby={desc('fecha')} />
        </Campo>
        <Campo id="ofa-horas" label="Horas trabajadas" requerido error={errores.horas} ayuda="Máximo 2 decimales">
          <input id="ofa-horas" inputMode="decimal" value={form.horas} onChange={e => set('horas')(e.target.value)}
            aria-invalid={Boolean(errores.horas)} aria-describedby={desc('horas')} />
        </Campo>
        <Campo id="ofa-avance" label="Avance de la operación (%)" requerido error={errores.avance} ayuda="De 0 a 100; con 100 la operación queda terminada">
          <input id="ofa-avance" inputMode="decimal" value={form.avance} onChange={e => set('avance')(e.target.value)}
            aria-invalid={Boolean(errores.avance)} aria-describedby={desc('avance')} />
        </Campo>
        <Campo id="ofa-detalle" label="Qué se hizo" ayuda="Opcional" completo>
          <textarea id="ofa-detalle" value={form.detalle} onChange={e => set('detalle')(e.target.value)} />
        </Campo>
      </form>
    </ModalBase>
  );
}

// Revisar parte: aprobar (con avance validado) u observar (con observación).
export function RevisarParteModal({ parte, moneda, onRevisar, onClose }) {
  const inicial = useMemo(() => ({ avance: parte.avance_reportado == null ? '' : String(parte.avance_reportado), observacion: '' }), [parte]);
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [trabajando, setTrabajando] = useState('');
  const raiz = useRef(null);
  const sucio = hayCambios(form, inicial);
  const set = campo => valor => {
    setForm(f => ({ ...f, [campo]: valor }));
    setErrores({});
    setErrorServidor('');
  };

  const revisar = async accion => {
    const errs = validarRevision(accion, form, parte);
    setErrores(errs);
    if (Object.keys(errs).length) {
      raiz.current?.querySelector(`#ofr-${primerError(errs, ['avance', 'observacion'])}`)?.focus();
      return;
    }
    setTrabajando(accion);
    setErrorServidor('');
    try {
      const avance = accion === 'aprobar' ? Number(String(form.avance).replace(',', '.')) : null;
      onClose(await onRevisar(accion, avance, String(form.observacion || '').trim() || null));
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo revisar el parte.');
      setTrabajando('');
    }
  };

  const filas = [
    ['Operación', parte.operacion ? `${parte.secuencia} · ${parte.operacion}` : 'Sin dato'],
    ['Técnico', `${parte.tecnico || 'Sin dato'} · ${formatearFecha(parte.fecha)}`],
    ['Horas', `${parte.horas} h (lleva ${parte.horas_operacion} h de ${parte.horas_estimadas} h)`],
    ['Avance reportado', parte.avance_reportado == null ? 'Sin dato' : `${parte.avance_reportado} %`],
    ['Qué se hizo', parte.detalle || 'Sin dato'],
  ];
  return (
    <ModalBase titulo={`Revisar parte ${parte.numero || ''}`.trim()} estrecho sucio={sucio && !trabajando} onClose={() => onClose()}
      ayuda={`Al aprobarlo se suman las horas, se actualiza el avance de la operación y de la OF, y el costo real (${moneda}).`}
      pie={cerrar => (
        <>
          {errorServidor && <div className="dx-ofd-server" role="alert">{errorServidor}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={Boolean(trabajando)}>Cancelar</button>
            <button type="button" className="dx-ofd-ghost" onClick={() => revisar('observar')} disabled={Boolean(trabajando)}>{trabajando === 'observar' ? 'Procesando…' : 'Observar'}</button>
            <button type="button" className="dx-ofd-primary" onClick={() => revisar('aprobar')} disabled={Boolean(trabajando)}><IcoCheck />{trabajando === 'aprobar' ? 'Procesando…' : 'Aprobar parte'}</button>
          </div>
        </>
      )}>
      <dl className="dx-ofd-cmp dx-ofd-cmp-gap">
        {filas.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
      </dl>
      <div ref={raiz} className="dx-ui-form-grid is-2">
        <Campo id="ofr-avance" label="Avance validado (%)" requerido error={errores.avance} ayuda="Puedes corregir lo reportado">
          <input id="ofr-avance" inputMode="decimal" value={form.avance} onChange={e => set('avance')(e.target.value)}
            aria-invalid={Boolean(errores.avance)} aria-describedby={errores.avance ? 'ofr-avance-err' : undefined} />
        </Campo>
        <Campo id="ofr-observacion" label="Observación" error={errores.observacion} ayuda="Obligatoria si observas el parte o cambias el avance">
          <input id="ofr-observacion" value={form.observacion} onChange={e => set('observacion')(e.target.value)}
            aria-invalid={Boolean(errores.observacion)} aria-describedby={errores.observacion ? 'ofr-observacion-err' : undefined} />
        </Campo>
      </div>
    </ModalBase>
  );
}
