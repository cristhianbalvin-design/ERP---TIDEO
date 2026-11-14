import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Campo, ModalBase } from './OFModales.jsx';
import { hoyISO } from './ofAvanceLogic.js';
import { datosReclamo, validarReclamo } from './ofGarantiasLogic.js';
import { evaluarReclamo, registrarReclamo, subirFotoReclamo } from '../../../services/ofGarantiasService.js';

export function OFReclamoModal({ garantia, empresaId, evaluar = false, onClose, onGuardado }) {
  const [form, setForm] = useState({ fecha: hoyISO(), evaluacion: evaluar ? 'procede' : 'pendiente', falla: '', observacion: '', fotos: [] });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const ref = useRef(null);
  const archivo = useRef(null);
  const miniaturas = useMemo(() => form.fotos.map(f => URL.createObjectURL(f)), [form.fotos]);
  useEffect(() => () => miniaturas.forEach(URL.revokeObjectURL), [miniaturas]);
  const cambiar = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSucio(true); setErrores(e => ({ ...e, [k]: undefined })); };
  const guardar = async crearOf => {
    let e = validarReclamo(form, garantia);
    if (evaluar) e = Object.fromEntries(Object.entries(e).filter(([k]) => ['evaluacion', 'observacion'].includes(k)));
    setErrores(e);
    const primero = Object.keys(e)[0];
    if (primero) { ref.current?.querySelector(`#ofg-${primero}`)?.focus(); return; }
    setTrabajando(true); setError('');
    try {
      if (evaluar) { await evaluarReclamo(garantia.reclamo.id, form.evaluacion, form.observacion.trim()); onGuardado(); }
      else {
        const fotos = await Promise.all(form.fotos.map(f => subirFotoReclamo(empresaId, garantia.of_id, f)));
        const resultado = await registrarReclamo(garantia.id, datosReclamo(form, fotos, crearOf));
        onGuardado(resultado);
      }
    } catch (err) { setError(err?.message || 'No se pudo guardar el reclamo.'); }
    finally { setTrabajando(false); }
  };
  const props = k => ({ id: `ofg-${k}`, value: form[k], onChange: e => cambiar(k, e.target.value), 'aria-invalid': Boolean(errores[k]), 'aria-describedby': errores[k] ? `ofg-${k}-err` : undefined });
  return <ModalBase titulo={evaluar ? 'Evaluar reclamo' : 'Registrar reclamo'} ayuda={`${garantia.numero} · ${garantia.serie}`} sucio={sucio && !trabajando} onClose={() => { if (!trabajando) onClose(); }}
    pie={cerrar => <>{error && <div className="dx-ofd-server" role="alert">{error}</div>}<div className="dx-ofd-modal-actions"><button type="button" className="dx-ofd-ghost" disabled={trabajando} onClick={cerrar}>Cancelar</button><button type="button" className="dx-ofd-primary" disabled={trabajando} onClick={() => guardar(false)}>{trabajando ? 'Procesando…' : evaluar ? 'Guardar evaluación' : 'Guardar reclamo'}</button>{!evaluar && form.evaluacion === 'procede' && <button type="button" className="dx-ofd-primary" disabled={trabajando} onClick={() => guardar(true)}>Crear OF de garantía</button>}</div></>}>
    <div ref={ref} className="dx-ui-form-grid is-2">
      {!evaluar && <Campo id="ofg-fecha" label="Fecha" requerido error={errores.fecha}><input {...props('fecha')} type="date" /></Campo>}
      <Campo id="ofg-evaluacion" label="Evaluación" requerido error={errores.evaluacion}><select {...props('evaluacion')} className="dx-ui-select">{!evaluar && <option value="pendiente">Pendiente</option>}<option value="procede">Procede</option><option value="no_procede">No procede</option></select></Campo>
      {!evaluar && <Campo id="ofg-falla" label="Falla reportada" requerido error={errores.falla} completo><textarea {...props('falla')} maxLength={2000} /></Campo>}
      <Campo id="ofg-observacion" label="Observación" requerido={form.evaluacion === 'no_procede'} error={errores.observacion} completo><textarea {...props('observacion')} /></Campo>
      {!evaluar && <Campo id="ofg-fotos" label="Fotos opcionales" error={errores.fotos} completo><input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { cambiar('fotos', [...form.fotos, ...Array.from(e.target.files || [])].slice(0, 6)); e.target.value = ''; }} /><button id="ofg-fotos" type="button" className="dx-ofd-ghost" disabled={form.fotos.length >= 6} onClick={() => archivo.current?.click()}>Agregar fotos ({form.fotos.length} de 6)</button><div className="dx-ofg-fotos">{form.fotos.map((f, i) => <figure key={`${f.name}-${i}`}><img src={miniaturas[i]} alt={`Foto ${i + 1} del reclamo`} /><button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => cambiar('fotos', form.fotos.filter((_, n) => n !== i))}>×</button></figure>)}</div></Campo>}
    </div>
  </ModalBase>;
}
