import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Campo, ModalBase } from './OFModales.jsx';
import { FirmaTrazo } from '../FirmaTrazo.jsx';
import { cargarEntrega, entregarOF, subirFirmaEntrega, subirFotoEntrega } from '../../../services/ofEntregaService.js';
import { generarYRegistrarPdfEntrega } from './OFEntregaPdf.jsx';
import { datosEntrega, estadoInicialEntrega, finGarantia, validarPasoEntrega } from './ofEntregaLogic.js';
import { hoyISO } from './ofAvanceLogic.js';
import { formatearFecha } from './ofBandejaLogic.js';

const PASOS = ['Fotos y conformidad', 'Firmas', 'Guía de remisión', 'Revisión'];
export function OFEntregaWizard({ of, empresaId, datos, onClose, onEntregada }) {
  const [form, setForm] = useState(() => estadoInicialEntrega(datos));
  const [paso, setPaso] = useState(1);
  const [completado, setCompletado] = useState(0);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const raiz = useRef(null);
  const miniaturas = useMemo(() => form.fotos.map(f => { try { return URL.createObjectURL(f); } catch { return ''; } }), [form.fotos]);
  useEffect(() => () => miniaturas.forEach(u => u && URL.revokeObjectURL(u)), [miniaturas]);
  const cambiar = (k, valor, guia = false) => { setSucio(true); setForm(f => guia ? { ...f, guia: { ...f.guia, [k]: valor } } : { ...f, [k]: valor }); setErrores(e => ({ ...e, [k]: undefined })); };
  const campo = (k, label, opciones = {}) => {
    const id = `ofe-${k}`; const valor = opciones.guia ? form.guia[k] : form[k];
    const props = { id, value: valor, onChange: e => cambiar(k, e.target.value, opciones.guia), 'aria-invalid': Boolean(errores[k]), 'aria-describedby': errores[k] ? `${id}-err` : undefined };
    return <Campo key={k} id={id} label={label} requerido={opciones.requerido !== false} error={errores[k]} completo={opciones.completo}>
      {opciones.opciones ? <select {...props} className="dx-ui-select">{opciones.opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select> : opciones.textarea ? <textarea {...props} /> : <input {...props} type={opciones.tipo || 'text'} inputMode={opciones.numerico ? 'numeric' : undefined} />}
    </Campo>;
  };
  const validar = p => {
    const errs = validarPasoEntrega(form, p); setErrores(errs);
    const primero = Object.keys(errs)[0];
    if (primero) { raiz.current?.querySelector(`#ofe-${primero}`)?.focus(); return false; }
    return true;
  };
  const continuar = async e => {
    e.preventDefault(); if (!validar(paso)) return;
    if (paso < 4) { setCompletado(Math.max(completado, paso)); setPaso(paso + 1); return; }
    for (let p = 1; p <= 3; p += 1) if (!validar(p)) { setPaso(p); return; }
    setTrabajando(true); setError('');
    let resultado;
    try {
      const fotos = await Promise.all(form.fotos.map(f => subirFotoEntrega(empresaId, of.id, f)));
      const [responsable, cliente] = await Promise.all([subirFirmaEntrega(empresaId, of.id, form.firma_responsable), subirFirmaEntrega(empresaId, of.id, form.firma_cliente)]);
      resultado = await entregarOF(of.id, datosEntrega(form, fotos, responsable, cliente));
    } catch (err) {
      // Si la respuesta se perdió pero la entrega quedó registrada, se trata como éxito.
      const registrada = await cargarEntrega(of.id).catch(() => null);
      if (registrada?.entrega) {
        resultado = { numero: registrada.entrega.numero, guia_numero: registrada.entrega.guia_numero };
      } else { setError(err?.message || 'No se pudo entregar la OF.'); setTrabajando(false); return; }
    }
    let falloPdf = false;
    try { await generarYRegistrarPdfEntrega(empresaId, of); } catch { falloPdf = true; }
    onEntregada(resultado, falloPdf);
  };
  return <ModalBase titulo={`Entregar ${of.numero} al cliente`} ayuda="Se genera el acta, la guía de remisión y la garantía de cada unidad." sucio={sucio && !trabajando} onClose={() => { if (!trabajando) onClose(); }}
    pie={cerrar => <>{error && <div className="dx-ofd-server" role="alert">{error}</div>}<div className="dx-ofd-modal-actions"><button type="button" className="dx-ofd-ghost" onClick={cerrar} disabled={trabajando}>Cancelar</button>{paso > 1 && <button type="button" className="dx-ofd-ghost" onClick={() => { setErrores({}); setPaso(paso - 1); }} disabled={trabajando}>Atrás</button>}<button type="submit" form="ofe-form" className="dx-ofd-primary" disabled={trabajando}>{trabajando ? 'Procesando…' : paso === 4 ? 'Entregar y emitir acta' : 'Siguiente'}</button></div></>}>
    <nav className="dx-ofe-steps" aria-label="Pasos de entrega">{PASOS.map((nombre, i) => <button key={nombre} type="button" className={i + 1 <= completado ? 'is-done' : ''} disabled={trabajando || i + 1 >= paso || i + 1 > completado} onClick={() => { setErrores({}); setPaso(i + 1); }} aria-current={paso === i + 1 ? 'step' : undefined}>{i + 1} · {nombre}</button>)}</nav>
    <form id="ofe-form" ref={raiz} className="dx-ui-form-grid dx-ofe-form" noValidate onSubmit={continuar}>
      {paso === 1 && <>
        <Campo id="ofe-fotos" label="Fotos de la entrega" requerido error={errores.fotos} completo><label className="dx-ofe-add"><input id="ofe-fotos" className="dx-ofe-file" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={form.fotos.length >= 6} onChange={e => { cambiar('fotos', [...form.fotos, ...Array.from(e.target.files || [])].slice(0, 6)); e.target.value = ''; }} aria-invalid={Boolean(errores.fotos)} aria-describedby={errores.fotos ? 'ofe-fotos-err' : undefined} />{form.fotos.length >= 6 ? 'Máximo 6 fotos' : `Agregar fotos (${form.fotos.length} de 6)`}</label>
          {form.fotos.length > 0 && <div className="dx-ofe-fotos">{form.fotos.map((f, i) => <figure className="dx-ofe-foto" key={`${f.name}-${i}`}>{miniaturas[i] && <img src={miniaturas[i]} alt={`Foto ${i + 1} de la entrega`} />}<button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => cambiar('fotos', form.fotos.filter((_, n) => n !== i))}>×</button></figure>)}</div>}</Campo>
        {campo('conformidad', 'Conformidad del cliente', { opciones: [['', 'Elige…'], ['conforme', 'Conforme'], ['con_observaciones', 'Con observaciones']] })}
        {form.unidades.map((u, i) => <Campo key={u.unidad} id={`ofe-serie_${i}`} label={`Serie unidad ${u.unidad}`} requerido error={errores[`serie_${i}`]}><input id={`ofe-serie_${i}`} value={u.serie} maxLength={60} aria-invalid={Boolean(errores[`serie_${i}`])} onChange={e => cambiar('unidades', form.unidades.map((x, n) => n === i ? { ...x, serie: e.target.value } : x))} /></Campo>)}
        {errores.unidades && <span id="ofe-unidades" tabIndex="-1" className="dx-ui-field-error">{errores.unidades}</span>}
        {campo('observaciones', 'Observaciones', { textarea: true, completo: true, requerido: form.conformidad === 'con_observaciones' })}
      </>}
      {paso === 2 && <>{['responsable', 'cliente'].map(rol => <Campo key={rol} id={`ofe-firma_${rol}`} label={`Firma del ${rol}`} requerido error={errores[`firma_${rol}`]} completo><div id={`ofe-firma_${rol}`} tabIndex="-1"><FirmaTrazo etiqueta={`Firma del ${rol}`} valor={form[`firma_${rol}`]} onChange={v => cambiar(`firma_${rol}`, v)} /></div></Campo>)}{campo('recibe_nombre', 'Nombre de quien recibe')}{campo('recibe_dni', 'Documento de quien recibe (DNI o CE)')}</>}
      {paso === 3 && <>{campo('partida_direccion', 'Punto de partida', { guia: true, completo: true })}{campo('llegada_direccion', 'Punto de llegada', { guia: true, completo: true })}{campo('fecha_inicio_traslado', 'Inicio del traslado', { guia: true, tipo: 'date' })}{campo('peso_bruto_total', 'Peso bruto (kg)', { guia: true, tipo: 'number' })}{campo('modalidad', 'Modalidad', { guia: true, opciones: [['remitente', 'Transporte privado'], ['transportista', 'Transporte público']] })}
        {(form.guia.modalidad === 'remitente' ? [['vehiculo_placa', 'Placa'], ['conductor_nombre', 'Conductor'], ['conductor_dni', 'DNI del conductor'], ['conductor_brevete', 'Brevete']] : [['transportista_ruc', 'RUC del transportista'], ['transportista_razon_social', 'Razón social del transportista']]).map(([k, t]) => campo(k, t, { guia: true }))}</>}
      {paso === 4 && <><div className="dx-ui-field-full dx-ofe-resumen"><p>Unidades: {form.unidades.map(u => u.serie).join(', ') || 'Sin dato'}</p><p>Conformidad: {form.conformidad === 'conforme' ? 'Conforme' : 'Con observaciones'} · {form.fotos.length} fotos · firmas completas</p><p>Guía: {form.guia.partida_direccion} → {form.guia.llegada_direccion}</p><p>Garantía: {Number(form.garantia_meses) ? `hasta ${formatearFecha(finGarantia(hoyISO(), Number(form.garantia_meses)))}` : 'Sin garantía'}</p></div>{campo('garantia_meses', 'Garantía (meses)', { tipo: 'number' })}</>}
    </form>
  </ModalBase>;
}
