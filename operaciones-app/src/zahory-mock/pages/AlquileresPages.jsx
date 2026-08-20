import { useEffect, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { getAdministrativeHref } from '../components/AdministrativeAppLinkPage.jsx';
import { STORAGE_BUCKETS, subirAdjunto } from '../../../../src/services/storageService.js';

// ── Mock Data — delegado a data.js (Capa 3) ───────────────────────────────
const ACTIVOS_RENTAL  = ZAHORY_SAC_DATA.flota_equipos_rental;
const CONTRATOS_MOCK  = ZAHORY_SAC_DATA.contratosRental;

// ── Helpers de fecha y estado ─────────────────────────────────────────────
const HOY = new Date('2026-05-13');

// En el maestro histórico, tipo_categoria también contiene descripciones
// específicas de flota (SCOOPTRAM, JUMBO, CARGADOR, etc.). Por eso se excluyen
// solo las categorías genéricas inequívocamente ajenas a flota.
const CATEGORIAS_NO_FLOTA = new Set([
  'MUEBLE', 'MOBILIARIO', 'INMUEBLE', 'INFORMATICA',
  'ACTIVO INTANGIBLE', 'INTANGIBLE', 'ACTIVO NO DEPRECIABLE', 'OTRO',
]);
const esActivoDeFlota = activo => !CATEGORIAS_NO_FLOTA.has(
  String(activo?.tipo_categoria || '').trim().toUpperCase(),
);

const calcEstadoContrato = (vencStr) => {
  const venc = new Date(vencStr);
  const diffDias = Math.floor((venc - HOY) / 86400000);
  if (diffDias < 0)   return 'Vencido';
  if (diffDias <= 45) return 'Por Vencer';
  return 'Vigente';
};

const ESTADO_CT_CFG = {
  'Vigente':    { cls: 'badge green',  label: 'Vigente'    },
  'Por Vencer': { cls: 'badge orange', label: 'Por Vencer' },
  'Vencido':    { cls: 'badge red',    label: 'Vencido'    },
};

const fmtFechaLarga = (iso) => {
  const [y, m, d] = iso.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d} ${meses[parseInt(m,10)-1]} ${y}`;
};

// Opciones del formulario de nuevo contrato
const CTFORM_INIT = {
  clienteId: '', unidadMinera: '', equipoId: '',
  fechaInicio: '', fechaFin: '', tarifaMonto: '', moneda: 'USD',
  tarifaPeriodicidad: 'hora', minimoFacturable: '', metaDmr: '85',
  centroCostoId: '', centroBeneficioId: '',
};

const generarNumeroContrato = () => {
  const anio = String(new Date().getFullYear()).slice(-2);
  return `CT-${anio}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
};

const generarIdContrato = () => (
  globalThis.crypto?.randomUUID?.() || `ctr_${Date.now()}_${Math.random().toString(36).slice(2)}`
);

const esNumeroContratoDuplicado = error => (
  error?.code === '23505' || /duplicate key|empresa_id.*numero|numero.*empresa_id/i.test(error?.message || '')
);

const etiquetaCuenta = cuenta => cuenta?.nombre_comercial || cuenta?.razon_social || cuenta?.id || '';
const etiquetaCatalogo = item => [item?.codigo, item?.nombre].filter(Boolean).join(' - ') || item?.id || '';

const mensajeErrorContrato = error => {
  if (error?.code === '42501') return 'No tienes permiso para registrar contratos en la sociedad activa.';
  if (error?.code === '23503') return 'El cliente, equipo o centro seleccionado ya no es válido para tu alcance.';
  if (error?.code === '23514') return 'Los datos del contrato no cumplen las validaciones requeridas.';
  return error?.message || 'No se pudo guardar el contrato. Inténtalo nuevamente.';
};

