import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { MaterialAutocomplete } from './MaterialAutocomplete.jsx';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { listarProyectosOT } from '../../services/minasService.js';
import { filtrarProyectosPorCliente } from './proyectosOtLogic.js';
import {
  NON_BILLABLE_CARGOS,
  getBlockedCargoReason,
  isCargoDisabledForTrabajo,
  validateOTForm,
  makeSegmento,
  makeOperacion,
  makeMOItem,
  makeRepuestoItem,
  makeTerceroItem,
  ESPECIALIDADES,
  calcSegmentoMO,
  calcSegmentoRepuestos,
  calcSegmentoTerceros,
  calcOTTotals,
  LINEA_NEGOCIO_VALUES,
  LINEA_NEGOCIO_LABELS,
} from '../schemas/otSchema.js';

const D = ZAHORY_SAC_DATA;
const TODAY = new Date().toISOString().slice(0, 10);

export const OT_FORM_SCHEMA = {
  tipo_trabajo: ['Preventivo_PM', 'Correctivo', 'Acondicionamiento', 'Overhaul'],
  tipo_cargo: ['Cliente_Contrato', 'Interno_Plataforma', 'Garantia_Fabrica', 'Reclamo_Rework'],
  required: ['linea_negocio', 'cliente_id', 'contrato_id', 'equipo', 'lugar_ejecucion', 'tipo_trabajo', 'tipo_cargo', 'tecnico', 'descripcion'],
  conditional: {
    motivo_retrabajo: "required when tipo_cargo === 'Reclamo_Rework'",
    ingreso_facturable_usd: "forced to 0 when tipo_cargo in NON_BILLABLE_CARGOS",
  },
};

const TIPO_TRABAJO = [
  ['Preventivo_PM', 'Preventivo PM'],
  ['Correctivo', 'Correctivo'],
  ['Acondicionamiento', 'Acondicionamiento'],
  ['Overhaul', 'Overhaul'],
];

const TIPO_CARGO = [
  ['Cliente_Contrato', 'Cliente / Contrato — facturable al cliente'],
  ['Interno_Plataforma', 'Interno plataforma — costo absorbido por la plataforma'],
  ['Garantia_Fabrica', 'Garantía Fábrica — recuperable del fabricante'],
  ['Reclamo_Rework',   'Reclamo / Rework — retrabajo no facturable'],
];

const LUGAR_EJECUCION = [
  ['Campo_Mina', 'Campo / Mina'],
  ['Taller', 'Taller'],
  ['Taller_Cliente', 'Taller / Cliente'],
];

