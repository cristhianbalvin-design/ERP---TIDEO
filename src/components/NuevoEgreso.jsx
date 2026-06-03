import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { I } from '../icons.jsx';
import { FileUpload } from './FileUpload.jsx';
import { finanzasService } from '../services/finanzasService.js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { getTipoCambioHoy, convertirMonto } from '../services/tipoCambioService.js';

// ── Datos por defecto si el admin no configuró tipos ──────────────────────────
const TIPOS_GASTO_DEFECTO = [
  { id: 'def_1', nombre: 'Materiales e insumos',   categoria_er: 'Materiales',        icono: 'package'  },
  { id: 'def_2', nombre: 'Servicio de tercero',     categoria_er: 'Servicios terceros', icono: 'wrench'   },
  { id: 'def_3', nombre: 'Gasto administrativo',   categoria_er: 'Administrativos',   icono: 'building' },
  { id: 'def_4', nombre: 'Gasto de campo/OT',      categoria_er: 'Materiales',        icono: 'truck'    },
  { id: 'def_5', nombre: 'Servicio básico',         categoria_er: 'Administrativos',   icono: 'receipt'  },
  { id: 'def_6', nombre: 'Logística/transporte',   categoria_er: 'Logística',         icono: 'truck'    },
];

const METODOS_PAGO   = ['Transferencia bancaria', 'Caja chica', 'Tarjeta empresa', 'Efectivo', 'Otro'];
const TIPOS_COMP     = ['Factura', 'Boleta', 'Recibo honorarios', 'Ticket', 'Sin comprobante'];
const ICONOS_DISP    = ['package', 'wrench', 'building', 'truck', 'receipt', 'dollar', 'cart', 'settings', 'percent', 'clipboard'];

const FORM_VACIO = {
  fecha:            '',
  concepto:         '',
  monto:            '',
  moneda:           'PEN',
  centro_costo_id:  '',
  ot_vinc_id:       '',
  ya_pagado:        false,
  metodo_pago:      'Transferencia bancaria',
  referencia_pago:  '',
  fecha_vencimiento:'',
  proveedor_id:     '',
  proveedor_texto:  '',
  num_comprobante:  '',
  tipo_comprobante: 'Factura',
};

function icono(name) {
  const m = {
    package: I.package, wrench: I.wrench, building: I.building,
    truck: I.truck, receipt: I.receipt, dollar: I.dollar,
    cart: I.cart, settings: I.settings, percent: I.percent,
    clipboard: I.clipboard,
  };
  return m[name] || I.receipt;
}