// ── Componente de vista previa de contrato ────────────────────────────────
const ContratoPdfPreview = ({ contrato, onClose }) => {
  const estado = calcEstadoContrato(contrato.vencimiento);
  const cfg    = ESTADO_CT_CFG[estado];
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(10,17,32,0.80)',
      zIndex:1100, display:'flex', flexDirection:'column',
      alignItems:'center', padding:'0 0 32px',
      overflowY:'auto',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Toolbar flotante */}
      <div style={{
        width:'100%', background:'var(--navy)', padding:'10px 24px',
        display:'flex', alignItems:'center', gap:10,
        position:'sticky', top:0, zIndex:10,
        boxShadow:'0 2px 12px rgba(0,0,0,0.35)',
      }}>
        <span className={cfg.cls} style={{ fontSize:11 }}>
          <span className="dot"/>{cfg.label}
        </span>
        <span style={{
          fontFamily:'ui-monospace,monospace', fontWeight:800,
          color:'white', fontSize:14, marginLeft:4,
        }}>{contrato.id}</span>
        <span style={{ fontSize:12.5, color:'rgba(255,255,255,0.65)', marginLeft:4 }}>
          · {contrato.cliente}
        </span>
        <div style={{ flex:1 }}/>
        <button className="btn btn-secondary btn-sm" style={{ color:'white', borderColor:'rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.08)' }}>
          <Icon name="download" size={13}/> Descargar PDF
        </button>
        <button className="btn btn-secondary btn-sm" style={{ color:'white', borderColor:'rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.08)' }}>
          <Icon name="report" size={13}/> Imprimir
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}
          style={{ color:'rgba(255,255,255,0.75)', marginLeft:4 }}>
          <Icon name="x" size={15}/>
        </button>
      </div>

      {/* Hoja A4 */}
      <div style={{
        width:'100%', maxWidth:794, margin:'32px auto 0',
        background:'white', boxShadow:'0 12px 48px rgba(0,0,0,0.45)',
        borderRadius:4, padding:'56px 64px', color:'#111',
        fontFamily:'Georgia, "Times New Roman", serif',
        lineHeight:1.6,
      }}>

        {/* Encabezado del documento */}
        <div style={{
          display:'flex', alignItems:'flex-start', gap:20,
          borderBottom:'3px solid var(--navy)', paddingBottom:20, marginBottom:24,
        }}>
          <div style={{
            width:56, height:56, background:'var(--navy)', borderRadius:8,
            display:'flex', alignItems:'center', justifyContent:'center',
            flexShrink:0,
          }}>
            <span style={{ color:'white', fontWeight:900, fontSize:13, letterSpacing:-1, fontFamily:'sans-serif' }}>Z</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'sans-serif', fontWeight:900, fontSize:18, color:'var(--navy)', letterSpacing:-.5 }}>
              Empresa Operadora
            </div>
            <div style={{ fontFamily:'sans-serif', fontSize:11, color:'#666', marginTop:1 }}>
              Servicios de Mantenimiento y Alquiler de Equipos Mineros
            </div>
            <div style={{ fontFamily:'sans-serif', fontSize:10.5, color:'#666' }}>
              Av. Industrial 1240, Ate — Lima · RUC 20512345678
            </div>
          </div>
          <div style={{ textAlign:'right', fontFamily:'sans-serif' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'var(--navy)' }}>
              CONTRATO DE ALQUILER
            </div>
            <div style={{ fontWeight:700, fontFamily:'ui-monospace,monospace', fontSize:13, color:'var(--cyan)', marginTop:3 }}>
              {contrato.id}
            </div>
            <div style={{ fontSize:11, color:'#666', marginTop:4 }}>
              Vigencia: {fmtFechaLarga(contrato.inicio)} — {fmtFechaLarga(contrato.vencimiento)}
            </div>
          </div>
        </div>

        {/* I — Partes Intervinientes */}
        <Section title="I. PARTES INTERVINIENTES">
          <Row label="ARRENDADOR" val="Empresa Operadora — RUC 20512345678"/>
          <Row label="Representante Legal" val="Ing. Carlos Mendoza Torres — DNI 08765432"/>
          <Row label="ARRENDATARIO" val={contrato.cliente}/>
          <Row label="Representante" val={contrato.representanteCliente}/>
        </Section>

        {/* II — Objeto */}
        <Section title="II. OBJETO DEL ALQUILER">
          <Row label="Equipo" val={`${contrato.equipo} — ${contrato.equipoModelo}`}/>
          <Row label="Unidad Minera" val={contrato.unidadMinera}/>
          <div style={{ marginTop:10, fontSize:13 }}>
            <span style={{ fontWeight:700 }}>Descripción: </span>
            {contrato.objeto}
          </div>
        </Section>

        {/* III — Tarifas */}
        <Section title="III. TARIFAS Y CONDICIONES">
          <Row label="Tarifa Operativa" val={`USD ${contrato.tarifa.toFixed(2)} por hora`}/>
          <Row label="Mínimo Garantizado" val={`${contrato.minimo} horas / mes`}/>
          <Row label="Meta de Disponibilidad Mecánica (DMR)" val={`${contrato.metaDMR}% — Según cláusula 5.2`}/>
          <Row label="Moneda de Facturación" val="Dólares Americanos (USD)"/>
          <Row label="Forma de Pago" val="30 días calendario desde la remisión de servicios"/>
          <div style={{ marginTop:12, fontSize:12, color:'#555', background:'#F8FAFC', padding:'10px 14px', borderRadius:6, borderLeft:'3px solid #CBD5E1' }}>
            En caso de que el DMR real sea inferior al DMR pactado, se aplicará una penalidad proporcional
            calculada según el Anexo A del presente contrato.
          </div>
        </Section>

        {/* IV — Firmas */}
        <Section title="IV. FIRMAS Y CONFORMIDAD">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:40, marginTop:8 }}>
            {[
              { rol:'POR EL ARRENDADOR', nombre:'Empresa Operadora', rep:contrato.representanteZahory },
              { rol:'POR EL ARRENDATARIO', nombre:contrato.cliente, rep:contrato.representanteCliente },
            ].map(f => (
              <div key={f.rol} style={{ textAlign:'center' }}>
                <div style={{ borderBottom:'1.5px solid #111', height:52, marginBottom:8 }}/>
                <div style={{ fontWeight:700, fontSize:12 }}>{f.rol}</div>
                <div style={{ fontSize:12 }}>{f.nombre}</div>
                <div style={{ fontSize:11.5, color:'#555' }}>{f.rep}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Footer del doc */}
        <div style={{
          marginTop:32, paddingTop:14,
          borderTop:'1px solid #E2E8F0',
          fontSize:10.5, color:'#999',
          fontFamily:'sans-serif', display:'flex', justifyContent:'space-between',
        }}>
          <span>Documento generado por ERP Operativo · {new Date().toLocaleDateString('es-PE')}</span>
          <span>Pág. 1 de 1</span>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div style={{ marginBottom:24 }}>
    <div style={{
      fontFamily:'sans-serif', fontWeight:800, fontSize:12,
      textTransform:'uppercase', letterSpacing:.8,
      color:'var(--navy)', borderBottom:'1px solid #E2E8F0',
      paddingBottom:5, marginBottom:10,
    }}>{title}</div>
    {children}
  </div>
);

const Row = ({ label, val }) => (
  <div style={{ display:'flex', gap:8, marginBottom:4, fontSize:13 }}>
    <span style={{ fontWeight:700, minWidth:240, color:'#333' }}>{label}:</span>
    <span style={{ color:'#111' }}>{val}</span>
  </div>
);

// ─── Datos diarios de disponibilidad — Abril 2026 ─────────────────────────
// Formato por día: [opH, paradaH, tipo, otRef, observacion]
// tipo: 'P' = Programada · 'NP' = No Programada · null = sin parada
const _mkDias = (raw) => raw.map(([op, par, tipo, ot, obs], idx) => ({
  dia: idx + 1, opH: op, paradaH: par, tipo, ot, obs,
  dmrPct: (op + par) > 0 ? +((op / (op + par)) * 100).toFixed(1) : null,
}));

const DIAS_LHD02 = _mkDias([
  [8.0, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [7.0, 2.0, 'P',  'OT-2026-028', 'PM-250h — Cambio de aceite hidráulico y filtros'],
  [8.0, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [0,   0,   null, null,           'Domingo — sin operación'],
  [8.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [6.0, 5.0, 'NP', 'OT-2026-035', 'Fuga de aceite en cilindro de levante — parada imprevista turno noche'],
  [8.0, 0,   null, null,           ''],
  [8.5, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [6.0, 5.0, 'P',  'OT-2026-041', 'Reemplazo de pines y bocinas delanteras — PM programado'],
  [8.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [0,   0,   null, null,           'Domingo — sin operación'],
  [8.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [8.0, 0,   null, null,           ''],
  [8.5, 0,   null, null,           ''],
  [7.5, 0,   null, null,           ''],
  [7.0, 0,   null, null,           ''],
]);

const DIAS_JB24 = _mkDias([
  [5.5, 0,   null, null,           ''],
  [4.0, 6.0, 'NP', 'OT-2026-029', 'Falla en sistema de rotación — cabezal de perforación bloqueado'],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [0,   0,   null, null,           'Domingo — sin operación'],
  [5.5, 0,   null, null,           ''],
  [3.0, 7.0, 'NP', 'OT-2026-033', 'Rotura de manguera de agua a alta presión — parada de emergencia'],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [4.5, 3.5, 'P',  'OT-2026-039', 'PM-500h — Cambio de filtros y lubricación general'],
  [5.0, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [2.5, 7.0, 'NP', 'OT-2026-044', 'Falla eléctrica panel de control — módulo ECU dañado'],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [4.5, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [0,   0,   null, null,           'Domingo — sin operación'],
  [4.5, 7.5, 'NP', 'OT-2026-051', 'Fisura en brazo del boom — inspección y refuerzo de soldadura'],
  [5.5, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
]);

const DIAS_DT01 = _mkDias([
  [5.5, 0,   null, null,           ''],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 4.0, 'NP', 'OT-2026-030', 'Falla en sistema de frenos — válvula de freno de servicio'],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [0,   0,   null, null,           'Domingo — sin operación'],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [6.0, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [4.5, 5.5, 'P',  'OT-2026-040', 'PM-1000h — Cambio de neumáticos y calibración de frenos'],
  [5.5, 0,   null, null,           ''],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 3.5, 'NP', 'OT-2026-047', 'Sobrecalentamiento de motor — cambio de termostato y correas'],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [0,   0,   null, null,           'Domingo — sin operación'],
  [5.5, 0,   null, null,           ''],
  [6.0, 0,   null, null,           ''],
  [5.0, 5.0, 'P',  'OT-2026-053', 'Revisión sistema hidráulico — mantenimiento semi-anual'],
  [5.5, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [6.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
  [5.0, 0,   null, null,           ''],
  [5.5, 0,   null, null,           ''],
]);

const LIQUIDACION_MOCK = [
  {
    equipo:'LHD-02', modelo:'Sandvik LH517i', cliente:'Minera Nexa Resources',
    contrato:'CT-2026-001', tarifa:55.00, horasContrato:200,
    horasReales:217, horasParada:12, dmr:94.7, metaDMR:85,
    estado:'Pre-facturado', proyecto:'U.M. Animón — Cerro de Pasco',
    serie:'LH517i-A3-28840', dias:DIAS_LHD02,
  },
  {
    equipo:'JB-24', modelo:'EPIROC Simba S7D', cliente:'Cia. Minas Buenaventura',
    contrato:'CT-2026-002', tarifa:72.00, horasContrato:180,
    horasReales:140, horasParada:31, dmr:81.9, metaDMR:88,
    estado:'En Revisión', proyecto:'U.M. Uchucchacua — Lima',
    serie:'S7D-BV-10093', dias:DIAS_JB24,
  },
  {
    equipo:'DT-01', modelo:'Sandvik TH540i', cliente:'Antapaccay S.A.',
    contrato:'CT-2026-004', tarifa:61.00, horasContrato:160,
    horasReales:155, horasParada:18, dmr:89.6, metaDMR:85,
    estado:'Pre-facturado', proyecto:'U.M. Antapaccay — Cusco',
    serie:'TH540i-AP-77412', dias:DIAS_DT01,
  },
];

// ── Flota status config ────────────────────────────────────────────────────
const ESTADO_FLOTA_CFG = {
  'disponible':       { cls: 'badge green',  dot: '#4CAF50', bg: '#E8F5E9', label: 'Disponible'   },
  'alquilado':        { cls: 'badge cyan',   dot: '#00BCD4', bg: '#E0F7FA', label: 'Alquilado'    },
  'en_mantenimiento': { cls: 'badge orange', dot: '#FF9800', bg: '#FFF3E0', label: 'En Taller'    },
  'en_transito':      { cls: 'badge cyan',   dot: '#3B82F6', bg: '#EFF6FF', label: 'En Tránsito'  },
  'baja':             { cls: 'badge red',    dot: '#EF4444', bg: '#FFF1F2', label: 'Baja'         },
};

// colores por CC — definidos a nivel módulo para reutilización en JSX
const CC_COLORS = {
  'FLO-ALQ':  { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  'OPS-INT':  { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
  'PROD-MAE': { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6' },
  'TRA-COM':  { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
};

// calcula horas restantes para próximo PM
const calcProximoPM = (equipo) => {
  const proximoPMHorometro = equipo.pm_ultimo_horometro + equipo.pm_intervalo_horas;
  return proximoPMHorometro - equipo.horometro;
};

// ── Opciones mock para el formulario de nuevo equipo ──────────────────────
const CATEGORIAS_EQUIPO   = ['Cargador Subterráneo (LHD)', 'Camión Minero', 'Jumbo Perforador', 'Bolter', 'Excavadora', 'Camioneta 4×4', 'Otro'];
const MARCAS_EQUIPO       = ['Caterpillar', 'Sandvik', 'EPIROC', 'GHH', 'Atlas Copco', 'Komatsu', 'Toyota', 'Hilux', 'Otra'];
const UBICACIONES_EQUIPO  = ['Base — Ate', 'Base — Satipo', 'Mina — Volcán', 'Mina — Buenaventura', 'Mina — Antamina', 'Proyecto Antapaccay', 'En Tránsito'];
const ESTADOS_COMERCIALES = ['disponible', 'alquilado', 'en_mantenimiento', 'en_transito', 'baja'];
const ESTADO_LABELS       = { disponible: 'Disponible', alquilado: 'Alquilado', en_mantenimiento: 'En Taller', en_transito: 'En Tránsito', baja: 'Baja' };
const CC_OPTIONS = [
  { value: 'FLO-ALQ',  label: 'FLO-ALQ — Flota & Alquileres'        },
  { value: 'OPS-INT',  label: 'OPS-INT — Operaciones Internas'       },
  { value: 'PROD-MAE', label: 'PROD-MAE — Producción / Maestranza'   },
  { value: 'TRA-COM',  label: 'TRA-COM — Transporte Comercial'       },
];
const PROPIETARIO_OPTIONS = ['Empresa Operadora', 'Cliente'];

const FLOTA_FORM_INIT = {
  codigo: '', categoria: '', marca: '', modelo: '', serie: '',
  horometro: '', ubicacion: '', estadoComercial: 'disponible',
  centro_costo: '', propietario: 'Empresa Operadora',
  pm_intervalo_horas: '', pm_ultimo_horometro: '',
};

// ── Toast simple ───────────────────────────────────────────────────────────
const Toast = ({ msg }) => (
  <div style={{
    position:'fixed', bottom:28, right:28, zIndex:2000,
    background:'#1B5E20', color:'white',
    padding:'12px 20px', borderRadius:10,
    fontWeight:700, fontSize:13.5,
    boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
    display:'flex', alignItems:'center', gap:10,
    animation:'fadeInUp 0.22s ease-out',
  }}>
    <span style={{ fontSize:18 }}>✓</span> {msg}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 1. PANEL DE FLOTA
// ═══════════════════════════════════════════════════════════════════════════
export const FlotaRentalPage = ({ onNav }) => {
  const sesionOperativa = useSesionOperativa();
  const crearActivosHref = getAdministrativeHref('activos_fijos');
  const [tab, setTab]               = useState('todos');
  const [equiposReales, setEquiposReales] = useState([]);
  const [cargandoFlota, setCargandoFlota] = useState(false);
  const [errorFlota, setErrorFlota] = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState(FLOTA_FORM_INIT);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(false);
  const [modalError, setModalError] = useState(null);
  const [modalAdv, setModalAdv]     = useState(null);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleGuardar = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setModalOpen(false);
      setForm(FLOTA_FORM_INIT);
      setToast(true);
      setTimeout(() => setToast(false), 2800);
    }, 900);
  };

  const handleCancelar = () => { setModalOpen(false); setForm(FLOTA_FORM_INIT); };

  const validarPreDespacho = (equipo) => {
    const errores = [];
    if (!equipo.certificaciones_ok) {
      errores.push('El equipo tiene certificaciones vencidas (SOAT, póliza o revisión técnica)');
    }
    if (equipo.ot_activa_id) {
      errores.push(`El equipo tiene una OT abierta: ${equipo.ot_activa_id}`);
    }
    const horasPM = calcProximoPM(equipo);
    if (horasPM <= 0) {
      errores.push('⚠ Advertencia: PM vencido. Se recomienda realizar PM antes del despacho.');
    }
    return errores;
  };

  const handleDespachar = (equipo) => {
    const errores = validarPreDespacho(equipo);
    const bloqueantes  = errores.filter(e => !e.startsWith('⚠'));
    const advertencias = errores.filter(e => e.startsWith('⚠'));
    if (bloqueantes.length > 0) {
      setModalError({ equipo, errores: bloqueantes });
      return;
    }
    if (advertencias.length > 0) {
      setModalAdv({ equipo, advertencias, onConfirmar: () => { onNav('checkout'); setModalAdv(null); } });
      return;
    }
    onNav('checkout');
  };

  useEffect(() => {
    let vigente = true;
    if (!sesionOperativa.empresaId) {
      setEquiposReales([]);
      return () => { vigente = false; };
    }

    const cargarFlota = async () => {
      setCargandoFlota(true);
      setErrorFlota('');
      try {
        const supabase = getSupabaseClient();
        const hoy = new Date().toISOString().slice(0, 10);
        const activosQuery = supabase
          .from('activos')
          .select('id,codigo,nombre,tipo_categoria,marca,modelo,ubicacion,estado')
          .eq('empresa_id', sesionOperativa.empresaId)
          .neq('estado', 'dado_baja')
          .order('codigo');
        let contratosQuery = supabase
          .from('contratos_alquiler_equipos')
          .select('equipo_id,contrato:contratos_alquiler!inner(id,numero,cuenta_id,sociedad_id,estado,fecha_inicio,fecha_fin,cuenta:cuentas!inner(nombre_comercial,razon_social))')
          .eq('contrato.empresa_id', sesionOperativa.empresaId)
          .eq('contrato.estado', 'vigente')
          .lte('contrato.fecha_inicio', hoy)
          .gte('contrato.fecha_fin', hoy);
        if (sesionOperativa.sociedadId) contratosQuery = contratosQuery.eq('contrato.sociedad_id', sesionOperativa.sociedadId);

        const [activosRes, contratosRes] = await Promise.all([activosQuery, contratosQuery]);
        if (activosRes.error) throw activosRes.error;
        if (contratosRes.error) throw contratosRes.error;
        if (!vigente) return;

        const contratosPorEquipo = new Map();
        (contratosRes.data || []).forEach(relacion => {
          const contrato = Array.isArray(relacion.contrato) ? relacion.contrato[0] : relacion.contrato;
          if (!contrato || !relacion.equipo_id) return;
          const actuales = contratosPorEquipo.get(relacion.equipo_id) || [];
          actuales.push(contrato);
          contratosPorEquipo.set(relacion.equipo_id, actuales);
        });
        const activos = activosRes.data || [];
        const activosFlota = activos.filter(esActivoDeFlota);
        setEquiposReales(activosFlota.map(activo => ({
          ...activo,
          contratosVigentes: contratosPorEquipo.get(activo.id) || [],
        })));
      } catch (error) {
        if (vigente) {
          setEquiposReales([]);
          setErrorFlota(`No se pudo cargar el Panel de Flota: ${error.message || 'error desconocido'}`);
        }
      } finally {
        if (vigente) setCargandoFlota(false);
      }
    };

    cargarFlota();
    return () => { vigente = false; };
  }, [sesionOperativa.empresaId, sesionOperativa.sociedadId]);

  const filtered = equiposReales.filter(equipo => (
    tab === 'todos'
    || (tab === 'con_contrato' && equipo.contratosVigentes.length > 0)
    || (tab === 'sin_contrato' && equipo.contratosVigentes.length === 0)
  ));
  const flotaTabs = [
    { key: 'todos', label: 'Todos', count: equiposReales.length },
    { key: 'con_contrato', label: 'Con contrato activo', count: equiposReales.filter(equipo => equipo.contratosVigentes.length > 0).length },
    { key: 'sin_contrato', label: 'Sin contrato activo', count: equiposReales.filter(equipo => equipo.contratosVigentes.length === 0).length },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Panel de Flota</h1>
          <div className="sub">Activos y contratos de alquiler vigentes</div>
        </div>
        <div className="spacer" />
        <a className="btn btn-secondary" href={crearActivosHref}>
          Crear activos en Administración
        </a>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
        Las acciones Historial, Despachar y Retornar estarán disponibles cuando se implemente el módulo de movimientos de flota.
      </div>

      {/* Quick filter tabs — dinámico con conteos */}
      <div className="report-toolbar">
        <div className="report-tabs">
        {flotaTabs.map(t => (
          <button key={t.key}
            className={'report-tab' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({t.count})
          </button>
        ))}
        </div>
      </div>

      {(sesionOperativa.cargando || cargandoFlota) && <div className="card" style={{ padding:16, marginBottom:16 }}>Cargando activos y contratos vigentes...</div>}
      {errorFlota && <div className="card" style={{ padding:16, marginBottom:16, color:'#b91c1c', borderColor:'#fecaca' }}>{errorFlota}</div>}
      {!sesionOperativa.cargando && !cargandoFlota && !errorFlota && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(284px, 1fr))', gap:16, marginBottom:24 }}>
          {filtered.map(equipo => {
            const contrato = equipo.contratosVigentes[0] || null;
            const multiplesContratos = equipo.contratosVigentes.length > 1;
            const marcaModelo = [equipo.marca, equipo.modelo].filter(Boolean).join(' · ');
            const cuenta = Array.isArray(contrato?.cuenta) ? contrato.cuenta[0] : contrato?.cuenta;
            const cliente = cuenta?.nombre_comercial || cuenta?.razon_social || contrato?.cuenta_id || '';
            return (
              <div key={equipo.id} className="card" style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                  {equipo.tipo_categoria && <span className="chip" style={{ fontSize:10.5, fontFamily:'ui-monospace,monospace' }}>{equipo.tipo_categoria}</span>}
                  {multiplesContratos && <span style={{ padding:'3px 8px', borderRadius:999, background:'rgba(245,158,11,.14)', color:'#b45309', fontSize:10.5, fontWeight:800 }}>⚠ Múltiples contratos vigentes</span>}
                </div>
                <div>
                  <div style={{ fontFamily:'ui-monospace,monospace', fontWeight:800, fontSize:16, color:'var(--navy)' }}>{equipo.codigo}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginTop:3 }}>{equipo.nombre}</div>
                  {marcaModelo && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>{marcaModelo}</div>}
                </div>
                {equipo.ubicacion && <div style={{ padding:'8px 10px', background:'#F8FAFC', borderRadius:6 }}><div style={{ fontSize:9.5, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:.6, marginBottom:3 }}>Ubicación</div><div style={{ fontWeight:700, color:'var(--navy)', fontSize:12 }}>{equipo.ubicacion}</div></div>}
                {!multiplesContratos && contrato && <div style={{ padding:'8px 10px', background:'#E0F7FA', borderRadius:6, fontSize:12 }}><span style={{ color:'var(--text-muted)' }}>Cliente: </span><span style={{ fontWeight:700 }}>{cliente}</span><span className="chip" style={{ marginLeft:8, fontSize:10.5, fontFamily:'ui-monospace,monospace' }}>{contrato.numero}</span></div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                  {['Historial', 'Despachar', 'Retornar'].map(accion => (
                    <button
                      key={accion}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled
                      title="Disponible cuando se implemente el módulo de movimientos de flota"
                    >
                      {accion}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="card" style={{ padding:16, color:'var(--text-muted)' }}>No hay equipos para esta vista.</div>}
        </div>
      )}

      {/* ── Modal Nuevo Equipo ─────────────────────────────────────────── */}
      {modalOpen && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(15,23,42,0.65)',
          zIndex:1000, display:'grid', placeItems:'center', padding:20,
          overflowY:'auto',
        }}
          onClick={e => { if (e.target === e.currentTarget) handleCancelar(); }}
        >
          <div className="card" style={{
            width:'100%', maxWidth:680,
            animation:'fadeInUp 0.2s ease-out',
            margin:'auto',
          }}>
            {/* Header */}
            <div className="card-header" style={{
              background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0',
            }}>
              <div>
                <h3 style={{ margin:0 }}>Registrar Nuevo Equipo</h3>
                <div style={{ fontSize:12, opacity:.75, marginTop:2 }}>
                  Ingrese los datos técnicos y el estado inicial del activo.
                </div>
              </div>
              <div className="spacer"/>
              <button className="icon-btn" onClick={handleCancelar} style={{ color:'white' }}>
                <Icon name="x" size={16}/>
              </button>
            </div>

            <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:20 }}>

              {/* Sección A */}
              <div>
                <div style={{
                  fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase',
                  color:'var(--cyan)', marginBottom:10,
                }}>A — Identificación del Activo</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="field">
                    <label>Código Interno *</label>
                    <input className="input" placeholder="Ej. LHD-04, CAM-02"
                      value={form.codigo} onChange={e => setField('codigo', e.target.value)}/>
                  </div>
                  <div className="field">
                    <label>Categoría *</label>
                    <select className="select"
                      value={form.categoria} onChange={e => setField('categoria', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {CATEGORIAS_EQUIPO.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Marca</label>
                    <select className="select"
                      value={form.marca} onChange={e => setField('marca', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {MARCAS_EQUIPO.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Modelo</label>
                    <input className="input" placeholder="Ej. R1300G, TH540i"
                      value={form.modelo} onChange={e => setField('modelo', e.target.value)}/>
                  </div>
                  <div className="field" style={{ gridColumn:'1/-1' }}>
                    <label>Número de Serie / PIN</label>
                    <input className="input" placeholder="Vital para historial de mantenimiento"
                      value={form.serie} onChange={e => setField('serie', e.target.value)}/>
                  </div>
                </div>
              </div>

              {/* Sección B */}
              <div>
                <div style={{
                  fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase',
                  color:'var(--cyan)', marginBottom:10,
                }}>B — Estado Operativo Inicial</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="field">
                    <label>Horómetro / Kilometraje Inicial</label>
                    <input className="input" type="number" placeholder="Ej. 8340"
                      value={form.horometro} onChange={e => setField('horometro', e.target.value)}/>
                  </div>
                  <div className="field">
                    <label>Estado Comercial</label>
                    <select className="select"
                      value={form.estadoComercial} onChange={e => setField('estadoComercial', e.target.value)}>
                      {ESTADOS_COMERCIALES.map(s => <option key={s} value={s}>{ESTADO_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn:'1/-1' }}>
                    <label>Ubicación Actual</label>
                    <select className="select"
                      value={form.ubicacion} onChange={e => setField('ubicacion', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {UBICACIONES_EQUIPO.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección C — Clasificación del activo (Gap G-01) */}
              <div>
                <div style={{
                  fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase',
                  color:'var(--cyan)', marginBottom:10,
                }}>C — Clasificación del Activo</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="field">
                    <label>Centro de Costo *</label>
                    <select className="select"
                      value={form.centro_costo} onChange={e => setField('centro_costo', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {CC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Propietario *</label>
                    <select className="select"
                      value={form.propietario} onChange={e => setField('propietario', e.target.value)}>
                      {PROPIETARIO_OPTIONS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>PM — Intervalo (horas) *</label>
                    <input className="input" type="number" min={1} placeholder="Ej: 250"
                      value={form.pm_intervalo_horas} onChange={e => setField('pm_intervalo_horas', e.target.value)}/>
                    <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:4 }}>
                      Cada cuántas horas se realiza el mantenimiento preventivo
                    </div>
                  </div>
                  <div className="field">
                    <label>PM — Horómetro último PM *</label>
                    <input className="input" type="number" min={0} placeholder="Ej: 0 si es equipo nuevo"
                      value={form.pm_ultimo_horometro} onChange={e => setField('pm_ultimo_horometro', e.target.value)}/>
                    <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:4 }}>
                      Horómetro en el que se realizó el último PM
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección D */}
              <div>
                <div style={{
                  fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase',
                  color:'var(--cyan)', marginBottom:10,
                }}>D — Multimedia</div>
                <div className="field">
                  <label>Foto del equipo</label>
                  <div style={{
                    border:'2px dashed var(--card-border)', borderRadius:10,
                    padding:'24px 20px', textAlign:'center', background:'#F8FAFC',
                    cursor:'pointer', transition:'border-color .15s, background .15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='var(--cyan)'; e.currentTarget.style.background='#F0FDFE'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='var(--card-border)'; e.currentTarget.style.background='#F8FAFC'; }}
                  >
                    <Icon name="camera" size={28} stroke={1.5}/>
                    <div style={{ marginTop:8, fontWeight:700, fontSize:13, color:'var(--navy)' }}>
                      Arrastra una imagen o haz clic para subir
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:3 }}>
                      JPG, PNG, HEIC · Máx. 10 MB
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display:'flex', gap:10, padding:'4px 16px 16px' }}>
              <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}
                onClick={handleCancelar} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
                onClick={handleGuardar} disabled={saving}>
                {saving
                  ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2, marginRight:6 }}/> Guardando...</>
                  : <><Icon name="check" size={13}/> Guardar Equipo</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg="Equipo registrado correctamente"/>}

      {/* Modal error bloqueante — no puede despachar */}
      {modalError && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.72)', zIndex:1200, display:'grid', placeItems:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:480, animation:'fadeInUp 0.2s ease-out' }}>
            <div className="card-header" style={{ background:'#dc2626', color:'white', borderRadius:'8px 8px 0 0' }}>
              <div>
                <h3 style={{ margin:0, fontSize:15 }}>No se puede despachar — {modalError.equipo.id}</h3>
                <div style={{ fontSize:11, opacity:.8, marginTop:2 }}>Resuelve los siguientes bloqueos antes de continuar</div>
              </div>
              <div className="spacer"/>
              <button className="icon-btn" style={{ color:'white' }} onClick={() => setModalError(null)}><Icon name="x" size={16}/></button>
            </div>
            <div className="card-body">
              <ul style={{ paddingLeft:18, margin:0 }}>
                {modalError.errores.map((err, i) => (
                  <li key={i} style={{ marginBottom:8, fontSize:13, color:'var(--text)' }}>{err}</li>
                ))}
              </ul>
            </div>
            <div style={{ display:'flex', gap:10, padding:'4px 16px 16px', justifyContent:'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalError(null)}>Cerrar</button>
              <button className="btn btn-secondary" onClick={() => { setModalError(null); onNav('equipos'); }}>
                Ver certificaciones →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal advertencia — puede continuar con confirmación */}
      {modalAdv && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.72)', zIndex:1200, display:'grid', placeItems:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:480, animation:'fadeInUp 0.2s ease-out' }}>
            <div className="card-header" style={{ background:'#f59e0b', color:'white', borderRadius:'8px 8px 0 0' }}>
              <div>
                <h3 style={{ margin:0, fontSize:15 }}>Advertencia antes de despachar — {modalAdv.equipo.id}</h3>
                <div style={{ fontSize:11, opacity:.85, marginTop:2 }}>Puedes continuar, pero revisa estas observaciones</div>
              </div>
              <div className="spacer"/>
              <button className="icon-btn" style={{ color:'white' }} onClick={() => setModalAdv(null)}><Icon name="x" size={16}/></button>
            </div>
            <div className="card-body">
              <ul style={{ paddingLeft:18, margin:0 }}>
                {modalAdv.advertencias.map((adv, i) => (
                  <li key={i} style={{ marginBottom:8, fontSize:13, color:'var(--text)' }}>{adv}</li>
                ))}
              </ul>
            </div>
            <div style={{ display:'flex', gap:10, padding:'4px 16px 16px', justifyContent:'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalAdv(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={modalAdv.onConfirmar}>Continuar de todas formas</button>
            </div>
          </div>
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONTRATOS Y TARIFAS
// ═══════════════════════════════════════════════════════════════════════════
export const ContratosRentalPage = ({ onNav }) => {
  const sesion = useSesionOperativa();
  const [modalNuevo,           setModalNuevo]           = useState(false);
  const [preview,              setPreview]              = useState(null);
  const [ctForm,               setCtForm]               = useState(CTFORM_INIT);
  const [saving,               setSaving]               = useState(false);
  const [toast,                setToast]                = useState(false);
  const [filtroEstado,         setFiltroEstado]         = useState('activos');
  const [contratoSeleccionado, setContratoSeleccionado] = useState(null);
  const [tabFicha,             setTabFicha]             = useState('resumen');
  const [fichaAbierta,         setFichaAbierta]         = useState(false);
  const [numeroSugerido,       setNumeroSugerido]       = useState('');
  const [clientes,             setClientes]             = useState([]);
  const [unidadesMineras,      setUnidadesMineras]      = useState([]);
  const [equipos,              setEquipos]              = useState([]);
  const [centrosCosto,         setCentrosCosto]         = useState([]);
  const [centrosBeneficio,     setCentrosBeneficio]     = useState([]);
  const [cargandoCatalogos,    setCargandoCatalogos]    = useState(false);
  const [errorCatalogos,       setErrorCatalogos]       = useState('');
  const [errorGuardar,         setErrorGuardar]         = useState('');
  const [archivoContrato,      setArchivoContrato]      = useState(null);
  const [contratoGuardado,     setContratoGuardado]     = useState(null);
  const [errorArchivo,         setErrorArchivo]         = useState('');
  const [subiendoArchivo,      setSubiendoArchivo]      = useState(false);

  const contratos = ZAHORY_SAC_DATA.contratosRental;

  // ── Helpers DMR ──────────────────────────────────────────────────────────
  const getDmrStatus = (contrato) => {
    if (contrato.dmr_real_actual === null || contrato.dmr_real_actual === undefined) return null;
    const diff = contrato.dmr_real_actual - contrato.metaDMR;
    if (diff >= 0)  return 'ok';
    if (diff >= -2) return 'riesgo';
    return 'penalidad';
  };

  const DMR_COLORS = {
    ok:        { real: '#22c55e', label: 'Sobre meta'  },
    riesgo:    { real: '#f59e0b', label: 'En riesgo'   },
    penalidad: { real: '#ef4444', label: '⚠ Penalidad' },
  };

  // ── Helpers horómetro ────────────────────────────────────────────────────
  const getHorasAcumuladasMes = (contrato) => {
    if (!contrato.horometro_actual || !contrato.horometro_inicio_mes) return null;
    return contrato.horometro_actual - contrato.horometro_inicio_mes;
  };

  // ── Helpers PM ───────────────────────────────────────────────────────────
  const getHorasParaPM = (contrato) => {
    if (!contrato.pm_ultimo_horometro || !contrato.horometro_actual) return null;
    return (contrato.pm_ultimo_horometro + contrato.pm_intervalo_horas) - contrato.horometro_actual;
  };

  const getPmAlerta = (horasPM) => {
    if (horasPM === null || horasPM === undefined) return null;
    if (horasPM <= 0)   return { label: '⚠ PM vencido',      color: '#ef4444' };
    if (horasPM <= 50)  return { label: `PM en ${horasPM}h`, color: '#ef4444' };
    if (horasPM <= 150) return { label: `PM en ${horasPM}h`, color: '#f59e0b' };
    return null;
  };

  // ── Ficha de detalle ─────────────────────────────────────────────────────
  const abrirFicha = (contratoId, tabInicial = 'resumen') => {
    const contrato = contratos.find(c => c.id === contratoId);
    setContratoSeleccionado(contrato);
    setTabFicha(tabInicial);
    setFichaAbierta(true);
  };

  const cerrarFicha = () => {
    setFichaAbierta(false);
    setContratoSeleccionado(null);
  };

  const crearOTDesdeContrato = () => {
    onNav?.('crear-ot');
  };

  // ── Acciones contextuales por estado ────────────────────────────────────
  const getAcciones = (contrato) => {
    const estado = calcEstadoContrato(contrato.vencimiento);
    switch (estado) {
      case 'Vigente':
        return [
          { label: 'Ver DMR',     icon: '📊', action: () => abrirFicha(contrato.id, 'dmr')   },
          { label: 'Crear OT',    icon: '🔧', action: () => crearOTDesdeContrato()            },
          { label: 'Liquidación', icon: '📋', action: () => onNav?.('liquidacion')            },
          { label: 'Editar',      icon: '✏️', action: () => setPreview(contrato)              },
        ];
      case 'Por Vencer':
        return [
          { label: 'Ver DMR',     icon: '📊', action: () => abrirFicha(contrato.id, 'dmr')   },
          { label: 'Renovar',     icon: '🔄', action: () => {}                                },
          { label: 'Crear OT',    icon: '🔧', action: () => crearOTDesdeContrato()            },
          { label: 'Liquidación', icon: '📋', action: () => onNav?.('liquidacion')            },
        ];
      case 'Vencido':
        return [
          { label: 'Ver historial', icon: '📄', action: () => abrirFicha(contrato.id)         },
          { label: 'Archivar',      icon: '🗂',  action: () => {}                              },
        ];
      default:
        return [];
    }
  };

  // ── Tabs de filtro ───────────────────────────────────────────────────────
  const TABS_FILTRO = [
    { key: 'activos',    label: 'Activos',    filter: c => ['Vigente','Por Vencer'].includes(calcEstadoContrato(c.vencimiento)) },
    { key: 'vigente',    label: 'Vigentes',   filter: c => calcEstadoContrato(c.vencimiento) === 'Vigente'                      },
    { key: 'por_vencer', label: 'Por Vencer', filter: c => calcEstadoContrato(c.vencimiento) === 'Por Vencer'                   },
    { key: 'vencido',    label: 'Vencidos',   filter: c => calcEstadoContrato(c.vencimiento) === 'Vencido'                      },
    { key: 'todos',      label: 'Todos',      filter: () => true                                                                 },
  ];

  const tabActual        = TABS_FILTRO.find(t => t.key === filtroEstado);
  const contratosFiltrados = contratos.filter(tabActual.filter);

  // ── Variables derivadas para la ficha de detalle ─────────────────────────
  const fc           = contratoSeleccionado;
  const fichaHorasPM = fc ? getHorasParaPM(fc) : null;
  const fichaPmAlerta   = fc ? getPmAlerta(fichaHorasPM) : null;
  const fichaDmrStatus  = fc ? getDmrStatus(fc) : null;
  const fichaHorasAcum  = fc ? getHorasAcumuladasMes(fc) : null;
  const fichaOts        = fc ? (ZAHORY_SAC_DATA.otsRental || []).filter(ot => fc.ot_ids?.includes(ot.id)) : [];
  const fichaCostoRec   = fichaOts.filter(ot => ot.cargo === 'Cliente_Contrato').reduce((s, ot) => s + ot.costo, 0);
  const fichaCostoNoRec = fichaOts.filter(ot => ot.cargo !== 'Cliente_Contrato').reduce((s, ot) => s + ot.costo, 0);
  const fichaRegistros  = fc ? ((ZAHORY_SAC_DATA.horometrosRental || {})[fc.id] || []) : [];
  const FICHA_DIAS_TRANSCU = 13;
  const FICHA_DIAS_MES     = 31;
  const fichaRitmo           = fichaHorasAcum ? fichaHorasAcum / FICHA_DIAS_TRANSCU : null;
  const fichaHorasProyectadas = fichaRitmo ? Math.round(fichaRitmo * FICHA_DIAS_MES) : null;

  const setCtField = (k, v) => setCtForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    let activo = true;
    if (!modalNuevo || !sesion.empresaId || !sesion.sociedadId || !sesion.permiteEscritura) return undefined;

    const cargarCatalogos = async () => {
      setCargandoCatalogos(true);
      setErrorCatalogos('');
      try {
        const supabase = getSupabaseClient();
        // activos no posee sociedad_id: el alcance disponible hoy es empresa + estado operativo.
        const [cuentasRes, unidadesRes, equiposRes, cecoRes, cebeRes] = await Promise.all([
          supabase.from('cuentas').select('id,nombre_comercial,razon_social,ruc,estado')
            .eq('empresa_id', sesion.empresaId).eq('estado', 'activo').order('nombre_comercial'),
          supabase.from('sedes').select('id,codigo,nombre')
            .eq('empresa_id', sesion.empresaId).eq('tipo', 'unidad_minera').eq('estado', 'activo').order('nombre'),
          supabase.from('activos').select('id,codigo,nombre,marca,modelo,estado')
            .eq('empresa_id', sesion.empresaId).eq('estado', 'operativo').order('codigo'),
          supabase.from('centros_costo').select('id,nombre,codigo')
            .eq('empresa_id', sesion.empresaId).eq('sociedad_id', sesion.sociedadId).eq('estado', 'activo').order('nombre'),
          supabase.from('centros_beneficio').select('id,nombre,codigo')
            .eq('empresa_id', sesion.empresaId).eq('sociedad_id', sesion.sociedadId).eq('estado', 'activo').order('nombre'),
        ]);
        const error = [cuentasRes, unidadesRes, equiposRes, cecoRes, cebeRes].find(resultado => resultado.error)?.error;
        if (error) throw error;
        if (!activo) return;
        setClientes(cuentasRes.data || []);
        setUnidadesMineras(unidadesRes.data || []);
        setEquipos(equiposRes.data || []);
        setCentrosCosto(cecoRes.data || []);
        setCentrosBeneficio(cebeRes.data || []);
      } catch (error) {
        if (activo) setErrorCatalogos(`No se pudieron cargar los catálogos: ${error.message || 'error desconocido'}`);
      } finally {
        if (activo) setCargandoCatalogos(false);
      }
    };

    cargarCatalogos();
    return () => { activo = false; };
  }, [modalNuevo, sesion.empresaId, sesion.sociedadId, sesion.permiteEscritura]);

  const limpiarModalContrato = () => {
    setModalNuevo(false);
    setCtForm(CTFORM_INIT);
    setArchivoContrato(null);
    setContratoGuardado(null);
    setErrorGuardar('');
    setErrorArchivo('');
  };

  const abrirModalContrato = () => {
    setCtForm(CTFORM_INIT);
    setNumeroSugerido(generarNumeroContrato());
    setArchivoContrato(null);
    setContratoGuardado(null);
    setErrorGuardar('');
    setErrorArchivo('');
    setModalNuevo(true);
  };

  const subirDocumentoContrato = async contratoId => {
    if (!archivoContrato) return true;
    setSubiendoArchivo(true);
    setErrorArchivo('');
    try {
      await subirAdjunto({
        empresaId: sesion.empresaId,
        entidadTipo: 'contratos_alquiler',
        entidadId: contratoId,
        file: archivoContrato,
        categoria: 'contrato_pdf',
        subidoPor: sesion.usuario?.id || null,
        bucket: STORAGE_BUCKETS.DOCUMENTOS_PRIVADOS,
      });
      return true;
    } catch (error) {
      setErrorArchivo(`El contrato fue creado, pero no se pudo subir el PDF: ${error.message || 'error desconocido'}`);
      return false;
    } finally {
      setSubiendoArchivo(false);
    }
  };

  const handleGuardar = async () => {
    if (!sesion.permiteEscritura) {
      setErrorGuardar('No puedes crear contratos desde la vista consolidada. Selecciona una sociedad operativa.');
      return;
    }
    if (!sesion.empresaId || !sesion.sociedadId) {
      setErrorGuardar('Aún no se resolvió la empresa y sociedad activas.');
      return;
    }
    const tarifa = Number(ctForm.tarifaMonto);
    const dmr = Number(ctForm.metaDmr);
    const minimo = ctForm.minimoFacturable === '' ? null : Number(ctForm.minimoFacturable);
    if (!ctForm.clienteId || !ctForm.equipoId || !ctForm.fechaInicio || !ctForm.fechaFin || !Number.isFinite(tarifa) || tarifa < 0 || !Number.isFinite(dmr) || dmr < 0 || dmr > 100 || (minimo !== null && (!Number.isFinite(minimo) || minimo < 0))) {
      setErrorGuardar('Completa Cliente, Equipo, fechas, tarifa y una meta DMR válida entre 0 y 100.');
      return;
    }
    if (ctForm.fechaFin < ctForm.fechaInicio) {
      setErrorGuardar('La fecha de vencimiento no puede ser anterior a la fecha de inicio.');
      return;
    }

    setSaving(true);
    setErrorGuardar('');
    let contrato = null;
    try {
      const supabase = getSupabaseClient();
      const id = generarIdContrato();
      for (let intento = 0; intento < 5; intento += 1) {
        const numero = intento === 0 ? numeroSugerido : generarNumeroContrato();
        const { data, error } = await supabase.from('contratos_alquiler').insert({
          id,
          empresa_id: sesion.empresaId,
          sociedad_id: sesion.sociedadId,
          numero,
          cuenta_id: ctForm.clienteId,
          unidad_minera: ctForm.unidadMinera || null,
          fecha_inicio: ctForm.fechaInicio,
          fecha_fin: ctForm.fechaFin,
          tarifa_monto: tarifa,
          tarifa_periodicidad: ctForm.tarifaPeriodicidad,
          minimo_facturable: minimo,
          meta_dmr: dmr,
          moneda: ctForm.moneda,
          centro_costo_id: ctForm.centroCostoId || null,
          centro_beneficio_id: ctForm.centroBeneficioId || null,
        }).select('id,numero').single();
        if (!error) { contrato = data; break; }
        if (!esNumeroContratoDuplicado(error) || intento === 4) throw error;
      }
      if (!contrato) throw new Error('No se pudo asignar un número de contrato disponible.');
      const { error: equipoError } = await supabase.from('contratos_alquiler_equipos').insert({
        contrato_alquiler_id: contrato.id,
        equipo_id: ctForm.equipoId,
      });
      if (equipoError) {
        // No dejamos un contrato nuevo sin el único equipo exigido por este flujo.
        await supabase.from('contratos_alquiler').delete().eq('id', contrato.id);
        throw equipoError;
      }

      setContratoGuardado(contrato);
      const documentoSubido = await subirDocumentoContrato(contrato.id);
      if (documentoSubido) {
        limpiarModalContrato();
        setToast(true);
        setTimeout(() => setToast(false), 2800);
      }
    } catch (error) {
      setErrorGuardar(mensajeErrorContrato(error));
    } finally {
      setSaving(false);
    }
  };

  const reintentarSubida = async () => {
    if (!contratoGuardado || subiendoArchivo) return;
    const documentoSubido = await subirDocumentoContrato(contratoGuardado.id);
    if (documentoSubido) {
      limpiarModalContrato();
      setToast(true);
      setTimeout(() => setToast(false), 2800);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Contratos y Tarifas</h1>
          <div className="sub">Acuerdos comerciales de alquiler de flota</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar</button>
        <button className="btn btn-primary" onClick={abrirModalContrato}>
          <Icon name="plus" size={13}/> Nuevo Contrato
        </button>
      </div>

      {/* ── C4: Tabs de filtro por estado ────────────────────────────────── */}
      <div className="report-toolbar">
        <div className="report-tabs">
        {TABS_FILTRO.map(t => (
          <button key={t.key}
            className={'report-tab' + (filtroEstado === t.key ? ' active' : '')}
            onClick={() => setFiltroEstado(t.key)}
          >
            {t.label} ({contratos.filter(t.filter).length})
          </button>
        ))}
        </div>
      </div>

      {/* ── Tabla de contratos ─────────────────────────────────────────── */}
      <div className="card">
        <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width:190 }}>Contrato</th>
              <th>Cliente / Unidad Minera</th>
              <th style={{ width:155 }}>Equipo</th>
              <th style={{ width:120 }}>Horómetro</th>
              <th style={{ width:155 }}>Condiciones</th>
              <th style={{ width:150 }}>DMR</th>
              <th style={{ width:105 }}>Estado</th>
              <th style={{ width:150 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contratosFiltrados.map(c => {
              const estado    = calcEstadoContrato(c.vencimiento);
              const cfg       = ESTADO_CT_CFG[estado];
              const dmrStatus = getDmrStatus(c);
              const horasPM   = getHorasParaPM(c);
              const pmAlerta  = getPmAlerta(horasPM);
              const horasAcum = getHorasAcumuladasMes(c);
              const acciones  = getAcciones(c);
              return (
                <tr key={c.id} className="clickable">

                  {/* C5: Contrato — badge CC ─────────────────────────────── */}
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{
                        fontFamily:'ui-monospace,monospace', fontWeight:800, fontSize:12.5,
                        color:'var(--cyan)', textDecoration:'underline', textUnderlineOffset:3,
                        padding:'2px 4px', display:'block', marginBottom:2,
                      }}
                      onClick={() => abrirFicha(c.id)}
                    >
                      {c.id}
                    </button>
                    <div style={{ fontSize:11, color:'var(--text-muted)', paddingLeft:4, marginBottom:3 }}>
                      {fmtFechaLarga(c.inicio)} — {fmtFechaLarga(c.vencimiento)}
                    </div>
                    <span style={{
                      background:'rgba(245,158,11,0.12)', color:'#f59e0b',
                      fontSize:'8.5px', fontFamily:'monospace', fontWeight:700,
                      padding:'1px 6px', borderRadius:8, display:'inline-block',
                    }}>
                      {c.centro_costo}
                    </span>
                  </td>

                  {/* Cliente / U.M. ──────────────────────────────────────── */}
                  <td>
                    <div style={{ fontWeight:700, fontSize:13 }}>{c.cliente}</div>
                    <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:1 }}>{c.unidadMinera}</div>
                  </td>

                  {/* C3: Equipo — indicador PM ───────────────────────────── */}
                  <td>
                    <span className="chip" style={{ fontFamily:'ui-monospace,monospace', fontSize:11.5 }}>
                      {c.equipo}
                    </span>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{c.equipoModelo}</div>
                    {pmAlerta && (
                      <span style={{
                        fontSize:'9px', color:pmAlerta.color, fontWeight:600,
                        display:'block', marginTop:2,
                      }}>
                        {pmAlerta.label}
                      </span>
                    )}
                  </td>

                  {/* C2: Horómetro actual ────────────────────────────────── */}
                  <td>
                    {c.horometro_actual ? (
                      <div>
                        <span style={{ fontWeight:600, fontSize:13 }}>
                          {c.horometro_actual.toLocaleString()} h
                        </span>
                        <span style={{ color:'#64748b', fontSize:'10px', display:'block' }}>
                          +{horasAcum}h este mes
                        </span>
                      </div>
                    ) : (
                      <span style={{ color:'#94a3b8' }}>—</span>
                    )}
                  </td>

                  {/* Condiciones ─────────────────────────────────────────── */}
                  <td>
                    <div style={{ fontFamily:'ui-monospace,monospace', fontWeight:700, fontSize:13, color:'var(--navy)' }}>
                      ${c.tarifa.toFixed(2)} / hr
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>
                      {c.minimo} h mínimas / mes
                    </div>
                  </td>

                  {/* C1: DMR real vs meta con semáforo ───────────────────── */}
                  <td>
                    {dmrStatus ? (
                      <div className="dmr-cell">
                        <span style={{ color:DMR_COLORS[dmrStatus].real, fontWeight:700, fontSize:13 }}>
                          {c.dmr_real_actual.toFixed(1)}%
                        </span>
                        <span style={{ color:'#64748b', fontSize:'10px' }}>
                          / meta {c.metaDMR}%
                        </span>
                        <span style={{ fontSize:'9px', color:DMR_COLORS[dmrStatus].real, fontWeight:600 }}>
                          {DMR_COLORS[dmrStatus].label}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color:'#94a3b8' }}>—</span>
                    )}
                  </td>

                  {/* Estado ──────────────────────────────────────────────── */}
                  <td>
                    <span className={cfg.cls}><span className="dot"/>{cfg.label}</span>
                  </td>

                  {/* C6: Acciones contextuales ───────────────────────────── */}
                  <td>
                    <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                      {acciones.map((acc, idx) => (
                        <button key={idx}
                          className="btn btn-ghost btn-sm"
                          title={acc.label}
                          onClick={acc.action}
                          style={{ fontSize:13, padding:'3px 5px' }}
                        >
                          {acc.icon}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── C7: Ficha de detalle — panel lateral ─────────────────────────── */}
      {fichaAbierta && fc && (
        <>
          <div
            style={{ position:'fixed', inset:0, background:'rgba(10,17,32,0.50)', zIndex:900 }}
            onClick={cerrarFicha}
          />
          <div style={{
            position:'fixed', top:0, right:0, bottom:0, width:540,
            background:'white', zIndex:910,
            boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',
            display:'flex', flexDirection:'column', overflowY:'hidden',
          }}>

            {/* Header */}
            <div style={{
              padding:'16px 20px', background:'var(--navy)', color:'white',
              display:'flex', alignItems:'flex-start', gap:12, flexShrink:0,
            }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontFamily:'ui-monospace,monospace', fontWeight:800, fontSize:15 }}>
                    {fc.id}
                  </span>
                  <span className={ESTADO_CT_CFG[calcEstadoContrato(fc.vencimiento)].cls} style={{ fontSize:10 }}>
                    <span className="dot"/>
                    {ESTADO_CT_CFG[calcEstadoContrato(fc.vencimiento)].label}
                  </span>
                  <span style={{
                    background:'rgba(245,158,11,0.25)', color:'#fbbf24',
                    fontSize:'8.5px', fontFamily:'monospace', fontWeight:700,
                    padding:'1px 6px', borderRadius:8,
                  }}>
                    {fc.centro_costo}
                  </span>
                </div>
                <div style={{ fontSize:12.5, opacity:.85 }}>{fc.cliente}</div>
                <div style={{ fontSize:11, opacity:.65 }}>{fc.unidadMinera}</div>
                <div style={{ fontSize:10.5, opacity:.55, marginTop:2 }}>
                  {fmtFechaLarga(fc.inicio)} — {fmtFechaLarga(fc.vencimiento)}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={cerrarFicha}
                style={{ color:'rgba(255,255,255,0.75)', marginTop:-4 }}>
                <Icon name="x" size={15}/>
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display:'flex', borderBottom:'1px solid #E2E8F0',
              background:'#F8FAFC', flexShrink:0,
            }}>
              {[
                { key:'resumen',    label:'Resumen'       },
                { key:'dmr',        label:'DMR Histórico' },
                { key:'ots',        label:'OTs'           },
                { key:'horometros', label:'Horómetros'    },
              ].map(t => (
                <button key={t.key} onClick={() => setTabFicha(t.key)} style={{
                  flex:1, padding:'10px 6px', fontSize:12, fontWeight:600,
                  border:'none', background:'transparent', cursor:'pointer',
                  color: tabFicha === t.key ? 'var(--navy)' : '#64748b',
                  borderBottom: tabFicha === t.key ? '2px solid var(--navy)' : '2px solid transparent',
                  marginBottom:-1,
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Cuerpo — scroll */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

              {/* Tab: Resumen ────────────────────────────────────────────── */}
              {tabFicha === 'resumen' && (
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:10 }}>
                      Equipo asignado
                    </div>
                    <div style={{ background:'#F8FAFC', borderRadius:8, padding:'12px 14px' }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'var(--navy)' }}>
                        {fc.equipo} · {fc.equipoModelo}
                      </div>
                      {fc.horometro_actual && (
                        <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>
                          Horómetro actual: <strong>{fc.horometro_actual.toLocaleString()} h</strong>
                        </div>
                      )}
                      {fichaPmAlerta && (
                        <div style={{ fontSize:11.5, color:fichaPmAlerta.color, fontWeight:600, marginTop:4 }}>
                          Próximo PM: {fichaPmAlerta.label}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:10 }}>
                      Condiciones del contrato
                    </div>
                    {[
                      ['Tarifa',          `$${fc.tarifa.toFixed(2)} / hora`],
                      ['Horas mínimas',   `${fc.minimo} h / mes`],
                      ['Meta DMR',        `${fc.metaDMR}%`],
                      ['Penalidad DMR',   '0.5 × tarifa × horas × diferencia%'],
                      ['Mantenimiento',   'Incluido en tarifa'],
                    ].map(([label, val]) => (
                      <div key={label} style={{
                        display:'flex', justifyContent:'space-between',
                        padding:'7px 0', borderBottom:'1px solid #F1F5F9', fontSize:12.5,
                      }}>
                        <span style={{ color:'#64748b' }}>{label}</span>
                        <span style={{ fontWeight:600, color:'var(--navy)' }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {fichaDmrStatus && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:10 }}>
                        DMR del período actual
                      </div>
                      <div style={{ background:'#F8FAFC', borderRadius:8, padding:'14px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                          <span style={{ fontSize:24, fontWeight:800, color:DMR_COLORS[fichaDmrStatus].real }}>
                            {fc.dmr_real_actual.toFixed(1)}%
                          </span>
                          <span style={{ fontSize:12, color:'#64748b' }}>Meta: {fc.metaDMR}%</span>
                        </div>
                        <div style={{ background:'#E2E8F0', borderRadius:4, height:8, position:'relative' }}>
                          <div style={{
                            width:`${Math.min(fc.dmr_real_actual, 100)}%`, height:'100%',
                            borderRadius:4, background:DMR_COLORS[fichaDmrStatus].real,
                          }}/>
                          <div style={{
                            position:'absolute', top:0, bottom:0, left:`${fc.metaDMR}%`,
                            width:2, background:'#f59e0b',
                          }}/>
                        </div>
                        <div style={{ marginTop:8, fontSize:12, fontWeight:600, color:DMR_COLORS[fichaDmrStatus].real }}>
                          {fichaDmrStatus === 'ok' ? '✓ Sobre meta — sin penalidad' : DMR_COLORS[fichaDmrStatus].label}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: DMR Histórico ──────────────────────────────────────── */}
              {tabFicha === 'dmr' && (
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:14 }}>
                    DMR real vs meta por período
                  </div>
                  <div style={{ marginBottom:20 }}>
                    {fc.liquidaciones.map((liq, i) => {
                      const sobreMeta = liq.dmr_real >= fc.metaDMR;
                      const barColor  = sobreMeta ? '#22c55e' : '#ef4444';
                      return (
                        <div key={i} style={{ marginBottom:14 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, marginBottom:4 }}>
                            <span style={{ color:'#64748b' }}>{liq.periodo}</span>
                            <span style={{ fontWeight:700, color:barColor }}>{liq.dmr_real.toFixed(1)}%</span>
                          </div>
                          <div style={{ background:'#F1F5F9', borderRadius:4, height:10, position:'relative' }}>
                            <div style={{ width:`${liq.dmr_real}%`, height:'100%', borderRadius:4, background:barColor }}/>
                            <div style={{
                              position:'absolute', top:0, bottom:0, left:`${fc.metaDMR}%`,
                              width:2, background:'#f59e0b',
                            }}/>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize:10, color:'#94a3b8', display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:14, height:2, background:'#f59e0b' }}/> Línea meta ({fc.metaDMR}%)
                    </div>
                  </div>
                  <table className="tbl" style={{ fontSize:12 }}>
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th className="num">Horas</th>
                        <th className="num">DMR real</th>
                        <th className="num">Penalidad</th>
                        <th className="num">Total USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fc.liquidaciones.map((liq, i) => (
                        <tr key={i}>
                          <td>{liq.periodo}</td>
                          <td className="num">{liq.horas_facturadas}h</td>
                          <td className="num">
                            <span style={{ color: liq.dmr_real >= fc.metaDMR ? '#22c55e' : '#ef4444', fontWeight:700 }}>
                              {liq.dmr_real.toFixed(1)}%
                            </span>
                          </td>
                          <td className="num" style={{ color: liq.penalidad > 0 ? '#ef4444' : 'inherit' }}>
                            {liq.penalidad > 0 ? `-$${liq.penalidad.toLocaleString()}` : '$0'}
                          </td>
                          <td className="num" style={{ fontWeight:600 }}>${liq.total_usd.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab: OTs ───────────────────────────────────────────────── */}
              {tabFicha === 'ots' && (
                <div>
                  <table className="tbl" style={{ fontSize:12, marginBottom:16 }}>
                    <thead>
                      <tr>
                        <th>OT</th>
                        <th>Tipo</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th className="num">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fichaOts.map(ot => (
                        <tr key={ot.id}>
                          <td style={{ fontFamily:'ui-monospace,monospace', fontSize:11, fontWeight:700 }}>{ot.id}</td>
                          <td style={{ fontSize:11 }}>{ot.tipo}</td>
                          <td style={{ fontSize:11 }}>{ot.fecha.split('-').reverse().join('/')}</td>
                          <td><span style={{ fontSize:10, fontWeight:600, color:'#22c55e' }}>{ot.estado}</span></td>
                          <td className="num" style={{ color: ot.cargo !== 'Cliente_Contrato' ? '#ef4444' : 'var(--navy)', fontWeight:600 }}>
                            ${ot.costo.toLocaleString()}
                            {ot.cargo !== 'Cliente_Contrato' && (
                              <div style={{ fontSize:'9px', color:'#ef4444' }}>Interno</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ background:'#F8FAFC', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12.5 }}>
                      <span style={{ color:'#64748b' }}>Recuperables (Cliente)</span>
                      <span style={{ fontWeight:700, color:'var(--navy)' }}>${fichaCostoRec.toLocaleString()}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5 }}>
                      <span style={{ color:'#64748b' }}>No recuperables (Interno)</span>
                      <span style={{ fontWeight:700, color:'#ef4444' }}>${fichaCostoNoRec.toLocaleString()}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
                    onClick={crearOTDesdeContrato}>
                    <Icon name="plus" size={13}/> Nueva OT bajo este contrato
                  </button>
                </div>
              )}

              {/* Tab: Horómetros ─────────────────────────────────────────── */}
              {tabFicha === 'horometros' && (
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                  {fc.horometro_actual ? (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:10 }}>
                        Período actual (Mayo 2026)
                      </div>
                      {[
                        ['Horómetro inicio de mes', `${fc.horometro_inicio_mes?.toLocaleString()} h`],
                        ['Horómetro actual',         `${fc.horometro_actual.toLocaleString()} h`],
                        ['Horas acumuladas',          `${fichaHorasAcum} h`],
                        ['Horas mínimas contrato',    `${fc.minimo} h`],
                        ['Excedente / déficit',        fichaHorasAcum >= fc.minimo
                          ? `+${fichaHorasAcum - fc.minimo} h ✓`
                          : `${fichaHorasAcum - fc.minimo} h ⚠`],
                      ].map(([label, val]) => (
                        <div key={label} style={{
                          display:'flex', justifyContent:'space-between',
                          padding:'6px 0', borderBottom:'1px solid #F1F5F9', fontSize:12.5,
                        }}>
                          <span style={{ color:'#64748b' }}>{label}</span>
                          <span style={{ fontWeight:600, color:'var(--navy)' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color:'#94a3b8', fontSize:12.5, textAlign:'center', padding:'20px 0' }}>
                      Sin horómetros activos — contrato cerrado
                    </div>
                  )}

                  {fichaRitmo && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:10 }}>
                        Proyección a fin de mes
                      </div>
                      <div style={{ background:'#F0FDF4', borderRadius:8, padding:'12px 14px' }}>
                        {[
                          ['Días transcurridos', `${FICHA_DIAS_TRANSCU} de ${FICHA_DIAS_MES}`],
                          ['Ritmo actual',        `${fichaRitmo.toFixed(1)} h/día`],
                          ['Horas proyectadas',   `${fichaHorasProyectadas} h`],
                          ['Estado proyectado',    fichaHorasProyectadas >= fc.minimo ? '✓ Sobre mínimo' : '⚠ Bajo mínimo'],
                        ].map(([label, val]) => (
                          <div key={label} style={{
                            display:'flex', justifyContent:'space-between',
                            padding:'5px 0', fontSize:12,
                          }}>
                            <span style={{ color:'#64748b' }}>{label}</span>
                            <span style={{ fontWeight:600, color:'var(--navy)' }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fichaRegistros.length > 0 && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.6, marginBottom:10 }}>
                        Registros del período
                      </div>
                      <table className="tbl" style={{ fontSize:12 }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th className="num">Horómetro</th>
                            <th className="num">Delta</th>
                            <th>Registrado por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fichaRegistros.map((r, i) => (
                            <tr key={i}>
                              <td>{r.fecha.split('-').reverse().join('/')}</td>
                              <td className="num" style={{ fontFamily:'ui-monospace,monospace', fontWeight:600 }}>
                                {r.horometro.toLocaleString()} h
                              </td>
                              <td className="num" style={{ color: r.delta > 0 ? '#22c55e' : '#64748b' }}>
                                {r.delta > 0 ? `+${r.delta}h` : '—'}
                              </td>
                              <td style={{ color:'#64748b' }}>{r.registrado_por}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer del panel */}
            <div style={{
              padding:'12px 20px', borderTop:'1px solid #E2E8F0',
              background:'#F8FAFC', display:'flex', gap:8, flexShrink:0,
            }}>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
                onClick={crearOTDesdeContrato}>
                <Icon name="plus" size={12}/> Crear OT
              </button>
              <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}
                onClick={() => onNav?.('liquidacion')}>
                <Icon name="report" size={12}/> Liquidación
              </button>
              <button className="btn btn-ghost btn-sm" style={{ flex:1, justifyContent:'center' }}
                onClick={() => setPreview(fc)}>
                <Icon name="edit" size={12}/> Editar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Nuevo Contrato ───────────────────────────────────────── */}
      {modalNuevo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:1001, display:'grid', placeItems:'center', padding:20, overflowY:'auto' }}
          onClick={e => { if (e.target === e.currentTarget && !saving && !subiendoArchivo) limpiarModalContrato(); }}>
          <div className="card" style={{ width:'100%', maxWidth:760, animation:'fadeInUp 0.2s ease-out', margin:'auto' }}>
            <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0', justifyContent:'space-between' }}>
              <div><h3 style={{ margin:0, color:'white' }}>Nuevo Contrato de Alquiler</h3><div style={{ fontSize:12, opacity:.75, marginTop:2 }}>Registro real para la sociedad activa.</div></div>
              <button className="icon-btn" onClick={limpiarModalContrato} disabled={saving || subiendoArchivo} style={{ color:'white', flexShrink:0 }}><Icon name="x" size={16}/></button>
            </div>
            <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {sesion.cargando && <div className="alert alert-info">Verificando sesión operativa...</div>}
              {!sesion.cargando && !sesion.permiteEscritura && <div className="alert alert-warning">Selecciona una sociedad operativa para crear contratos. La vista consolidada es solo de lectura.</div>}
              {errorCatalogos && <div className="alert alert-error">{errorCatalogos}</div>}
              {errorGuardar && <div className="alert alert-error">{errorGuardar}</div>}
              {errorArchivo && <div className="alert alert-warning">{errorArchivo}</div>}
              {contratoGuardado && errorArchivo && <div className="alert alert-info">Contrato {contratoGuardado.numero} creado. Puedes reintentar solo la subida del PDF, sin duplicar el contrato.</div>}

              <div>
                <div style={{ fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase', color:'var(--cyan)', marginBottom:10 }}>A — Identificación</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:12 }}>
                  <div className="field" style={{ minWidth:0 }}><label>Número de Contrato</label><input className="input" style={{ width:'100%', minWidth:0 }} value={numeroSugerido} readOnly /></div>
                  <div className="field" style={{ minWidth:0 }}><label>Cliente *</label><select className="select" style={{ width:'100%', minWidth:0 }} value={ctForm.clienteId} onChange={e => setCtField('clienteId', e.target.value)} disabled={cargandoCatalogos || Boolean(contratoGuardado)}><option value="">{cargandoCatalogos ? 'Cargando clientes...' : 'Seleccionar...'}</option>{clientes.map(cuenta => <option key={cuenta.id} value={cuenta.id}>{etiquetaCuenta(cuenta)}{cuenta.ruc ? ` · ${cuenta.ruc}` : ''}</option>)}</select></div>
                  <div className="field" style={{ minWidth:0 }}><label>Unidad Minera</label><select className="select" style={{ width:'100%', minWidth:0 }} value={ctForm.unidadMinera} onChange={e => setCtField('unidadMinera', e.target.value)} disabled={cargandoCatalogos || Boolean(contratoGuardado)}><option value="">{cargandoCatalogos ? 'Cargando unidades...' : 'Sin unidad minera'}</option>{unidadesMineras.map(unidad => <option key={unidad.id} value={unidad.id}>{etiquetaCatalogo(unidad)}</option>)}</select></div>
                  <div className="field" style={{ minWidth:0 }}><label>Equipo Asignado *</label><select className="select" style={{ width:'100%', minWidth:0 }} value={ctForm.equipoId} onChange={e => setCtField('equipoId', e.target.value)} disabled={cargandoCatalogos || Boolean(contratoGuardado)}><option value="">{cargandoCatalogos ? 'Cargando equipos...' : 'Seleccionar...'}</option>{equipos.map(equipo => <option key={equipo.id} value={equipo.id}>{etiquetaCatalogo(equipo)}</option>)}</select><div className="sub" style={{ fontSize:11, marginTop:4 }}>Activos se filtra por empresa: el maestro no tiene sociedad_id.</div></div>
                  <div className="field" style={{ minWidth:0 }}><label>Fecha de Inicio *</label><input className="input" style={{ width:'100%', minWidth:0 }} type="date" value={ctForm.fechaInicio} onChange={e => setCtField('fechaInicio', e.target.value)} disabled={Boolean(contratoGuardado)}/></div>
                  <div className="field" style={{ minWidth:0 }}><label>Fecha de Vencimiento *</label><input className="input" style={{ width:'100%', minWidth:0 }} type="date" min={ctForm.fechaInicio || undefined} value={ctForm.fechaFin} onChange={e => setCtField('fechaFin', e.target.value)} disabled={Boolean(contratoGuardado)}/></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase', color:'var(--cyan)', marginBottom:10 }}>B — Parámetros de Cobro</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
                  <div className="field"><label>Tarifa *</label><input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={ctForm.tarifaMonto} onChange={e => setCtField('tarifaMonto', e.target.value)} disabled={Boolean(contratoGuardado)}/></div>
                  <div className="field"><label>Moneda *</label><select className="select" value={ctForm.moneda} onChange={e => setCtField('moneda', e.target.value)} disabled={Boolean(contratoGuardado)}><option value="USD">USD</option><option value="PEN">PEN</option></select></div>
                  <div className="field"><label>Unidad de tarifa *</label><select className="select" value={ctForm.tarifaPeriodicidad} onChange={e => setCtField('tarifaPeriodicidad', e.target.value)} disabled={Boolean(contratoGuardado)}><option value="hora">Hora</option><option value="dia">Día</option><option value="mes">Mes</option></select></div>
                  <div className="field"><label>Mínimo garantizado</label><input className="input" type="number" min="0" step="0.01" placeholder="Opcional" value={ctForm.minimoFacturable} onChange={e => setCtField('minimoFacturable', e.target.value)} disabled={Boolean(contratoGuardado)}/></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase', color:'var(--cyan)', marginBottom:10 }}>C — Disponibilidad y centros</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:12 }}>
                  <div className="field" style={{ minWidth:0 }}><label>Meta DMR % *</label><input className="input" style={{ width:'100%', minWidth:0 }} type="number" min="0" max="100" step="0.01" value={ctForm.metaDmr} onChange={e => setCtField('metaDmr', e.target.value)} disabled={Boolean(contratoGuardado)}/></div>
                  <div className="field" style={{ minWidth:0 }}><label>Centro de Costo</label><select className="select" style={{ width:'100%', minWidth:0 }} value={ctForm.centroCostoId} onChange={e => setCtField('centroCostoId', e.target.value)} disabled={cargandoCatalogos || Boolean(contratoGuardado)}><option value="">Sin centro de costo</option>{centrosCosto.map(centro => <option key={centro.id} value={centro.id}>{etiquetaCatalogo(centro)}</option>)}</select></div>
                  <div className="field" style={{ minWidth:0 }}><label>Centro de Beneficio</label><select className="select" style={{ width:'100%', minWidth:0 }} value={ctForm.centroBeneficioId} onChange={e => setCtField('centroBeneficioId', e.target.value)} disabled={cargandoCatalogos || Boolean(contratoGuardado)}><option value="">Sin centro de beneficio</option>{centrosBeneficio.map(centro => <option key={centro.id} value={centro.id}>{etiquetaCatalogo(centro)}</option>)}</select></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:11, fontWeight:800, letterSpacing:.8, textTransform:'uppercase', color:'var(--cyan)', marginBottom:10 }}>D — Documento del contrato</div>
                <div className="field"><label>PDF del contrato (opcional, máximo 20 MB)</label><input className="input" type="file" accept="application/pdf,.pdf" onChange={e => { setArchivoContrato(e.target.files?.[0] || null); setErrorArchivo(''); }} disabled={Boolean(contratoGuardado) || subiendoArchivo}/>{archivoContrato && <div className="sub" style={{ marginTop:5, fontSize:12 }}>Archivo seleccionado: {archivoContrato.name}</div>}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, padding:'4px 16px 16px' }}>
              <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }} onClick={limpiarModalContrato} disabled={saving || subiendoArchivo}>{contratoGuardado ? 'Cerrar' : 'Cancelar'}</button>
              {contratoGuardado && errorArchivo
                ? <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={reintentarSubida} disabled={subiendoArchivo}>{subiendoArchivo ? 'Subiendo PDF...' : 'Reintentar PDF'}</button>
                : <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleGuardar} disabled={saving || cargandoCatalogos || !sesion.permiteEscritura}>{saving ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2, marginRight:6 }}/> Guardando...</> : <><Icon name="check" size={13}/> Guardar Contrato</>}</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview ────────────────────────────────────────────────── */}
      {preview && <ContratoPdfPreview contrato={preview} onClose={() => setPreview(null)}/>}

      {toast && <Toast msg="Contrato registrado correctamente"/>}
      <FooterBrand/>
    </div>
  );
};

// ─── Helpers UI compartidos ────────────────────────────────────────────────
const RichFieldA = ({ label, hint, required, children, style }) => (
  <div style={style}>
    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.5px' }}>
      {label}{required && <span style={{ color:'var(--red)', marginLeft:2 }}>*</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize:11, color:'var(--slate-2)', marginTop:5, lineHeight:1.4 }}>{hint}</div>}
  </div>
);

const SummaryRowA = ({ label, value }) => (
  <div style={{ marginBottom:10 }}>
    <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.28)', textTransform:'uppercase', letterSpacing:'0.8px' }}>{label}</div>
    <div style={{ fontSize:12, color: value ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.2)', marginTop:2, fontWeight: value ? 500 : 400, wordBreak:'break-all', lineHeight:1.35 }}>
      {value || '—'}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. ACTAS / DESPACHOS — Módulo completo
// ═══════════════════════════════════════════════════════════════════════════

const ITEMS_COMPONENTES = [
  'Equipo articulado con tracción en las cuatro ruedas y articulación central',
  'Eje delantero rígido',
  'Eje trasero oscilante',
  'Freno de servicio',
  'Freno de estacionamiento',
  'Sistema de dirección comandado por STIC',
  'Sistema de transmisión (caja transmisión / convertidor)',
  'Sistema hidráulico comandado por joystick',
  'Sistema de luces',
  'Revisión del brazo de elevación',
  'Revisión varillaje volteo y recojo',
  'Revisión de tirante de inclinación',
  'Revisión de la cuchara',
];

const ITEMS_MOTOR = [
  'Arranque del motor',
  'Revisión de ruidos (no habituales)',
  'Presión de aceite de motor (luz piloto en tablero)',
  'Revisión de nivel aceite de motor',
  'Sistema de refrigeración',
  'Revisión de fugas sistema de refrigeración',
  'Correcta carga del alternador',
  'Chequeo visual de correas',
  'Chequeo de soporte de motor',
  'Sistema de parada de emergencia de motor',
  'Revisión fugas en sistema de escape',
];

const ESTADOS_ACTA = {
  borrador:              { label: 'Borrador',           badge: 'slate'  },
  pendiente_campo:       { label: 'Pendiente de campo', badge: 'cyan'   },
  pendiente_conformidad: { label: 'Pendiente de firma', badge: 'orange' },
  conformidad_firmada:   { label: 'Firmada',            badge: 'green'  },
  anulada:               { label: 'Anulada',            badge: 'red'    },
};

const mkChecklist = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, verificado: false, obs: '' }));

const ActaBadge = ({ estado }) => {
  const s = ESTADOS_ACTA[estado] || { label: estado, badge: 'slate' };
  return <span className={`badge ${s.badge}`}><span className="dot"/>{s.label}</span>;
};

const TipoBadgeActa = ({ tipo }) => (
  <span className={`badge ${tipo === 'despacho' ? 'cyan' : 'orange'}`} style={{ fontSize: 10 }}>
    {tipo === 'despacho' ? '↑ Despacho' : '↓ Retorno'}
  </span>
);

const FORM_INIT = {
  tipo: 'despacho', contrato_id: '', equipo_id: '', equipo_modelo: '', equipo_serie: '',
  motor_serie: '', fecha: '2026-05-19', tecnico_nombre: '', horometro: '',
  componentes: mkChecklist(ITEMS_COMPONENTES.length), motor: mkChecklist(ITEMS_MOTOR.length),
  rep_cliente_nombre: '', rep_cliente_dni: '', rep_cliente_empresa: '',
  supervisor_nombre: '', fecha_conformidad: '2026-05-19', declaracion: false,
};

export const DespachosRentalPage = ({ onNav }) => {
  const [view, setView]       = useState('listado');
  const [actas, setActas]     = useState(() =>
    (ZAHORY_SAC_DATA.actas || []).map(a => ({
      ...a,
      componentes: a.componentes?.length ? a.componentes : mkChecklist(ITEMS_COMPONENTES.length),
      motor:       a.motor?.length       ? a.motor       : mkChecklist(ITEMS_MOTOR.length),
    }))
  );
  const [actaSelId, setActaSelId] = useState(null);
  const [tab, setTab]             = useState('todas');
  const [previewActa, setPreviewActa] = useState(null);
  const [anularId, setAnularId]   = useState(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [backlogModal, setBacklogModal] = useState(null);
  const [paso, setPaso]           = useState(1);
  const [form, setForm]           = useState(FORM_INIT);
  const [toast, setToast]         = useState(null);
  const [panelActa, setPanelActa] = useState(null);
  const [tabPanel, setTabPanel]   = useState('datos');

  const actaSel = actas.find(a => a.id === actaSelId);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const actasFiltradas = actas.filter(a => {
    if (tab === 'despachos')  return a.tipo === 'despacho';
    if (tab === 'retornos')   return a.tipo === 'retorno';
    if (tab === 'pendientes') return a.estado === 'pendiente_conformidad';
    return true;
  });

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onContratoChange = (ctId) => {
    const ct = CONTRATOS_MOCK.find(c => c.id === ctId);
    const eq = ct ? ACTIVOS_RENTAL.find(a => a.id === ct.equipo) : null;
    setForm(f => ({
      ...f, contrato_id: ctId,
      equipo_id: ct?.equipo || '',
      equipo_modelo: eq?.modelo || '',
      equipo_serie: '',
      rep_cliente_empresa: ct?.cliente || '',
    }));
  };

  const hasAlertItems = (a) =>
    [...(a.componentes || []), ...(a.motor || [])].some(i => !i.verificado || i.obs.trim());

  const paso2Valid = form.componentes.every(c => c.verificado || c.obs.trim());
  const paso3Valid = form.motor.every(m => m.verificado || m.obs.trim());

  const handleSave = (estadoTarget) => {
    const alertItems = [];
    form.componentes.forEach((c, i) => {
      if (!c.verificado) alertItems.push({ seccion: 'Componentes', nombre: ITEMS_COMPONENTES[i], obs: c.obs, noVerificado: true });
      else if (c.obs.trim()) alertItems.push({ seccion: 'Componentes', nombre: ITEMS_COMPONENTES[i], obs: c.obs, noVerificado: false });
    });
    form.motor.forEach((m, i) => {
      if (!m.verificado) alertItems.push({ seccion: 'Motor', nombre: ITEMS_MOTOR[i], obs: m.obs, noVerificado: true });
      else if (m.obs.trim()) alertItems.push({ seccion: 'Motor', nombre: ITEMS_MOTOR[i], obs: m.obs, noVerificado: false });
    });
    if (alertItems.length > 0) { setBacklogModal({ estadoTarget, alertItems }); return; }
    doSave(estadoTarget, false);
  };

  const doSave = (estadoTarget, crearBacklog) => {
    const ct = CONTRATOS_MOCK.find(c => c.id === form.contrato_id);
    const newId = `ACTA-2026-${String(actas.length + 1).padStart(3, '0')}`;
    setActas(prev => [{
      id: newId, numero: newId, tipo: form.tipo,
      contrato_id: form.contrato_id,
      cliente_nombre: ct?.cliente || form.rep_cliente_empresa,
      equipo_id: form.equipo_id, equipo_modelo: form.equipo_modelo,
      equipo_serie: form.equipo_serie, motor_serie: form.motor_serie,
      horometro: parseFloat(form.horometro) || 0, fecha: form.fecha,
      fecha_conformidad: estadoTarget === 'conformidad_firmada' ? form.fecha_conformidad : null,
      tecnico_nombre: form.tecnico_nombre, tecnico_dni: '',
      rep_cliente_nombre: form.rep_cliente_nombre, rep_cliente_dni: form.rep_cliente_dni,
      rep_cliente_empresa: form.rep_cliente_empresa || ct?.cliente,
      supervisor_nombre: form.supervisor_nombre,
      estado: estadoTarget, backlog_generado: crearBacklog,
      componentes: form.componentes.map(c => ({ ...c })),
      motor: form.motor.map(m => ({ ...m })),
    }, ...prev]);
    setBacklogModal(null);
    setView('listado'); setPaso(1); setForm(FORM_INIT);
    showToast(crearBacklog ? 'Acta guardada · observaciones enviadas al Backlog.' : 'Acta guardada correctamente.');
  };

  const handleAnular = () => {
    if (!anularMotivo.trim()) return;
    setActas(prev => prev.map(a => a.id === anularId ? { ...a, estado: 'anulada', motivo_anulacion: anularMotivo } : a));
    setAnularId(null); setAnularMotivo('');
    showToast('Acta anulada.');
  };

  // ── Overlays ──────────────────────────────────────────────────────────────
  const toastJsx = toast && (
    <div style={{ position:'fixed', bottom:24, right:24, background:'var(--cyan)', color:'#fff', padding:'10px 20px', borderRadius:8, fontSize:13, fontWeight:600, zIndex:2000, boxShadow:'0 4px 12px rgba(0,0,0,0.2)' }}>
      {toast}
    </div>
  );

  const anularModalJsx = anularId && (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,17,32,0.7)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="card" style={{ width:400, padding:0 }}>
        <div className="card-header"><h3 style={{ color:'var(--red)' }}>Anular Acta</h3></div>
        <div className="card-body">
          <p style={{ fontSize:13, marginBottom:12 }}>Esta acción anulará el acta. Ingresa el motivo obligatorio:</p>
          <label className="form-label">Motivo de anulación *</label>
          <textarea className="form-control" rows={3} value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} placeholder="Describe el motivo..."/>
          <div style={{ display:'flex', gap:10, marginTop:16, justifyContent:'flex-end' }}>
            <button className="btn" onClick={() => { setAnularId(null); setAnularMotivo(''); }}>Cancelar</button>
            <button className="btn" style={{ background:'var(--red)', color:'#fff', border:'none' }} disabled={!anularMotivo.trim()} onClick={handleAnular}>
              Confirmar anulación
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const backlogModalJsx = backlogModal && (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,17,32,0.7)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="card" style={{ width:520, maxHeight:'80vh', overflowY:'auto', padding:0 }}>
        <div className="card-header"><h3>Ítems con observaciones detectados</h3></div>
        <div className="card-body">
          <p style={{ fontSize:13, marginBottom:12 }}>
            Se encontraron ítems sin verificar o con observaciones. ¿Deseas crear registros en el <strong>Backlog Operativo</strong>?
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
            {backlogModal.alertItems.map((item, i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'8px 10px', background: item.noVerificado ? 'rgba(239,68,68,0.05)' : 'rgba(234,179,8,0.05)', borderRadius:6, border:`1px solid ${item.noVerificado ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}` }}>
                <span style={{ fontSize:14, marginTop:1 }}>{item.noVerificado ? '⚠️' : '📝'}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:600 }}>[{item.seccion}] {item.nombre}</div>
                  {item.obs ? <div style={{ fontSize:11, color:'var(--text-muted)' }}>Obs: {item.obs}</div>
                            : <div style={{ fontSize:11, color:'var(--red)' }}>Sin verificar y sin observación</div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button className="btn" onClick={() => doSave(backlogModal.estadoTarget, false)}>Guardar sin crear backlog</button>
            <button className="btn btn-cyan" onClick={() => doSave(backlogModal.estadoTarget, true)}>
              <Icon name="plus" size={13}/> Crear en Backlog y guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── PREVIEW MODAL ─────────────────────────────────────────────────────────
  if (previewActa) {
    const a = previewActa;
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fd = a.fecha ? a.fecha.split('-') : ['','',''];
    const fDay = fd[2]; const fMon = fd[1] ? MESES[parseInt(fd[1],10)-1] : ''; const fYear = fd[0];
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(10,17,32,0.88)', zIndex:1100, display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ background:'var(--navy)', padding:'10px 24px', display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Preview del Acta · {a.numero}</span>
          <div style={{ flex:1 }}/>
          <button className="btn btn-cyan btn-sm" style={{ fontSize:12 }} onClick={() => window.print()}>
            <Icon name="report" size={13}/> Imprimir
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color:'#fff' }} onClick={() => setPreviewActa(null)}>
            <Icon name="x" size={14}/> Cerrar
          </button>
        </div>
        {/* Documento impreso */}
        <div style={{ background:'#fff', width:794, margin:'24px auto', padding:40, color:'#000', fontFamily:'Arial, sans-serif', fontSize:11, lineHeight:1.4 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'2px solid #000', paddingBottom:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700 }}>Empresa Operadora S.A.C.</div>
              <div style={{ fontSize:9, color:'#555', marginTop:2 }}>RUC: 20601829101</div>
              <div style={{ fontSize:9, color:'#555' }}>Cal. Teófilo Castillo Mza. 7 Lote 29 H.U. Macropolis Etapa 2 - Zona Lurín - Lima</div>
            </div>
            <div style={{ textAlign:'right', fontSize:9 }}>
              <div>Tel: (01) 234-5678 · Cel: +51 999 888 777</div>
              <div>contacto@empresa-demo.pe · www.empresa-demo.pe</div>
            </div>
          </div>
          <div style={{ textAlign:'center', fontSize:14, fontWeight:700, letterSpacing:2, marginBottom:12, border:'1px solid #000', padding:'6px 0' }}>
            ACTA DE ENTREGA
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10, fontSize:10 }}>
            <tbody>
              <tr>
                <td style={{ border:'1px solid #000', padding:'4px 8px', width:'18%', fontWeight:700, background:'#f0f0f0' }}>CLIENTE:</td>
                <td style={{ border:'1px solid #000', padding:'4px 8px', width:'45%' }}>{a.rep_cliente_empresa || a.cliente_nombre}</td>
                <td style={{ border:'1px solid #000', padding:'4px 8px', width:'12%', fontWeight:700, background:'#f0f0f0' }}>FECHA:</td>
                <td style={{ border:'1px solid #000', padding:'4px 8px' }}>{a.fecha}</td>
              </tr>
              <tr>
                <td style={{ border:'1px solid #000', padding:'4px 8px', fontWeight:700, background:'#f0f0f0' }}>ENTREGADO POR:</td>
                <td colSpan={3} style={{ border:'1px solid #000', padding:'4px 8px' }}>{a.tecnico_nombre}</td>
              </tr>
            </tbody>
          </table>
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12, fontSize:10 }}>
            <tbody>
              {[['EQUIPO:', a.equipo_modelo],['N° SERIE EQUIPO:', a.equipo_serie],['N° SERIE MOTOR:', a.motor_serie],['HORÓMETRO:', `${a.horometro} hrs (Diésel)`]].map(([lbl, val]) => (
                <tr key={lbl}>
                  <td style={{ border:'1px solid #000', padding:'4px 8px', width:'22%', fontWeight:700, background:'#f0f0f0' }}>{lbl}</td>
                  <td style={{ border:'1px solid #000', padding:'4px 8px' }}>{val || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {[{ title:'1. DESCRIPCIÓN DE COMPONENTES', items:ITEMS_COMPONENTES, data:a.componentes },
            { title:'2. MOTOR CATERPILLAR',           items:ITEMS_MOTOR,        data:a.motor        }].map(sec => (
            <div key={sec.title}>
              <div style={{ fontWeight:700, fontSize:11, marginBottom:4, marginTop:10 }}>{sec.title}</div>
              <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10, fontSize:10 }}>
                <thead>
                  <tr>
                    <th style={{ border:'1px solid #000', padding:'4px 6px', background:'#f0f0f0', width:'5%', textAlign:'center' }}>N°</th>
                    <th style={{ border:'1px solid #000', padding:'4px 6px', background:'#f0f0f0', width:'8%', textAlign:'center' }}>✓</th>
                    <th style={{ border:'1px solid #000', padding:'4px 8px', background:'#f0f0f0' }}>ÍTEM</th>
                    <th style={{ border:'1px solid #000', padding:'4px 8px', background:'#f0f0f0', width:'28%', textAlign:'center' }}>OBSERVACIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.items.map((item, i) => {
                    const c = sec.data?.[i] || { verificado:false, obs:'' };
                    return (
                      <tr key={i}>
                        <td style={{ border:'1px solid #000', padding:'3px 6px', textAlign:'center' }}>{i+1}</td>
                        <td style={{ border:'1px solid #000', padding:'3px 6px', textAlign:'center', fontSize:14 }}>{c.verificado ? '☑' : '☐'}</td>
                        <td style={{ border:'1px solid #000', padding:'3px 8px' }}>{item}</td>
                        <td style={{ border:'1px solid #000', padding:'3px 8px', color: c.obs ? '#000' : '#bbb' }}>{c.obs || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <div style={{ fontWeight:700, fontSize:11, marginBottom:8, marginTop:14, borderTop:'1px solid #000', paddingTop:8 }}>9. CONFORMIDAD</div>
          <p style={{ fontSize:10, marginBottom:6 }}>
            Hoy <strong>{fDay}</strong> de <strong>{fMon}</strong> del <strong>{fYear}</strong>, se realiza la entrega del equipo{' '}
            <strong>{a.equipo_modelo}</strong> con N° de Serie: <strong>{a.equipo_serie}</strong>, Marca CATERPILLAR,
            mediante nuestro representante especialista, el Téc. <strong>{a.tecnico_nombre}</strong>.
          </p>
          <p style={{ fontSize:10, marginBottom:6 }}>El equipo ya antes descrito, se presenta en estado operativo y sin desperfectos.</p>
          <p style={{ fontSize:10, marginBottom:6 }}>La empresa operadora y el cliente se comprometen a no modificar la maquinaria sin previa autorización expresa y por escrito de la empresa operadora, reservándose el derecho de dar por terminado el contrato en caso de incumplimiento de dicha cláusula.</p>
          <p style={{ fontSize:10, marginBottom:16 }}>Solo el personal señalado por la empresa operadora, o un representante debidamente autorizado, podrá autorizar mantenimientos y reparaciones sobre la maquinaria descrita en el presente documento.</p>
          <div style={{ display:'flex', gap:16, marginTop:20 }}>
            {[
              { titulo:'Representante empresa operadora', nombre: a.tecnico_nombre, dni: a.tecnico_dni, empresa: null },
              { titulo:'Representante del Cliente',      nombre: a.rep_cliente_nombre || '___________________________', dni: a.rep_cliente_dni, empresa: a.rep_cliente_empresa, sello: true },
              ...(a.supervisor_nombre ? [{ titulo:'Supervisor de Mantenimiento', nombre: a.supervisor_nombre, dni: null, empresa: null }] : []),
            ].map((f, i) => (
              <div key={i} style={{ flex:1, textAlign:'center' }}>
                <div style={{ borderTop:'1px solid #000', paddingTop:8, marginTop:48 }}>
                  <div style={{ fontWeight:700 }}>{f.titulo}</div>
                  <div style={{ fontSize:10, marginTop:4 }}>{f.nombre}</div>
                  {f.dni && <div style={{ fontSize:9, color:'#555' }}>DNI: {f.dni}</div>}
                  {f.empresa && <div style={{ fontSize:9, color:'#555' }}>{f.empresa}</div>}
                  {f.sello && <div style={{ fontSize:9, color:'#aaa', marginTop:4 }}>[Sello de empresa]</div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid #ccc', marginTop:20, paddingTop:8, fontSize:9, color:'#666', textAlign:'center' }}>
            Tel: (01) 234-5678 · Cel: +51 999 888 777 · contacto@empresa-demo.pe · www.empresa-demo.pe
          </div>
        </div>
      </div>
    );
  }

  // ── DETALLE VIEW ──────────────────────────────────────────────────────────
  if (view === 'detalle' && actaSel) {
    const a = actaSel;
    const obsComp  = (a.componentes || []).filter(c => !c.verificado || c.obs.trim());
    const obsMotor = (a.motor || []).filter(m => !m.verificado || m.obs.trim());
    const CheckItem = ({ items, labels }) => (
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {labels.map((lbl, i) => {
          const item = items?.[i] || { verificado:false, obs:'' };
          return (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 10px', borderRadius:6, background: item.verificado ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)', border:`1px solid ${item.verificado ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
              <span style={{ fontSize:14, marginTop:1 }}>{item.verificado ? '✅' : '❌'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500 }}>{lbl}</div>
                {item.obs && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Obs: {item.obs}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
    return (
      <div className="page">
        {anularModalJsx}{toastJsx}
        <div className="page-header">
          <div><h1>Detalle del Acta</h1><div className="sub">{a.numero}</div></div>
          <div className="spacer"/>
          <button className="btn btn-cyan" onClick={() => setPreviewActa(a)}><Icon name="report" size={14}/> Preview del Acta</button>
          <button className="btn" style={{ marginLeft:8 }} onClick={() => setView('listado')}><Icon name="back" size={14}/> Volver</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="card" style={{ gridColumn:'span 2' }}>
            <div className="card-header">
              <h3>Identificación del Acta</h3>
              <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
                <TipoBadgeActa tipo={a.tipo}/><ActaBadge estado={a.estado}/>
                {a.estado !== 'anulada' && <button className="btn btn-sm" style={{ color:'var(--red)', fontSize:11 }} onClick={() => setAnularId(a.id)}>Anular</button>}
              </div>
            </div>
            <div className="card-body">
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16 }}>
                {[['N° Acta',a.numero],['Fecha',a.fecha],['Técnico responsable',a.tecnico_nombre],['DNI técnico',a.tecnico_dni||'—'],['Cliente',a.cliente_nombre||a.rep_cliente_empresa],['Contrato',a.contrato_id],['Equipo ID',a.equipo_id],['Horómetro',`${a.horometro} hrs`],['Modelo completo',a.equipo_modelo],['N° Serie equipo',a.equipo_serie||'—'],['N° Serie motor',a.motor_serie||'—'],['Backlog generado',a.backlog_generado?'Sí':'No']].map(([lbl,val]) => (
                  <div key={lbl}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px' }}>{lbl}</div>
                    <div style={{ fontSize:13, fontWeight:600, marginTop:2 }}>{val||'—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Descripción de Componentes</h3>
              <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>{(a.componentes||[]).filter(c=>c.verificado).length}/{ITEMS_COMPONENTES.length} verificados</span>
              {obsComp.length > 0 && <span className="badge orange" style={{ fontSize:10, marginLeft:8 }}><span className="dot"/>{obsComp.length} obs</span>}
            </div>
            <div className="card-body"><CheckItem items={a.componentes} labels={ITEMS_COMPONENTES}/></div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>Motor Caterpillar</h3>
              <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>{(a.motor||[]).filter(m=>m.verificado).length}/{ITEMS_MOTOR.length} verificados</span>
              {obsMotor.length > 0 && <span className="badge orange" style={{ fontSize:10, marginLeft:8 }}><span className="dot"/>{obsMotor.length} obs</span>}
            </div>
            <div className="card-body"><CheckItem items={a.motor} labels={ITEMS_MOTOR}/></div>
          </div>
          <div className="card" style={{ gridColumn:'span 2' }}>
            <div className="card-header"><h3>Conformidad</h3></div>
            <div className="card-body">
              {a.rep_cliente_nombre ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:16 }}>
                  {[['Representante cliente',a.rep_cliente_nombre],['DNI representante',a.rep_cliente_dni||'—'],['Empresa',a.rep_cliente_empresa||'—'],['Supervisor mantto',a.supervisor_nombre||'—'],['Fecha conformidad',a.fecha_conformidad||'—']].map(([lbl,val]) => (
                    <div key={lbl}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px' }}>{lbl}</div>
                      <div style={{ fontSize:13, fontWeight:600, marginTop:2 }}>{val}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)', fontSize:13 }}>No se ha registrado conformidad del cliente aún.</div>
              )}
            </div>
          </div>
          {a.backlog_generado && (
            <div className="card" style={{ gridColumn:'span 2', borderLeft:'3px solid var(--cyan)' }}>
              <div className="card-header"><h3>Backlog generado desde esta acta</h3></div>
              <div className="card-body" style={{ fontSize:12, color:'var(--text-muted)' }}>Las observaciones de esta acta fueron enviadas al <strong>Backlog Operativo</strong> para seguimiento técnico.</div>
            </div>
          )}
        </div>
        <FooterBrand/>
      </div>
    );
  }

  // ── NUEVA ACTA VIEW ───────────────────────────────────────────────────────
  if (view === 'nueva') {
    const ct = CONTRATOS_MOCK.find(c => c.id === form.contrato_id);

    const STEP_CFG = [
      { id:1, label:'Cabecera',    icon:'briefcase', desc:'Identificacion del acta y del equipo' },
      { id:2, label:'Componentes', icon:'parts',     desc:'Estado de componentes estructurales' },
      { id:3, label:'Motor',       icon:'activity',  desc:'Inspeccion del motor Caterpillar' },
      { id:4, label:'Conformidad', icon:'check',     desc:'Firma y declaracion de conformidad' },
    ];

    const TIPO_OPTS = [
      { val:'despacho', icon:'arrow', label:'↑ Despacho a Mina', sub:'El equipo sale hacia la unidad minera' },
      { val:'retorno',  icon:'back',  label:'↓ Retorno a Base',  sub:'El equipo regresa al taller / base'   },
    ];

    const ChecklistEditor = ({ items, labels, fieldKey }) => (
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {labels.map((lbl, i) => {
          const item = items[i];
          const warn = !item.verificado && !item.obs.trim();
          return (
            <div key={i} style={{ border:`1px solid ${warn ? 'rgba(239,68,68,0.3)' : item.verificado ? 'rgba(34,197,94,0.2)' : 'var(--card-border)'}`, borderRadius:8, padding:'10px 14px', background: warn ? 'rgba(239,68,68,0.03)' : item.verificado ? 'rgba(34,197,94,0.03)' : '#fff' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', flex:1 }}>
                  <input type="checkbox" checked={item.verificado}
                    onChange={e => setForm(f => ({ ...f, [fieldKey]: f[fieldKey].map((it,j) => j===i ? { ...it, verificado:e.target.checked } : it) }))}
                    style={{ width:16, height:16, accentColor:'var(--cyan)', cursor:'pointer', flexShrink:0 }}
                  />
                  <span style={{ fontSize:13, fontWeight: item.verificado ? 400 : 500, lineHeight:1.4 }}>
                    <span style={{ color:'var(--text-muted)', marginRight:4, fontWeight:700 }}>{i+1}.</span>{lbl}
                  </span>
                </label>
                {warn && <span style={{ fontSize:10, color:'var(--red)', whiteSpace:'nowrap', fontWeight:700, flexShrink:0 }}>obs. requerida</span>}
              </div>
              <input className="input" style={{ marginTop:8, fontSize:12, opacity: item.verificado ? 0.6 : 1 }}
                placeholder={warn ? 'Observacion obligatoria si no se verifica...' : 'Observacion (opcional)'}
                value={item.obs}
                onChange={e => setForm(f => ({ ...f, [fieldKey]: f[fieldKey].map((it,j) => j===i ? { ...it, obs:e.target.value } : it) }))}
              />
            </div>
          );
        })}
      </div>
    );

    return (
      <>
        {backlogModalJsx}{toastJsx}
        <div className="wizard-layout" style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

          {/* ══ PANEL IZQUIERDO ════════════════════════════════════════════ */}
          <div className="wizard-detail-panel" style={{ width:272, flexShrink:0, background:'linear-gradient(180deg,#1A2B4A 0%,#1F3358 100%)', display:'flex', flexDirection:'column', padding:'24px 20px 32px', borderRight:'1px solid rgba(255,255,255,0.06)' }}>

            {/* Cabecera */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:32 }}>
              <button onClick={() => { setView('listado'); setPaso(1); setForm(FORM_INIT); }} style={{ color:'rgba(255,255,255,0.45)', padding:'5px 7px', borderRadius:7, background:'rgba(255,255,255,0.07)', marginTop:1, flexShrink:0, border:'1px solid rgba(255,255,255,0.08)' }}>
                <Icon name="back" size={14}/>
              </button>
              <div>
                <div style={{ color:'#fff', fontWeight:700, fontSize:15, lineHeight:1.2 }}>Nueva Acta</div>
                <div style={{ color:'var(--cyan)', fontSize:11, marginTop:3, fontWeight:600, letterSpacing:'0.3px' }}>
                  {form.tipo === 'despacho' ? 'Despacho a Mina' : 'Retorno a Base'}
                </div>
              </div>
            </div>

            {/* Stepper vertical */}
            <div>
              {STEP_CFG.map((s, i) => {
                const isActive = paso === s.id;
                const isDone   = paso > s.id;
                return (
                  <div key={s.id} style={{ display:'flex', gap:14 }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                      <div onClick={() => isDone && setPaso(s.id)} style={{ width:30, height:30, borderRadius:'50%', background: isDone ? 'var(--cyan)' : isActive ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.05)', border:`2px solid ${isDone || isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.12)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color: isDone ? '#fff' : isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.28)', cursor: isDone ? 'pointer' : 'default', boxShadow: isActive ? '0 0 0 4px rgba(0,188,212,0.12)' : 'none', transition:'all 0.2s', flexShrink:0 }}>
                        {isDone ? <Icon name="check" size={12}/> : s.id}
                      </div>
                      {i < STEP_CFG.length - 1 && <div style={{ width:2, height:34, background: isDone ? 'var(--cyan)' : 'rgba(255,255,255,0.07)', margin:'4px 0', borderRadius:1, transition:'background 0.3s' }}/>}
                    </div>
                    <div style={{ paddingTop:5 }}>
                      <div onClick={() => isDone && setPaso(s.id)} style={{ fontSize:13, fontWeight: isActive ? 700 : 500, cursor: isDone ? 'pointer' : 'default', lineHeight:1.3, color: isActive ? '#fff' : isDone ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)' }}>
                        {s.label}
                      </div>
                      {isActive && <div style={{ fontSize:10, color:'rgba(0,188,212,0.75)', marginTop:2, fontWeight:500, lineHeight:1.4 }}>{s.desc}</div>}
                      {i < STEP_CFG.length - 1 && <div style={{ height: isActive ? 22 : 30 }}/>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Divisor */}
            <div style={{ height:1, background:'rgba(255,255,255,0.07)', margin:'24px 0 20px' }}/>

            {/* Resumen en vivo */}
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.24)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:14 }}>Resumen en vivo</div>
              <SummaryRowA label="Tipo"         value={paso >= 1 ? (form.tipo === 'despacho' ? '↑ Despacho a Mina' : '↓ Retorno a Base') : null}/>
              <SummaryRowA label="Contrato"     value={form.contrato_id || null}/>
              <SummaryRowA label="Equipo"       value={form.equipo_modelo || form.equipo_id || null}/>
              <SummaryRowA label="Fecha"        value={form.fecha || null}/>
              <SummaryRowA label="Horometro"    value={form.horometro ? `${form.horometro} h` : null}/>
              <SummaryRowA label="Tecnico"      value={form.tecnico_nombre || null}/>
              <SummaryRowA label="Componentes"  value={paso >= 2 ? `${form.componentes.filter(c=>c.verificado).length}/${ITEMS_COMPONENTES.length} verif.` : null}/>
              <SummaryRowA label="Motor"        value={paso >= 3 ? `${form.motor.filter(m=>m.verificado).length}/${ITEMS_MOTOR.length} verif.` : null}/>
            </div>
          </div>

          {/* ══ PANEL DERECHO ══════════════════════════════════════════════ */}
          <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', justifyContent:'center' }}>
            <div style={{ width:'100%', maxWidth:860, padding:'32px 36px 80px' }}>

              {/* Cabecera del paso */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28, paddingBottom:22, borderBottom:'1px solid var(--card-border)' }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'var(--cyan-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--cyan)', flexShrink:0 }}>
                  <Icon name={STEP_CFG[paso-1].icon} size={20}/>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:2 }}>Paso {paso} de 4</div>
                  <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--navy)', lineHeight:1.2 }}>{STEP_CFG[paso-1].label}</h2>
                  <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text-muted)' }}>{STEP_CFG[paso-1].desc}</p>
                </div>
              </div>

              {/* ── Paso 1: Cabecera ─────────────────────────────────── */}
              {paso === 1 && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {/* Tipo de acta */}
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:16 }}>Tipo de acta *</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                      {TIPO_OPTS.map(opt => {
                        const sel = form.tipo === opt.val;
                        return (
                          <div key={opt.val} onClick={() => setField('tipo', opt.val)} style={{ background:'#fff', borderRadius:10, padding:'18px 20px', cursor:'pointer', position:'relative', border:`2px solid ${sel ? 'var(--cyan)' : 'var(--card-border)'}`, boxShadow: sel ? '0 4px 16px rgba(0,188,212,0.12)' : 'var(--shadow-sm)', transition:'border-color 0.18s,box-shadow 0.18s' }}>
                            <div style={{ position:'absolute', top:14, right:14, width:18, height:18, borderRadius:'50%', background: sel ? 'var(--cyan)' : 'transparent', border:`2px solid ${sel ? 'var(--cyan)' : '#D1D5DB'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {sel && <Icon name="check" size={10}/>}
                            </div>
                            <div style={{ width:40, height:40, borderRadius:9, background: sel ? 'var(--cyan-soft)' : '#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', color: sel ? 'var(--cyan)' : 'var(--slate)', marginBottom:12 }}>
                              <Icon name={opt.icon} size={20}/>
                            </div>
                            <div style={{ fontWeight:700, fontSize:14, color:'var(--navy)', marginBottom:4 }}>{opt.label}</div>
                            <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{opt.sub}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Contrato y equipo */}
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Contrato y equipo</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
                      <RichFieldA label="Contrato" required hint="Contrato activo asociado al despacho">
                        <select className="select" value={form.contrato_id} onChange={e => onContratoChange(e.target.value)}>
                          <option value="">— Seleccionar contrato —</option>
                          {CONTRATOS_MOCK.map(c => <option key={c.id} value={c.id}>{c.id} · {c.cliente}</option>)}
                        </select>
                      </RichFieldA>
                      <RichFieldA label="Equipo (desde contrato)" hint="Se completa automaticamente al seleccionar contrato">
                        <input className="input" readOnly value={form.equipo_modelo || form.equipo_id || '—'} style={{ background:'rgba(0,0,0,0.03)', color:'var(--text-muted)' }}/>
                      </RichFieldA>
                      <RichFieldA label="N° de serie del equipo" hint="Numero de bastidor o serie del equipo">
                        <input className="input" value={form.equipo_serie} onChange={e => setField('equipo_serie',e.target.value)} placeholder="Ej. COTR1300TNJB00333"/>
                      </RichFieldA>
                      <RichFieldA label="N° de serie del motor" hint="Numero de serie del motor principal">
                        <input className="input" value={form.motor_serie} onChange={e => setField('motor_serie',e.target.value)} placeholder="Ej. RCJ03275-3306B"/>
                      </RichFieldA>
                    </div>
                  </div>

                  {/* Datos del acta */}
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Datos del acta</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
                      <RichFieldA label="Fecha del acta" required hint="Fecha en que se realiza el despacho o retorno">
                        <input className="input" type="date" value={form.fecha} onChange={e => setField('fecha',e.target.value)}/>
                      </RichFieldA>
                      <RichFieldA label="Horometro actual (hrs)" required hint="Lectura del horometro al momento del acta">
                        <input className="input" type="number" step="0.1" value={form.horometro} onChange={e => setField('horometro',e.target.value)} placeholder="Ej. 3464.3"/>
                      </RichFieldA>
                    </div>
                    <RichFieldA label="Tecnico Asignado" required hint="Tecnico responsable del despacho o retorno">
                      <select className="select" value={form.tecnico_nombre} onChange={e => setField('tecnico_nombre',e.target.value)}>
                        <option value="">— Seleccionar tecnico —</option>
                        {(ZAHORY_SAC_DATA.personalOperativo||[]).map(p => <option key={p.cod} value={p.nombre}>{p.nombre} · {p.cargo}</option>)}
                      </select>
                    </RichFieldA>
                  </div>
                </div>
              )}

              {/* ── Paso 2: Componentes ──────────────────────────────── */}
              {paso === 2 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Verificacion de componentes</div>
                        <div style={{ fontSize:13, color:'var(--text)', marginTop:4 }}>
                          {form.componentes.filter(c=>c.verificado).length} de {ITEMS_COMPONENTES.length} items verificados
                        </div>
                      </div>
                      {!paso2Valid && <span className="badge red" style={{ fontSize:10 }}><span className="dot"/> Items sin observacion</span>}
                    </div>
                  </div>
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <ChecklistEditor items={form.componentes} labels={ITEMS_COMPONENTES} fieldKey="componentes"/>
                  </div>
                </div>
              )}

              {/* ── Paso 3: Motor ────────────────────────────────────── */}
              {paso === 3 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px' }}>Inspeccion del motor Caterpillar</div>
                        <div style={{ fontSize:13, color:'var(--text)', marginTop:4 }}>
                          {form.motor.filter(m=>m.verificado).length} de {ITEMS_MOTOR.length} items verificados
                        </div>
                      </div>
                      {!paso3Valid && <span className="badge red" style={{ fontSize:10 }}><span className="dot"/> Items sin observacion</span>}
                    </div>
                  </div>
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <ChecklistEditor items={form.motor} labels={ITEMS_MOTOR} fieldKey="motor"/>
                  </div>
                </div>
              )}

              {/* ── Paso 4: Conformidad ──────────────────────────────── */}
              {paso === 4 && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div className="card" style={{ padding:'22px 24px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:18 }}>Datos del representante del cliente</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
                      <RichFieldA label="Nombre del representante" required hint="Nombre completo de quien recibe el equipo">
                        <input className="input" value={form.rep_cliente_nombre} onChange={e => setField('rep_cliente_nombre',e.target.value)} placeholder="Nombre completo"/>
                      </RichFieldA>
                      <RichFieldA label="DNI del representante" hint="Numero de documento de identidad">
                        <input className="input" value={form.rep_cliente_dni} onChange={e => setField('rep_cliente_dni',e.target.value)} placeholder="Numero de DNI"/>
                      </RichFieldA>
                      <RichFieldA label="Empresa del cliente" hint="Razon social de la empresa cliente">
                        <input className="input" value={form.rep_cliente_empresa} onChange={e => setField('rep_cliente_empresa',e.target.value)} placeholder="Nombre de la empresa"/>
                      </RichFieldA>
                      <RichFieldA label="Supervisor de mantenimiento" hint="Opcional — supervisor que acompana el acta">
                        <input className="input" value={form.supervisor_nombre} onChange={e => setField('supervisor_nombre',e.target.value)} placeholder="Nombre del supervisor"/>
                      </RichFieldA>
                      <RichFieldA label="Fecha de conformidad" hint="Fecha en que se firma la conformidad">
                        <input className="input" type="date" value={form.fecha_conformidad} onChange={e => setField('fecha_conformidad',e.target.value)}/>
                      </RichFieldA>
                    </div>
                  </div>

                  {/* Declaracion */}
                  <div onClick={() => setField('declaracion', !form.declaracion)} style={{ background:'#fff', borderRadius:10, padding:'18px 20px', cursor:'pointer', border:`2px solid ${form.declaracion ? 'var(--cyan)' : 'var(--card-border)'}`, boxShadow: form.declaracion ? '0 4px 16px rgba(0,188,212,0.1)' : 'var(--shadow-sm)', transition:'all 0.18s', display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ width:20, height:20, borderRadius:5, background: form.declaracion ? 'var(--cyan)' : 'transparent', border:`2px solid ${form.declaracion ? 'var(--cyan)' : '#D1D5DB'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                      {form.declaracion && <Icon name="check" size={12}/>}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:'var(--navy)', marginBottom:4 }}>Declaracion de conformidad *</div>
                      <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.55 }}>
                        Declaro que el equipo descrito se entrega en <strong>estado operativo y sin desperfectos</strong>, conforme al checklist realizado.
                      </div>
                    </div>
                  </div>

                  {/* Opciones de guardado */}
                  <div className="card" style={{ padding:'16px 24px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>Guardar acta como</div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleSave('borrador')} style={{ flex:1, justifyContent:'center' }}>Borrador</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleSave('pendiente_conformidad')} style={{ flex:1, justifyContent:'center' }}>Pendiente de firma</button>
                      <button className="btn btn-cyan btn-sm" disabled={!form.rep_cliente_nombre||!form.declaracion} onClick={() => handleSave('conformidad_firmada')} style={{ flex:2, justifyContent:'center', display:'flex', alignItems:'center', gap:6 }}>
                        <Icon name="check" size={14}/> Registrar conformidad firmada
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Navegacion */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:32 }}>
                <button className="btn btn-ghost" disabled={paso === 1} onClick={() => setPaso(p => Math.max(1, p-1))} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Icon name="back" size={14}/> Anterior
                </button>
                {paso < 4 && (
                  <button className="btn btn-cyan"
                    disabled={
                      (paso === 1 && (!form.contrato_id||!form.fecha||!form.horometro||!form.tecnico_nombre)) ||
                      (paso === 2 && !paso2Valid) ||
                      (paso === 3 && !paso3Valid)
                    }
                    onClick={() => setPaso(p => Math.min(4, p+1))}
                    style={{ display:'flex', alignItems:'center', gap:6 }}
                  >
                    Siguiente <Icon name="arrow" size={14}/>
                  </button>
                )}
              </div>
              <FooterBrand/>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Helpers de Actas & Despachos ─────────────────────────────────────────
  const getOTMovilizacion = (acta) => {
    if (acta.tipo === 'retorno') {
      return acta.ot_movilizacion_id
        ? { label: `OT desmovilización: ${acta.ot_movilizacion_id}`, color: '#22c55e' }
        : { label: '⚠ Sin OT desmovilización', color: '#ef4444' };
    }
    return acta.ot_movilizacion_id
      ? { label: `OT movilización: ${acta.ot_movilizacion_id}`, color: '#22c55e' }
      : { label: '⚠ Sin OT movilización', color: '#f59e0b' };
  };

  const handleRegistrarFirma = (actaId) => {
    const hoy = new Date().toISOString().split('T')[0];
    setActas(prev => prev.map(a =>
      a.id === actaId
        ? { ...a, estado: 'conformidad_firmada', firmado_por_cliente: 'Representante registrado', firmado_fecha: hoy }
        : a
    ));
    setPanelActa(null);
    showToast('Firma registrada. Equipo activado en contrato. OT de movilización generada.');
  };

  // ── LISTADO VIEW (default) ────────────────────────────────────────────────
  const total      = actas.length;
  const pendFirma  = actas.filter(a => a.estado === 'pendiente_conformidad').length;
  const firmadas   = actas.filter(a => a.estado === 'conformidad_firmada').length;

  return (
    <div className="page">
      {anularModalJsx}{backlogModalJsx}{toastJsx}
      <div className="page-header">
        <div><h1>Actas / Despachos</h1><div className="sub">Registro digital de despachos y retornos de equipos</div></div>
        <div className="spacer"/>
        <button className="btn btn-cyan" onClick={() => setView('nueva')}><Icon name="plus" size={14}/> Nueva acta</button>
      </div>

      <div className="report-kpi-grid">
        <div className="kpi"><div className="kpi-header"><div className="label">Actas totales</div><div className="kpi-icon-wrap"><Icon name="orders" size={16}/></div></div><div className="value">{total}</div></div>
        <div className="kpi orange-soft"><div className="kpi-header"><div className="label">Pendientes de firma</div><div className="kpi-icon-wrap"><Icon name="clock" size={16}/></div></div><div className="value" style={{color:'#d97706'}}>{pendFirma}</div></div>
        <div className="kpi green-soft"><div className="kpi-header"><div className="label">Firmadas</div><div className="kpi-icon-wrap"><Icon name="check" size={16}/></div></div><div className="value" style={{color:'#15803d'}}>{firmadas}</div></div>
        <div className="kpi"><div className="kpi-header"><div className="label">Despachos</div><div className="kpi-icon-wrap"><Icon name="truck" size={16}/></div></div><div className="value">{actas.filter(a=>a.tipo==='despacho').length}</div></div>
      </div>

      {/* Tabs */}
      <div className="report-toolbar">
        <div className="report-tabs">
        {[{id:'todas',label:`Todas (${total})`},{id:'despachos',label:`Despachos (${actas.filter(a=>a.tipo==='despacho').length})`},{id:'retornos',label:`Retornos (${actas.filter(a=>a.tipo==='retorno').length})`},{id:'pendientes',label:`Pendientes de firma (${pendFirma})`}].map(t => (
          <button key={t.id} className={'report-tab' + (tab===t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ minWidth:130 }}>N° Acta</th>
                <th style={{ width:90 }}>Tipo</th>
                <th>Equipo / Serie</th>
                <th>Cliente</th>
                <th style={{ width:120 }}>Contrato / CC</th>
                <th style={{ width:90 }}>Fecha</th>
                <th style={{ width:140 }}>Horómetro</th>
                <th>Técnico</th>
                <th style={{ width:140 }}>Estado</th>
                <th style={{ width:170 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!actasFiltradas.length && (
                <tr><td colSpan={10} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>No hay actas para los filtros seleccionados.</td></tr>
              )}
              {actasFiltradas.map(a => {
                const otInfo = getOTMovilizacion(a);
                return (
                  <tr key={a.id}>
                    {/* N° Acta */}
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <strong style={{ fontSize:13, fontWeight:500 }}>{a.numero}</strong>
                        {hasAlertItems(a) && <span title="Tiene observaciones o ítems sin verificar" style={{ fontSize:13 }}>⚠️</span>}
                        {a.backlog_generado && <span className="badge cyan" style={{ fontSize:9 }}>BKL</span>}
                      </div>
                    </td>

                    {/* Tipo */}
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{
                        fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600,
                        background: a.tipo === 'despacho' ? 'rgba(59,130,246,0.12)' : 'rgba(100,116,139,0.12)',
                        color: a.tipo === 'despacho' ? '#3b82f6' : '#94a3b8',
                      }}>
                        {a.tipo === 'despacho' ? '↑ Despacho' : '↓ Retorno'}
                      </span>
                    </td>

                    {/* Equipo / Serie */}
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{a.equipo_modelo || a.equipo_id}</div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{a.equipo_serie || '—'}</div>
                    </td>

                    {/* Cliente */}
                    <td style={{ padding:'12px 16px', fontSize:13, fontWeight:500 }}>
                      {a.cliente_nombre || a.rep_cliente_empresa || '—'}
                    </td>

                    {/* Contrato / CC — Corrección 1 + 6 */}
                    <td style={{ padding:'12px 16px' }}>
                      <span
                        style={{ color:'#60a5fa', cursor:'pointer', fontSize:12, fontWeight:500, fontFamily:'monospace' }}
                        onClick={() => onNav('contratos-rental')}
                      >
                        {a.contrato_id || '—'}
                      </span>
                      {a.centro_costo && (
                        <span style={{
                          display:'block', marginTop:3,
                          background:'rgba(245,158,11,0.12)', color:'#f59e0b',
                          fontSize:'8.5px', fontFamily:'monospace', fontWeight:600,
                          padding:'1px 6px', borderRadius:8, width:'fit-content',
                        }}>
                          {a.centro_costo}
                        </span>
                      )}
                    </td>

                    {/* Fecha */}
                    <td style={{ padding:'12px 16px', fontSize:13 }}>{a.fecha}</td>

                    {/* Horómetro — Corrección 5 */}
                    <td style={{ padding:'12px 16px' }}>
                      {a.tipo === 'retorno' && a.horometro_retorno ? (
                        <div>
                          <div style={{ fontSize:11, color:'#64748b' }}>
                            Despacho: {Number(a.horometro).toLocaleString()} h
                          </div>
                          <div style={{ fontSize:13, fontWeight:600 }}>
                            Retorno: {Number(a.horometro_retorno).toLocaleString()} h
                          </div>
                          <div style={{ fontSize:11, color:'#22c55e' }}>
                            +{(a.horometro_retorno - a.horometro).toLocaleString()} h en campo
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize:13, fontWeight:600 }}>
                          {a.horometro?.toLocaleString()} h
                        </div>
                      )}
                    </td>

                    {/* Técnico */}
                    <td style={{ padding:'12px 16px', fontSize:12 }}>{a.tecnico_nombre}</td>

                    {/* Estado — Corrección 4 */}
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{
                        fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600,
                        background: a.estado === 'conformidad_firmada'
                          ? 'rgba(34,197,94,0.12)'
                          : a.estado === 'pendiente_conformidad'
                            ? 'rgba(245,158,11,0.12)'
                            : a.estado === 'anulada'
                              ? 'rgba(239,68,68,0.12)'
                              : 'rgba(100,116,139,0.12)',
                        color: a.estado === 'conformidad_firmada'
                          ? '#22c55e'
                          : a.estado === 'pendiente_conformidad'
                            ? '#f59e0b'
                            : a.estado === 'anulada'
                              ? '#ef4444'
                              : '#94a3b8',
                      }}>
                        {a.estado === 'conformidad_firmada'
                          ? 'Firmada'
                          : a.estado === 'pendiente_conformidad'
                            ? 'Pendiente de firma'
                            : a.estado === 'anulada'
                              ? 'Anulada'
                              : a.estado}
                      </span>
                      {a.estado === 'pendiente_conformidad' && (
                        <div style={{ fontSize:'9px', color:'#f59e0b', fontWeight:600, marginTop:4, fontFamily:'monospace' }}>
                          ⚠ Equipo no activado en contrato
                        </div>
                      )}
                    </td>

                    {/* Acciones — Correcciones 2, 4 */}
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize:11, padding:'3px 8px' }}
                          title="Ver detalle"
                          onClick={() => { setPanelActa(a); setTabPanel('datos'); }}
                        >
                          Ver
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize:11, padding:'3px 8px' }}
                          title="Vista PDF"
                          onClick={() => setPreviewActa(a)}
                        >
                          PDF
                        </button>
                        {a.estado === 'pendiente_conformidad' && (
                          <button
                            className="btn btn-cyan btn-sm"
                            style={{ fontSize:10, padding:'3px 8px' }}
                            onClick={() => handleRegistrarFirma(a.id)}
                          >
                            Firmar
                          </button>
                        )}
                        {a.estado !== 'anulada' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize:11, color:'#ef4444', padding:'3px 8px' }}
                            title="Anular acta"
                            onClick={() => setAnularId(a.id)}
                          >
                            Anular
                          </button>
                        )}
                      </div>
                      {/* Indicador OT movilización — Corrección 2 */}
                      <div style={{ fontSize:10, color: otInfo.color, marginTop:4, fontFamily:'monospace', lineHeight:1.3 }}>
                        {otInfo.label}
                      </div>
                      {!a.ot_movilizacion_id && a.estado !== 'anulada' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize:9, marginTop:3, padding:'2px 6px', color:'#94a3b8' }}
                          onClick={() => onNav('crear-ot')}
                        >
                          + Generar OT
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Panel lateral — Corrección 3 ───────────────────────────────── */}
      {panelActa && (() => {
        const pa = panelActa;
        return (
          <>
            <div
              style={{ position:'fixed', inset:0, background:'rgba(10,17,32,0.50)', zIndex:900 }}
              onClick={() => setPanelActa(null)}
            />
            <div style={{
              position:'fixed', top:0, right:0, bottom:0, width:560,
              background:'white', zIndex:910,
              boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',
              display:'flex', flexDirection:'column', overflowY:'hidden',
            }}>
              {/* Header del panel */}
              <div style={{ padding:'16px 20px', background:'var(--navy)', color:'white', display:'flex', alignItems:'flex-start', gap:12, flexShrink:0 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontFamily:'ui-monospace,monospace', fontWeight:800, fontSize:15 }}>{pa.numero}</span>
                    <span style={{
                      fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600,
                      background: pa.tipo === 'despacho' ? 'rgba(59,130,246,0.25)' : 'rgba(100,116,139,0.25)',
                      color: pa.tipo === 'despacho' ? '#93c5fd' : '#cbd5e1',
                    }}>
                      {pa.tipo === 'despacho' ? '↑ Despacho' : '↓ Retorno'}
                    </span>
                    <span style={{
                      fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600,
                      background: pa.estado === 'conformidad_firmada' ? 'rgba(34,197,94,0.20)' : pa.estado === 'pendiente_conformidad' ? 'rgba(245,158,11,0.20)' : 'rgba(239,68,68,0.20)',
                      color: pa.estado === 'conformidad_firmada' ? '#86efac' : pa.estado === 'pendiente_conformidad' ? '#fcd34d' : '#fca5a5',
                    }}>
                      {pa.estado === 'conformidad_firmada' ? 'Firmada' : pa.estado === 'pendiente_conformidad' ? 'Pendiente de firma' : 'Anulada'}
                    </span>
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, opacity:.9 }}>{pa.equipo_modelo || pa.equipo_id}</div>
                  <div style={{ fontSize:11, opacity:.65, marginTop:2 }}>Serie: {pa.equipo_serie || '—'}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setPanelActa(null)}
                  style={{ color:'rgba(255,255,255,0.75)', marginTop:-4 }}>
                  <Icon name="x" size={15}/>
                </button>
              </div>

              {/* Tabs del panel */}
              <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0', background:'#F8FAFC', flexShrink:0 }}>
                {[{ key:'datos', label:'Datos del acta' }, { key:'checklist', label:'Checklist de inspección' }].map(t => (
                  <button key={t.key} onClick={() => setTabPanel(t.key)} style={{
                    padding:'12px 20px', fontSize:13, fontWeight: tabPanel===t.key ? 700 : 400,
                    background:'none', border:'none', cursor:'pointer',
                    color: tabPanel===t.key ? 'var(--navy)' : 'var(--text-muted)',
                    borderBottom:`2px solid ${tabPanel===t.key ? 'var(--cyan)' : 'transparent'}`,
                    marginBottom:-1,
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Contenido del panel */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

                {/* ── TAB 1: Datos del acta ── */}
                {tabPanel === 'datos' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                    <section>
                      <div style={{ fontSize:10, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10, borderBottom:'1px solid #E2E8F0', paddingBottom:6 }}>Datos del evento</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                        {[
                          ['Tipo',     pa.tipo === 'despacho' ? 'Despacho' : 'Retorno'],
                          ['Contrato', pa.contrato_id || '—'],
                          ['Cliente',  pa.cliente_nombre || pa.rep_cliente_empresa || '—'],
                          ['Fecha',    pa.fecha || '—'],
                          ['Técnico',  pa.tecnico_nombre || '—'],
                          ['CC',       pa.centro_costo || '—'],
                        ].map(([lbl, val]) => (
                          <div key={lbl}>
                            <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>{lbl}</div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div style={{ fontSize:10, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10, borderBottom:'1px solid #E2E8F0', paddingBottom:6 }}>Horómetros</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                        <div>
                          <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Al despacho</div>
                          <div style={{ fontSize:13, fontWeight:500 }}>{pa.horometro?.toLocaleString()} h</div>
                        </div>
                        <div>
                          <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Al retorno</div>
                          <div style={{ fontSize:13, fontWeight:500 }}>{pa.horometro_retorno ? `${Number(pa.horometro_retorno).toLocaleString()} h` : '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Diferencia</div>
                          <div style={{ fontSize:13, fontWeight:600, color: pa.horometro_retorno ? '#22c55e' : '#94a3b8' }}>
                            {pa.horometro_retorno ? `+${(pa.horometro_retorno - pa.horometro).toLocaleString()} h` : '—'}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <div style={{ fontSize:10, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10, borderBottom:'1px solid #E2E8F0', paddingBottom:6 }}>OT de movilización</div>
                      {pa.ot_movilizacion_id ? (
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#60a5fa' }}>{pa.ot_movilizacion_id}</span>
                          <span style={{ fontSize:11, fontWeight:600, color: pa.ot_movilizacion_estado === 'cerrada' ? '#22c55e' : '#f59e0b' }}>
                            ● {pa.ot_movilizacion_estado === 'cerrada' ? 'Cerrada' : 'Abierta'}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>⚠ Sin OT de movilización</span>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize:10 }}
                            onClick={() => { setPanelActa(null); onNav('crear-ot'); }}>
                            + Generar OT
                          </button>
                        </div>
                      )}
                    </section>

                    <section>
                      <div style={{ fontSize:10, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10, borderBottom:'1px solid #E2E8F0', paddingBottom:6 }}>Firma</div>
                      {pa.firmado_por_cliente ? (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                          <div>
                            <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Firmado por cliente</div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{pa.firmado_por_cliente}</div>
                          </div>
                          <div>
                            <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Fecha firma</div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{pa.firmado_fecha || '—'}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>⚠ Pendiente de firma del cliente</span>
                          <button className="btn btn-cyan btn-sm" style={{ fontSize:10 }}
                            onClick={() => handleRegistrarFirma(pa.id)}>
                            Registrar firma
                          </button>
                        </div>
                      )}
                    </section>

                    <section>
                      <div style={{ fontSize:10, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:10, borderBottom:'1px solid #E2E8F0', paddingBottom:6 }}>Observaciones</div>
                      <div style={{ fontSize:13, color: pa.observaciones ? '#1e293b' : '#94a3b8', lineHeight:1.5 }}>
                        {pa.observaciones || 'Sin observaciones'}
                      </div>
                    </section>
                  </div>
                )}

                {/* ── TAB 2: Checklist de inspección ── */}
                {tabPanel === 'checklist' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    {pa.checklist ? (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                          <div>
                            <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Inspeccionado por</div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{pa.checklist.inspeccionado_por || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize:9.5, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:2 }}>Fecha inspección</div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{pa.checklist.fecha_inspeccion || '—'}</div>
                          </div>
                          <div style={{ gridColumn:'span 2' }}>
                            <span style={{
                              fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                              background: pa.checklist.completado ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                              color: pa.checklist.completado ? '#22c55e' : '#f59e0b',
                            }}>
                              {pa.checklist.completado ? '✓ Completo' : '⚠ Incompleto — hay observaciones pendientes'}
                            </span>
                          </div>
                        </div>

                        <div style={{ border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                            <thead>
                              <tr style={{ background:'#F8FAFC' }}>
                                <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'.6px', width:'50%' }}>Ítem</th>
                                <th style={{ padding:'10px 12px', textAlign:'center', fontWeight:700, color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'.6px', width:'20%' }}>Resultado</th>
                                <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'.6px' }}>Nota</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pa.checklist.items.map((item, i) => (
                                <tr key={i} style={{ borderTop:'1px solid #F1F5F9', background: item.ok ? 'white' : 'rgba(239,68,68,0.03)' }}>
                                  <td style={{ padding:'10px 12px', fontWeight:500, fontSize:12 }}>{item.label}</td>
                                  <td style={{ padding:'10px 12px', textAlign:'center' }}>
                                    <span style={{ fontSize:11, fontWeight:700, color: item.ok ? '#22c55e' : '#ef4444' }}>
                                      {item.ok ? '✓ OK' : '✗ Observado'}
                                    </span>
                                  </td>
                                  <td style={{ padding:'10px 12px', color: item.nota ? '#374151' : '#94a3b8', fontSize:11 }}>
                                    {item.nota || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {pa.checklist.items.some(i => !i.ok) && pa.observaciones && (
                          <div style={{
                            background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
                            borderRadius:8, padding:'10px 14px', fontSize:12, color:'#dc2626', fontWeight:600,
                            lineHeight:1.5,
                          }}>
                            ⚠ {pa.observaciones}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign:'center', color:'#94a3b8', fontSize:13, padding:32 }}>
                        No hay checklist estructurado para esta acta.
                        <div style={{ fontSize:11, marginTop:4 }}>Ver el detalle completo con el botón "Ver" en la fila.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      <FooterBrand/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. LIQUIDACIÓN Y REPORTE DMR — Componentes de soporte
// ═══════════════════════════════════════════════════════════════════════════

// Mini sparkline para la columna de tendencia en la tabla principal
const SparklineMini = ({ dias }) => {
  const vals = dias.filter(d => d.dmrPct !== null).map(d => d.dmrPct);
  if (vals.length < 2) return null;
  const w = 80, h = 28, minV = 50, maxV = 100;
  const scaleY = v => h - ((v - minV) / (maxV - minV)) * h;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${scaleY(v)}`).join(' ');
  const last = vals[vals.length - 1];
  const rising = last >= vals[0];
  return (
    <svg width={w} height={h} style={{ display:'block', overflow:'visible' }}>
      <polyline points={pts} fill="none"
        stroke={rising ? '#22c55e' : '#ef4444'} strokeWidth={1.8}
        strokeLinejoin="round" strokeLinecap="round"/>
      <circle
        cx={(vals.length - 1) / (vals.length - 1) * w}
        cy={scaleY(last)} r={3}
        fill={rising ? '#22c55e' : '#ef4444'}/>
    </svg>
  );
};

// Gráfico de línea completo para la vista detalle
const DisponibilidadChart = ({ dias, metaDMR }) => {
  const [hover, setHover] = useState(null);
  const activeDias = dias.filter(d => (d.opH + d.paradaH) > 0);
  if (activeDias.length === 0) {
    return (
      <div style={{
        height:160, display:'grid', placeItems:'center',
        color:'var(--text-muted)', fontSize:12,
        border:'1px dashed var(--card-border)', borderRadius:8,
      }}>
        Sin datos para el rango seleccionado.
      </div>
    );
  }
  const w = 700, h = 160, padL = 44, padR = 16, padT = 12, padB = 32;
  const minV = 40, maxV = 100;
  const xOf = i => activeDias.length === 1
    ? padL + (w - padL - padR) / 2
    : padL + (w - padL - padR) * (i / (activeDias.length - 1));
  const yOf = v => padT + (h - padT - padB) * (1 - (v - minV) / (maxV - minV));
  const metaY = yOf(metaDMR);
  const pts = activeDias.map((d, i) => `${xOf(i)},${yOf(d.dmrPct || 0)}`).join(' ');
  const areaD = `M${xOf(0)},${yOf(activeDias[0]?.dmrPct || 0)} ` +
    activeDias.map((d, i) => `L${xOf(i)},${yOf(d.dmrPct || 0)}`).join(' ') +
    ` L${xOf(activeDias.length - 1)},${h - padB} L${xOf(0)},${h - padB} Z`;

  return (
    <div style={{ position:'relative', width:'100%', overflowX:'auto' }}>
      <svg width={w} height={h} style={{ display:'block' }}>
        <defs>
          <linearGradient id="dmrAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        {/* Gridlines */}
        {[40, 60, 80, 100].map(v => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={yOf(v)} y2={yOf(v)} stroke="#f1f5f9" strokeWidth={1}/>
            <text x={padL - 5} y={yOf(v) + 4} fontSize={9} fill="#94a3b8" textAnchor="end">{v}%</text>
          </g>
        ))}
        {/* Meta DMR line */}
        <line x1={padL} x2={w - padR} y1={metaY} y2={metaY} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}/>
        <text x={w - padR - 2} y={metaY - 5} fontSize={9} fill="#ef4444" textAnchor="end" fontWeight="700">
          Meta {metaDMR}%
        </text>
        {/* Area fill */}
        <path d={areaD} fill="url(#dmrAreaGrad)"/>
        {/* Line */}
        <polyline points={pts} fill="none" stroke="#0ea5e9" strokeWidth={2.2}
          strokeLinejoin="round" strokeLinecap="round"/>
        {/* X axis day labels every 5 */}
        {activeDias.map((d, i) => {
          if (i % 5 !== 0 && i !== activeDias.length - 1) return null;
          return (
            <text key={d.dia} x={xOf(i)} y={h - padB + 14} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {d.dia}
            </text>
          );
        })}
        {/* Interaction dots */}
        {activeDias.map((d, i) => (
          <g key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor:'pointer' }}>
            <rect x={xOf(i) - (w / activeDias.length / 2)} y={padT}
              width={w / activeDias.length} height={h - padT - padB} fill="transparent"/>
            <circle cx={xOf(i)} cy={yOf(d.dmrPct || 0)}
              r={hover === i ? 5 : 3}
              fill={(d.dmrPct || 0) < metaDMR ? '#ef4444' : '#0ea5e9'}
              style={{ transition:'r .1s' }}/>
          </g>
        ))}
      </svg>
      {hover !== null && activeDias[hover] && (
        <div style={{
          position:'absolute',
          left: xOf(hover),
          top: yOf(activeDias[hover].dmrPct || 0) - 46,
          background:'#1e293b', color:'white',
          padding:'6px 10px', borderRadius:6,
          fontSize:11.5, fontWeight:700,
          pointerEvents:'none', transform:'translateX(-50%)',
          boxShadow:'0 4px 16px rgba(0,0,0,0.35)',
          whiteSpace:'nowrap',
        }}>
          Día {activeDias[hover].dia} Abr: {activeDias[hover].dmrPct}%
          {activeDias[hover].tipo && (
            <span style={{
              marginLeft:8, fontSize:10.5,
              color: activeDias[hover].tipo === 'NP' ? '#fca5a5' : '#fcd34d',
            }}>
              ({activeDias[hover].tipo === 'NP' ? 'No Prog.' : 'Prog.'})
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Modal de confirmación y cálculo de liquidación
const ModalLiquidacion = ({ equipo, onClose }) => {
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const hFact    = Math.max(equipo.horasReales, equipo.horasContrato);
  const subtotal = hFact * equipo.tarifa;
  const penalidad = equipo.dmr < equipo.metaDMR
    ? ((equipo.metaDMR - equipo.dmr) / 100) * equipo.horasContrato * equipo.tarifa * 0.5
    : 0;
  const total = subtotal - penalidad;

  const handleConfirmar = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setDone(true); }, 1200);
  };

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(15,23,42,0.72)',
      zIndex:1100, display:'grid', placeItems:'center', padding:20,
    }}
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="card" style={{ width:'100%', maxWidth:520, animation:'fadeInUp 0.2s ease-out' }}>
        <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0' }}>
          <div>
            <h3 style={{ margin:0 }}>Cerrar Liquidación</h3>
            <div style={{ fontSize:12, opacity:.7, marginTop:2 }}>
              {equipo.equipo} · {equipo.cliente} · Abril 2026
            </div>
          </div>
          <div className="spacer"/>
          <button className="icon-btn" onClick={onClose} style={{ color:'white' }}>
            <Icon name="x" size={16}/>
          </button>
        </div>

        {done ? (
          <div className="card-body" style={{ textAlign:'center', padding:'40px 24px' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>✓</div>
            <h3 style={{ color:'#15803d', margin:'0 0 8px' }}>Liquidación Confirmada</h3>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>
              {equipo.equipo} pasado a estado "Facturado". El área financiera recibirá la notificación.
            </div>
            <button className="btn btn-primary" style={{ marginTop:20 }} onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Resumen período */}
              <div style={{ background:'#F8FAFC', borderRadius:8, padding:'14px 16px', border:'1px solid var(--card-border)' }}>
                <div style={{ fontWeight:800, fontSize:11, textTransform:'uppercase', letterSpacing:.8, color:'var(--text-muted)', marginBottom:10 }}>
                  Resumen del Período
                </div>
                {[
                  ['Horas Mínimas (Contrato)',      `${equipo.horasContrato} h`],
                  ['Horas Reales (Partes Diarios)', `${equipo.horasReales} h`],
                  ['Horas de Parada (Taller)',       `${equipo.horasParada} h`],
                  ['Horas a Facturar (max real/mín)',`${hFact} h`],
                  ['Tarifa por Hora',                `$${equipo.tarifa.toFixed(2)}`],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display:'flex', justifyContent:'space-between', padding:'4px 0',
                    fontSize:12.5, borderBottom:'1px solid #F0F2F5',
                  }}>
                    <span style={{ color:'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontWeight:700, fontFamily:'ui-monospace,monospace' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Cálculo */}
              <div style={{
                background: penalidad > 0 ? '#FFF5F5' : '#F0FDF4',
                borderRadius:8, padding:'14px 16px',
                border:`1px solid ${penalidad > 0 ? '#fca5a5' : '#86efac'}`,
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                  <span>Subtotal ({hFact}h × ${equipo.tarifa.toFixed(2)})</span>
                  <span style={{ fontWeight:700, fontFamily:'ui-monospace,monospace' }}>
                    ${subtotal.toLocaleString('en-US', { minimumFractionDigits:2 })}
                  </span>
                </div>
                {penalidad > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#dc2626', marginBottom:8 }}>
                    <span>⚠ Penalidad DMR ({equipo.dmr.toFixed(1)}% vs meta {equipo.metaDMR}%)</span>
                    <span style={{ fontWeight:700, fontFamily:'ui-monospace,monospace' }}>
                      −${penalidad.toLocaleString('en-US', { minimumFractionDigits:2 })}
                    </span>
                  </div>
                )}
                <div style={{
                  display:'flex', justifyContent:'space-between',
                  fontSize:16, fontWeight:800,
                  paddingTop:10, borderTop:`2px solid ${penalidad > 0 ? '#fca5a5' : '#86efac'}`,
                }}>
                  <span>TOTAL A FACTURAR (USD)</span>
                  <span style={{
                    fontFamily:'ui-monospace,monospace',
                    color: penalidad > 0 ? '#dc2626' : '#15803d',
                  }}>
                    ${total.toLocaleString('en-US', { minimumFractionDigits:2 })}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display:'flex', gap:10, padding:'4px 16px 16px' }}>
              <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}
                onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
                onClick={handleConfirmar} disabled={saving}>
                {saving
                  ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2, marginRight:6 }}/> Procesando...</>
                  : <><Icon name="check" size={13}/> Confirmar y Facturar</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Vista detalle de disponibilidad por equipo
const LiquidacionDetalleEquipo = ({ equipo, onBack, onNav, setCurrentOT }) => {
  const monthLabel = 'Abril 2026';
  const monthValue = '2026-04';
  const firstDay = Math.min(...equipo.dias.map(d => d.dia));
  const lastDay = Math.max(...equipo.dias.map(d => d.dia));
  const dayToDate = (day) => `${monthValue}-${String(day).padStart(2, '0')}`;
  const [fechaDesde, setFechaDesde] = useState(dayToDate(firstDay));
  const [fechaHasta, setFechaHasta] = useState(dayToDate(lastDay));

  const diasFiltrados = equipo.dias.filter(d => {
    const fecha = dayToDate(d.dia);
    return fecha >= fechaDesde && fecha <= fechaHasta;
  });
  const totalOp  = diasFiltrados.reduce((s, d) => s + d.opH, 0);
  const totalPar = diasFiltrados.reduce((s, d) => s + d.paradaH, 0);
  const dmrCalc  = totalOp + totalPar > 0 ? ((totalOp / (totalOp + totalPar)) * 100).toFixed(1) : '0.0';
  const npCount  = diasFiltrados.filter(d => d.tipo === 'NP').length;
  const pCount   = diasFiltrados.filter(d => d.tipo === 'P').length;
  const formatDateLabel = (value) => value.split('-').reverse().join('/');
  const periodoLabel = `${formatDateLabel(fechaDesde)} - ${formatDateLabel(fechaHasta)}`;

  const handleOTClick = (otRef) => {
    if (onNav && setCurrentOT) {
      setCurrentOT(otRef);
      onNav('ot-detalle');
    }
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ flexWrap:'wrap', gap:10 }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="back" size={14}/> Volver a Liquidación General
        </button>
        <div>
          <h1>
            <span style={{ fontFamily:'ui-monospace,monospace', color:'var(--cyan)' }}>{equipo.equipo}</span>
            {' '}— Reporte de Disponibilidad
          </h1>
          <div className="sub">{monthLabel} · {equipo.cliente} · {equipo.proyecto}</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary btn-sm">
          <Icon name="download" size={13}/> Exportar PDF Reporte
        </button>
      </div>

      {/* Filtros pre-seleccionados */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16,
        background:'#F8FAFC', borderRadius:10, padding:'14px 18px',
        border:'1px solid var(--card-border)',
      }}>
        {[
          { label:'Proyecto / U.M.', val:equipo.proyecto },
          { label:'Modelo',           val:equipo.modelo  },
          { label:'Nº de Serie',      val:equipo.serie   },
          { label:'Contrato',         val:equipo.contrato },
        ].map(item => (
          <div key={item.label}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:.6, color:'var(--text-muted)', marginBottom:2 }}>
              {item.label}
            </div>
            <div style={{ fontWeight:700, fontSize:12.5, color:'var(--navy)', fontFamily:'ui-monospace,monospace' }}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {/* Periodo de corte */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'minmax(220px,1fr) 170px 170px auto',
        gap:12,
        alignItems:'end',
        marginBottom:16,
        background:'#FFFFFF',
        border:'1px solid var(--card-border)',
        borderRadius:10,
        padding:'12px 18px',
      }}>
        <div>
          <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.7, color:'var(--text-muted)', marginBottom:3 }}>
            Periodo de corte
          </div>
          <div style={{ fontWeight:700, color:'var(--navy)' }}>{periodoLabel}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
            Ajusta el rango segun la fecha de corte contractual de este equipo.
          </div>
        </div>
        <div>
          <label className="form-label">Desde</label>
          <input
            className="form-control"
            type="date"
            min={dayToDate(firstDay)}
            max={fechaHasta}
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Hasta</label>
          <input
            className="form-control"
            type="date"
            min={fechaDesde}
            max={dayToDate(lastDay)}
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
          />
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setFechaDesde(dayToDate(firstDay));
            setFechaHasta(dayToDate(lastDay));
          }}
        >
          Restablecer
        </button>
      </div>

      {/* Gráfico de tendencia */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <h3>Tendencia de Disponibilidad Diaria — {periodoLabel}</h3>
          <div style={{ display:'flex', gap:16, marginLeft:'auto', fontSize:11.5, alignItems:'center' }}>
            <span style={{ color:'var(--text-muted)' }}>
              DMR promedio: <strong style={{ color:'var(--navy)' }}>{dmrCalc}%</strong>
            </span>
            <span style={{ color:'#ef4444', fontWeight:700 }}>
              {npCount} parada(s) NP
            </span>
            <span style={{ color:'#d97706', fontWeight:700 }}>
              {pCount} parada(s) programada(s)
            </span>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop:8 }}>
          <DisponibilidadChart dias={diasFiltrados} metaDMR={equipo.metaDMR}/>
          <div style={{ display:'flex', gap:20, marginTop:10, paddingTop:10, borderTop:'1px solid var(--card-border)', fontSize:11.5 }}>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ display:'inline-block', width:24, height:2, background:'#0ea5e9', borderRadius:1 }}/>
              <span style={{ color:'var(--text-muted)' }}>Disponibilidad diaria</span>
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ display:'inline-block', width:20, borderTop:'1.5px dashed #ef4444' }}/>
              <span style={{ color:'var(--text-muted)' }}>Meta DMR {equipo.metaDMR}%</span>
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#ef4444' }}/>
              <span style={{ color:'var(--text-muted)' }}>Día bajo meta (penaliza)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabla detalle diario */}
      <div className="card">
        <div className="card-header">
          <h3>Detalle Diario de Operación</h3>
          <div style={{ marginLeft:'auto', display:'flex', gap:12, fontSize:11.5, alignItems:'center' }}>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'#fee2e2', border:'1px solid #fca5a5' }}/>
              No Programada (afecta penalidad)
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'#fef3c7', border:'1px solid #fcd34d' }}/>
              Programada (menor impacto)
            </span>
          </div>
        </div>
        <table className="tbl" style={{ fontSize:12.5 }}>
          <thead>
            <tr>
              <th style={{ width:52 }}>Día</th>
              <th style={{ width:100 }}>Fecha</th>
              <th className="num" style={{ width:130 }}>Hrs Operativas</th>
              <th className="num" style={{ width:120 }}>Hrs Parada</th>
              <th style={{ width:140 }}>Tipo Parada</th>
              <th style={{ width:130 }}>OT Vinculada</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {diasFiltrados.map((d) => {
              const isNP  = d.tipo === 'NP';
              const isP   = d.tipo === 'P';
              const rowBg = isNP ? 'rgba(254,226,226,0.55)' : isP ? 'rgba(254,243,199,0.55)' : '';
              return (
                <tr key={d.dia} style={{ background:rowBg }}>
                  <td style={{ fontFamily:'ui-monospace,monospace', fontWeight:700, fontSize:12 }}>{d.dia}</td>
                  <td style={{ fontSize:11.5, color:'var(--text-muted)' }}>
                    {String(d.dia).padStart(2, '0')} Abr 2026
                  </td>
                  <td className="num mono" style={{
                    fontWeight: d.opH > 0 ? 700 : 400,
                    color: d.opH === 0 ? 'var(--text-muted)' : '#15803d',
                  }}>
                    {d.opH > 0 ? `${d.opH.toFixed(1)} h` : '—'}
                  </td>
                  <td className="num mono" style={{
                    fontWeight: d.paradaH > 0 ? 700 : 400,
                    color: d.paradaH === 0 ? 'var(--text-muted)' : isNP ? '#dc2626' : '#d97706',
                  }}>
                    {d.paradaH > 0 ? `${d.paradaH.toFixed(1)} h` : '—'}
                  </td>
                  <td>
                    {d.tipo === 'NP' && <span className="badge red"   style={{ fontSize:10.5 }}>No Programada</span>}
                    {d.tipo === 'P'  && <span className="badge orange" style={{ fontSize:10.5 }}>Programada</span>}
                    {!d.tipo         && <span style={{ color:'var(--text-muted)', fontSize:11 }}>—</span>}
                  </td>
                  <td>
                    {d.ot ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        title={`Abrir ${d.ot} en OTs`}
                        style={{
                          fontFamily:'ui-monospace,monospace', fontWeight:700,
                          color:'var(--cyan)', textDecoration:'underline',
                          textUnderlineOffset:2, fontSize:11.5, padding:'1px 4px',
                        }}
                        onClick={() => handleOTClick(d.ot)}
                      >
                        {d.ot}
                      </button>
                    ) : (
                      <span style={{ color:'var(--text-muted)', fontSize:11 }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize:12, color: d.obs ? 'var(--text)' : 'var(--text-muted)' }}>
                    {d.obs || '—'}
                  </td>
                </tr>
              );
            })}
            {diasFiltrados.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>
                  No hay registros diarios para el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background:'var(--navy)', color:'white', fontWeight:700 }}>
              <td colSpan={2} style={{ padding:'10px 16px', color:'white', fontWeight:800, fontSize:13 }}>
                TOTALES DEL PERÍODO
              </td>
              <td className="num" style={{ color:'#4ade80', fontFamily:'ui-monospace,monospace', padding:'10px 16px', fontSize:13 }}>
                {totalOp.toFixed(1)} h
              </td>
              <td className="num" style={{
                color: totalPar > 20 ? '#fca5a5' : '#fcd34d',
                fontFamily:'ui-monospace,monospace', padding:'10px 16px', fontSize:13,
              }}>
                {totalPar.toFixed(1)} h
              </td>
              <td colSpan={3} style={{ padding:'10px 16px', color:'rgba(255,255,255,0.8)', fontSize:12 }}>
                DMR Calculado:{' '}
                <strong style={{ color:'white', fontSize:14, fontFamily:'ui-monospace,monospace' }}>
                  {dmrCalc}%
                </strong>
                {' '}· Meta: {equipo.metaDMR}%
                {parseFloat(dmrCalc) < equipo.metaDMR && (
                  <span style={{
                    marginLeft:12, padding:'2px 10px', borderRadius:12,
                    background:'#dc2626', fontSize:11, fontWeight:800,
                  }}>
                    ⚠ PENALIDAD APLICABLE
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <FooterBrand/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. LIQUIDACIÓN Y REPORTE DMR — Página principal
// ═══════════════════════════════════════════════════════════════════════════
export const LiquidacionRentalPage = ({ onNav, setCurrentOT }) => {
  const [detalleEquipo,    setDetalleEquipo]    = useState(null);
  const [liqSeleccionada,  setLiqSeleccionada]  = useState(null);
  const [panelAbierto,     setPanelAbierto]     = useState(false);
  const [tabDetalle,       setTabDetalle]       = useState('calculo');
  const [periodoActual,    setPeriodoActual]    = useState('2026-04');
  const [liquidaciones,    setLiquidaciones]    = useState(
    ZAHORY_SAC_DATA.liquidaciones_periodo || []
  );

  const periodoAnterior = ZAHORY_SAC_DATA.periodo_anterior_liq || {};

  // ── Fórmulas ──────────────────────────────────────────────────────────────
  const calcPenalidad = (liq) => {
    if (liq.dmr_real >= liq.meta_dmr) return 0;
    const horasTotales = liq.horas_reales + liq.horas_parada;
    return (
      ((liq.meta_dmr - liq.dmr_real) / 100) *
      horasTotales *
      liq.tarifa_hora *
      liq.factor_penalidad
    );
  };

  const getEstadoInfo = (liq) => {
    switch (liq.estado) {
      case 'borrador':      return { label: 'Borrador',      resp: null,              fecha: null };
      case 'en_revision':   return { label: 'En Revisión',   resp: liq.revisado_por,  fecha: liq.revisado_fecha };
      case 'aprobado':      return { label: 'Aprobado',      resp: liq.aprobado_por,  fecha: liq.aprobado_fecha };
      case 'pre_facturado': return { label: 'Pre-facturado', resp: liq.aprobado_por,  fecha: liq.aprobado_fecha };
      case 'facturado':     return { label: 'Facturado',     resp: liq.aprobado_por,  fecha: liq.aprobado_fecha };
      default:              return { label: liq.estado,      resp: null,              fecha: null };
    }
  };

  const cambiarEstado = (liqId, nuevoEstado) => {
    setLiquidaciones(prev => prev.map(l =>
      l.id === liqId ? { ...l, estado: nuevoEstado } : l
    ));
    if (liqSeleccionada && liqSeleccionada.id === liqId) {
      setLiqSeleccionada(prev => ({ ...prev, estado: nuevoEstado }));
    }
  };

  const getAccionesLiq = (liq) => {
    const base = [
      { icon: '👁', tooltip: 'Ver detalle',   action: () => { setLiqSeleccionada(liq); setPanelAbierto(true); } },
      { icon: '📄', tooltip: 'Descargar PDF', action: () => alert('Generación de PDF simulada'), color: null },
    ];
    switch (liq.estado) {
      case 'borrador':
        return [...base, { icon: '→', tooltip: 'Enviar a revisión', action: () => cambiarEstado(liq.id, 'en_revision'), color: '#64748b' }];
      case 'en_revision':
        return [...base,
          { icon: '✓', tooltip: 'Aprobar',           action: () => cambiarEstado(liq.id, 'aprobado'), color: '#22c55e' },
          { icon: '✗', tooltip: 'Rechazar → Borrador', action: () => cambiarEstado(liq.id, 'borrador'), color: '#ef4444' },
        ];
      case 'aprobado':
        return [...base, { icon: '📤', tooltip: 'Pre-facturar', action: () => cambiarEstado(liq.id, 'pre_facturado'), color: '#8b5cf6' }];
      case 'pre_facturado':
        return [...base, { icon: '🏦', tooltip: 'Enviar a facturación (Capa 4)', action: () => alert('Esta acción se completa en el módulo de Facturación'), color: '#3b82f6' }];
      case 'facturado':
        return [base[0], base[1]];
      default:
        return base;
    }
  };

  // ── KPI cómputos ──────────────────────────────────────────────────────────
  const dmrActual       = liquidaciones.length ? +(liquidaciones.reduce((s, r) => s + r.dmr_real, 0) / liquidaciones.length).toFixed(1) : 0;
  const totalHorasOp    = liquidaciones.reduce((s, r) => s + r.horas_reales, 0);
  const criticos        = liquidaciones.filter(r => r.dmr_real < r.meta_dmr).length;
  const totalPenalidades = liquidaciones.reduce((s, r) => s + r.penalidad_usd, 0);
  const totalGeneral    = liquidaciones.reduce((s, r) => s + r.total_usd, 0);
  const totalSubtotal   = liquidaciones.reduce((s, r) => s + r.subtotal_usd, 0);

  const pa = periodoAnterior;
  const dmrDelta       = dmrActual - (pa.dmr_promedio || 0);
  const horasDelta     = totalHorasOp - (pa.total_horas || 0);
  const criticosDelta  = criticos - (pa.equipos_criticos || 0);
  const penalDelta     = totalPenalidades - (pa.penalidades_usd || 0);

  const dmrBadgeColor = (dmr) => dmr > 90 ? '#22c55e' : dmr >= 85 ? '#f59e0b' : '#ef4444';
  const dmrBadgeBg    = (dmr) => dmr > 90 ? 'rgba(34,197,94,0.10)' : dmr >= 85 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';

  // ── Sparkline de tendencia DMR ────────────────────────────────────────────
  const TendenciaMini = ({ vals }) => {
    if (!vals || vals.length < 2) return null;
    const min = Math.min(...vals) - 2;
    const max = Math.max(...vals) + 2;
    const W = 60; const H = 24;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - min) / (max - min)) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = vals[vals.length - 1];
    const col  = dmrBadgeColor(last);
    return (
      <svg width={W} height={H} style={{ display:'block' }}>
        <polyline points={pts} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round"/>
      </svg>
    );
  };

  // ── Sub-vista: detalle legado ─────────────────────────────────────────────
  if (detalleEquipo) {
    return (
      <LiquidacionDetalleEquipo
        equipo={detalleEquipo}
        onBack={() => setDetalleEquipo(null)}
        onNav={onNav}
        setCurrentOT={setCurrentOT}
      />
    );
  }

  // ── Panel lateral seleccionado ────────────────────────────────────────────
  const liq = liqSeleccionada;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Liquidación y Reporte DMR</h1>
          <div className="sub" style={{ display:'flex', alignItems:'center', gap:10 }}>
            Centro de control de cierre de mes ·
            <select
              value={periodoActual}
              onChange={e => setPeriodoActual(e.target.value)}
              style={{
                background:'transparent', border:'1px solid rgba(255,255,255,0.20)',
                borderRadius:6, padding:'2px 8px', fontSize:12, color:'inherit',
                cursor:'pointer',
              }}
            >
              <option value="2026-04">Abril 2026</option>
              <option value="2026-03">Marzo 2026</option>
              <option value="2026-02">Febrero 2026</option>
            </select>
          </div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-secondary"><Icon name="download" size={13}/> Exportar Excel</button>
        <button className="btn btn-cyan" style={{ color:'#0f172a', fontWeight:800 }}>
          <Icon name="pdf" size={13}/> Generar informe de liquidación
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="kpi-grid" style={{ marginBottom:20 }}>
        {[
          {
            label: 'DMR PROMEDIO FLOTA',
            val: `${dmrActual}%`,
            icon: 'activity',
            className: 'kpi',
            sub: `${dmrDelta >= 0 ? '▲' : '▼'} ${Math.abs(dmrDelta).toFixed(1)}pp vs ${pa.label || 'mes anterior'}`
          },
          {
            label: 'TOTAL HORAS OPERATIVAS',
            val: `${totalHorasOp.toLocaleString()} h`,
            icon: 'clock',
            className: 'kpi',
            sub: `${horasDelta >= 0 ? '▲' : '▼'} ${Math.abs(horasDelta)}h vs ${pa.label || 'mes anterior'}`
          },
          {
            label: 'EQUIPOS CRÍTICOS',
            val: `${criticos}`,
            icon: 'alert',
            className: criticos > 0 ? 'kpi red-soft' : 'kpi green-soft',
            sub: `${criticosDelta <= 0 ? '▼' : '▲'} ${Math.abs(criticosDelta)} vs ${pa.label || 'mes anterior'}`
          },
          {
            label: 'PENALIDADES ESTIMADAS',
            val: `$${totalPenalidades.toLocaleString('en-US', { minimumFractionDigits:2 })}`,
            icon: 'rates',
            className: totalPenalidades > 0 ? 'kpi red-soft' : 'kpi green-soft',
            sub: `${penalDelta <= 0 ? '▼' : '▲'} $${Math.abs(penalDelta).toLocaleString('en-US', { minimumFractionDigits:2 })} vs ${pa.label || 'mes anterior'}`
          },
        ].map((kpi, i) => (
          <div key={i} className={kpi.className}>
            <div className="kpi-header">
              <div className="label">{kpi.label}</div>
              <div className="kpi-icon-wrap"><Icon name={kpi.icon} size={16}/></div>
            </div>
            <div className="value" style={{ color: kpi.className.includes('red-soft') ? '#ef4444' : kpi.className.includes('green-soft') ? '#15803d' : 'var(--navy)' }}>{kpi.val}</div>
            <div className="sub">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Tabla de liquidaciones ── */}
      <div className="card">
        <div className="card-header">
          <h3>Detalle de Liquidación — Flota Activa · Abril 2026</h3>
          <div style={{ marginLeft:'auto', display:'flex', gap:12, fontSize:11.5, color:'var(--text-muted)', alignItems:'center' }}>
            {[
              { bg:'rgba(34,197,94,0.10)',   border:'#22c55e', label:'>90% Cumple'   },
              { bg:'rgba(245,158,11,0.10)',  border:'#f59e0b', label:'85–90% Alerta' },
              { bg:'rgba(239,68,68,0.10)',   border:'#ef4444', label:'<85% Crítico'  },
            ].map(l => (
              <span key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ display:'inline-block', width:11, height:11, borderRadius:3, background:l.bg, border:`1px solid ${l.border}` }}/>
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width:120 }}>Equipo</th>
              <th style={{ width:200 }}>Cliente / Contrato</th>
              <th className="num" style={{ width:110 }}>Hrs Real / Mín.</th>
              <th className="num" style={{ width:90 }}>Hrs Parada</th>
              <th className="num" style={{ width:130 }}>% DMR</th>
              <th className="num" style={{ width:140 }}>Penalidad</th>
              <th className="num" style={{ width:150 }}>Total USD</th>
              <th style={{ width:80 }}>Tendencia</th>
              <th style={{ width:140 }}>Estado</th>
              <th style={{ width:100, textAlign:'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {liquidaciones.map((r) => {
              const estadoInfo = getEstadoInfo(r);
              const acciones   = getAccionesLiq(r);
              return (
                <tr key={r.id} style={{ height:48 }}>

                  {/* Equipo */}
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{
                        fontFamily:'ui-monospace,monospace', fontWeight:800,
                        fontSize:13, color:'var(--cyan)',
                        textDecoration:'underline', textUnderlineOffset:2,
                        padding:'1px 0', display:'block',
                      }}
                      onClick={() => { setLiqSeleccionada(r); setPanelAbierto(true); setTabDetalle('calculo'); }}
                    >
                      {r.equipo_id}
                    </button>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{r.equipo_modelo}</div>
                  </td>

                  {/* C4 — Cliente / Contrato + badge CC */}
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{r.cliente}</div>
                    <div style={{ fontSize:11, color:'#64748b', marginTop:2, fontFamily:'monospace' }}>
                      {r.contrato_id}
                    </div>
                    <span style={{
                      display:'inline-block', marginTop:3,
                      background:'rgba(245,158,11,0.12)', color:'#f59e0b',
                      fontSize:'8.5px', fontFamily:'monospace',
                      padding:'1px 6px', borderRadius:8, fontWeight:600,
                    }}>
                      {r.centro_costo}
                    </span>
                  </td>

                  {/* Hrs Real / Mín */}
                  <td className="num mono" style={{ padding:'12px 16px' }}>
                    <div style={{
                      fontWeight:700,
                      color: r.horas_reales < r.horas_minimas ? '#d97706' : '#15803d',
                    }}>
                      {r.horas_reales} h
                    </div>
                    <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:1 }}>mín. {r.horas_minimas} h</div>
                  </td>

                  {/* Hrs Parada */}
                  <td className="num mono" style={{
                    fontWeight:700, padding:'12px 16px',
                    color: r.horas_parada > 20 ? '#dc2626' : 'var(--text)',
                  }}>
                    {r.horas_parada} h
                  </td>

                  {/* C1 — % DMR badge */}
                  <td className="num" style={{ padding:'12px 16px' }}>
                    <div style={{
                      display:'inline-flex', alignItems:'center', gap:5,
                      padding:'4px 12px', borderRadius:20, fontWeight:800,
                      fontSize:13, fontFamily:'ui-monospace,monospace', minWidth:76,
                      background: dmrBadgeBg(r.dmr_real),
                      color:      dmrBadgeColor(r.dmr_real),
                    }}>
                      {r.dmr_real < r.meta_dmr && <Icon name="alert" size={11}/>}
                      {r.dmr_real.toFixed(1)}%
                    </div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3, textAlign:'center' }}>
                      meta {r.meta_dmr}%
                    </div>
                  </td>

                  {/* C1 — Penalidad */}
                  <td style={{ textAlign:'right', padding:'12px 16px' }}>
                    {r.penalidad_usd > 0 ? (
                      <div>
                        <span style={{ color:'#ef4444', fontWeight:700, fontSize:13 }}>
                          −${r.penalidad_usd.toLocaleString('en-US', { minimumFractionDigits:2 })}
                        </span>
                        <span style={{ display:'block', fontSize:10, color:'#64748b', marginTop:1 }}>
                          DMR {r.dmr_real}% vs {r.meta_dmr}% meta
                        </span>
                      </div>
                    ) : (
                      <span style={{ color:'#22c55e', fontSize:12 }}>Sin penalidad</span>
                    )}
                  </td>

                  {/* C2 — Total USD */}
                  <td style={{ textAlign:'right', padding:'12px 16px' }}>
                    <span style={{ fontWeight:700, fontSize:14, color:'#f8fafc' }}>
                      ${r.total_usd.toLocaleString('en-US', { minimumFractionDigits:2 })}
                    </span>
                    <span style={{ display:'block', fontSize:10, color:'#64748b', marginTop:1 }}>
                      {r.horas_facturables}h × ${r.tarifa_hora}/h
                      {r.horas_facturables > r.horas_reales ? ' (mínimo)' : ''}
                    </span>
                  </td>

                  {/* Tendencia sparkline */}
                  <td style={{ padding:'12px 8px' }}>
                    <TendenciaMini vals={r.tendencia_dmr}/>
                  </td>

                  {/* C3 — Estado con responsable */}
                  <td style={{ padding:'12px 16px' }}>
                    <span className={`badge-estado-${r.estado}`}>{estadoInfo.label}</span>
                    {estadoInfo.resp && (
                      <span style={{ display:'block', fontSize:10, color:'#64748b', marginTop:3 }}>
                        {estadoInfo.resp} · {estadoInfo.fecha}
                      </span>
                    )}
                  </td>

                  {/* C5 — Acciones contextuales */}
                  <td style={{ textAlign:'right', padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:2, justifyContent:'flex-end' }}>
                      {acciones.map((acc, idx) => (
                        <button
                          key={idx}
                          className="icon-btn"
                          title={acc.tooltip}
                          style={{ padding:5, fontSize:13, color: acc.color || 'var(--text-muted)' }}
                          onClick={acc.action}
                        >
                          {acc.icon}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* C2 — Fila de totales */}
          <tfoot>
            <tr className="tabla-totales">
              <td colSpan={5}></td>
              <td style={{ textAlign:'right', fontWeight:600, color:'#ef4444', fontSize:13 }}>
                −${totalPenalidades.toLocaleString('en-US', { minimumFractionDigits:2 })}
              </td>
              <td style={{ textAlign:'right', fontWeight:700, color:'#f8fafc', fontSize:15 }}>
                ${totalGeneral.toLocaleString('en-US', { minimumFractionDigits:2 })}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* C6 — Panel lateral de detalle */}
      {panelAbierto && liq && (
        <>
          <div
            style={{ position:'fixed', inset:0, background:'rgba(10,17,32,0.50)', zIndex:900 }}
            onClick={() => setPanelAbierto(false)}
          />
          <div style={{
            position:'fixed', top:0, right:0, bottom:0, width:560,
            background:'var(--bg)', zIndex:910,
            boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',
            display:'flex', flexDirection:'column', overflowY:'hidden',
          }}>
            {/* Header del panel */}
            <div style={{
              padding:'16px 20px', background:'var(--navy)', color:'white',
              display:'flex', alignItems:'flex-start', gap:12, flexShrink:0,
            }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontFamily:'ui-monospace,monospace', fontWeight:800, fontSize:15 }}>
                    {liq.equipo_id}
                  </span>
                  <span style={{ fontFamily:'ui-monospace,monospace', fontSize:11, opacity:.7 }}>
                    {liq.equipo_modelo}
                  </span>
                  <span className={`badge-estado-${liq.estado}`} style={{ fontSize:10 }}>
                    {getEstadoInfo(liq).label}
                  </span>
                </div>
                <div style={{ fontSize:12.5, opacity:.85 }}>{liq.cliente}</div>
                <div style={{ fontSize:11, opacity:.60, fontFamily:'monospace' }}>
                  {liq.contrato_id} · [{liq.centro_costo}] · {liq.periodo}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPanelAbierto(false)}
                style={{ color:'rgba(255,255,255,0.75)', marginTop:-4 }}>
                <Icon name="x" size={15}/>
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display:'flex', borderBottom:'1px solid #E2E8F0',
              background:'#F8FAFC', flexShrink:0,
            }}>
              {[
                { key:'calculo', label:'Cálculo' },
                { key:'ots',     label:'OTs del Período' },
                { key:'historial', label:'Historial' },
              ].map(t => (
                <button key={t.key} onClick={() => setTabDetalle(t.key)} style={{
                  flex:1, padding:'10px 6px', fontSize:12, fontWeight:600,
                  background:'none', border:'none', cursor:'pointer',
                  borderBottom: tabDetalle === t.key ? '2px solid var(--cyan)' : '2px solid transparent',
                  color: tabDetalle === t.key ? 'var(--navy)' : 'var(--text-muted)',
                  transition:'color .12s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Cuerpo del panel */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

              {/* ── Tab 1: Cálculo ── */}
              {tabDetalle === 'calculo' && (
                <div>
                  {/* Horómetros */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.8, color:'var(--cyan)', marginBottom:10 }}>
                      Horómetros del Período
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[
                        { label:'Inicio de período', val:`${liq.horometro_inicio?.toLocaleString()} h` },
                        { label:'Fin de período',    val:`${liq.horometro_fin?.toLocaleString()} h`   },
                        { label:'Horas reales',      val:`${liq.horas_reales} h`                      },
                        { label:'Horas mínimas',     val:`${liq.horas_minimas} h`                     },
                      ].map(item => (
                        <div key={item.label} style={{ padding:'8px 12px', background:'white', borderRadius:8, border:'1px solid var(--card-border)' }}>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>{item.label}</div>
                          <div style={{ fontWeight:700, fontSize:13, fontFamily:'ui-monospace,monospace' }}>{item.val}</div>
                        </div>
                      ))}
                      <div style={{ padding:'8px 12px', background:'rgba(34,197,94,0.06)', borderRadius:8, border:'1px solid rgba(34,197,94,0.20)', gridColumn:'1/-1' }}>
                        <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>Horas facturables <span style={{ color:'#64748b' }}>(MAX real, mínimo)</span></div>
                        <div style={{ fontWeight:800, fontSize:16, color:'#15803d', fontFamily:'ui-monospace,monospace' }}>
                          {liq.horas_facturables} h
                          {liq.horas_facturables > liq.horas_reales && (
                            <span style={{ fontSize:11, color:'#d97706', fontWeight:500, marginLeft:8 }}>
                              ↑ aplicado mínimo garantizado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cálculo de facturación */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.8, color:'var(--cyan)', marginBottom:10 }}>
                      Cálculo de Facturación
                    </div>
                    <div style={{ background:'white', borderRadius:8, border:'1px solid var(--card-border)', overflow:'hidden' }}>
                      {[
                        { label:'Subtotal', val:`${liq.horas_facturables}h × $${liq.tarifa_hora}/h`, amount:`$${liq.subtotal_usd?.toLocaleString('en-US', { minimumFractionDigits:2 })}`, color:'#1f2937' },
                        liq.penalidad_usd > 0
                          ? { label:'Penalidad DMR', val:`${((liq.meta_dmr - liq.dmr_real)/100 * 100).toFixed(1)}pp × ${liq.horas_reales + liq.horas_parada}h × $${liq.tarifa_hora} × ${liq.factor_penalidad}`, amount:`−$${liq.penalidad_usd?.toLocaleString('en-US', { minimumFractionDigits:2 })}`, color:'#ef4444' }
                          : { label:'Penalidad DMR', val:`Sin penalidad (DMR ${liq.dmr_real}% ≥ meta ${liq.meta_dmr}%)`, amount:'$0.00', color:'#22c55e' },
                      ].map((row, i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid var(--card-border)', fontSize:13 }}>
                          <div>
                            <span style={{ fontWeight:600 }}>{row.label}</span>
                            <span style={{ fontSize:11, color:'#64748b', marginLeft:8 }}>{row.val}</span>
                          </div>
                          <span style={{ fontWeight:700, color:row.color, fontFamily:'ui-monospace,monospace' }}>{row.amount}</span>
                        </div>
                      ))}
                      <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 14px', background:'rgba(15,23,42,0.04)', fontSize:14 }}>
                        <span style={{ fontWeight:800, textTransform:'uppercase', letterSpacing:.5 }}>Total a Facturar</span>
                        <span style={{ fontWeight:900, fontSize:17, color:'var(--navy)', fontFamily:'ui-monospace,monospace' }}>
                          ${liq.total_usd?.toLocaleString('en-US', { minimumFractionDigits:2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DMR del período */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.8, color:'var(--cyan)', marginBottom:10 }}>
                      DMR del Período
                    </div>
                    <div style={{ background:'white', borderRadius:8, border:'1px solid var(--card-border)', padding:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                        <span style={{ fontSize:26, fontWeight:800, color:dmrBadgeColor(liq.dmr_real) }}>
                          {liq.dmr_real}%
                        </span>
                        <div>
                          <div style={{ fontSize:11, color:'#64748b' }}>Meta contractual: {liq.meta_dmr}%</div>
                          <div style={{ fontSize:11, color: liq.dmr_real >= liq.meta_dmr ? '#22c55e' : '#ef4444', fontWeight:600 }}>
                            {liq.dmr_real >= liq.meta_dmr ? '✓ Sobre meta' : '⚠ Bajo meta'}
                          </div>
                        </div>
                      </div>
                      <div style={{ background:'#f1f5f9', borderRadius:6, height:8, overflow:'hidden', marginBottom:8 }}>
                        <div style={{
                          height:'100%', width:`${Math.min(liq.dmr_real, 100)}%`,
                          background:dmrBadgeColor(liq.dmr_real), borderRadius:6, transition:'width .4s',
                        }}/>
                      </div>
                      <div style={{ fontSize:11, color:'#64748b' }}>Horas de parada: {liq.horas_parada} h</div>
                    </div>
                  </div>

                  {/* Botones */}
                  <div style={{ display:'flex', gap:10 }}>
                    {liq.estado === 'en_revision' && (
                      <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}
                        onClick={() => cambiarEstado(liq.id, 'aprobado')}>
                        ✓ Aprobar liquidación
                      </button>
                    )}
                    <button className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}
                      onClick={() => alert('Generación de informe PDF simulada')}>
                      📄 Generar informe PDF
                    </button>
                  </div>
                </div>
              )}

              {/* ── Tab 2: OTs del período ── */}
              {tabDetalle === 'ots' && (
                <div>
                  <table className="tbl" style={{ marginBottom:16 }}>
                    <thead>
                      <tr>
                        <th>OT ID</th>
                        <th>Tipo</th>
                        <th>Cargo Financiero</th>
                        <th className="num">Costo Real</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(liq.ots_periodo || []).map(ot => {
                        const esRecuperable = ot.cargo === 'Cliente_Contrato';
                        const esGarantia    = ot.cargo === 'Garantia_Fabrica';
                        return (
                          <tr key={ot.id}>
                            <td style={{ fontFamily:'ui-monospace,monospace', fontWeight:700, fontSize:12, color:'var(--cyan)' }}>
                              {ot.id}
                            </td>
                            <td style={{ fontSize:12 }}>{ot.tipo}</td>
                            <td>
                              <span style={{
                                fontSize:11, padding:'2px 8px', borderRadius:10,
                                background: esRecuperable ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                                color: esRecuperable ? '#22c55e' : '#ef4444',
                                fontWeight:600,
                              }}>
                                {ot.cargo}
                              </span>
                              {!esRecuperable && (
                                <span style={{ display:'block', fontSize:9.5, color:'#ef4444', marginTop:2 }}>
                                  Absorbido por la plataforma
                                </span>
                              )}
                            </td>
                            <td className="num" style={{ fontWeight:700 }}>
                              ${ot.costo_real?.toLocaleString('en-US', { minimumFractionDigits:2 })}
                            </td>
                            <td>
                              <span style={{
                                fontSize:11, padding:'2px 8px', borderRadius:10,
                                background:'rgba(34,197,94,0.10)', color:'#22c55e', fontWeight:600,
                              }}>
                                {ot.estado}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Resumen de costos */}
                  <div style={{ background:'white', borderRadius:8, border:'1px solid var(--card-border)', padding:14 }}>
                    <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.8, color:'var(--cyan)', marginBottom:10 }}>
                      Resumen de Costos del Período
                    </div>
                    {[
                      { label:'Costos recuperables (cargo cliente)', val: liq.costo_ots_recuperable, color:'#22c55e' },
                      { label:'Costos absorbidos por la plataforma', val: liq.costo_ots_interno,     color:'#ef4444' },
                      { label:'Total costos del período',            val: (liq.costo_ots_recuperable || 0) + (liq.costo_ots_interno || 0), color:'#1f2937', bold:true },
                    ].map((r, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom: i < 2 ? '1px solid var(--card-border)' : 'none', fontSize:13 }}>
                        <span style={{ color:'#64748b' }}>{r.label}</span>
                        <span style={{ fontWeight: r.bold ? 800 : 600, color:r.color, fontFamily:'ui-monospace,monospace' }}>
                          ${r.val?.toLocaleString('en-US', { minimumFractionDigits:2 })}
                        </span>
                      </div>
                    ))}
                    {/* Margen bruto */}
                    <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(15,23,42,0.04)', borderRadius:6 }}>
                      <div style={{ fontSize:10, color:'#64748b', marginBottom:4 }}>Margen bruto del contrato (período)</div>
                      {(() => {
                        const costoTotal = (liq.costo_ots_recuperable || 0) + (liq.costo_ots_interno || 0);
                        const margen     = liq.total_usd - costoTotal;
                        const margenPct  = liq.total_usd > 0 ? (margen / liq.total_usd * 100).toFixed(1) : 0;
                        return (
                          <div style={{ fontWeight:800, fontSize:14, color:'var(--navy)' }}>
                            ${liq.total_usd?.toLocaleString('en-US', { minimumFractionDigits:2 })} (ingreso)
                            {' − '}
                            ${costoTotal.toLocaleString('en-US', { minimumFractionDigits:2 })} (costos OTs)
                            {' = '}
                            <span style={{ color: margen >= 0 ? '#22c55e' : '#ef4444' }}>
                              ${margen.toLocaleString('en-US', { minimumFractionDigits:2 })} ({margenPct}%)
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 3: Historial ── */}
              {tabDetalle === 'historial' && (
                <div>
                  <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:.8, color:'var(--cyan)', marginBottom:12 }}>
                    Liquidaciones pasadas — {liq.contrato_id}
                  </div>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th className="num">Hrs</th>
                        <th className="num">DMR</th>
                        <th className="num">Penalidad</th>
                        <th className="num">Total</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { periodo:'Mar 2026', horas:218, dmr:94.0, penalidad:0,    total:11990, estado:'facturado' },
                        { periodo:'Feb 2026', horas:200, dmr:88.4, penalidad:0,    total:11000, estado:'facturado' },
                        { periodo:'Ene 2026', horas:210, dmr:96.2, penalidad:0,    total:11550, estado:'facturado' },
                      ].map((h, i) => (
                        <tr key={i}>
                          <td>{h.periodo}</td>
                          <td className="num">{h.horas}h</td>
                          <td className="num">
                            <span style={{ color:dmrBadgeColor(h.dmr), fontWeight:700 }}>{h.dmr}%</span>
                          </td>
                          <td className="num">
                            {h.penalidad > 0
                              ? <span style={{ color:'#ef4444' }}>−${h.penalidad.toLocaleString()}</span>
                              : <span style={{ color:'#64748b' }}>$0</span>
                            }
                          </td>
                          <td className="num" style={{ fontWeight:700 }}>
                            ${h.total.toLocaleString('en-US', { minimumFractionDigits:2 })}
                          </td>
                          <td>
                            <span className="badge-estado-facturado">Facturado ✓</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <FooterBrand/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Rental — Panel ejecutivo de la línea Flota y Alquileres
// ═══════════════════════════════════════════════════════════════════════════════
const _RENTAL_STATS = (() => {
  const enCampo     = LIQUIDACION_MOCK.length;
  const dmrProm     = (LIQUIDACION_MOCK.reduce((s, e) => s + e.dmr, 0) / enCampo).toFixed(1);
  const facturMes   = LIQUIDACION_MOCK.reduce((s, e) => s + Math.max(e.horasReales, e.horasContrato) * e.tarifa, 0);
  const liqPendiente= LIQUIDACION_MOCK.filter(e => e.estado === 'En Revisión').length;
  const criticos    = LIQUIDACION_MOCK.filter(e => e.dmr < e.metaDMR).length;
  return { enCampo, dmrProm, facturMes, liqPendiente, criticos };
})();

const _DMR_COLOR = (dmr, meta) => {
  if (dmr >= 90)          return { bg: '#E8F5E9', color: '#1B5E20', dot: '#4CAF50' };
  if (dmr >= meta)        return { bg: '#FFF3E0', color: '#C15D00', dot: '#FF9800' };
  return                         { bg: '#FFEBEE', color: '#B71C1C', dot: '#E53935' };
};

export const DashboardRentalPage = ({ onNav }) => {
  const s = _RENTAL_STATS;

  const KpiCard = ({ label, value, sub, accent }) => (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a, #1e2d45)',
      borderRadius: 10, padding: '18px 20px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || '#f1f5f9', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard Rental</h1>
          <div className="sub">Línea de negocio — Flota y Alquileres</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-cyan" onClick={() => onNav('flota')}>Ver Panel de Flota</button>
        <button className="btn btn-secondary" onClick={() => onNav('liquidacion')}>Liquidaciones</button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Equipos en Campo"         value={s.enCampo}           sub="contratos activos"                    accent="#38bdf8"/>
        <KpiCard label="DMR Promedio Flota"        value={`${s.dmrProm}%`}     sub="últimos 30 días"                      accent={Number(s.dmrProm) >= 88 ? '#4ade80' : '#fbbf24'}/>
        <KpiCard label="Facturación Est. del Mes"  value={`$${s.facturMes.toLocaleString('en-US',{maximumFractionDigits:0})}`} sub="USD — por horas facturables" accent="#f1f5f9"/>
        <KpiCard label="Liq. Pendientes Aprobación" value={s.liqPendiente}     sub={s.criticos > 0 ? `${s.criticos} equipos bajo meta DMR` : 'Sin alertas críticas'} accent={s.liqPendiente > 0 ? '#fbbf24' : '#4ade80'}/>
      </div>

      {/* Contratos activos */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Contratos Activos</h3>
          <span className="hint">{LIQUIDACION_MOCK.length} equipos en campo</span>
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav('contratos-rental')}>Ver todos los contratos</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Equipo</th><th>Cliente</th><th>Proyecto</th>
              <th>DMR Real</th><th>Meta DMR</th><th>Hrs. Reales</th>
              <th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {LIQUIDACION_MOCK.map(e => {
              const c = _DMR_COLOR(e.dmr, e.metaDMR);
              return (
                <tr key={e.equipo} className="clickable" onClick={() => onNav('liquidacion')}>
                  <td><span className="ot-code">{e.equipo}</span><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.modelo}</div></td>
                  <td>{e.cliente}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.proyecto}</td>
                  <td>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6, background: c.bg, color: c.color, padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:700 }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background: c.dot }}/>
                      {e.dmr}%
                    </span>
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{e.metaDMR}%</td>
                  <td className="num">{e.horasReales} h</td>
                  <td><span className={"badge " + (e.estado === 'Pre-facturado' ? 'green' : 'orange')}>{e.estado}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={ev => { ev.stopPropagation(); onNav('liquidacion'); }}>Detalle</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Alertas rápidas */}
      {s.criticos > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
          <div className="card-body">
            <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--red)', fontWeight:700, marginBottom:8 }}>
              <Icon name="alert" size={16}/>
              {s.criticos} equipo(s) con DMR por debajo de la meta contractual
            </div>
            {LIQUIDACION_MOCK.filter(e => e.dmr < e.metaDMR).map(e => (
              <div key={e.equipo} style={{ fontSize:13, color:'var(--text-muted)', marginBottom:4 }}>
                · <strong style={{ color:'var(--text)' }}>{e.equipo}</strong> — DMR {e.dmr}% vs meta {e.metaDMR}% ({e.cliente})
              </div>
            ))}
          </div>
        </div>
      )}

      <FooterBrand/>
    </div>
  );
};