const cargoLabel = (v) => TIPO_CARGO.find(([c]) => c === v)?.[1] || v;
const trabajoLabel = (v) => TIPO_TRABAJO.find(([t]) => t === v)?.[1] || v;
const CARGOS_NO_FACTURABLES_DBS = ['Interno_Plataforma', 'Garantia_Fabrica', 'Reclamo_Rework'];
const noFacturable = (cargo) => CARGOS_NO_FACTURABLES_DBS.includes(cargo) || NON_BILLABLE_CARGOS.includes(cargo);
const nombreCliente = (cliente) => cliente?.nombre_comercial || cliente?.razon_social || cliente?.razonSocial || cliente?.id || '';
const descripcionObjetoCosto = (objeto) => objeto?.nombre || objeto?.objeto || objeto?.descripcion || objeto?.numero || '';
// El maestro usa categorías de flota personalizadas (por ejemplo, "Maquinaria pesada").
// Se excluyen únicamente las categorías que no pueden ser equipos operativos.
const CATEGORIAS_NO_FLOTA = new Set([
  'MUEBLE', 'MOBILIARIO', 'INMUEBLE', 'INFORMATICA',
  'ACTIVO INTANGIBLE', 'INTANGIBLE', 'ACTIVO NO DEPRECIABLE', 'OTRO',
]);
const esActivoDeFlota = (activo) => !CATEGORIAS_NO_FLOTA.has(String(activo?.tipo_categoria || '').trim().toUpperCase());
const generarNumeroOT = () => `OT-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random() * 1000).toString().padStart(4, '0')}`;
const generarIdOT = () => `ot_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.floor(Math.random() * 1000000)}`}`;
const esErrorNumeroDuplicado = (error) =>
  error?.code === '23505' || /duplicate key|empresa_id.*numero|numero.*empresa_id/i.test(error?.message || '');

const mensajeErrorGuardadoOT = (error) => {
  const mensaje = String(error?.message || 'No se pudo guardar la OT.');
  if (error?.code === '42501' || /row-level security|permission denied|no tienes acceso|membres/i.test(mensaje)) {
    return 'No tienes permiso para crear OTs en la empresa o sociedad activa.';
  }
  if (error?.code === '23503') {
    return 'La OS, contrato, CECO o CEBE seleccionado ya no es válido para esta empresa o sociedad.';
  }
  if (/ordenes_trabajo_horometro_raiz_equipo_chk/i.test(mensaje)) {
    return 'El horómetro actual es obligatorio cuando la OT tiene un contrato o equipo asociado.';
  }
  if (error?.code === '23514' || /ordenes_trabajo_(tipo_trabajo|cargo_financiero|combinacion_dbs|motivo_rework|horometro|raiz_costo)/i.test(mensaje)) {
    return 'La combinación de datos DBS no es válida. Revisa la clasificación, raíz de costo y horómetro.';
  }
  return mensaje;
};

const inferUnidadMinera = (contrato) => {
  if (!contrato) return '';
  if (contrato.unidad_minera) return contrato.unidad_minera;
  const m = contrato.descripcion?.match(/Unidad\s+(.+)$/i);
  if (m) return m[1].trim();
  return contrato.descripcion?.split('–').pop()?.trim() || contrato.cliente || '';
};

const textoMinimoGarantizado = (contrato) => {
  if (contrato?.minimo_facturable == null) return '';
  const valorYUnidad = [
    Number(contrato.minimo_facturable).toLocaleString('es-PE'),
    contrato.unidad_minimo_facturable,
  ].filter(parte => parte !== null && parte !== undefined && String(parte).trim() !== '');
  const periodicidad = contrato.periodicidad_minimo_facturable;
  const sufijoPeriodicidad = periodicidad !== null && periodicidad !== undefined && String(periodicidad).trim() !== ''
    ? ` / ${periodicidad}`
    : '';
  return `Mínimo garantizado: ${valorYUnidad.join(' ')}${sufijoPeriodicidad}`;
};

const hasValidSegment = (segs) =>
  segs.length > 0 && segs.every(s => s.descripcion && s.ot_operaciones.some(op => op.tipo_servicio_interno_id));

// ── Drawer de backlogs ─────────────────────────────────────────────────────

const ClienteSearchSelect = ({ clientes, value, onChange, error, disabled = false, loading = false }) => {
  const wrapperRef = useRef(null);
  const selected = clientes.find(c => c.id === value);
  const [query, setQuery] = useState(nombreCliente(selected));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(nombreCliente(selected));
  }, [selected?.id, selected?.nombre_comercial, selected?.razon_social, selected?.razonSocial]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? clientes.filter(c => [nombreCliente(c), c.razon_social, c.ruc, c.contacto, c.id]
        .some(v => String(v || '').toLowerCase().includes(normalizedQuery)))
    : clientes;

  const selectCliente = (clienteId) => {
    onChange(clienteId);
    setOpen(false);
  };

  const handleInput = (nextQuery) => {
    setQuery(nextQuery);
    setOpen(true);
    if (value && nextQuery !== nombreCliente(selected)) onChange('');
  };

  return (
    <div className="search-select" ref={wrapperRef}>
      <div className="search-select-control">
        <Icon name="search" size={14}/>
        <input
          className="input"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Buscar cliente por razon social, RUC o contacto"
          style={{ borderColor: error ? '#E53935' : undefined }}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="search-select-clear"
            onClick={() => {
              setQuery('');
              onChange('');
              setOpen(true);
            }}
            title="Limpiar cliente"
          >
            <Icon name="x" size={12}/>
          </button>
        )}
      </div>
      {open && (
        <div className="search-select-menu">
          {loading ? (
            <div className="search-select-empty">Cargando clientes...</div>
          ) : filtered.map(c => (
            <button
              type="button"
              key={c.id}
              className={"search-select-option" + (c.id === value ? " active" : "")}
              onPointerDown={e => {
                e.preventDefault();
                e.stopPropagation();
                selectCliente(c.id);
              }}
            >
              <span>
                <b>{nombreCliente(c)}</b>
                <small>{c.ruc || 'Sin RUC'}{c.contacto ? ` - ${c.contacto}` : ''}</small>
              </span>
              {c.id === value && <Icon name="check" size={13}/>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="search-select-empty">No se encontraron clientes activos.</div>
          )}
        </div>
      )}
    </div>
  );
};

const BacklogDrawer = ({ open, equipo, selected, onClose, onToggle }) => {
  const rows = D.backlog.filter(b => !equipo || b.eq === equipo);
  return (
    <div className="dx-ot-backdrop" hidden={!open} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}>
      <aside className="card" style={{ width: 460, maxWidth: '96vw', minWidth: 0, height: '100vh', borderRadius: 0, overflow: 'auto' }}>
        <div className="card-header" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <h3>Vincular Hallazgos / Backlog</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar panel de hallazgos y backlog" style={{ marginLeft: 'auto' }} onClick={onClose}><Icon name="x" size={12}/></button>
        </div>
        <div style={{ padding: 14 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            El backlog es adjunto técnico — ya no define el origen de la OT.
          </div>
          {rows.map(b => (
            <label key={b.bkl} style={{ display: 'block', border: '1px solid var(--card-border)', borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'pointer', background: selected.includes(b.bkl) ? 'var(--green-soft)' : 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={selected.includes(b.bkl)} onChange={() => onToggle(b.bkl)} />
                <span className="ot-code">{b.bkl}</span>
                <span className="chip">{b.sistema}</span>
                <span className="badge" style={{ marginLeft: 'auto', background: b.prioridad === 'Emergencia' ? '#E53935' : 'var(--navy)', color: 'white' }}>{b.score}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>{b.hallazgo}</div>
            </label>
          ))}
          {rows.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 30 }}>No hay backlogs para este equipo.</div>}
        </div>
      </aside>
    </div>
  );
};


const getBannerImpacto = (cargo) => {
  switch (cargo) {
    case 'Cliente_Contrato':
      return { bg: 'rgba(34,197,94,0.08)', border: '#22c55e', icon: '✓', color: '#22c55e',
               title: 'Trabajo Facturable — cubierto por el cliente',
               desc: 'El costo de esta OT se recupera en la liquidación mensual del contrato.' };
    case 'Interno_Zahory':
      return { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', icon: '⚠', color: '#f59e0b',
               title: 'No facturable — costo absorbido por la plataforma',
               desc: 'Este costo se registra como gasto operativo interno. No se factura al cliente.' };
    case 'Garantia_Fabrica':
      return { bg: 'rgba(139,92,246,0.08)', border: '#8b5cf6', icon: '→', color: '#8b5cf6',
               title: 'No Facturable — recuperable del fabricante',
               desc: 'El costo es gestionado como reclamo de garantía con el fabricante del equipo.' };
    case 'Reclamo_Rework':
      return { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', icon: '✗', color: '#ef4444',
               title: 'No facturable — retrabajo propio de la plataforma',
               desc: 'Trabajo correctivo por defecto de ejecución previo. El motivo es obligatorio.' };
    default: return null;
  }
};

// ── Barra inferior fija (Sticky Bottom Bar) ────────────────────────────────

const StickyTotals = ({ segmentos, tipoCargo, ingreso, centroCosto, objetoCostoId, valid, guardando, onCancel, onSave }) => {
  const totals = useMemo(() => calcOTTotals(segmentos), [segmentos]);
  const ingresoNum = noFacturable(tipoCargo) ? 0 : Number(ingreso || 0);
  const margen = totals.total > 0 && ingresoNum > 0
    ? ((ingresoNum - totals.total) / ingresoNum * 100).toFixed(1)
    : null;
  const isInternal = noFacturable(tipoCargo);

  const Col = ({ label, value, color, text }) => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 20px', borderRight: '1px solid var(--card-border)', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{label}</div>
      {text
        ? <div style={{ fontSize: 15, fontWeight: 700, color }}>{text}</div>
        : <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: color || (value > 0 ? 'var(--navy)' : 'var(--text-muted)') }}>${Number(value).toFixed(0)}</div>
      }
    </div>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 'var(--sidebar-w)', right: 0, zIndex: 50,
      background: 'white',
      borderTop: '1px solid var(--card-border)',
      boxShadow: '0 -10px 15px -3px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'stretch', height: 62,
    }}>

      {/* Bloque de imputación CC + objeto de costo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', borderRight: '1px solid var(--card-border)', flexShrink: 0,
      }}>
        {centroCosto ? (
          <>
            <span style={{
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
              padding: '2px 7px', borderRadius: 5, border: '1px solid rgba(245,158,11,0.25)',
              whiteSpace: 'nowrap',
            }}>
              {centroCosto}
            </span>
            {objetoCostoId && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {objetoCostoId}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 10, color: '#ef4444', whiteSpace: 'nowrap' }}>
            ⚠ Sin CC asignado
          </span>
        )}
      </div>

      {/* Columnas de desglose — cada una ocupa flex:1 */}
      <Col label="Mano de Obra"      value={totals.mo} />
      <Col label="Repuestos"         value={totals.repuestos} />
      <Col label="Terceros"          value={totals.terceros} />
      <Col
        label="Ingreso facturable"
        value={ingresoNum}
        color={isInternal ? 'var(--text-muted)' : 'var(--green)'}
        text={isInternal ? '—' : undefined}
      />
      {margen !== null && (
        <Col
          label="Margen"
          text={`${margen}%`}
          color={Number(margen) >= 0 ? 'var(--green)' : '#E53935'}
        />
      )}

      {/* Gran Total + badge + botones */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', flexShrink: 0,
        borderLeft: '2px solid var(--card-border)',
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Gran Total OT</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', lineHeight: 1 }}>${totals.total.toFixed(0)}</div>
        </div>
        <div style={{
          padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: isInternal ? 'var(--orange-soft)' : 'var(--green-soft)',
          color: isInternal ? '#C15D00' : '#1B5E20',
          border: isInternal ? '1px solid #FFD9A8' : '1px solid #C8E6C9',
          whiteSpace: 'nowrap',
        }}>
          <Icon name={isInternal ? 'alert' : 'check'} size={11}/>
          {' '}{isInternal ? 'Pérdida / Inversión' : 'Facturable'}
        </div>
        <div style={{ width: 1, height: 36, background: 'var(--card-border)' }} />
        <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" disabled={!valid || guardando} onClick={onSave}>
          <Icon name="check" size={13}/> {guardando ? 'Guardando OT...' : 'Guardar OT'}
        </button>
      </div>
    </div>
  );
};

// ── SegmentoCard: accordion con 3 tabs de estimación ──────────────────────

const SegmentoCard = ({
  seg, isOnly, onPatch, onRemove, empresaId, sociedadId, permiteEscritura, tiposServicio, cargandoTiposServicio,
  errorTiposServicio, tecnicos, cargandoTecnicos, cuadrillas, cargandoCuadrillas,
  errorCuadrillas,
}) => {
  const [tab, setTab] = useState('mo');

  const patchEst = (tipo, idx, patch) =>
    onPatch({ [tipo]: seg[tipo].map((item, i) => i === idx ? { ...item, ...patch } : item) });
  const addEst = (tipo, factory) =>
    onPatch({ [tipo]: [...seg[tipo], factory()] });
  const removeEst = (tipo, idx) =>
    onPatch({ [tipo]: seg[tipo].filter((_, i) => i !== idx) });

  const addOp = () =>
    onPatch({ ot_operaciones: [...seg.ot_operaciones, makeOperacion(seg.ot_operaciones.length + 1)] });
  const removeOp = (oi) =>
    onPatch({ ot_operaciones: seg.ot_operaciones.filter((_, i) => i !== oi) });
  const patchOp = (oi, patch) =>
    onPatch({ ot_operaciones: seg.ot_operaciones.map((op, i) => i === oi ? { ...op, ...patch } : op) });

  const aplicarCuadrilla = (cuadrillaId) => {
    const cuadrilla = cuadrillas.find(item => item.id === cuadrillaId);
    if (!cuadrilla) return;

    const tecnicosDisponibles = new Map(tecnicos.map(tecnico => [tecnico.id, tecnico]));
    const tecnicoIds = (cuadrilla.cuadrilla_miembros || [])
      .map(miembro => miembro.tecnico_id)
      .filter(tecnicoId => tecnicosDisponibles.has(tecnicoId));

    onPatch({
      ot_operaciones: seg.ot_operaciones.map((operacion, indice) => ({
        ...operacion,
        tecnico_id: tecnicoIds[indice] || '',
      })),
    });
  };

  const totalMO  = calcSegmentoMO(seg);
  const totalRep = calcSegmentoRepuestos(seg);
  const totalTer = calcSegmentoTerceros(seg);
  const totalSeg = totalMO + totalRep + totalTer;

  const TABS = [
    { id: 'mo',        label: 'MO',        total: totalMO  },
    { id: 'repuestos', label: 'Repuestos', total: totalRep },
    { id: 'terceros',  label: 'Terceros',  total: totalTer },
  ];

  const tabBtn = (t) => ({
    padding: '7px 14px', fontSize: 12, border: 'none', cursor: 'pointer', background: 'none',
    fontWeight: tab === t.id ? 700 : 400,
    borderBottom: tab === t.id ? '2px solid var(--cyan)' : '2px solid transparent',
    color: tab === t.id ? 'var(--cyan)' : 'var(--text-muted)',
  });

  return (
    <div style={{ border: '1px solid var(--card-border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>

      {/* ── Cabecera del segmento ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '66px 1fr auto auto', gap: 8, padding: '8px 12px', background: '#F0F4F8', borderBottom: '1px solid var(--card-border)', alignItems: 'center' }}>
        <input className="input" value={seg.codigo} placeholder="01"
          onChange={e => onPatch({ codigo: e.target.value })}
          style={{ textAlign: 'center', fontSize: 12, padding: 5 }} />
        <input className="input" value={seg.descripcion} placeholder="Descripción del segmento *"
          onChange={e => onPatch({ descripcion: e.target.value })}
          style={{ fontSize: 13 }} />
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, minWidth: 80, textAlign: 'right', color: totalSeg > 0 ? 'var(--navy)' : 'var(--text-muted)' }}>
          ${totalSeg.toFixed(0)}
        </span>
        {!isOnly && (
          <button className="btn btn-ghost btn-sm" style={{ color: '#E53935' }} onClick={onRemove} title="Eliminar segmento">
            <Icon name="x" size={12}/>
          </button>
        )}
      </div>

      {/* ── Operaciones ── */}
      <div style={{ padding: '8px 12px 6px', background: '#FAFCFF', borderBottom: '1px solid var(--card-border)' }}>
        <div className="input-group" style={{ marginBottom: 8, maxWidth: 360 }}>
          <label style={{ fontSize: 11 }}>Aplicar cuadrilla</label>
          <select
            className="input"
            value=""
            disabled={cargandoCuadrillas}
            onChange={e => aplicarCuadrilla(e.target.value)}
            title="Distribuye los miembros disponibles entre las operaciones de este segmento"
            style={{ fontSize: 12, padding: '4px 8px', background: cargandoCuadrillas ? '#ECEFF1' : undefined }}
          >
            <option value="">{cargandoCuadrillas ? 'Cargando cuadrillas...' : '-- Rellenar técnicos del segmento --'}</option>
            {cuadrillas.map(cuadrilla => (
              <option key={cuadrilla.id} value={cuadrilla.id}>
                {cuadrilla.nombre}{cuadrilla.especialidad_principal ? ` · ${cuadrilla.especialidad_principal}` : ''}
              </option>
            ))}
          </select>
          {errorCuadrillas && (
            <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
              No se pudieron cargar las cuadrillas: {errorCuadrillas}
            </div>
          )}
        </div>
        {seg.ot_operaciones.map((op, oi) => (
          <div key={oi} style={{ display: 'grid', gridTemplateColumns: '16px 60px minmax(180px, 1fr) minmax(150px, .65fr) auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>↳</span>
            <input className="input" value={op.codigo} placeholder="01"
              onChange={e => patchOp(oi, { codigo: e.target.value })}
              style={{ textAlign: 'center', fontSize: 12, padding: '4px 6px' }} />
            <select className="input" value={op.tipo_servicio_interno_id || ''}
              disabled={cargandoTiposServicio}
              onChange={e => {
                const tipoServicio = tiposServicio.find(tipo => tipo.id === e.target.value);
                patchOp(oi, {
                  tipo_servicio_interno_id: e.target.value,
                  descripcion: tipoServicio?.nombre || '',
                });
              }}
              style={{ fontSize: 12, padding: '4px 8px', background: cargandoTiposServicio ? '#ECEFF1' : undefined }}>
              <option value="">{cargandoTiposServicio ? 'Cargando operaciones...' : '-- Seleccionar operación --'}</option>
              {tiposServicio.map(tipoServicio => (
                <option key={tipoServicio.id} value={tipoServicio.id}>
                  {tipoServicio.codigo} - {tipoServicio.nombre}{tipoServicio.facturable === false ? ' · No facturable' : ''}
                </option>
              ))}
            </select>
            <select className="input" value={op.tecnico_id || ''}
              disabled={cargandoTecnicos}
              onChange={e => patchOp(oi, { tecnico_id: e.target.value })}
              title="Técnico asignado a esta operación (opcional)"
              style={{ minWidth: 0, fontSize: 12, padding: '4px 8px', background: cargandoTecnicos ? '#ECEFF1' : undefined }}>
              <option value="">{cargandoTecnicos ? 'Cargando técnicos...' : '-- Sin técnico asignado --'}</option>
              {tecnicos.map(tecnico => (
                <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>
              ))}
            </select>
            {seg.ot_operaciones.length > 1 && (
              <button className="btn btn-ghost btn-sm" style={{ color: '#E53935', padding: '4px 6px' }}
                onClick={() => removeOp(oi)} title="Eliminar operación">
                <Icon name="x" size={11}/>
              </button>
            )}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--cyan)' }} onClick={addOp}>
          <Icon name="plus" size={11}/> Agregar Operación
        </button>
        {errorTiposServicio && (
          <div style={{ fontSize: 11, color: '#E53935', marginTop: 6 }}>
            No se pudieron cargar las operaciones: {errorTiposServicio}
          </div>
        )}
      </div>

      {/* ── Tabs de estimación ── */}
      <div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', background: '#F8FAFC' }}>
          {TABS.map(t => (
            <button key={t.id} style={tabBtn(t)} onClick={() => setTab(t.id)}>
              {t.label}
              <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.85 }}>${t.total.toFixed(0)}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: 12, minHeight: 80 }}>

          {/* MO Tab */}
          {tab === 'mo' && (
            <div>
              {seg.estimacion_mano_obra.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 64px 80px 24px', gap: 6, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}>
                  <span>Especialidad</span>
                  <span style={{ textAlign: 'center' }}>Técnicos</span>
                  <span style={{ textAlign: 'center' }}>Horas</span>
                  <span style={{ textAlign: 'right' }}>Subtotal</span>
                  <span/>
                </div>
              )}
              {seg.estimacion_mano_obra.map((item, i) => {
                const esp = ESPECIALIDADES.find(e => e.id === item.especialidad_id);
                const costo = (esp?.tarifaUSD || 0) * Number(item.cantidad_tecnicos || 1) * Number(item.horas_estimadas || 0);
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 64px 80px 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <select className="input" value={item.especialidad_id}
                      onChange={e => patchEst('estimacion_mano_obra', i, { especialidad_id: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 6px' }}>
                      <option value="">-- Especialidad --</option>
                      {ESPECIALIDADES.map(e => (
                        <option key={e.id} value={e.id}>{e.label} · ${e.tarifaUSD}/h</option>
                      ))}
                    </select>
                    <input type="number" className="input" min={1} value={item.cantidad_tecnicos}
                      onChange={e => patchEst('estimacion_mano_obra', i, { cantidad_tecnicos: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 4px', textAlign: 'center' }} title="Cantidad de técnicos" />
                    <input type="number" className="input" min={0.5} step={0.5} value={item.horas_estimadas}
                      onChange={e => patchEst('estimacion_mano_obra', i, { horas_estimadas: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 4px', textAlign: 'center' }} title="Horas estimadas" />
                    <span className="mono" style={{ fontSize: 12, textAlign: 'right', fontWeight: 600, color: costo > 0 ? 'var(--navy)' : 'var(--text-muted)' }}>
                      ${costo.toFixed(0)}
                    </span>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#E53935', padding: '3px 5px' }}
                      onClick={() => removeEst('estimacion_mano_obra', i)}>
                      <Icon name="x" size={10}/>
                    </button>
                  </div>
                );
              })}
              {seg.estimacion_mano_obra.length === 0 && (
                <div className="muted" style={{ fontSize: 12, paddingBottom: 8 }}>Sin líneas de MO. Agrega las especialidades requeridas.</div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--cyan)' }}
                onClick={() => addEst('estimacion_mano_obra', makeMOItem)}>
                <Icon name="plus" size={11}/> Agregar especialidad
              </button>
            </div>
          )}

          {/* Repuestos Tab */}
          {tab === 'repuestos' && (
            <div>
              {seg.estimacion_repuestos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 80px 24px', gap: 6, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}>
                  <span>Repuesto</span>
                  <span style={{ textAlign: 'center' }}>Cant.</span>
                  <span style={{ textAlign: 'right' }}>Precio unit.</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                  <span/>
                </div>
              )}
              {seg.estimacion_repuestos.map((item, i) => {
                const linTotal = Number(item.precio_unitario || 0) * Number(item.cantidad || 0);
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 80px 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <MaterialAutocomplete
                      item={item}
                      empresaId={empresaId}
                      sociedadId={sociedadId}
                      disabled={!permiteEscritura}
                      onClear={() => patchEst('estimacion_repuestos', i, {
                        material_id: '', material_codigo: '', material_descripcion: '', disponible: 0,
                      })}
                      onSelect={(material) => patchEst('estimacion_repuestos', i, {
                        material_id: material.material_id,
                        material_codigo: material.codigo,
                        material_descripcion: material.descripcion,
                        disponible: Number(material.disponible || 0),
                        precio_unitario: Number(material.precio_unitario || 0),
                      })}
                    />
                    <input type="number" className="input" min={1} value={item.cantidad}
                      onChange={e => patchEst('estimacion_repuestos', i, { cantidad: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 4px', textAlign: 'center' }} />
                    <input type="number" className="input" min={0} step={0.01} value={item.precio_unitario}
                      onChange={e => patchEst('estimacion_repuestos', i, { precio_unitario: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 4px', textAlign: 'right' }} />
                    <span className="mono" style={{ fontSize: 12, textAlign: 'right', fontWeight: 600, color: linTotal > 0 ? 'var(--navy)' : 'var(--text-muted)' }}>
                      ${linTotal.toFixed(0)}
                    </span>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#E53935', padding: '3px 5px' }}
                      onClick={() => removeEst('estimacion_repuestos', i)}>
                      <Icon name="x" size={10}/>
                    </button>
                  </div>
                );
              })}
              {seg.estimacion_repuestos.length === 0 && (
                <div className="muted" style={{ fontSize: 12, paddingBottom: 8 }}>Sin repuestos estimados para este segmento.</div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--cyan)' }}
                onClick={() => addEst('estimacion_repuestos', makeRepuestoItem)}>
                <Icon name="plus" size={11}/> Agregar repuesto
              </button>
            </div>
          )}

          {/* Terceros Tab */}
          {tab === 'terceros' && (
            <div>
              {seg.estimacion_terceros.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input className="input" value={item.descripcion_servicio}
                    placeholder="Servicio de tercero o subcontrato..."
                    onChange={e => patchEst('estimacion_terceros', i, { descripcion_servicio: e.target.value })}
                    style={{ fontSize: 12, padding: '4px 8px' }} />
                  <input type="number" className="input" min={0} step={10} value={item.costo_estimado}
                    onChange={e => patchEst('estimacion_terceros', i, { costo_estimado: e.target.value })}
                    style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} placeholder="$ USD" />
                  <button className="btn btn-ghost btn-sm" style={{ color: '#E53935', padding: '3px 5px' }}
                    onClick={() => removeEst('estimacion_terceros', i)}>
                    <Icon name="x" size={10}/>
                  </button>
                </div>
              ))}
              {seg.estimacion_terceros.length === 0 && (
                <div className="muted" style={{ fontSize: 12, paddingBottom: 8 }}>Sin servicios de terceros o subcontratos.</div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--cyan)' }}
                onClick={() => addEst('estimacion_terceros', makeTerceroItem)}>
                <Icon name="plus" size={11}/> Agregar tercero
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Página principal ───────────────────────────────────────────────────────

const CC_DESC = {
  'FLO-ALQ':  'Flota & Alquileres — costo recuperable del cliente',
  'OPS-INT':  'Operaciones internas — costo absorbido por la plataforma',
  'PROD-MAE': 'Producción / Maestranza — costo de fabricación',
  'PROD-SOL': 'Producción / Soldadura — costo de fabricación',
};

export const CrearOTPage = ({ onNav, routeParams = {} }) => {
  const sesionOperativa = useSesionOperativa();
  const [pasoActual, setPasoActual] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [segmentos, setSegmentos] = useState([makeSegmento()]);
  const [backlogs, setBacklogs] = useState([]);
  const [creada, setCreada] = useState(null);

  // ── Estado DBS (C1, C2, C5, C6) ────────────────────────────────────────
  const [objetoCostoTipo, setObjetoCostoTipo] = useState('contrato');
  const [propietarioEquipoOS, setPropietarioEquipoOS] = useState('cliente');
  const [errorDBS, setErrorDBS] = useState(null);
  const [horometroSugerido, setHorometroSugerido] = useState(null);
  const [clientesReales, setClientesReales] = useState([]);
  const [proyectosOt, setProyectosOt] = useState([]);
  const [cargandoProyectosOt, setCargandoProyectosOt] = useState(false);
  const [osClientesReales, setOsClientesReales] = useState([]);
  const [contratosAlquilerReales, setContratosAlquilerReales] = useState([]);
  const [centrosCostoReales, setCentrosCostoReales] = useState([]);
  const [centrosBeneficioReales, setCentrosBeneficioReales] = useState([]);
  const [unidadesMinerasReales, setUnidadesMinerasReales] = useState([]);
  const [equiposInternosReales, setEquiposInternosReales] = useState([]);
  const [equiposClienteReales, setEquiposClienteReales] = useState([]);
  const [equiposContratoReales, setEquiposContratoReales] = useState([]);
  const [tecnicosReales, setTecnicosReales] = useState([]);
  const [cuadrillasReales, setCuadrillasReales] = useState([]);
  const [tiposServicioInterno, setTiposServicioInterno] = useState([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [cargandoObjetoCosto, setCargandoObjetoCosto] = useState(false);
  const [cargandoCentrosCosto, setCargandoCentrosCosto] = useState(false);
  const [cargandoCentrosBeneficio, setCargandoCentrosBeneficio] = useState(false);
  const [cargandoUnidadesMineras, setCargandoUnidadesMineras] = useState(false);
  const [cargandoEquiposInternos, setCargandoEquiposInternos] = useState(false);
  const [cargandoEquiposCliente, setCargandoEquiposCliente] = useState(false);
  const [cargandoEquiposContrato, setCargandoEquiposContrato] = useState(false);
  const [cargandoTecnicos, setCargandoTecnicos] = useState(false);
  const [cargandoCuadrillas, setCargandoCuadrillas] = useState(false);
  const [cargandoTiposServicio, setCargandoTiposServicio] = useState(false);
  const [errorClientes, setErrorClientes] = useState(null);
  const [errorObjetoCosto, setErrorObjetoCosto] = useState(null);
  const [errorCentrosCosto, setErrorCentrosCosto] = useState(null);
  const [errorCentrosBeneficio, setErrorCentrosBeneficio] = useState(null);
  const [errorUnidadesMineras, setErrorUnidadesMineras] = useState(null);
  const [errorEquiposInternos, setErrorEquiposInternos] = useState(null);
  const [errorEquiposCliente, setErrorEquiposCliente] = useState(null);
  const [errorEquiposContrato, setErrorEquiposContrato] = useState(null);
  const [errorTecnicos, setErrorTecnicos] = useState(null);
  const [errorCuadrillas, setErrorCuadrillas] = useState(null);
  const [errorTiposServicio, setErrorTiposServicio] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);
  const [form, setForm] = useState({
    lineaNegocio: '',
    clienteId: '',
    proyectoId: '',
    contratoId: '',
    equipo: '',
    objeto_costo_id: null,
    lugarEjecucion: 'Campo_Mina',
    unidadMinera: '',
    tipoTrabajo: 'Correctivo',
    tipoCargo: 'Cliente_Contrato',
    tecnico: '',
    descripcion: '',
    motivoRetrabajo: '',
    fechaProgramadaInicio: TODAY,
    fechaAprobacionComercial: '',
    ingreso: 0,
    centro_costo: null,
    centro_beneficio_id: null,
    horometroApertura: '',
  });
  const proyectosOtCliente = useMemo(() => filtrarProyectosPorCliente(proyectosOt, form.clienteId), [proyectosOt, form.clienteId]);
  const proyectoSeleccionadoOt = proyectosOtCliente.find(proyecto => String(proyecto.id) === String(form.proyectoId));
  const proyectoResumen = form.proyectoId && proyectoSeleccionadoOt
    ? `${proyectoSeleccionadoOt.mina_nombre ? `${proyectoSeleccionadoOt.mina_nombre} · ` : ''}${proyectoSeleccionadoOt.codigo} · ${proyectoSeleccionadoOt.nombre}`
    : 'Sin proyecto';

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId) { setProyectosOt([]); return () => { vigente = false; }; }
    setCargandoProyectosOt(true);
    listarProyectosOT({ empresa_id: sesionOperativa.empresaId })
      .then(data => { if (vigente) setProyectosOt(Array.isArray(data) ? data : []); })
      .catch(() => { if (vigente) setProyectosOt([]); })
      .finally(() => { if (vigente) setCargandoProyectosOt(false); });
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId]);

  const irAPaso = (paso) => {
    setPasoActual(paso);
    document.querySelector('.dx-ot-steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Preservar contexto de navegación desde Backlog / Bandeja
  useEffect(() => {
    const contextoStr = localStorage.getItem('zahory_ot_contexto');
    if (contextoStr) {
      try {
        const ctx = JSON.parse(contextoStr);
        const eqContrato = D.contratos.find(c => c.equiposScope?.includes(ctx.equipo_id));
        const cc = eqContrato?.centro_costo || 'FLO-ALQ';
        setForm(prev => ({
          ...prev,
          clienteId:    eqContrato ? eqContrato.clienteId : '',
          contratoId:   eqContrato ? eqContrato.id        : '',
          equipo:       ctx.equipo_id  || '',
          centro_costo: cc,
          objeto_costo_id: eqContrato ? eqContrato.id : ctx.equipo_id || null,
          tipoTrabajo:  ctx.tipo_trabajo     || 'Correctivo',
          tipoCargo:    ctx.cargo_financiero  || 'Cliente_Contrato',
          descripcion:  ctx.descripcion       || '',
          lineaNegocio: 'flota_alquileres',
        }));
        if (ctx.backlog_origen_id) setBacklogs([ctx.backlog_origen_id]);
        localStorage.removeItem('zahory_ot_contexto');
      } catch (e) {
        console.error('Error leyendo contexto de OT:', e);
      }
    }
  }, []);

  // ── Datos derivados ─────────────────────────────────────────────────────
  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || !sesionOperativa.permiteEscritura) {
      setClientesReales([]);
      setCargandoClientes(false);
      return () => { vigente = false; };
    }

    setCargandoClientes(true);
    setErrorClientes(null);
    getSupabaseClient()
      .from('cuentas')
      .select('id,nombre_comercial,razon_social,ruc,estado')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('estado', 'activo')
      .order('nombre_comercial')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setClientesReales([]);
          setErrorClientes(error.message);
        } else {
          setClientesReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setClientesReales([]);
          setErrorClientes(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoClientes(false);
      });

    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.permiteEscritura]);

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId) {
      setCuadrillasReales([]);
      setCargandoCuadrillas(false);
      setErrorCuadrillas(null);
      return () => { vigente = false; };
    }

    setCargandoCuadrillas(true);
    setErrorCuadrillas(null);
    getSupabaseClient()
      .from('cuadrillas')
      .select('id,nombre,especialidad_principal,cuadrilla_miembros(id,tecnico_id)')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('activa', true)
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setCuadrillasReales([]);
          setErrorCuadrillas(error.message);
        } else {
          setCuadrillasReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setCuadrillasReales([]);
          setErrorCuadrillas(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoCuadrillas(false);
      });

    return () => { vigente = false; };
  }, [sesionOperativa.empresaId]);

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || !sesionOperativa.permiteEscritura) {
      setTiposServicioInterno([]);
      setCargandoTiposServicio(false);
      return () => { vigente = false; };
    }

    setCargandoTiposServicio(true);
    setErrorTiposServicio(null);
    getSupabaseClient()
      .from('tipos_servicio_interno')
      .select('id,codigo,nombre,clasificacion,facturable,estado')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('estado', 'activo')
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setTiposServicioInterno([]);
          setErrorTiposServicio(error.message);
        } else {
          setTiposServicioInterno(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setTiposServicioInterno([]);
          setErrorTiposServicio(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoTiposServicio(false);
      });

    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.permiteEscritura]);

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId || !sesionOperativa.permiteEscritura) {
      setTecnicosReales([]);
      setCargandoTecnicos(false);
      return () => { vigente = false; };
    }

    setCargandoTecnicos(true);
    setErrorTecnicos(null);
    getSupabaseClient()
      .from('personal_operativo')
      .select('id,nombre,especialidad,estado,tarifa_hora')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('estado', 'disponible')
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setTecnicosReales([]);
          setErrorTecnicos(error.message);
        } else {
          setTecnicosReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setTecnicosReales([]);
          setErrorTecnicos(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoTecnicos(false);
      });

    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.permiteEscritura]);

  useEffect(() => {
    let vigente = true;
    if (
      objetoCostoTipo !== 'equipo_interno'
      && !(objetoCostoTipo === 'os_cliente' && propietarioEquipoOS === 'propio')
      || !sesionOperativa.empresaId
      || !sesionOperativa.permiteEscritura
    ) {
      setEquiposInternosReales([]);
      setCargandoEquiposInternos(false);
      return () => { vigente = false; };
    }

    setCargandoEquiposInternos(true);
    setErrorEquiposInternos(null);
    getSupabaseClient()
      .from('activos')
      .select('id,codigo,nombre,marca,modelo,tipo_categoria,centro_costo_id')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('propietario_tipo', 'propio')
      .neq('estado', 'dado_baja')
      .order('codigo')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setEquiposInternosReales([]);
          setErrorEquiposInternos(error.message);
        } else {
          setEquiposInternosReales((data || []).filter(esActivoDeFlota));
        }
      })
      .catch(error => {
        if (vigente) {
          setEquiposInternosReales([]);
          setErrorEquiposInternos(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoEquiposInternos(false);
      });

    return () => { vigente = false; };
  }, [
    objetoCostoTipo,
    propietarioEquipoOS,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
  ]);

  useEffect(() => {
    let vigente = true;
    if (
      objetoCostoTipo !== 'os_cliente'
      || !sesionOperativa.empresaId
      || !sesionOperativa.permiteEscritura
      || !form.clienteId
    ) {
      setEquiposClienteReales([]);
      setCargandoEquiposCliente(false);
      return () => { vigente = false; };
    }

    setCargandoEquiposCliente(true);
    setErrorEquiposCliente(null);
    getSupabaseClient()
      .from('activos')
      .select('id,codigo,nombre,marca,modelo,placa_serie,estado')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('propietario_tipo', 'cliente')
      .eq('cliente_propietario_id', form.clienteId)
      .neq('estado', 'dado_baja')
      .order('codigo')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setEquiposClienteReales([]);
          setErrorEquiposCliente(error.message);
        } else {
          setEquiposClienteReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setEquiposClienteReales([]);
          setErrorEquiposCliente(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoEquiposCliente(false);
      });

    return () => { vigente = false; };
  }, [
    form.clienteId,
    objetoCostoTipo,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
  ]);

  useEffect(() => {
    let vigente = true;
    if (
      !sesionOperativa.empresaId
      || !sesionOperativa.sociedadId
      || !sesionOperativa.permiteEscritura
    ) {
      setCentrosCostoReales([]);
      setCargandoCentrosCosto(false);
      return () => { vigente = false; };
    }

    setCargandoCentrosCosto(true);
    setErrorCentrosCosto(null);
    getSupabaseClient()
      .from('centros_costo')
      .select('id,nombre,codigo,cebe_id')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('estado', 'activo')
      .eq('sociedad_id', sesionOperativa.sociedadId)
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setCentrosCostoReales([]);
          setErrorCentrosCosto(error.message);
        } else {
          setCentrosCostoReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setCentrosCostoReales([]);
          setErrorCentrosCosto(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoCentrosCosto(false);
      });

    return () => { vigente = false; };
  }, [
    objetoCostoTipo,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
    sesionOperativa.sociedadId,
  ]);

  useEffect(() => {
    let vigente = true;
    if (
      objetoCostoTipo !== 'os_cliente'
      || !sesionOperativa.empresaId
      || !sesionOperativa.sociedadId
      || !sesionOperativa.permiteEscritura
    ) {
      setCentrosBeneficioReales([]);
      setCargandoCentrosBeneficio(false);
      return () => { vigente = false; };
    }

    setCargandoCentrosBeneficio(true);
    setErrorCentrosBeneficio(null);
    getSupabaseClient()
      .from('centros_beneficio')
      .select('id,nombre,codigo')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('estado', 'activo')
      .eq('sociedad_id', sesionOperativa.sociedadId)
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setCentrosBeneficioReales([]);
          setErrorCentrosBeneficio(error.message);
        } else {
          setCentrosBeneficioReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setCentrosBeneficioReales([]);
          setErrorCentrosBeneficio(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoCentrosBeneficio(false);
      });

    return () => { vigente = false; };
  }, [
    objetoCostoTipo,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
    sesionOperativa.sociedadId,
  ]);

  useEffect(() => {
    let vigente = true;
    if (
      form.lugarEjecucion !== 'Campo_Mina'
      || !sesionOperativa.empresaId
      || !sesionOperativa.permiteEscritura
    ) {
      setUnidadesMinerasReales([]);
      setCargandoUnidadesMineras(false);
      return () => { vigente = false; };
    }

    setCargandoUnidadesMineras(true);
    setErrorUnidadesMineras(null);
    getSupabaseClient()
      .from('sedes')
      .select('id,codigo,nombre')
      .eq('empresa_id', sesionOperativa.empresaId)
      .eq('tipo', 'unidad_minera')
      .eq('estado', 'activo')
      .order('nombre')
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setUnidadesMinerasReales([]);
          setErrorUnidadesMineras(error.message);
        } else {
          setUnidadesMinerasReales(data || []);
        }
      })
      .catch(error => {
        if (vigente) {
          setUnidadesMinerasReales([]);
          setErrorUnidadesMineras(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoUnidadesMineras(false);
      });

    return () => { vigente = false; };
  }, [
    form.lugarEjecucion,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
  ]);

  useEffect(() => {
    let vigente = true;
    if (
      !sesionOperativa.empresaId
      || !sesionOperativa.permiteEscritura
      || !form.clienteId
      || objetoCostoTipo === 'equipo_interno'
    ) {
      setOsClientesReales([]);
      setContratosAlquilerReales([]);
      setCargandoObjetoCosto(false);
      return () => { vigente = false; };
    }

    setCargandoObjetoCosto(true);
    setErrorObjetoCosto(null);
    const hoy = new Date().toISOString().slice(0, 10);
    let consulta = objetoCostoTipo === 'os_cliente'
      ? getSupabaseClient()
        .from('os_clientes')
        .select('id,numero,nombre,cuenta_id,sociedad_id,estado,moneda,fecha_inicio,fecha_fin,centro_beneficio_id')
        .eq('empresa_id', sesionOperativa.empresaId)
        .eq('cuenta_id', form.clienteId)
        .order('numero')
      : getSupabaseClient()
        .from('contratos_alquiler')
        .select('id,numero,cuenta_id,sociedad_id,estado,fecha_inicio,fecha_fin,moneda,unidad_minera,objeto,minimo_facturable,unidad_minimo_facturable,periodicidad_minimo_facturable,centro_costo_id,centro_beneficio_id,meta_dmr')
        .eq('empresa_id', sesionOperativa.empresaId)
        .eq('cuenta_id', form.clienteId)
        .eq('estado', 'vigente')
        .lte('fecha_inicio', hoy)
        .gte('fecha_fin', hoy)
        .order('numero');
    if (sesionOperativa.sociedadId) consulta = consulta.eq('sociedad_id', sesionOperativa.sociedadId);

    consulta
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setOsClientesReales([]);
          setContratosAlquilerReales([]);
          setErrorObjetoCosto(error.message);
        } else if (objetoCostoTipo === 'os_cliente') {
          setOsClientesReales(data || []);
          setContratosAlquilerReales([]);
        } else {
          setContratosAlquilerReales(data || []);
          setOsClientesReales([]);
        }
      })
      .catch(error => {
        if (vigente) {
          setOsClientesReales([]);
          setContratosAlquilerReales([]);
          setErrorObjetoCosto(error.message);
        }
      })
      .finally(() => {
        if (vigente) setCargandoObjetoCosto(false);
      });

    return () => { vigente = false; };
  }, [
    form.clienteId,
    objetoCostoTipo,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
    sesionOperativa.sociedadId,
  ]);

  const cliente = useMemo(() => clientesReales.find(c => c.id === form.clienteId), [clientesReales, form.clienteId]);
  const objetosCostoFiltrados = useMemo(
    () => (objetoCostoTipo === 'os_cliente' ? osClientesReales : contratosAlquilerReales)
      .map(objeto => ({ ...objeto, descripcion: descripcionObjetoCosto(objeto) })),
    [contratosAlquilerReales, objetoCostoTipo, osClientesReales],
  );
  const contrato = useMemo(() => {
    if (objetoCostoTipo === 'equipo_interno') return null;
    return objetosCostoFiltrados.find(c => c.id === form.contratoId);
  }, [form.contratoId, objetoCostoTipo, objetosCostoFiltrados]);

  useEffect(() => {
    let vigente = true;
    if (
      objetoCostoTipo !== 'contrato'
      || !contrato?.id
      || !sesionOperativa.empresaId
      || !sesionOperativa.permiteEscritura
    ) {
      setEquiposContratoReales([]);
      setCargandoEquiposContrato(false);
      setErrorEquiposContrato(null);
      return () => { vigente = false; };
    }

    const cargarEquiposContrato = async () => {
      setCargandoEquiposContrato(true);
      setErrorEquiposContrato(null);
      try {
        const supabase = getSupabaseClient();
        const { data: relaciones, error: relacionesError } = await supabase
          .from('contratos_alquiler_equipos')
          .select('equipo_id,tarifa_hora_override')
          .eq('contrato_alquiler_id', contrato.id);
        if (relacionesError) throw relacionesError;

        const equipoIds = [...new Set((relaciones || []).map(relacion => relacion.equipo_id).filter(Boolean))];
        if (!equipoIds.length) {
          if (vigente) setEquiposContratoReales([]);
          return;
        }

        const { data: activos, error: activosError } = await supabase
          .from('activos')
          .select('id,codigo,nombre,marca,modelo,estado,horometro_actual')
          .eq('empresa_id', sesionOperativa.empresaId)
          .in('id', equipoIds)
          .neq('estado', 'dado_baja');
        if (activosError) throw activosError;
        if (!vigente) return;

        const activosPorId = new Map((activos || []).map(activo => [activo.id, activo]));
        setEquiposContratoReales((relaciones || [])
          .map(relacion => {
            const activo = activosPorId.get(relacion.equipo_id);
            return activo
              ? { ...activo, tarifa_hora_override: relacion.tarifa_hora_override }
              : null;
          })
          .filter(Boolean));
      } catch (error) {
        if (vigente) {
          setEquiposContratoReales([]);
          setErrorEquiposContrato(error.message);
        }
      } finally {
        if (vigente) setCargandoEquiposContrato(false);
      }
    };

    cargarEquiposContrato();
    return () => { vigente = false; };
  }, [
    contrato?.id,
    objetoCostoTipo,
    sesionOperativa.empresaId,
    sesionOperativa.permiteEscritura,
  ]);
  const etiquetaCentroBeneficioOs = useMemo(() => {
    const centroBeneficio = centrosBeneficioReales.find(
      item => item.id === form.centro_beneficio_id,
    );
    if (centroBeneficio) {
      return [centroBeneficio.codigo, centroBeneficio.nombre].filter(Boolean).join(' - ');
    }
    if (cargandoCentrosBeneficio) return 'Cargando centro de beneficio...';
    if (errorCentrosBeneficio) return 'Centro de beneficio no disponible';
    return 'Centro de beneficio no disponible';
  }, [
    centrosBeneficioReales,
    cargandoCentrosBeneficio,
    errorCentrosBeneficio,
    form.centro_beneficio_id,
  ]);
  const equiposFiltrados = useMemo(() => {
    if (objetoCostoTipo === 'contrato') return equiposContratoReales;
    if (
      objetoCostoTipo === 'equipo_interno'
      || (objetoCostoTipo === 'os_cliente' && propietarioEquipoOS === 'propio')
    ) return equiposInternosReales;
    if (!contrato) return [];
    return D.equipos.filter(e => contrato.equiposScope?.includes(e.cod));
  }, [contrato, equiposContratoReales, equiposInternosReales, objetoCostoTipo, propietarioEquipoOS]);
  const equipo = useMemo(() => (
    objetoCostoTipo === 'equipo_interno'
      ? equiposInternosReales.find(e => e.id === form.equipo)
      : objetoCostoTipo === 'os_cliente'
        ? propietarioEquipoOS === 'propio'
          ? equiposInternosReales.find(e => e.id === form.equipo)
          : equiposClienteReales.find(e => e.id === form.equipo)
        : equiposContratoReales.find(e => e.id === form.equipo)
  ), [equiposClienteReales, equiposContratoReales, equiposInternosReales, form.equipo, objetoCostoTipo, propietarioEquipoOS]);
  const requiereCentroCostoManual = objetoCostoTipo === 'os_cliente'
    || (objetoCostoTipo === 'equipo_interno' && Boolean(form.equipo) && !equipo?.centro_costo_id);

  const resolverCebeEstructural = (centroCostoId) =>
    centrosCostoReales.find(centroCosto => centroCosto.id === centroCostoId)?.cebe_id || null;

  useEffect(() => {
    if (objetoCostoTipo !== 'equipo_interno') return;
    const centroBeneficioId = resolverCebeEstructural(form.centro_costo);
    setForm(prev => (
      prev.centro_beneficio_id === centroBeneficioId
        ? prev
        : { ...prev, centro_beneficio_id: centroBeneficioId }
    ));
  }, [centrosCostoReales, form.centro_costo, objetoCostoTipo]);

  // ── Herencia de CC (C1) ─────────────────────────────────────────────────
  const heredarCC = (tipo, id) => {
    let cc = null;
    let centroBeneficioId = null;
    if (tipo === 'contrato') {
      const c = contratosAlquilerReales.find(x => x.id === id);
      cc = c?.centro_costo_id || null;
      centroBeneficioId = c?.centro_beneficio_id || null;
    } else if (tipo === 'os_cliente') {
      const os = osClientesReales.find(x => x.id === id);
      centroBeneficioId = os?.centro_beneficio_id || null;
    } else if (tipo === 'equipo_interno') {
      const eq = equiposInternosReales.find(e => e.id === id);
      cc = eq?.centro_costo_id || null;
      centroBeneficioId = resolverCebeEstructural(cc);
    }
    setForm(prev => ({ ...prev, centro_costo: cc, centro_beneficio_id: centroBeneficioId }));
    return cc;
  };

  // ── Validación DBS en tiempo real (C5) ──────────────────────────────────
  const validarDBS = (tipo, cargo) =>
    setErrorDBS(getBlockedCargoReason(tipo, cargo) || null);

  // ── Handlers ────────────────────────────────────────────────────────────
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setCentroCostoManual = (centroCostoId) => {
    const cc = centroCostoId || null;
    setForm(prev => ({
      ...prev,
      centro_costo: cc,
      centro_beneficio_id: objetoCostoTipo === 'equipo_interno'
        ? resolverCebeEstructural(cc)
        : prev.centro_beneficio_id,
    }));
  };

  const changeObjetoCostoTipo = (tipo) => {
    setObjetoCostoTipo(tipo);
    setPropietarioEquipoOS('cliente');
    setForm(f => ({
      ...f, objeto_costo_tipo: tipo, objeto_costo_id: null,
      clienteId: '', proyectoId: '', contratoId: '', equipo: '',
      unidadMinera: '', centro_costo: null, centro_beneficio_id: null, horometroApertura: '',
    }));
    setHorometroSugerido(null);
    setBacklogs([]);
  };

  const setCliente = (clienteId) => {
    setForm(f => ({
      ...f, clienteId, contratoId: '', equipo: '',
      proyectoId: '',
      unidadMinera: '', centro_costo: null, centro_beneficio_id: null, objeto_costo_id: null, horometroApertura: '',
    }));
    setHorometroSugerido(null);
    setBacklogs([]);
  };

  // Llegada desde la ficha de OS Cliente (app principal): ?os=<id>&cliente=<cuenta_id>.
  // Se preselecciona una sola vez; después el usuario puede cambiar cualquier dato.
  const prefijoOS = useRef({ os: routeParams?.os || '', cliente: routeParams?.cliente || '', etapa: routeParams?.os && routeParams?.cliente ? 'tipo' : 'listo' });
  useEffect(() => {
    const p = prefijoOS.current;
    if (p.etapa === 'tipo') {
      p.etapa = 'cliente';
      changeObjetoCostoTipo('os_cliente');
    } else if (p.etapa === 'cliente' && objetoCostoTipo === 'os_cliente' && !form.clienteId) {
      p.etapa = 'os';
      setCliente(p.cliente);
    } else if (p.etapa === 'os' && form.clienteId === p.cliente && osClientesReales.some(o => o.id === p.os)) {
      p.etapa = 'listo';
      setContrato(p.os);
    }
  });

  const setContrato = (contratoId) => {
    const next = objetosCostoFiltrados.find(c => c.id === contratoId);
    heredarCC(objetoCostoTipo, contratoId);
    setForm(f => ({
      ...f, contratoId, equipo: '',
      unidadMinera: next?.unidad_minera || (f.lugarEjecucion === 'Campo_Mina' ? '' : inferUnidadMinera(next)),
      objeto_costo_id: contratoId,
      horometroApertura: '',
    }));
    setHorometroSugerido(null);
    setBacklogs([]);
  };

  const cambiarPropietarioEquipoOS = (propietario) => {
    setPropietarioEquipoOS(propietario);
    setForm(f => ({ ...f, equipo: '', horometroApertura: '' }));
    setHorometroSugerido(null);
    setBacklogs([]);
  };

  const handleEquipoChange = (cod) => {
    const eq = objetoCostoTipo === 'equipo_interno'
      ? equiposInternosReales.find(e => e.id === cod)
      : objetoCostoTipo === 'os_cliente'
        ? propietarioEquipoOS === 'propio'
          ? equiposInternosReales.find(e => e.id === cod)
          : equiposClienteReales.find(e => e.id === cod)
        : equiposContratoReales.find(e => e.id === cod);
    const suggested = eq?.horometro_actual ?? null;
    setHorometroSugerido(suggested);
    const extra = objetoCostoTipo === 'equipo_interno' ? { objeto_costo_id: cod } : {};
    setForm(f => ({
      ...f, equipo: cod,
      horometroApertura: suggested != null ? String(suggested) : '',
      ...extra,
    }));
    if (objetoCostoTipo === 'equipo_interno') heredarCC('equipo_interno', cod);
    setBacklogs([]);
  };

  const renderSelectorEquipoPropio = ({ requiereOS = false, mensajeSinEquipos } = {}) => {
    const bloqueado = (requiereOS && !form.contratoId)
      || cargandoEquiposInternos
      || !sesionOperativa.permiteEscritura;
    return (
      <>
        <select className="input" value={form.equipo}
          disabled={bloqueado}
          onChange={e => handleEquipoChange(e.target.value)}
          style={{
            marginTop: 4,
            background: bloqueado ? '#ECEFF1' : undefined,
            borderColor: fieldErrors.equipo ? '#E53935' : undefined,
          }}>
          <option value="">
            {requiereOS && !form.contratoId
              ? 'Seleccione primero una OS'
              : cargandoEquiposInternos
                ? 'Cargando equipos propios...'
                : '-- Seleccionar equipo propio --'}
          </option>
          {equiposInternosReales.map(equipoPropio => (
            <option key={equipoPropio.id} value={equipoPropio.id}>
              {equipoPropio.codigo} - {equipoPropio.nombre}
            </option>
          ))}
        </select>
        {errorEquiposInternos && (
          <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
            No se pudieron cargar los equipos propios: {errorEquiposInternos}
          </div>
        )}
        {!cargandoEquiposInternos && !errorEquiposInternos && (!requiereOS || form.contratoId) && equiposInternosReales.length === 0 && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            {mensajeSinEquipos || 'No hay equipos operativos de flota disponibles para esta empresa.'}
          </div>
        )}
        {fieldErrors.equipo?.[0] && (
          <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.equipo[0]}</div>
        )}
      </>
    );
  };

  const setLugarEjecucion = (lugarEjecucion) =>
    setForm(f => ({
      ...f, lugarEjecucion,
      unidadMinera: '',
    }));

  // C5 — handlers con validación DBS en tiempo real
  const handleTipoChange = (nuevoTipo) => {
    const cargo = isCargoDisabledForTrabajo(nuevoTipo, form.tipoCargo)
      ? 'Cliente_Contrato' : form.tipoCargo;
    setForm(f => ({ ...f, tipoTrabajo: nuevoTipo, tipoCargo: cargo }));
    validarDBS(nuevoTipo, cargo);
  };

  const handleCargoChange = (nuevoCargo) => {
    const noFact = CARGOS_NO_FACTURABLES_DBS;
    setForm(f => ({
      ...f, tipoCargo: nuevoCargo,
      ingreso: noFact.includes(nuevoCargo) ? 0 : f.ingreso,
    }));
    validarDBS(form.tipoTrabajo, nuevoCargo);
  };

  const toggleBacklog = (bkl) =>
    setBacklogs(list => list.includes(bkl) ? list.filter(x => x !== bkl) : [...list, bkl]);
  const addSegmento    = () => setSegmentos(list => [...list, makeSegmento(list.length + 1)]);
  const removeSegmento = (i) => setSegmentos(list => list.filter((_, idx) => idx !== i));
  const patchSegmento  = (i, patch) =>
    setSegmentos(list => list.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  // ── Validación ──────────────────────────────────────────────────────────
  const validation = validateOTForm({
    ...form, hasValidSegment: hasValidSegment(segmentos), objetoCostoTipo,
  });
  const fieldErrors = validation.fieldErrors;
  const hasCentroCosto = Boolean(form.centro_costo || form.centro_beneficio_id);
  const requiereHorometroRaiz = ['contrato', 'equipo_interno'].includes(objetoCostoTipo)
    || (objetoCostoTipo === 'os_cliente' && Boolean(form.equipo));
  const horometroRaizEquipoValido = !requiereHorometroRaiz
    || (String(form.horometroApertura || '').trim() !== '' && Number(form.horometroApertura) >= 0);
  const horometroObligatorio = form.lugarEjecucion === 'Campo_Mina' || requiereHorometroRaiz;
  // Sin equipo (OT de servicio con raíz OS Cliente) el lugar se elige igual y no hay horómetro que registrar.
  const lugarHabilitado = Boolean(form.equipo) || objetoCostoTipo === 'os_cliente';
  const valid = sesionOperativa.permiteEscritura && validation.success && !errorDBS && hasCentroCosto
    && horometroRaizEquipoValido
    && !(form.tipoCargo === 'Reclamo_Rework' && !form.motivoRetrabajo?.trim())
    && !(form.lugarEjecucion === 'Campo_Mina' && form.equipo && !form.horometroApertura);

  const extraErrors = [
    !hasCentroCosto
      && '- El centro de costo no pudo heredarse. Seleccione el objeto de costo raíz.',
    errorDBS
      && `- Combinación DBS no permitida: ${errorDBS}`,
    (form.tipoCargo === 'Reclamo_Rework' && !form.motivoRetrabajo?.trim())
      && '- El motivo del retrabajo es obligatorio.',
    (form.lugarEjecucion === 'Campo_Mina' && form.equipo && !form.horometroApertura)
      && '- El horómetro de apertura es obligatorio para OTs en campo.',
    !horometroRaizEquipoValido
      && '- El horómetro actual es obligatorio y no puede ser negativo para una OT bajo contrato, sobre equipo interno o desde una OS con equipo asociado.',
  ].filter(Boolean);

  const pendientesPorPaso = () => {
    const pendientes = [[], [], [], [], []];
    const pasoPorCampo = {
      lineaNegocio: 1, clienteId: 1, contratoId: 1, equipo: 1,
      lugarEjecucion: 2, unidadMinera: 2,
      tipoTrabajo: 3, tipoCargo: 3, motivoRetrabajo: 3, segmentos: 3,
      tecnico: 4, fechaProgramadaInicio: 4, descripcion: 5,
    };
    Object.entries(fieldErrors).forEach(([campo, mensajes]) => {
      (mensajes || []).forEach(mensaje => pendientes[(pasoPorCampo[campo] || 5) - 1].push(mensaje));
    });
    if (!hasCentroCosto) pendientes[0].push('Seleccione el objeto de costo raíz para heredar o definir el centro de costo.');
    if (!horometroRaizEquipoValido || (form.lugarEjecucion === 'Campo_Mina' && form.equipo && !form.horometroApertura)) {
      pendientes[1].push('Complete el horómetro requerido según el lugar y objeto de costo.');
    }
    if (errorDBS) pendientes[2].push(`Combinación DBS no permitida: ${errorDBS}`);
    return pendientes;
  };
  const pendientesPaso = pendientesPorPaso();
  const pasosWizard = [
    ['Contexto', 'Define la línea de negocio y el objeto de costo raíz.'],
    ['Lugar', 'Indica dónde se ejecutará el trabajo y registra el horómetro.'],
    ['Matriz DBS', 'Clasifica el trabajo y completa segmentos, mano de obra y repuestos.'],
    ['Responsable', 'Asigna responsable, fechas y datos financieros.'],
    ['Revisión', 'Revisa el resumen y agrega la descripción técnica antes de crear la OT.'],
  ];

  const guardarOT = async () => {
    if (guardando || !valid) return;

    setGuardando(true);
    setErrorGuardado(null);
    const totales = calcOTTotals(segmentos);
    const esOTDesdeOS = objetoCostoTipo === 'os_cliente';
    const payloadBase = {
      id: generarIdOT(),
      empresa_id: sesionOperativa.empresaId,
      sociedad_id: sesionOperativa.sociedadId || null,
      os_cliente_id: esOTDesdeOS ? form.contratoId : null,
      contrato_alquiler_id: objetoCostoTipo === 'contrato' ? form.contratoId : null,
      equipo_id: ['contrato', 'equipo_interno', 'os_cliente'].includes(objetoCostoTipo) ? (form.equipo || null) : null,
      cuenta_id: form.clienteId || null,
      proyecto_id: form.proyectoId || null,
      // ordenes_trabajo.servicio es NOT NULL y el formulario no tiene un campo
      // separado: la descripción técnica es el servicio registrado en esta fase.
      servicio: form.descripcion.trim(),
      descripcion: form.descripcion.trim(),
      direccion_ejecucion: form.unidadMinera || form.lugarEjecucion || null,
      fecha_programada: form.fechaProgramadaInicio,
      estado: 'programada',
      avance_pct: 0,
      costo_estimado: totales.total,
      costo_estimado_ot: totales.total,
      costo_real: 0,
      moneda: contrato?.moneda || sesionOperativa.empresa?.moneda_base || 'PEN',
      centro_costo_id: form.centro_costo || null,
      centro_beneficio_id: form.centro_beneficio_id || null,
      tipo_trabajo: form.tipoTrabajo,
      cargo_financiero: form.tipoCargo,
      linea_negocio: form.lineaNegocio || null,
      tecnico_responsable_id: form.tecnico || null,
      motivo_rework: form.tipoCargo === 'Reclamo_Rework' ? form.motivoRetrabajo.trim() : null,
      horometro_actual: requiereHorometroRaiz
        ? Number(form.horometroApertura) : null,
    };

    try {
      let guardada = null;
      let ultimoError = null;
      for (let intento = 0; intento < 5; intento += 1) {
        const numero = generarNumeroOT();
        const { data, error } = await getSupabaseClient()
          .from('ordenes_trabajo')
          .insert({ ...payloadBase, numero })
          .select('id, numero')
          .single();
        if (!error) {
          guardada = data || { id: payloadBase.id, numero };
          break;
        }
        ultimoError = error;
        if (!esErrorNumeroDuplicado(error)) throw error;
      }
      if (!guardada) throw ultimoError || new Error('No se pudo reservar un número de OT único.');

      // Las operaciones se persisten solo después de contar con el id real
      // requerido por la FK ot_tareas.ot_id.
      const tareas = segmentos.flatMap((segmento) =>
        segmento.ot_operaciones
          .filter(operacion => operacion.tipo_servicio_interno_id)
          .map((operacion) => {
            const tipoServicio = tiposServicioInterno.find(
              tipo => tipo.id === operacion.tipo_servicio_interno_id,
            );
            const tecnico = tecnicosReales.find(tecnicoItem => tecnicoItem.id === operacion.tecnico_id);
            return {
              empresa_id: sesionOperativa.empresaId,
              ot_id: guardada.id,
              titulo: [tipoServicio?.codigo, tipoServicio?.nombre].filter(Boolean).join(' - ') || operacion.descripcion,
              descripcion: segmento.descripcion || null,
              tecnico_id: tecnico?.id || null,
              tecnico_nombre: tecnico?.nombre || null,
              tecnico_tipo: tecnico ? 'operativo' : null,
              estado: 'pendiente',
              horas_estimadas: null,
              horas_reales: 0,
              avance_pct: 0,
              completada: false,
            };
          }),
      ).map((tarea, orden) => ({ ...tarea, orden }));

      let errorTareas = null;
      if (tareas.length > 0) {
        const { error } = await getSupabaseClient()
          .from('ot_tareas')
          .insert(tareas);
        errorTareas = error;
      }

      const repuestosEstimados = segmentos.flatMap((segmento) =>
        segmento.estimacion_repuestos
          .filter(item => item.material_id)
          .map(item => ({
            ot_id: guardada.id,
            segmento_id: segmento.codigo,
            material_id: item.material_id,
            cantidad_estimada: Number(item.cantidad || 0),
            precio_unitario_estimado: Number(item.precio_unitario || 0),
            almacen_id: null,
            solpe_id: null,
            empresa_id: sesionOperativa.empresaId,
            sociedad_id: sesionOperativa.sociedadId || null,
          })),
      );

      let errorRepuestos = null;
      if (repuestosEstimados.length > 0) {
        const { error } = await getSupabaseClient()
          .from('ot_segmento_repuestos')
          .insert(repuestosEstimados);
        errorRepuestos = error;
      }

      setCreada({
        ...form,
        id: guardada.id,
        numero: guardada.numero,
        backlogs,
        segmentos,
        fechaPrimerLaborReal: null,
        ingreso: noFacturable(form.tipoCargo) ? 0 : form.ingreso,
        horometro_apertura: form.horometroApertura ? Number(form.horometroApertura) : null,
        errorRepuestos: errorRepuestos
          ? `La OT ${guardada.numero} fue creada, pero sus repuestos estimados no pudieron registrarse.`
          : null,
        errorTareas: errorTareas
          ? `La OT ${guardada.numero} fue creada, pero sus tareas no pudieron registrarse. Regístralas manualmente desde Administrativo.`
          : null,
      });
    } catch (error) {
      setErrorGuardado(mensajeErrorGuardadoOT(error));
    } finally {
      setGuardando(false);
    }
  };

  if (sesionOperativa.cargando) {
    return (
      <div className="page dx-ui dx-ot-wiz">
        <div className="card dx-ot-state-card" style={{ maxWidth: 560, margin: '60px auto', padding: 24, textAlign: 'center' }}>
          Cargando la sesión operativa…
        </div>
        <FooterBrand/>
      </div>
    );
  }

  if (!sesionOperativa.usuario || !sesionOperativa.empresaId) {
    return (
      <div className="page dx-ui dx-ot-wiz">
        <div className="card dx-ot-state-card" style={{ maxWidth: 560, margin: '60px auto', padding: 24 }}>
          <h2>Sesión administrativa requerida</h2>
          <p className="sub">
            Inicia sesión en Administrativo para cargar los datos de empresa y sociedad antes de crear una OT.
          </p>
          {sesionOperativa.error && (
            <div style={{ color: '#E53935', fontSize: 12 }}>{sesionOperativa.error}</div>
          )}
        </div>
        <FooterBrand/>
      </div>
    );
  }

  // ── Pantalla de confirmación ────────────────────────────────────────────
  if (creada) {
    const t = calcOTTotals(creada.segmentos);
    const etiquetaEquipoCreada = creada.equipo
      ? [equipo?.codigo || equipo?.cod, equipo?.nombre].filter(Boolean).join(' - ') || creada.equipo
      : 'Sin equipo';
    const centroCostoCreado = centrosCostoReales.find(centroCosto => centroCosto.id === creada.centro_costo);
    const etiquetaCentroCostoCreado = centroCostoCreado
      ? [centroCostoCreado.codigo, centroCostoCreado.nombre].filter(Boolean).join(' - ')
      : 'Centro de costo no disponible';
    return (
      <div className="page dx-ui dx-ot-wiz">
        <div className="dx-ot-success" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E8F5E9', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: 'var(--green)' }}>
            <Icon name="check" size={28}/>
          </div>
          <h2>OT creada correctamente</h2>
          <div className="sub" style={{ marginBottom: 18 }}>
            <b>{creada.numero}</b> · {trabajoLabel(creada.tipoTrabajo)} · {cargoLabel(creada.tipoCargo)}
          </div>
          {creada.errorRepuestos && (
            <div className="card" style={{ padding: 14, marginBottom: 18, textAlign: 'left', color: '#b45309', borderColor: '#fcd34d', background: '#fffbeb' }}>
              {creada.errorRepuestos}
            </div>
          )}
          {creada.errorTareas && (
            <div className="card" style={{ padding: 14, marginBottom: 18, textAlign: 'left', color: '#b45309', borderColor: '#fcd34d', background: '#fffbeb' }}>
              {creada.errorTareas}
            </div>
          )}
          <div className="card" style={{ padding: 16, textAlign: 'left', marginBottom: 18 }}>
            <div><span className="muted">Equipo:</span> <b>{etiquetaEquipoCreada}</b></div>
            <div><span className="muted">CC:</span>{' '}
              <b style={{ color: '#f59e0b' }}>{etiquetaCentroCostoCreado}</b></div>
            <div><span className="muted">Segmentos:</span> <b>{creada.segmentos.length}</b></div>
            <div><span className="muted">Costo total estimado:</span> <b className="mono">${t.total.toFixed(0)}</b></div>
            <div><span className="muted">Ingreso facturable:</span>{' '}
              <b>{noFacturable(creada.tipoCargo) ? '$0.00' : `$${Number(creada.ingreso || 0).toFixed(0)}`}</b></div>
            {creada.horometro_apertura != null && (
              <div><span className="muted">Horómetro apertura:</span>{' '}
                <b className="mono">{Number(creada.horometro_apertura).toLocaleString()} h</b></div>
            )}
            <div><span className="muted">Backlogs vinculados:</span>{' '}
              <b>{creada.backlogs.length || 'Ninguno'}</b></div>
          </div>
          <button className="btn btn-primary" onClick={() => onNav('ots')}>Ver OTs</button>
        </div>
        <FooterBrand/>
      </div>
    );
  }

  // ── Render principal ────────────────────────────────────────────────────
  const bannerImpacto = getBannerImpacto(form.tipoCargo);
  const needsCliente  = objetoCostoTipo !== 'equipo_interno';

  return (
    <div className="page dx-ui dx-ot-wiz">
      <div className="page-header">
        <button type="button" className="dx-ot-back" onClick={() => onNav('ots')}>
          Volver a la bandeja
        </button>
        <div className="dx-ot-heading">
          <div className="dx-ot-eyebrow">Taller y operaciones</div>
          <h1>Nueva orden de trabajo</h1>
          <div className="sub">Creacion directa DBS · Tipo de Trabajo × Cargo Financiero</div>
        </div>
      </div>

      {!sesionOperativa.permiteEscritura && (
        <div className="card dx-ot-alert" style={{ marginBottom: 12, padding: 14, color: '#b45309' }}>
          Vista consolidada de grupo: no se permite crear ni editar OTs hasta seleccionar una sociedad operativa.
        </div>
      )}
      {errorGuardado && (
        <div className="card dx-ot-alert dx-ot-alert-error" style={{ marginBottom: 12, padding: 14, color: '#b91c1c', borderColor: '#fecaca' }}>
          No se pudo guardar la OT: {errorGuardado}
        </div>
      )}
      <nav className="dx-ot-steps" aria-label="Pasos para crear una orden de trabajo">
        {pasosWizard.map(([nombre], indice) => (
          <button key={nombre} type="button" className="dx-ot-step" aria-current={pasoActual === indice + 1 ? 'step' : undefined}
            aria-pressed={pasoActual === indice + 1} onClick={() => irAPaso(indice + 1)}>
            <span className="dx-ot-step-number">{indice + 1}</span><span className="dx-ot-step-name">{nombre}</span>
          </button>
        ))}
        <div className="dx-ot-step-compact">Paso {pasoActual} de 5 · {pasosWizard[pasoActual - 1][0]}</div>
      </nav>
      <fieldset disabled={!sesionOperativa.permiteEscritura} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div>

        {/* ── Cabecera DBS ── */}
        <div className="card dx-ot-form-card" style={{ marginBottom: 12 }}>
          <div className="card-header">
            <h3>Cabecera DBS</h3>
            <span className="hint">Jerarquia comercial · Matriz Trabajo × Cargo</span>
          </div>
          <div className="ot-form-body">

            <section className="dx-ot-step-panel" hidden={pasoActual !== 1}>
              <div className="dx-ot-step-heading"><h2>{pasosWizard[0][0]}</h2><p>{pasosWizard[0][1]}</p></div>

            {/* Sección 0 — Línea de negocio */}
            <section className="ot-form-section dx-ot-section" style={{ marginBottom: 10 }}>
              <div className="ot-form-section-title">0. Línea de negocio</div>
              <div style={{ padding: '10px 12px' }}>
                <div className="label" style={{ fontSize: 12, marginBottom: 4 }}>Línea de negocio *</div>
                <select className="input" value={form.lineaNegocio}
                  onChange={e => set('lineaNegocio', e.target.value)}
                  style={{ width: '100%', borderColor: fieldErrors.lineaNegocio ? '#E53935' : undefined }}>
                  <option value="">-- Seleccionar línea --</option>
                  {LINEA_NEGOCIO_VALUES.map(v => (
                    <option key={v} value={v}>{LINEA_NEGOCIO_LABELS[v]}</option>
                  ))}
                </select>
                {fieldErrors.lineaNegocio?.[0] && (
                  <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.lineaNegocio[0]}</div>
                )}
              </div>
            </section>

            {/* Sección 1 — Contexto comercial (C1 + C6) */}
            <section className="ot-form-section ot-form-section-popover dx-ot-section">
              <div className="ot-form-section-title">1. Contexto comercial</div>
              <div style={{ padding: '12px 12px 4px' }}>

                {/* C6 — Selector tipo objeto de costo raíz */}
                <div style={{ marginBottom: 16 }}>
                  <div className="label" style={{ fontSize: 12 }}>
                    Objeto de costo raíz *
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                      Define quién contiene y acumula el costo de esta OT
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {[
                      { key: 'contrato',       label: 'Contrato de alquiler',  desc: 'OT bajo un contrato activo de rental' },
                      { key: 'os_cliente',     label: 'OS Cliente',            desc: 'OT bajo una orden de servicio puntual' },
                      { key: 'equipo_interno', label: 'Equipo interno de plataforma', desc: 'OT interna sin contrato — overhaul, preparación' },
                    ].map(opt => (
                      <button key={opt.key} type="button"
                        className="dx-ot-object-choice"
                        aria-pressed={objetoCostoTipo === opt.key}
                        onClick={() => changeObjetoCostoTipo(opt.key)}
                        style={{
                          flex: 1, padding: '10px', textAlign: 'left', cursor: 'pointer',
                          borderRadius: 8,
                          background: objetoCostoTipo === opt.key ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                          border: objetoCostoTipo === opt.key ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--card-border)',
                        }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: objetoCostoTipo === opt.key ? '#f59e0b' : 'var(--text-muted)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cascada según tipo objeto */}
                {objetoCostoTipo === 'equipo_interno' ? (
                  <>
                  <div className="ot-form-field" style={{ marginBottom: 12 }}>
                    <div className="label" style={{ fontSize: 12 }}>Equipo (activo propio de la plataforma) *</div>
                    {renderSelectorEquipoPropio()}
                  </div>
                  </>
                ) : (
                  <div className={`ot-form-grid commercial${objetoCostoTipo === 'os_cliente' ? ' os-cliente' : ''}`}>
                    <div className="ot-form-field">
                      <div className="label" style={{ fontSize: 12 }}>Cliente *</div>
                      <ClienteSearchSelect
                        clientes={clientesReales}
                        value={form.clienteId}
                        onChange={setCliente}
                        error={Boolean(fieldErrors.clienteId)}
                        disabled={cargandoClientes || !sesionOperativa.permiteEscritura}
                        loading={cargandoClientes}
                      />
                      {errorClientes && (
                        <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                          No se pudieron cargar los clientes: {errorClientes}
                        </div>
                      )}
                      {fieldErrors.clienteId?.[0] && (
                        <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.clienteId[0]}</div>
                      )}
                    </div>
                    <div className="ot-form-field">
                      <div className="label" style={{ fontSize: 12 }}>Proyecto (opcional)</div>
                      <select className="input" value={form.proyectoId} disabled={!form.clienteId || cargandoProyectosOt || !sesionOperativa.permiteEscritura} onChange={e => set('proyectoId', e.target.value)} style={{ marginTop: 4 }}>
                        <option value="">{!form.clienteId ? 'Seleccione primero un cliente' : cargandoProyectosOt ? 'Cargando proyectos…' : 'Sin proyecto'}</option>
                        {proyectosOtCliente.map(proyecto => <option key={proyecto.id} value={proyecto.id}>{proyecto.mina_nombre ? `${proyecto.mina_nombre} · ` : ''}{proyecto.codigo} · {proyecto.nombre}</option>)}
                      </select>
                    </div>
                    <div className="ot-form-field">
                      <div className="label" style={{ fontSize: 12 }}>
                        {objetoCostoTipo === 'os_cliente' ? 'OS / Orden de Servicio *' : 'Contrato / Proyecto *'}
                      </div>
                      <select className="input" value={form.contratoId}
                        disabled={!form.clienteId || cargandoObjetoCosto}
                        onChange={e => setContrato(e.target.value)}
                        style={{ marginTop: 4, background: !form.clienteId || cargandoObjetoCosto ? '#ECEFF1' : undefined, borderColor: fieldErrors.contratoId ? '#E53935' : undefined }}>
                        <option value="">
                          {cargandoObjetoCosto
                            ? 'Cargando opciones...'
                            : form.clienteId
                            ? (objetoCostoTipo === 'os_cliente' ? '-- Seleccionar OS --' : '-- Seleccionar contrato --')
                            : 'Seleccione primero un cliente'}
                        </option>
                        {objetosCostoFiltrados.map(c => (
                          <option key={c.id} value={c.id}>{c.numero} · {c.descripcion}</option>
                        ))}
                      </select>
                      {errorObjetoCosto && (
                        <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                          No se pudieron cargar las opciones: {errorObjetoCosto}
                        </div>
                      )}
                      {fieldErrors.contratoId?.[0] && (
                        <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.contratoId[0]}</div>
                      )}
                      {objetoCostoTipo === 'contrato' && contrato && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                          {textoMinimoGarantizado(contrato) && (
                            <div>{textoMinimoGarantizado(contrato)}</div>
                          )}
                          {contrato.meta_dmr != null && (
                            <div>Meta DMR: <strong>{Number(contrato.meta_dmr).toLocaleString('es-PE')}%</strong></div>
                          )}
                        </div>
                      )}
                    </div>
                    {objetoCostoTipo === 'contrato' && (
                      <div className="ot-form-field">
                      <div className="label" style={{ fontSize: 12 }}>Activo / Equipo *</div>
                      <select className="input" value={form.equipo}
                        disabled={!form.contratoId || cargandoEquiposContrato}
                        onChange={e => handleEquipoChange(e.target.value)}
                        style={{ marginTop: 4, background: !form.contratoId || cargandoEquiposContrato ? '#ECEFF1' : undefined, borderColor: fieldErrors.equipo ? '#E53935' : undefined }}>
                        <option value="">
                          {!form.contratoId
                            ? 'Seleccione primero un contrato'
                            : cargandoEquiposContrato
                              ? 'Cargando equipos del contrato...'
                              : '-- Seleccionar equipo --'}
                        </option>
                        {equiposFiltrados.map(eq => (
                          <option key={eq.id} value={eq.id}>
                            {[eq.codigo, eq.nombre, eq.marca, eq.modelo].filter(Boolean).join(' · ')}
                          </option>
                        ))}
                      </select>
                      {errorEquiposContrato && (
                        <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                          No se pudieron cargar los equipos del contrato: {errorEquiposContrato}
                        </div>
                      )}
                      {!cargandoEquiposContrato && !errorEquiposContrato && form.contratoId && equiposFiltrados.length === 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                          Este contrato no tiene equipos operativos asignados.
                        </div>
                      )}
                      {objetoCostoTipo === 'contrato' && equipo?.tarifa_hora_override != null && contrato?.moneda && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                          Tarifa acordada para este equipo:{' '}
                          <strong>{contrato.moneda} {Number(equipo.tarifa_hora_override).toFixed(2)} / hora</strong>
                        </div>
                      )}
                      {fieldErrors.equipo?.[0] && (
                        <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.equipo[0]}</div>
                      )}
                      </div>
                    )}
                    {objetoCostoTipo === 'os_cliente' && (
                      <div className="ot-form-field">
                        <div className="label" style={{ fontSize: 12 }}>Equipo <span style={{ fontWeight: 400, color: '#64748b' }}>(opcional en servicios sin equipo)</span></div>
                        <div role="radiogroup" aria-label="Propietario del equipo" style={{ display: 'flex', gap: 12, marginTop: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                          {[
                            { value: 'propio', label: 'Propio de la empresa' },
                            { value: 'cliente', label: 'Del cliente' },
                          ].map(opcion => (
                            <label key={opcion.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: sesionOperativa.permiteEscritura ? 'pointer' : 'default', fontSize: 12 }}>
                              <input type="radio" name="propietario-equipo-os" value={opcion.value}
                                checked={propietarioEquipoOS === opcion.value}
                                disabled={!sesionOperativa.permiteEscritura}
                                onChange={() => cambiarPropietarioEquipoOS(opcion.value)} />
                              {opcion.label}
                            </label>
                          ))}
                        </div>
                        {propietarioEquipoOS === 'propio' ? (
                          renderSelectorEquipoPropio({
                            requiereOS: true,
                            mensajeSinEquipos: 'No hay equipos propios disponibles. Regístralo primero en Activos Fijos y vuelve a esta OT.',
                          })
                        ) : (
                          <>
                        <select className="input" value={form.equipo}
                          disabled={!form.contratoId || cargandoEquiposCliente || !sesionOperativa.permiteEscritura}
                          onChange={e => handleEquipoChange(e.target.value)}
                          style={{
                            marginTop: 4,
                            background: !form.contratoId || cargandoEquiposCliente || !sesionOperativa.permiteEscritura ? '#ECEFF1' : undefined,
                            borderColor: fieldErrors.equipo ? '#E53935' : undefined,
                          }}>
                          <option value="">
                            {!form.contratoId
                              ? 'Seleccione primero una OS'
                              : cargandoEquiposCliente
                                ? 'Cargando equipos del cliente...'
                                : '-- Seleccionar equipo del cliente --'}
                          </option>
                          {equiposClienteReales.map(equipoCliente => (
                            <option key={equipoCliente.id} value={equipoCliente.id}>
                              {[equipoCliente.codigo, equipoCliente.nombre, equipoCliente.placa_serie].filter(Boolean).join(' · ')}
                            </option>
                          ))}
                        </select>
                        {errorEquiposCliente && (
                          <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                            No se pudieron cargar los equipos del cliente: {errorEquiposCliente}
                          </div>
                        )}
                        {fieldErrors.equipo?.[0] && (
                          <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.equipo[0]}</div>
                        )}

                        {form.clienteId && !cargandoEquiposCliente && !equiposClienteReales.length && !errorEquiposCliente && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: '#64748b' }}>
                            <span>Este cliente no tiene activos registrados. Regístralo primero desde Recepción de Activos.</span>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNav('recepcion-activos')}>
                              Ir a Recepción de Activos
                            </button>
                          </div>
                        )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* C1 — Badge CC heredado (solo lectura) */}
                {requiereCentroCostoManual && (
                  <div className="ot-form-field" style={{ marginTop: 12, paddingBottom: 4 }}>
                    <div className="label" style={{ fontSize: 12 }}>Centro de Costo *</div>
                    <select
                      className="input"
                      value={form.centro_costo || ''}
                      disabled={cargandoCentrosCosto || !sesionOperativa.empresaId || !sesionOperativa.sociedadId}
                      onChange={e => setCentroCostoManual(e.target.value)}
                      style={{
                        marginTop: 4,
                        borderColor: !form.centro_costo ? '#E53935' : undefined,
                        background: cargandoCentrosCosto || !sesionOperativa.empresaId || !sesionOperativa.sociedadId ? '#ECEFF1' : undefined,
                      }}
                    >
                      <option value="">
                        {cargandoCentrosCosto
                          ? 'Cargando centros de costo...'
                          : '-- Seleccionar centro de costo --'}
                      </option>
                      {centrosCostoReales.map(centroCosto => (
                        <option key={centroCosto.id} value={centroCosto.id}>
                          {centroCosto.codigo} - {centroCosto.nombre}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      {objetoCostoTipo === 'os_cliente'
                        ? 'La OS no define un centro de costo: selección manual obligatoria.'
                        : 'El equipo no tiene un centro de costo asignado: selección manual obligatoria.'}
                    </div>
                    {errorCentrosCosto && (
                      <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                        No se pudieron cargar los centros de costo: {errorCentrosCosto}
                      </div>
                    )}
                  </div>
                )}
                {objetoCostoTipo === 'os_cliente' && form.centro_beneficio_id && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                    Centro de Beneficio heredado de la OS: <strong>{etiquetaCentroBeneficioOs}</strong>
                  </div>
                )}
                {objetoCostoTipo === 'equipo_interno' && form.centro_beneficio_id && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                    Centro de Beneficio heredado del CECO: <strong>{form.centro_beneficio_id}</strong>
                  </div>
                )}
                {objetoCostoTipo !== 'os_cliente' && form.centro_costo && (
                  <div style={{ marginTop: 12, paddingBottom: 4 }}>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace' }}>
                      {requiereCentroCostoManual
                        ? 'Centro de Costo (selección manual)'
                        : 'Centro de Costo (heredado automáticamente)'}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                        fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                        padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)',
                      }}>
                        {form.centro_costo}
                      </span>
                      {CC_DESC[form.centro_costo] && (
                        <span style={{ fontSize: 11, color: '#475569' }}>{CC_DESC[form.centro_costo]}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            </section>

            {/* Sección 2 — Lugar de ejecución + Horómetro (C2) */}
            <section className="dx-ot-step-panel" hidden={pasoActual !== 2}>
            <div className="dx-ot-step-heading"><h2>{pasosWizard[1][0]}</h2><p>{pasosWizard[1][1]}</p></div>
            <section className="ot-form-section dx-ot-section">
              <div className="ot-form-section-title">2. Lugar de ejecución</div>
              <div className="ot-form-grid execution">
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Lugar de Ejecucion *</div>
                  <select className="input" value={form.lugarEjecucion}
                    disabled={!lugarHabilitado}
                    onChange={e => setLugarEjecucion(e.target.value)}
                    style={{ marginTop: 4, background: !lugarHabilitado ? '#ECEFF1' : undefined }}>
                    {LUGAR_EJECUCION.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                {form.lugarEjecucion === 'Campo_Mina' ? (
                  <div className="ot-form-field">
                    <div className="label" style={{ fontSize: 12 }}>Unidad Minera *</div>
                    <select className="input" value={form.unidadMinera}
                      disabled={!lugarHabilitado || cargandoUnidadesMineras}
                      onChange={e => set('unidadMinera', e.target.value)}
                      style={{
                        marginTop: 4,
                        background: !lugarHabilitado || cargandoUnidadesMineras ? '#ECEFF1' : undefined,
                        borderColor: fieldErrors.unidadMinera ? '#E53935' : undefined,
                      }}
                    >
                      <option value="">
                        {!lugarHabilitado
                          ? 'Seleccione primero un equipo'
                          : cargandoUnidadesMineras
                            ? 'Cargando unidades mineras...'
                            : unidadesMinerasReales.length === 0
                              ? 'No hay unidades mineras activas disponibles'
                              : '-- Seleccionar unidad minera --'}
                      </option>
                      {unidadesMinerasReales.map(unidad => (
                        <option key={unidad.id} value={unidad.id}>
                          {unidad.codigo} - {unidad.nombre}
                        </option>
                      ))}
                    </select>
                    {errorUnidadesMineras && (
                      <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                        No se pudieron cargar las unidades mineras: {errorUnidadesMineras}
                      </div>
                    )}
                    {fieldErrors.unidadMinera?.[0] && (
                      <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.unidadMinera[0]}</div>
                    )}
                  </div>
                ) : form.lugarEjecucion === 'Taller_Cliente' ? (
                  <div className="ot-form-field">
                    <div className="label" style={{ fontSize: 12 }}>Taller / Cliente</div>
                    <input className="input" value={form.unidadMinera}
                      disabled={!lugarHabilitado}
                      onChange={e => set('unidadMinera', e.target.value)}
                      placeholder={lugarHabilitado ? 'Ej. Taller del cliente / sede' : 'Seleccione primero un equipo'}
                      style={{ marginTop: 4, background: !lugarHabilitado ? '#ECEFF1' : undefined }} />
                  </div>
                ) : (
                  <div className="ot-form-field">
                    <div className="label" style={{ fontSize: 12 }}>Taller / Sede</div>
                    <input className="input" value="Taller principal" readOnly style={{ marginTop: 4, background: '#F8FAFC' }} />
                  </div>
                )}
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Contexto comercial</div>
                  <div className="ot-context-box" style={{ marginTop: 4 }}>
                    {needsCliente
                      ? (cliente ? <>{nombreCliente(cliente)}{contrato && <><br/><span className="muted">{contrato.numero}</span></>}</> : <span className="muted">Sin cliente</span>)
                      : (equipo ? `Equipo interno: ${equipo.codigo || equipo.cod}` : <span className="muted">Sin equipo</span>)
                    }
                  </div>
                </div>
              </div>

              {/* C2 — Horómetro de apertura */}
              <div style={{ padding: '12px 12px 8px' }}>
                <div className="label" style={{ fontSize: 12 }}>
                  Horómetro actual del equipo{horometroObligatorio ? <span style={{ color: '#ef4444' }}> *</span> : ''}
                </div>
                {horometroSugerido != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 4px' }}>
                    Último horómetro registrado: {horometroSugerido.toLocaleString()} h
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input type="number" className="input"
                    value={form.horometroApertura}
                    onChange={e => set('horometroApertura', e.target.value)}
                    placeholder={form.equipo ? 'ej: 15200' : 'Seleccione un equipo primero'}
                    disabled={!form.equipo}
                    style={{
                      width: 200, fontFamily: 'monospace',
                      background: !form.equipo ? '#ECEFF1' : undefined,
                      borderColor: horometroObligatorio && form.equipo && !form.horometroApertura
                        ? '#E53935' : undefined,
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    horas — registrar el horómetro físico al iniciar la OT
                  </span>
                </div>
                {horometroObligatorio && form.equipo && !form.horometroApertura && (
                  <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                    El horómetro actual es obligatorio para OTs en campo, bajo contrato o con equipo asociado a la OT.
                  </div>
                )}
              </div>
            </section>
            </section>

            {/* Sección 3 — Matriz DBS (C3 + C4 + C5) */}
            <section className="dx-ot-step-panel" hidden={pasoActual !== 3}>
            <div className="dx-ot-step-heading"><h2>{pasosWizard[2][0]}</h2><p>{pasosWizard[2][1]}</p></div>
            <section className="ot-form-section dx-ot-section">
              <div className="ot-form-section-title">3. Matriz DBS</div>
              <div className="ot-form-grid dbs">
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Tipo de Trabajo *</div>
                  <div className="dx-ot-choice-group" role="group" aria-label="Tipo de trabajo">
                    {TIPO_TRABAJO.map(([v, label]) => (
                      <button key={v} type="button" className="dx-ot-choice" aria-pressed={form.tipoTrabajo === v}
                        onClick={() => handleTipoChange(v)}>{label}</button>
                    ))}
                  </div>
                </div>
                {/* C3 — Label renombrado */}
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>
                    Cargo Financiero *
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                      ¿Quién absorbe el costo de esta OT?
                    </span>
                  </div>
                  <div className="dx-ot-choice-group" role="group" aria-label="Cargo financiero" aria-invalid={Boolean(fieldErrors.tipoCargo)}>
                    {TIPO_CARGO.map(([v, label]) => {
                      const reason = getBlockedCargoReason(form.tipoTrabajo, v);
                      return (
                        <button key={v} type="button" className="dx-ot-choice" aria-pressed={form.tipoCargo === v}
                          disabled={Boolean(reason)} title={reason || undefined} onClick={() => handleCargoChange(v)}>
                          {label}{reason ? ' — bloqueado' : ''}
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.tipoCargo?.[0] && (
                    <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.tipoCargo[0]}</div>
                  )}
                </div>
              </div>

              {/* C5 — Error DBS en tiempo real */}
              {errorDBS && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6, padding: '10px 14px', margin: '8px 12px',
                  display: 'flex', gap: 8,
                }}>
                  <span style={{ color: '#ef4444', fontSize: 16 }}>✗</span>
                  <div>
                    <div style={{ color: '#ef4444', fontWeight: 600, fontSize: 12 }}>Combinación DBS no permitida</div>
                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{errorDBS}</div>
                  </div>
                </div>
              )}

              {/* C4 — Banner impacto financiero — 4 variantes */}
              {bannerImpacto && (
                <div style={{
                  background: bannerImpacto.bg,
                  borderLeft: `3px solid ${bannerImpacto.border}`,
                  borderRadius: '0 4px 4px 0',
                  padding: '10px 14px', margin: '8px 12px 12px',
                }}>
                  <div style={{ color: bannerImpacto.color, fontWeight: 600, fontSize: 12 }}>
                    {bannerImpacto.icon} {bannerImpacto.title}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>{bannerImpacto.desc}</div>
                </div>
              )}

              {/* C5 — Motivo rework dinámico */}
              {form.tipoCargo === 'Reclamo_Rework' && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div className="label" style={{ fontSize: 12 }}>
                    Motivo del retrabajo <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                      Describir la falla original y la OT que la generó (si aplica)
                    </span>
                  </div>
                  <textarea className="input" rows={3}
                    value={form.motivoRetrabajo}
                    onChange={e => set('motivoRetrabajo', e.target.value)}
                    placeholder="ej: Falla en soldadura de mando final realizada en OT-2026-031. Retrabajo por defecto de ejecución del área de taller."
                    style={{ resize: 'vertical', width: '100%', marginTop: 6, borderColor: !form.motivoRetrabajo ? '#ef4444' : undefined }}
                  />
                  {!form.motivoRetrabajo && (
                    <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                      El motivo es obligatorio para retrabajos.
                    </div>
                  )}
                </div>
              )}
            </section>
            </section>

            {/* Sección 4 — Responsable y fechas */}
            <section className="dx-ot-step-panel" hidden={pasoActual !== 4}>
            <div className="dx-ot-step-heading"><h2>{pasosWizard[3][0]}</h2><p>{pasosWizard[3][1]}</p></div>
            <section className="ot-form-section dx-ot-section">
              <div className="ot-form-section-title">4. Responsable y fechas</div>
              <div className="ot-form-grid operations">
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Técnico responsable *</div>
                  <select className="input" value={form.tecnico}
                    disabled={cargandoTecnicos || !sesionOperativa.permiteEscritura}
                    onChange={e => set('tecnico', e.target.value)}
                    style={{
                      marginTop: 4,
                      background: cargandoTecnicos || !sesionOperativa.permiteEscritura ? '#ECEFF1' : undefined,
                      borderColor: fieldErrors.tecnico ? '#E53935' : undefined,
                    }}>
                    <option value="">{cargandoTecnicos ? 'Cargando técnicos...' : '-- Seleccionar técnico --'}</option>
                    {tecnicosReales.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>)}
                  </select>
                  {errorTecnicos && (
                    <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                      No se pudieron cargar los técnicos: {errorTecnicos}
                    </div>
                  )}
                  {fieldErrors.tecnico?.[0] && (
                    <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.tecnico[0]}</div>
                  )}
                </div>
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Fecha Programada de Inicio *</div>
                  <input type="date" className="input" value={form.fechaProgramadaInicio}
                    onChange={e => set('fechaProgramadaInicio', e.target.value)}
                    style={{ marginTop: 4, borderColor: fieldErrors.fechaProgramadaInicio ? '#E53935' : undefined }} />
                  {fieldErrors.fechaProgramadaInicio?.[0] && (
                    <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>{fieldErrors.fechaProgramadaInicio[0]}</div>
                  )}
                </div>
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Ingreso facturable USD</div>
                  <input type="number" className="input"
                    value={noFacturable(form.tipoCargo) ? 0 : form.ingreso}
                    disabled={noFacturable(form.tipoCargo)}
                    onChange={e => set('ingreso', e.target.value)}
                    style={{ marginTop: 4, background: noFacturable(form.tipoCargo) ? '#ECEFF1' : undefined }} />
                </div>
                <div className="ot-form-field">
                  <div className="label" style={{ fontSize: 12 }}>Aprobacion comercial</div>
                  <input type="datetime-local" className="input" value={form.fechaAprobacionComercial}
                    onChange={e => set('fechaAprobacionComercial', e.target.value)}
                    style={{ marginTop: 4 }} />
                </div>
              </div>
            </section>
            </section>

            {/* Sección 5 — Descripción técnica */}
            <section className="dx-ot-step-panel" hidden={pasoActual !== 5}>
            <div className="dx-ot-step-heading"><h2>{pasosWizard[4][0]}</h2><p>{pasosWizard[4][1]}</p></div>
            <section className="ot-form-section dx-ot-section">
              <div className="ot-form-section-title">5. Descripción técnica</div>
              <div style={{ padding: 12 }}>
                <textarea className="input" rows={4} value={form.descripcion}
                  onChange={e => set('descripcion', e.target.value)}
                  style={{ resize: 'vertical', width: '100%' }}
                  placeholder={equipo ? `Describe el trabajo sobre ${equipo.codigo || equipo.cod}...` : 'Selecciona un equipo y describe el trabajo...'} />
              </div>
            </section>

            <div className="dx-ot-review">
              <div className="dx-ot-review-title">Resumen de la orden</div>
              {[
                ['Contexto', `Línea: ${LINEA_NEGOCIO_LABELS[form.lineaNegocio] || 'Pendiente'} · Raíz: ${{ contrato: 'Contrato', os_cliente: 'OS Cliente', equipo_interno: 'Equipo interno' }[objetoCostoTipo]} · ${nombreCliente(cliente) || 'Sin cliente'} · ${contrato?.numero || 'Sin contrato'} · ${equipo?.codigo || equipo?.cod || 'Sin equipo'} · CC ${form.centro_costo || form.centro_beneficio_id || 'sin centro'}`, 1],
                ['Proyecto', proyectoResumen, 1],
                ['Lugar', `${form.lugarEjecucion || 'Sin definir'} · ${form.unidadMinera || 'Sin unidad minera'} · Horómetro ${form.horometroApertura || 'sin registrar'}`, 2],
                ['Matriz DBS', `${trabajoLabel(form.tipoTrabajo)} · ${cargoLabel(form.tipoCargo)} · ${segmentos.length} segmento(s): ${segmentos.map(s => s.descripcion || s.codigo).join(', ')} · ${backlogs.length} backlog(s)`, 3],
                ['Responsable', `${tecnicosReales.find(t => t.id === form.tecnico)?.nombre || 'Sin responsable'} · Inicio ${form.fechaProgramadaInicio || 'sin fecha'} · Aprobación ${form.fechaAprobacionComercial || 'sin fecha'} · Ingreso USD ${noFacturable(form.tipoCargo) ? '0' : form.ingreso || '0'}`, 4],
                ['Descripción técnica', form.descripcion || 'Sin descripción técnica', 5],
              ].map(([titulo, detalle, paso]) => (
                <div className="dx-ot-review-row" key={titulo}>
                  <div><strong>{titulo}</strong><span>{detalle}</span></div>
                  <button type="button" className="dx-ot-edit" onClick={() => irAPaso(paso)}>Editar</button>
                </div>
              ))}
            </div>
            </section>

          </div>
        </div>

        {/* ── Estructura del trabajo ── */}
        <div className="dx-ot-step-panel" hidden={pasoActual !== 3}>
        <div className="card dx-ot-structure" style={{ marginBottom: 12 }}>
          <div className="card-header">
            <h3>Estructura del trabajo</h3>
            <span className="hint">Segmentos → Operaciones + estimación MO / Repuestos / Terceros</span>
          </div>
          <div style={{ padding: 14 }}>
            {segmentos.map((seg, si) => (
              <SegmentoCard
                key={si}
                seg={seg}
                isOnly={segmentos.length === 1}
                onPatch={(patch) => patchSegmento(si, patch)}
                onRemove={() => removeSegmento(si)}
                empresaId={sesionOperativa.empresaId}
                sociedadId={sesionOperativa.sociedadId}
                permiteEscritura={sesionOperativa.permiteEscritura}
                tiposServicio={tiposServicioInterno}
                cargandoTiposServicio={cargandoTiposServicio}
                errorTiposServicio={errorTiposServicio}
                tecnicos={tecnicosReales}
                cargandoTecnicos={cargandoTecnicos}
                cuadrillas={cuadrillasReales}
                cargandoCuadrillas={cargandoCuadrillas}
                errorCuadrillas={errorCuadrillas}
              />
            ))}
            <button className="btn btn-secondary btn-sm" onClick={addSegmento}>
              <Icon name="plus" size={12}/> Agregar Segmento
            </button>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} disabled={!form.equipo}
              onClick={() => setDrawerOpen(true)}>
              <Icon name="orders" size={12}/> Vincular Hallazgos/Backlog{backlogs.length ? ` (${backlogs.length})` : ''}
            </button>
          </div>
        </div>
        </div>

      </div>

      </fieldset>

      {/* Lista de validaciones al guardar (C5 + C1 + C2) */}
      {pasoActual === 5 && (!valid || extraErrors.length > 0) && (
        <div style={{ color: '#E53935', fontSize: 12, marginTop: 12 }}>
          <Icon name="alert" size={12}/> Completa los campos obligatorios y las validaciones DBS.
          {validation.issues.map((issue, i) => (
            <div key={i} style={{ marginTop: 3 }}>- {issue.message}</div>
          ))}
          {extraErrors.map((msg, i) => (
            <div key={`x${i}`} style={{ marginTop: 3 }}>{msg}</div>
          ))}
        </div>
      )}

      <div className="dx-ot-bottom-space" />
      <div className="dx-ot-foot">
        <div className="dx-ot-foot-cost"><span>Costo estimado</span><strong>${calcOTTotals(segmentos).total.toFixed(0)}</strong></div>
        <div className="dx-ot-foot-pending" aria-live="polite">
          {pendientesPaso[pasoActual - 1].length ? `Falta: ${pendientesPaso[pasoActual - 1][0]}` : 'Paso completo'}
        </div>
        <div className="dx-ot-foot-actions">
          <button type="button" className="dx-ot-foot-back" onClick={() => irAPaso(Math.max(1, pasoActual - 1))} disabled={pasoActual === 1}>Atrás</button>
          {pasoActual < 5 ? (
            <button type="button" className="dx-ot-foot-next" onClick={() => irAPaso(pasoActual + 1)} disabled={pendientesPaso[pasoActual - 1].length > 0}>Continuar</button>
          ) : (
            <button type="button" className="dx-ot-foot-next" onClick={guardarOT} disabled={!valid || guardando}>{guardando ? 'Guardando…' : 'Crear OT'}</button>
          )}
        </div>
      </div>
      <BacklogDrawer
        open={drawerOpen}
        equipo={form.equipo}
        selected={backlogs}
        onToggle={toggleBacklog}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};
