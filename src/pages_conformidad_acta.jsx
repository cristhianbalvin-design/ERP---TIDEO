import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { FirmaTrazoCliente } from './components/FirmaTrazoCliente.jsx';
import {
  datosDispositivoCliente, estadoEnlace, faltanteConformidad, formatoFecha, formatoFechaHora, iniciales, payloadFirma,
} from './utils/conformidadActa.js';
import './pages_conformidad_acta.css';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const llamar = async body => {
  const { data, error } = await sb.functions.invoke('acta-conformidad-firmar', { body });
  if (error) {
    let detalle = null;
    try { detalle = await error.context?.json?.(); } catch { detalle = null; }
    throw new Error(detalle?.error || 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.');
  }
  return data;
};

const Icono = ({ d, children }) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d ? <path d={d} /> : children}</svg>
);

function Marca({ emisor }) {
  if (!emisor?.razon_social) return null;
  return (
    <header className="dx-conf-brand">
      <div className="dx-conf-logo">{emisor.logo_url ? <img src={emisor.logo_url} alt="" /> : iniciales(emisor.razon_social)}</div>
      <div><b>{emisor.razon_social}</b><span>{[emisor.ruc && `RUC ${emisor.ruc}`, emisor.direccion].filter(Boolean).join(' · ')}</span></div>
    </header>
  );
}

function Estado({ tipo, titulo, children }) {
  const icono = { ok: <Icono d="M5 12l5 5 9-10" />, ya: <Icono><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></Icono>, mal: <Icono><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icono> }[tipo];
  return (
    <section className="dx-conf-card" aria-live="polite">
      <div className={`dx-conf-estado is-${tipo}`}>
        <div className="dx-conf-estado-ico">{icono}</div>
        <h2>{titulo}</h2>
        {children}
      </div>
    </section>
  );
}