// ── Componente principal ──────────────────────────────────────────────────────
// preconfig: { paso, tipoSel, form } — permite abrir directamente en paso 2
// pre-cargado (ej. desde Caja Chica con metodo_pago='Caja chica' ya_pagado=true).
export function NuevoEgreso({ onClose, onSaved, origen = 'compras_gastos', preconfig = null }) {
  const {
    empresa, authUser, centrosCosto, ots, proveedores,
    setComprasGastos, setCajaChica, setCxp,
    addNotificacion,
  } = useApp();

  // Pre-generamos el ID del gasto para poder enlazarlo a FileUpload antes de guardar
  const gastoId = useMemo(
    () => `gasto_${Math.random().toString(36).slice(2, 14)}`,
    [],
  );
  const fileRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  const [paso, setPaso]           = useState(preconfig?.paso || 1);
  const [tipoSel, setTipoSel]     = useState(preconfig?.tipoSel || null);
  const [tiposGasto, setTiposGasto] = useState([]);
  const [tc, setTc]               = useState(null);
  const [archivoUrl, setArchivoUrl] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errCeco, setErrCeco]     = useState(false);
  const [errVence, setErrVence]   = useState(false);
  const [form, setForm]           = useState({ ...FORM_VACIO, fecha: today, ...(preconfig?.form || {}) });

  const setF = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    if (k === 'centro_costo_id') setErrCeco(false);
    if (k === 'fecha_vencimiento') setErrVence(false);
  };

  const cecos       = (centrosCosto || []).filter(c => c.estado === 'activo');
  const otsActivas  = (ots || []).filter(o => !['cerrada', 'anulada'].includes(o.estado));
  const provsActivos = (proveedores || []).filter(p => p.estado !== 'inactivo');

  // Cargar tipos de gasto y tipo de cambio al montar
  useEffect(() => {
    const load = async () => {
      if (isSupabaseConfigured() && empresa?.id) {
        try {
          const data = await finanzasService.getTiposGasto(empresa.id);
          setTiposGasto(data.length ? data : TIPOS_GASTO_DEFECTO);
        } catch {
          setTiposGasto(TIPOS_GASTO_DEFECTO);
        }
      } else {
        setTiposGasto(TIPOS_GASTO_DEFECTO);
      }
      try {
        const sb = isSupabaseConfigured() ? await getSupabaseClient() : null;
        const tipoCambio = await getTipoCambioHoy(sb);
        setTc(tipoCambio);
      } catch { /* TC no disponible — formulario sigue funcionando */ }
    };
    load();
  }, [empresa?.id]);

  // Equivalente PEN cuando la moneda es distinta
  const montoPEN = useMemo(() => {
    const m = parseFloat(form.monto) || 0;
    if (form.moneda === 'PEN' || !tc) return m;
    return convertirMonto(m, form.moneda, 'PEN', tc);
  }, [form.monto, form.moneda, tc]);

  // Descripción de destino (se actualiza en paso 2 según toggle)
  const destinoLabel = form.ya_pagado
    ? (form.metodo_pago === 'Caja chica'
        ? 'compras_gastos + caja_chica'
        : 'compras_gastos (pagado)')
    : 'compras_gastos + CxP pendiente';

  // ── Paso 1: selección de tipo ─────────────────────────────────────────────
  const renderPaso1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
        Selecciona el tipo de gasto. La categoría ER se asignará automáticamente.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {tiposGasto.map(t => {
          const activo = tipoSel?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipoSel(t)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '16px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${activo ? 'var(--cyan)' : 'var(--border)'}`,
                background: activo ? 'color-mix(in srgb, var(--cyan) 8%, var(--surface))' : 'var(--surface)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ width: 22, height: 22, color: activo ? 'var(--cyan)' : 'var(--fg-muted)' }}>
                {icono(t.icono)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{t.nombre}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{t.categoria_er}</span>
            </button>
          );
        })}
      </div>

      {tipoSel && (
        <div style={{
          display: 'flex', gap: 14, padding: '12px 16px', borderRadius: 8,
          background: 'color-mix(in srgb, var(--cyan) 6%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--cyan) 25%, var(--border))',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 3 }}>Categoría ER</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {tipoSel.categoria_er}
              <span className="badge badge-cyan" style={{ marginLeft: 8, fontSize: 10 }}>automático</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 3 }}>Destino</div>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--fg-muted)' }}>{destinoLabel}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!tipoSel}
          onClick={() => setPaso(2)}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );

  // ── Paso 2: detalle y pago ────────────────────────────────────────────────
  const renderPaso2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Concepto */}
      <div className="input-group">
        <label>Concepto / descripción <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input" value={form.concepto}
          onChange={e => setF('concepto', e.target.value)}
          placeholder="Ej: Materiales para OT-045, Servicio de limpieza..."
        />
      </div>

      {/* Monto + Moneda */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div className="input-group">
          <label>Monto <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            className="input" type="number" min="0.01" step="0.01"
            value={form.monto} onChange={e => setF('monto', e.target.value)} placeholder="0.00"
          />
        </div>
        <div className="input-group">
          <label>Moneda</label>
          <select className="select" value={form.moneda} onChange={e => setF('moneda', e.target.value)}>
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      {/* Equivalente PEN si moneda != PEN */}
      {form.moneda !== 'PEN' && form.monto && (
        <div style={{
          fontSize: 12, color: 'var(--fg-muted)', padding: '8px 12px',
          background: 'var(--bg-alt)', borderRadius: 6,
        }}>
          Equivalente: <strong>S/ {montoPEN.toFixed(2)}</strong>
          {tc ? <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>TC automático</span>
               : <span style={{ marginLeft: 6, color: 'var(--orange)' }}>Sin TC disponible</span>}
        </div>
      )}

      {/* CECO (obligatorio) */}
      <div className="input-group">
        <label>Centro de Costo <span style={{ color: 'var(--danger)' }}>*</span></label>
        <select
          className={`select${errCeco ? ' input-error' : ''}`}
          value={form.centro_costo_id}
          onChange={e => setF('centro_costo_id', e.target.value)}
        >
          <option value="">— Seleccionar CECO —</option>
          {cecos.map(c => (
            <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ''}{c.nombre}</option>
          ))}
        </select>
        {errCeco && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
            El CECO es obligatorio.
          </div>
        )}
      </div>

      {/* OT vinculada (opcional) */}
      <div className="input-group">
        <label>OT vinculada <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontSize: 11 }}>(opcional)</span></label>
        <select className="select" value={form.ot_vinc_id} onChange={e => setF('ot_vinc_id', e.target.value)}>
          <option value="">— Sin OT —</option>
          {otsActivas.map(o => (
            <option key={o.id} value={o.id}>{o.codigo || o.id} {o.descripcion ? `— ${o.descripcion}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Toggle: ¿ya fue pagado? */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 8,
        background: form.ya_pagado
          ? 'color-mix(in srgb, var(--green) 8%, var(--surface))'
          : 'color-mix(in srgb, var(--orange) 6%, var(--surface))',
        border: `1px solid ${form.ya_pagado ? 'color-mix(in srgb, var(--green) 25%, var(--border))' : 'color-mix(in srgb, var(--orange) 25%, var(--border))'}`,
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>¿Este gasto ya fue pagado?</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
            {form.ya_pagado ? 'Sí — se registra como pagado' : 'No — quedará pendiente de pago (CxP)'}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{form.ya_pagado ? 'Sí' : 'No'}</span>
          <div
            onClick={() => setF('ya_pagado', !form.ya_pagado)}
            style={{
              width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
              background: form.ya_pagado ? 'var(--green)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: form.ya_pagado ? 21 : 3,
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </label>
      </div>

      {/* Campos condicionales: pagado */}
      {form.ya_pagado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label>Método de pago</label>
              <select className="select" value={form.metodo_pago} onChange={e => setF('metodo_pago', e.target.value)}>
                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Referencia / N° operación</label>
              <input className="input" value={form.referencia_pago}
                onChange={e => setF('referencia_pago', e.target.value)}
                placeholder="N° transferencia, voucher..."
              />
            </div>
          </div>
        </>
      )}

      {/* Campos condicionales: pendiente */}
      {!form.ya_pagado && (
        <>
          <div className="input-group">
            <label>Fecha de vencimiento <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className={`input${errVence ? ' input-error' : ''}`}
              type="date" value={form.fecha_vencimiento}
              onChange={e => setF('fecha_vencimiento', e.target.value)}
            />
            {errVence && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                La fecha de vencimiento es obligatoria.
              </div>
            )}
          </div>
          <div className="input-group">
            <label>Proveedor o beneficiario</label>
            <select className="select" value={form.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)}>
              <option value="">— Ingreso libre —</option>
              {provsActivos.map(p => (
                <option key={p.id} value={p.id}>{p.razon_social || p.nombre_comercial || p.id}</option>
              ))}
            </select>
            {!form.proveedor_id && (
              <input
                className="input" style={{ marginTop: 6 }}
                placeholder="Nombre si no está en el catálogo"
                value={form.proveedor_texto}
                onChange={e => setF('proveedor_texto', e.target.value)}
              />
            )}
          </div>
        </>
      )}

      {/* Comprobante */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="input-group">
          <label>N° comprobante</label>
          <input className="input" value={form.num_comprobante}
            onChange={e => setF('num_comprobante', e.target.value)}
            placeholder="F001-000123"
          />
        </div>
        <div className="input-group">
          <label>Tipo de comprobante</label>
          <select className="select" value={form.tipo_comprobante} onChange={e => setF('tipo_comprobante', e.target.value)}>
            {TIPOS_COMP.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Adjuntar comprobante */}
      <div className="input-group">
        <label>Adjuntar comprobante</label>
        <FileUpload
          ref={fileRef}
          entidadTipo="compras_gastos"
          entidadId={gastoId}
          empresaId={empresa?.id}
          categoria="comprobante"
          deferUpload={false}
          onUploaded={(adjuntos) => {
            const url = adjuntos?.[0]?.url || '';
            setArchivoUrl(url);
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <button className="btn btn-secondary" type="button" onClick={() => setPaso(1)}>← Atrás</button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            let ok = true;
            if (!form.centro_costo_id) { setErrCeco(true); ok = false; }
            if (!form.ya_pagado && !form.fecha_vencimiento) { setErrVence(true); ok = false; }
            if (!form.concepto.trim() || !parseFloat(form.monto)) return;
            if (ok) setPaso(3);
          }}
        >
          Revisar →
        </button>
      </div>
    </div>
  );

  // ── Paso 3: confirmar ─────────────────────────────────────────────────────
  const renderPaso3 = () => {
    const monto    = parseFloat(form.monto) || 0;
    const categoria = tipoSel?.categoria_er || 'Administrativos';
    const cecoNombre = cecos.find(c => c.id === form.centro_costo_id)?.nombre || '—';
    const provNombre = form.proveedor_id
      ? (provsActivos.find(p => p.id === form.proveedor_id)?.razon_social || form.proveedor_id)
      : (form.proveedor_texto || '—');

    const filas = [
      ['Tipo de gasto',  tipoSel?.nombre || '—'],
      ['Categoría ER',   <><strong>{categoria}</strong> <span className="badge badge-cyan" style={{fontSize:10}}>automático</span></>],
      ['Concepto',       form.concepto],
      ['Fecha',          form.fecha],
      ['Monto',          `${form.moneda} ${monto.toFixed(2)}${form.moneda !== 'PEN' ? ` (S/ ${montoPEN.toFixed(2)})` : ''}`],
      ['CECO',           cecoNombre],
      form.ot_vinc_id ? ['OT vinculada', otsActivas.find(o => o.id === form.ot_vinc_id)?.codigo || form.ot_vinc_id] : null,
      ['Estado pago',    form.ya_pagado ? 'Pagado' : 'Pendiente'],
      form.ya_pagado ? ['Método',    form.metodo_pago] : null,
      form.ya_pagado && form.referencia_pago ? ['Referencia', form.referencia_pago] : null,
      !form.ya_pagado ? ['Vencimiento', form.fecha_vencimiento] : null,
      !form.ya_pagado ? ['Proveedor / beneficiario', provNombre] : null,
      form.num_comprobante ? ['Comprobante', `${form.tipo_comprobante} ${form.num_comprobante}`] : null,
      archivoUrl ? ['Archivo', '✓ Adjunto cargado'] : null,
    ].filter(Boolean);

    const destinoFinal = form.ya_pagado
      ? (form.metodo_pago === 'Caja chica'
          ? 'Gasto en compras_gastos + registro en caja_chica'
          : 'Gasto registrado en compras_gastos')
      : 'Gasto registrado en compras_gastos + CxP pendiente creada';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          padding: '12px 16px', borderRadius: 8, fontSize: 13,
          background: 'color-mix(in srgb, var(--cyan) 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--cyan) 25%, var(--border))',
          fontWeight: 600,
        }}>
          {destinoFinal}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '7px 0', color: 'var(--fg-muted)', width: '42%', verticalAlign: 'top' }}>{k}</td>
                <td style={{ padding: '7px 0', fontWeight: 500, verticalAlign: 'top' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
          <button className="btn btn-secondary" type="button" onClick={() => setPaso(2)}>← Atrás</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={guardando}
            onClick={handleGuardar}
          >
            {guardando ? 'Guardando...' : `${I.save} Guardar egreso`}
          </button>
        </div>
      </div>
    );
  };

  // ── Lógica de persistencia ────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!form.centro_costo_id) { setErrCeco(true); setPaso(2); return; }
    if (!form.ya_pagado && !form.fecha_vencimiento) { setErrVence(true); setPaso(2); return; }

    setGuardando(true);
    try {
      const monto     = parseFloat(form.monto) || 0;
      const categoria = tipoSel?.categoria_er || 'Administrativos';
      const tcVal     = form.moneda !== 'PEN' && tc
        ? (form.moneda === 'USD' ? tc.usd : tc.eur)
        : null;

      // ── 1. Siempre crear compras_gastos ───────────────────────────────
      const gastoBase = {
        id:                 gastoId,
        empresa_id:         empresa.id,
        tipo:               'gasto',
        descripcion:        form.concepto.trim(),
        categoria,
        categoria_er:       categoria,
        monto,
        moneda:             form.moneda,
        ...(tcVal ? { tipo_cambio: tcVal, moneda_original: form.moneda, monto_original: monto } : {}),
        fecha:              form.fecha,
        centro_costo_id:    form.centro_costo_id,
        ot_vinc_id:         form.ot_vinc_id || null,
        tipo_comprobante:   form.tipo_comprobante,
        num_comprobante:    form.num_comprobante || null,
        archivo_factura_url: archivoUrl || null,
        origen_registro:    'backoffice',
        estado:             'registrado',
        estado_pago:        form.ya_pagado ? 'pagado' : 'pendiente',
        referencia_pago:    form.ya_pagado ? (form.referencia_pago || null) : null,
        creado_por:         authUser?.id || null,
        created_at:         new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        const sb = await getSupabaseClient();
        const insertGasto = async (p) => sb.from('compras_gastos').insert([p]).select().single();
        let gp = { ...gastoBase };
        for (let i = 0; i < 8; i++) {
          const { error } = await insertGasto(gp);
          if (!error) break;
          const col = error.message?.match(/column "([^"]+)" of relation/)?.[1]
            || error.message?.match(/'([^']+)' column/)?.[1];
          if (!col || !(col in gp)) throw error;
          delete gp[col];
        }
      }
      setComprasGastos(prev => [gastoBase, ...prev]);

      let toastMsg = 'Gasto registrado en compras_gastos';

      // ── 2a. Caja chica: gasto pagado vía caja chica ───────────────────
      if (form.ya_pagado && form.metodo_pago === 'Caja chica') {
        const ccId = `cc_${Math.random().toString(36).slice(2, 14)}`;
        const ccRecord = {
          id:                ccId,
          empresa_id:        empresa.id,
          fecha:             form.fecha,
          concepto:          form.concepto.trim(),
          monto,
          moneda:            form.moneda,
          responsable_id:    authUser?.id   || null,
          responsable_nombre: authUser?.email || null,
          ceco_id:           form.centro_costo_id,
          categoria,
          num_comprobante:   form.num_comprobante || null,
          comprobante_url:   archivoUrl || null,
          estado:            'registrado',
          origen_registro:   'backoffice',
          gasto_id:          gastoId,
          creado_por:        authUser?.id || null,
          creado_en:         new Date().toISOString(),
        };
        if (isSupabaseConfigured()) {
          await finanzasService.insertarCajaChica(ccRecord).catch(err =>
            console.warn('[NuevoEgreso] caja_chica insert:', err?.message),
          );
        }
        setCajaChica(prev => [ccRecord, ...prev]);
        toastMsg = 'Gasto registrado en compras_gastos + Caja chica';

      // ── 2b. CxP: gasto pendiente ──────────────────────────────────────
      } else if (!form.ya_pagado) {
        const cxpId = `cxp_${Math.random().toString(36).slice(2, 14)}`;
        const cxpRecord = {
          id:                cxpId,
          empresa_id:        empresa.id,
          proveedor_id:      form.proveedor_id || null,
          nombre_emisor:     !form.proveedor_id ? (form.proveedor_texto || null) : null,
          tipo_beneficiario: 'proveedor',
          concepto:          form.concepto.trim(),
          monto_total:       monto,
          moneda:            form.moneda,
          ...(tcVal ? { tipo_cambio: tcVal, moneda_original: form.moneda, monto_original: monto } : {}),
          fecha_emision:     form.fecha,
          fecha_vencimiento: form.fecha_vencimiento,
          tipo_comprobante:  form.tipo_comprobante,
          factura_numero:    form.num_comprobante || null,
          archivo_factura_url: archivoUrl || null,
          categoria_er:      categoria,
          centro_costo_id:   form.centro_costo_id,
          ot_vinc_id:        form.ot_vinc_id || null,
          gasto_id:          gastoId,
          origen:            'backoffice',
          estado:            'por_pagar',
          monto_pagado:      0,
          saldo:             monto,
          created_at:        new Date().toISOString(),
        };
        if (isSupabaseConfigured()) {
          await finanzasService.generarCxP({ ...cxpRecord, no_devengar_er: true }).catch(err =>
            console.warn('[NuevoEgreso] cxp insert:', err?.message),
          );
        }
        setCxp(prev => [cxpRecord, ...prev]);
        toastMsg = 'Gasto registrado + CxP pendiente creada';
      }

      addNotificacion(toastMsg);
      onSaved?.({ gastoId, toastMsg });
    } catch (err) {
      console.error('[NuevoEgreso] handleGuardar:', err);
      addNotificacion('Error al guardar el egreso. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  // ── Indicador de pasos ────────────────────────────────────────────────────
  const pasoLabels = ['Tipo de gasto', 'Detalle y pago', 'Confirmar'];

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 'min(620px, 96vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Nuevo egreso</div>
            <div className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>
              {pasoLabels[paso - 1]}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>

        {/* Stepper */}
        <div style={{
          display: 'flex', padding: '10px 22px', gap: 0,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-alt)',
        }}>
          {pasoLabels.map((label, idx) => {
            const num    = idx + 1;
            const activo = num === paso;
            const hecho  = num < paso;
            return (
              <div
                key={num}
                style={{ display: 'flex', alignItems: 'center', flex: 1, position: 'relative' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: hecho ? 'var(--green)' : activo ? 'var(--cyan)' : 'var(--border)',
                    color: (hecho || activo) ? '#fff' : 'var(--fg-muted)',
                    flexShrink: 0,
                  }}>
                    {hecho ? '✓' : num}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: activo ? 600 : 400, color: activo ? 'var(--fg)' : 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {idx < pasoLabels.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 8px' }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="side-panel-body">
          {paso === 1 && renderPaso1()}
          {paso === 2 && renderPaso2()}
          {paso === 3 && renderPaso3()}
        </div>
      </div>
    </>
  );
}

// ── Sub-componente para la sección admin de tipos de gasto ────────────────────
const CATS_ER = ['Materiales', 'Servicios terceros', 'Logística', 'Administrativos', 'Comerciales', 'Gastos financieros'];

export function TiposGastoAdmin() {
  const { empresa, addNotificacion } = useApp();
  const [tipos, setTipos]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel]     = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm]       = useState({ nombre: '', categoria_er: 'Materiales', icono: 'receipt', activo: true, orden: 0 });
  const [guardando, setGuardando] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const cargar = async () => {
    if (!isSupabaseConfigured() || !empresa?.id) {
      setTipos(TIPOS_GASTO_DEFECTO.map((t, i) => ({ ...t, orden: i, activo: true })));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = await getSupabaseClient();
      const { data } = await sb.from('tipos_gasto_empresa').select('*').eq('empresa_id', empresa.id).order('orden');
      setTipos(data || []);
    } catch { setTipos([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [empresa?.id]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre: '', categoria_er: 'Materiales', icono: 'receipt', activo: true, orden: tipos.length });
    setPanel(true);
  };

  const abrirEditar = (t) => {
    setEditando(t);
    setForm({ nombre: t.nombre, categoria_er: t.categoria_er, icono: t.icono, activo: t.activo, orden: t.orden });
    setPanel(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try {
      if (!isSupabaseConfigured()) {
        addNotificacion('Solo disponible con Supabase configurado.');
        return;
      }
      if (editando) {
        const updated = await finanzasService.actualizarTipoGasto(editando.id, form);
        setTipos(prev => prev.map(t => t.id === editando.id ? updated : t));
        addNotificacion('Tipo de gasto actualizado.');
      } else {
        const nuevo = await finanzasService.insertarTipoGasto({ ...form, empresa_id: empresa.id });
        setTipos(prev => [...prev, nuevo]);
        addNotificacion('Tipo de gasto creado.');
      }
      setPanel(false);
    } catch (err) {
      addNotificacion(`Error: ${err?.message || 'No se pudo guardar.'}`);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (t) => {
    if (!window.confirm(`¿Eliminar "${t.nombre}"?`)) return;
    try {
      await finanzasService.eliminarTipoGasto(t.id);
      setTipos(prev => prev.filter(x => x.id !== t.id));
      addNotificacion('Tipo de gasto eliminado.');
    } catch (err) {
      addNotificacion(`Error: ${err?.message}`);
    }
  };

  return (
    <div className="card params-card mb-6">
      <div className="card-head">
        <h3>Tipos de Gasto</h3>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={abrirNuevo}>{I.plus} Nuevo tipo</button>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>Cargando...</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría ER</th>
                <th>Ícono</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tipos.length ? tipos.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.nombre}</td>
                  <td><span className="badge badge-cyan">{t.categoria_er}</span></td>
                  <td><span style={{ width: 18, height: 18, display: 'inline-block' }}>{icono(t.icono)}</span></td>
                  <td>
                    <span className={`badge ${t.activo ? 'badge-green' : 'badge-gray'}`}>
                      {t.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => abrirEditar(t)}>{I.edit}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={() => eliminar(t)}>{I.trash}</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>
                  No hay tipos configurados. Se usarán los valores por defecto.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)} />
          <div className="side-panel" style={{ width: 'min(440px, 96vw)' }}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Parámetros · Egresos</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{editando ? 'Editar tipo' : 'Nuevo tipo de gasto'}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="input-group">
                <label>Nombre visible <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} placeholder="Ej: Materiales e insumos" />
              </div>
              <div className="input-group">
                <label>Categoría ER</label>
                <select className="select" value={form.categoria_er} onChange={e => setF('categoria_er', e.target.value)}>
                  {CATS_ER.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Ícono</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ICONOS_DISP.map(name => (
                    <button
                      key={name} type="button"
                      onClick={() => setF('icono', name)}
                      style={{
                        width: 36, height: 36, borderRadius: 8, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${form.icono === name ? 'var(--cyan)' : 'var(--border)'}`,
                        background: form.icono === name ? 'color-mix(in srgb, var(--cyan) 12%, var(--surface))' : 'var(--surface)',
                      }}
                    >
                      <span style={{ width: 16, height: 16 }}>{icono(name)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label>Orden</label>
                  <input className="input" type="number" min="0" value={form.orden} onChange={e => setF('orden', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label>Estado</label>
                  <select className="select" value={form.activo ? 'activo' : 'inactivo'} onChange={e => setF('activo', e.target.value === 'activo')}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button className="btn btn-secondary" type="button" onClick={() => setPanel(false)}>Cancelar</button>
                <button className="btn btn-primary" type="button" disabled={guardando || !form.nombre.trim()} onClick={guardar}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
