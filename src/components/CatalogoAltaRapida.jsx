import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import '../catalogo_alta_rapida.css';

// Alta rápida de un producto del catálogo de venta desde la Nueva OV (Admin).
// Usa las mismas RPC que Operaciones › Venta de repuestos › Catálogo de venta.
const num = v => Number(String(v ?? '').replace(',', '.'));
const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soles = v => `S/ ${(Math.round(Number(v || 0) * 100) / 100).toFixed(2)}`;

export function validarAltaRapida(f) {
  const errores = {};
  if (!f.material) errores.material = 'Elige el material de la lista.';
  const p = String(f.precio_lista ?? '').trim();
  if (p === '') errores.precio_lista = 'Indica el precio de lista.';
  else if (!(num(p) > 0)) errores.precio_lista = 'Indica un precio mayor a cero.';
  const d = String(f.descuento_maximo_pct ?? '').trim();
  if (d !== '' && !(num(d) >= 0 && num(d) <= 100)) errores.descuento_maximo_pct = 'Entre 0 y 100.';
  return errores;
}

export function CatalogoAltaRapida({ empresaId, monedaInicial = 'PEN', onCerrar, onGuardado }) {
  const [materiales, setMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ material: null, precio_lista: '', moneda: monedaInicial === 'USD' ? 'USD' : 'PEN', descuento_maximo_pct: '' });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const refs = { material: useRef(null), precio_lista: useRef(null), descuento_maximo_pct: useRef(null) };

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase.rpc('wms_catalogo_venta', { p_empresa_id: empresaId });
        if (error) throw error;
        if (vigente) setMateriales(data?.materiales || []);
      } catch (e) { if (vigente) setErrorServidor(e.message || 'No se pudieron cargar los materiales.'); }
      finally { if (vigente) setCargando(false); }
    })();
    return () => { vigente = false; };
  }, [empresaId]);

  const resultados = useMemo(() => {
    const q = normalizar(texto).trim();
    if (q.length < 2 || (f.material && texto === `${f.material.codigo} · ${f.material.descripcion}`)) return [];
    return materiales.filter(m => normalizar(`${m.codigo} ${m.descripcion}`).includes(q)).slice(0, 20);
  }, [materiales, texto, f.material]);

  const cambiar = (campo, valor) => { setF(a => ({ ...a, [campo]: valor })); setErrores(a => ({ ...a, [campo]: undefined })); setErrorServidor(''); };
  const precio = num(f.precio_lista) || 0;
  const bajoCosto = f.material && f.moneda === 'PEN' && precio > 0 && Number(f.material.costo_promedio || 0) > precio;
  const inv = c => (errores[c] ? { 'aria-invalid': 'true', 'aria-describedby': `dx-catr-${c}-err` } : {});
  const err = c => (errores[c] ? <small className="dx-ui-field-error" id={`dx-catr-${c}-err`} role="alert">{errores[c]}</small> : null);

  const guardar = async e => {
    e.preventDefault();
    const encontrados = validarAltaRapida(f);
    setErrores(encontrados);
    const primero = ['material', 'precio_lista', 'descuento_maximo_pct'].find(k => encontrados[k]);
    if (primero) { refs[primero].current?.focus(); return; }
    setOcupado(true); setErrorServidor('');
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.rpc('wms_catalogo_guardar', {
        p_empresa_id: empresaId, p_id: null, p_material_id: f.material.material_id,
        p_precio_lista: Math.round(precio * 100) / 100, p_moneda: f.moneda,
        p_descuento_maximo_pct: String(f.descuento_maximo_pct).trim() === '' ? 0 : num(f.descuento_maximo_pct), p_activo: true,
      });
      if (error) throw error;
      onGuardado(data);
    } catch (ex) { setErrorServidor(ex.message || 'No se pudo agregar el producto.'); }
    finally { setOcupado(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <form className="modal dx-ui dx-catr" role="dialog" aria-modal="true" aria-labelledby="dx-catr-t" onSubmit={guardar} noValidate>
        <div className="modal-head"><h2 id="dx-catr-t">Agregar producto al catálogo</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onCerrar} disabled={ocupado}>×</button></div>
        <div className="modal-body">
          <p className="dx-ui-sub">Elige un material del maestro y fija su precio de venta. Queda elegido en la línea de la OV.</p>
          <div className="dx-ui-field dx-catr-buscar">
            <label htmlFor="dx-catr-mat">Material<span className="dx-ui-required" aria-hidden="true">*</span></label>
            <input id="dx-catr-mat" ref={refs.material} type="search" autoComplete="off" placeholder={cargando ? 'Cargando materiales…' : 'Busca por código o descripción'}
              value={texto} disabled={cargando} role="combobox" aria-expanded={abierto && resultados.length > 0} aria-controls="dx-catr-lista" {...inv('material')}
              onChange={e => { setTexto(e.target.value); setAbierto(true); if (f.material) cambiar('material', null); }}
              onKeyDown={e => { if (e.key === 'Escape') setAbierto(false); }} />
            {abierto && resultados.length > 0 && <div className="dx-catr-pop" id="dx-catr-lista" role="listbox" aria-label="Materiales">
              {resultados.map(m => <button key={m.material_id} type="button" role="option" aria-selected={false} disabled={m.en_catalogo}
                onClick={() => { cambiar('material', m); setTexto(`${m.codigo} · ${m.descripcion}`); setAbierto(false); }}>
                <span><b>{m.codigo}</b> {m.descripcion}</span>
                <small>{m.en_catalogo ? 'Ya está en el catálogo' : `${Number(m.disponible || 0)} ${m.unidad || ''} · costo ${soles(m.costo_promedio)}`}</small>
              </button>)}
            </div>}
            {err('material')}
          </div>
          <div className="dx-ui-form-grid dx-catr-grid">
            <div className="dx-ui-field"><label htmlFor="dx-catr-precio">Precio de lista<span className="dx-ui-required" aria-hidden="true">*</span></label>
              <input id="dx-catr-precio" ref={refs.precio_lista} inputMode="decimal" value={f.precio_lista} {...inv('precio_lista')} onChange={e => cambiar('precio_lista', e.target.value)} />{err('precio_lista')}</div>
            <div className="dx-ui-field"><label htmlFor="dx-catr-moneda">Moneda<span className="dx-ui-required" aria-hidden="true">*</span></label>
              <select id="dx-catr-moneda" className="dx-ui-select" value={f.moneda} onChange={e => cambiar('moneda', e.target.value)}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select></div>
            <div className="dx-ui-field"><label htmlFor="dx-catr-desc">Descuento máximo %</label>
              <input id="dx-catr-desc" ref={refs.descuento_maximo_pct} inputMode="decimal" value={f.descuento_maximo_pct} {...inv('descuento_maximo_pct')} onChange={e => cambiar('descuento_maximo_pct', e.target.value)} />
              {err('descuento_maximo_pct') || <small className="dx-ui-field-hint">Vacío = 0.</small>}</div>
          </div>
          {f.material && <div className="dx-catr-resumen">
            <div><span>Costo promedio</span><b>{soles(f.material.costo_promedio)}</b></div>
            <div><span>Margen</span><b>{f.moneda === 'PEN' && precio > 0 ? `${(((precio - Number(f.material.costo_promedio || 0)) / precio) * 100).toFixed(1)}%` : 'Sin dato'}</b></div>
            <div><span>Disponible</span><b>{Number(f.material.disponible || 0)} {f.material.unidad || ''}</b></div>
          </div>}
          {bajoCosto && <div className="dx-catr-note amber" role="status">Aviso: el precio queda por debajo del costo promedio. Se puede guardar igual.</div>}
          {errorServidor && <div className="dx-catr-note red" role="alert">{errorServidor}</div>}
        </div>
        <div className="modal-foot dx-catr-foot">
          <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
          <button className="btn btn-primary" disabled={ocupado || cargando}>{ocupado ? 'Guardando…' : 'Agregar al catálogo'}</button>
        </div>
      </form>
    </div>
  );
}