// Página del enlace para un acta móvil con conformidad pendiente. Si el enlace no es de un acta
// móvil (cierres anteriores), delega en la página antigua con `renderAnterior`.
export function PaginaConformidadActa({ token, renderAnterior }) {
  const [estado, setEstado] = useState('cargando');
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState({ resultado: 'conforme', observaciones: '', nombre: '', documento: '', cargo: '', firma: null });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [visor, setVisor] = useState(null);

  useEffect(() => {
    let vigente = true;
    llamar({ accion: 'info', token })
      .then(respuesta => { if (vigente) { setDatos(respuesta); setEstado(estadoEnlace(respuesta)); } })
      .catch(e => { if (vigente) { setError(e.message); setEstado('error'); } });
    return () => { vigente = false; };
  }, [token]);

  const cambiar = (campo, valor) => { setForm(actual => ({ ...actual, [campo]: valor })); setError(''); };
  const faltante = faltanteConformidad(form);

  const firmar = async () => {
    if (faltante || enviando) { setError(faltante); return; }
    setEnviando(true);
    setError('');
    try {
      const respuesta = await llamar(payloadFirma(token, form, datosDispositivoCliente()));
      setDatos(actual => ({ ...actual, ...respuesta }));
      setEstado('firmada');
      window.scrollTo?.(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (estado === 'legacy') return renderAnterior();

  const emisor = datos?.emisor;
  let contenido;
  if (estado === 'cargando') {
    contenido = <div className="dx-conf-card"><div className="dx-conf-estado"><p>Cargando el acta…</p></div></div>;
  } else if (estado === 'invalido' || estado === 'vencido') {
    contenido = (
      <Estado tipo="mal" titulo={estado === 'vencido' ? 'Enlace vencido' : 'Enlace no válido'}>
        <p>Pide al proveedor del servicio que te envíe un enlace nuevo.</p>
      </Estado>
    );
  } else if (estado === 'error') {
    contenido = <Estado tipo="mal" titulo="No pudimos cargar el acta"><p>{error || 'Vuelve a intentarlo en unos minutos.'}</p></Estado>;
  } else if (estado === 'firmada') {
    const recien = Boolean(datos?.correo_enviado !== undefined);
    contenido = (
      <Estado tipo={recien ? 'ok' : 'ya'} titulo={recien ? 'Conformidad registrada' : 'Esta conformidad ya fue registrada'}>
        <p>El acta <b>{datos?.acta_numero}</b> quedó firmada el {formatoFechaHora(datos?.firmado_en)} (hora de Lima)</p>
        {recien && datos?.correo_enviado && datos?.correo_mask && <p>Te enviamos el PDF firmado a <b>{datos.correo_mask}</b>.</p>}
        {datos?.pdf_url && <a className="dx-conf-btn" href={datos.pdf_url} target="_blank" rel="noreferrer">Descargar acta firmada (PDF)</a>}
      </Estado>
    );
  } else {
    const d = datos || {};
    const fotos = (d.fotos || []).filter(f => f.url);
    contenido = (
      <>
        <div className="dx-conf-eyebrow">Acta de conformidad de servicio</div>
        <h1 className="dx-conf-title">{d.acta_numero}</h1>
        <p className="dx-conf-sub"><span className="dx-conf-pill is-amber"><i />Pendiente de tu conformidad</span>{d.expira_en && <span>Vence el {formatoFecha(d.expira_en)}</span>}</p>

        <section className="dx-conf-card">
          <div className="dx-conf-card-h"><h2>Servicio</h2></div>
          <div className="dx-conf-card-b">
            <dl className="dx-conf-datos">
              <div><dt>OT</dt><dd>{d.ot?.numero || '—'}</dd></div>
              <div><dt>Emitida el</dt><dd>{formatoFechaHora(d.emitida_en) || '—'}</dd></div>
              <div className="is-full"><dt>Servicio</dt><dd>{d.ot?.servicio || '—'}</dd></div>
              {d.ot?.direccion && <div className="is-full"><dt>Lugar</dt><dd>{d.ot.direccion}</dd></div>}
              <div><dt>Cliente</dt><dd>{d.cliente?.nombre || '—'}</dd></div>
              <div><dt>Horas ejecutadas</dt><dd>{d.trabajo?.horas != null ? `${Number(d.trabajo.horas)} h` : '—'}</dd></div>
              {d.trabajo?.descripcion && <div className="is-full"><dt>Trabajo realizado</dt><dd>{d.trabajo.descripcion}</dd></div>}
              {d.trabajo?.tareas?.length > 0 && <div className="is-full"><dt>Tareas</dt><dd>{d.trabajo.tareas.join(' · ')}</dd></div>}
            </dl>
          </div>
        </section>

        {d.motivo && (
          <section className="dx-conf-card">
            <div className="dx-conf-card-h"><h2>¿Por qué quedó pendiente?</h2></div>
            <div className="dx-conf-card-b"><div className="dx-conf-aviso">El técnico registró: “{d.motivo}”</div></div>
          </section>
        )}

        {fotos.length > 0 && (
          <section className="dx-conf-card">
            <div className="dx-conf-card-h"><h2>Fotos del trabajo</h2><small>{fotos.length} foto{fotos.length === 1 ? '' : 's'} · toca para ampliar</small></div>
            <div className="dx-conf-card-b">
              <div className="dx-conf-fotos">
                {fotos.map((f, i) => (
                  <button key={i} type="button" className="dx-conf-foto" onClick={() => setVisor(f.url)} aria-label={`Ampliar foto ${f.tipo === 'antes' ? 'antes' : 'después'} ${i + 1}`}>
                    <img src={f.url} alt="" loading="lazy" />
                    <span>{f.tipo === 'antes' ? 'Antes' : 'Después'}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {d.tecnico?.firma_url && (
          <section className="dx-conf-card">
            <div className="dx-conf-card-h"><h2>Firma del técnico responsable</h2></div>
            <div className="dx-conf-card-b">
              <div className="dx-conf-firma-img"><img src={d.tecnico.firma_url} alt="Firma del técnico" /></div>
              <div className="dx-conf-meta">{[d.tecnico.nombre, d.tecnico.cargo].filter(Boolean).join(' · ')}</div>
            </div>
          </section>
        )}

        <section className="dx-conf-card">
          <div className="dx-conf-card-h"><h2>Tu conformidad</h2></div>
          <div className="dx-conf-card-b">
            <div className="dx-conf-opciones" role="radiogroup" aria-label="Resultado de la conformidad">
              {[['conforme', 'Conforme', 'El servicio se hizo según lo acordado.'], ['observaciones', 'Con observaciones', 'Lo acepto, con comentarios.']].map(([valor, titulo, texto]) => (
                <button key={valor} type="button" role="radio" aria-checked={form.resultado === valor} className={`dx-conf-opcion${form.resultado === valor ? ' is-on' : ''}`} onClick={() => cambiar('resultado', valor)}>
                  <span className="dx-conf-radio" /><span><b>{titulo}</b><small>{texto}</small></span>
                </button>
              ))}
            </div>
            {form.resultado === 'observaciones' && (
              <div className="dx-conf-campo"><label htmlFor="dx-conf-obs">Observaciones *</label><textarea id="dx-conf-obs" rows={3} value={form.observaciones} onChange={e => cambiar('observaciones', e.target.value)} placeholder="Describe lo que quieres que quede registrado" /></div>
            )}
            <div className="dx-conf-campo"><label htmlFor="dx-conf-nombre">Nombre completo *</label><input id="dx-conf-nombre" autoComplete="name" value={form.nombre} onChange={e => cambiar('nombre', e.target.value)} placeholder="Nombre y apellidos" /></div>
            <div className="dx-conf-fila2">
              <div className="dx-conf-campo"><label htmlFor="dx-conf-doc">Documento *</label><input id="dx-conf-doc" inputMode="numeric" maxLength={15} value={form.documento} onChange={e => cambiar('documento', e.target.value)} placeholder="DNI o CE" /></div>
              <div className="dx-conf-campo"><label htmlFor="dx-conf-cargo">Cargo</label><input id="dx-conf-cargo" value={form.cargo} onChange={e => cambiar('cargo', e.target.value)} placeholder="Opcional" /></div>
            </div>
            <div className="dx-conf-campo"><span>Firma *</span><FirmaTrazoCliente etiqueta="Área de firma del cliente" valor={form.firma} onChange={firma => cambiar('firma', firma)} deshabilitado={enviando} /></div>
            {error && <div className="dx-conf-error" role="alert">{error}</div>}
            <button type="button" className="dx-conf-btn is-primary" disabled={Boolean(faltante) || enviando} onClick={firmar}>{enviando ? 'Registrando…' : 'Firmar y dar conformidad'}</button>
            <p className="dx-conf-legal">{faltante || 'Al firmar, se agrega tu firma al acta y te enviamos el PDF firmado por correo.'}</p>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="dx-conf-page">
      <main className="dx-conf-wrap">
        <Marca emisor={emisor} />
        {contenido}
        <div className="dx-conf-pie">Generado con OPERA by Tideo Tech &amp; Strategy</div>
      </main>
      {visor && <button type="button" className="dx-conf-visor" onClick={() => setVisor(null)} aria-label="Cerrar foto"><img src={visor} alt="" /></button>}
    </div>
  );
}
