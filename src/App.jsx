import React, { useEffect, useMemo, useState } from 'react';
import { AppProvider, useApp } from './context.jsx';
import { AuthGate } from './AuthGate.jsx';
import { Sidebar, Header } from './shell.jsx';

import { Roles, Usuarios, Tenants, Planes, Stub, Maestros, Servicios, Tarifarios, Parametros, RRHHAdmin, MetricasSaaS } from './pages_admin.jsx';
import { CSOnboarding, CSPlanes, CSHealthScore, CSRenovaciones, CSFidelizacion, BICustomerSuccess } from './pages_cs.jsx';
import { IAComercial, IAOperativa, IAFinanciera } from './pages_ia.jsx';
import { BIFinanciero } from './pages_bi_fin.jsx';
import { Dashboard, Leads, Pipeline, Actividades, AgendaComercial, OSCliente, Marketing, BIComercial, BIOperativo } from './pages_core.jsx';
import { Cotizaciones, Valorizacion, Inventario, HojaCosteo } from './pages_extra.jsx';
import { CxC, Tesoreria, Resultados, Facturacion, Ventas, CajaChica, PrestamosPersonal, CxP, Presupuestos } from './pages_fin.jsx';
import { FinanciamientoDeuda } from './pages_fin_deuda.jsx';
import { MobileFieldView } from './pages_mobile.jsx';
import { Cuentas, OT, Partes, Compras, Proveedores, CotizacionesCompras, OrdenesCompra, OrdenesServicio, Recepciones, TurnosHorarios, ControlAsistencia, Nomina, Backlog, Cierre, Remision, SOLPE, Planner, Tickets, RRHH_Operativo } from './pages_ops.jsx';
import { MOCK } from './data.js';

const CREATE_WORDS = ['nuevo', 'nueva', 'registrar', 'crear', 'emitir', 'asignar', 'solicitar ajuste', 'enviar encuesta'];
const ACTION_EXCLUSIONS = ['aprobar', 'guardar', 'convertir', 'iniciar', 'cerrar', 'conciliar', 'validar', 'atender', 'generar oportunidad', 'enviar a cliente', 'siguiente', 'firmar', 'finalizar'];
const PLATFORM_PAGES = new Set(['tenants', 'planes', 'metricas_saas']);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[App render error]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell" style={{alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24}}>
        <div className="card" style={{width:'min(720px, 100%)', padding:28}}>
          <div className="eyebrow">Error de pantalla</div>
          <div className="font-display" style={{fontSize:24, fontWeight:800, marginTop:6}}>No se pudo abrir este módulo</div>
          <p className="text-muted" style={{marginTop:8}}>
            La app capturó un error de render. Copia este mensaje si vuelve a aparecer.
          </p>
          <pre style={{whiteSpace:'pre-wrap', background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:8, padding:12, fontSize:12, marginTop:16}}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button className="btn btn-primary" style={{marginTop:16}} onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}

const FORM_TEMPLATES = {
  tenants: { title: 'Nueva empresa / tenant', fields: [
    ['razon_social', 'Razon social', 'text'], ['nombre_comercial', 'Nombre comercial', 'text'], ['ruc', 'RUC / NIT', 'text'],
    ['pais', 'Pais', 'text'], ['moneda', 'Moneda base', 'select', ['PEN', 'USD']], ['estado', 'Estado', 'select', ['activa', 'demo', 'suspendida']],
    ['admin_email', 'Email del admin del tenant', 'email'], ['admin_nombre', 'Nombre del admin', 'text']
  ]},
  planes: { title: 'Nuevo plan', fields: [['nombre','Nombre del plan','text'], ['precio','Precio mensual','number'], ['usuarios','Limite de usuarios','number'], ['modulos','Modulos incluidos','textarea']] },
  roles: { title: 'Nuevo rol', fields: [['nombre','Nombre del rol','text'], ['descripcion','Descripcion','textarea'], ['perfil_campo','Perfil de campo','select',['Ninguno','Tecnico','Vendedor','Compras','Supervisor','Gerencia']]] },
  usuarios: { title: 'Nuevo usuario', fields: [
    ['nombre','Nombre completo','text'],
    ['email','Email','email'],
    ['cargo','Cargo','cargo'],
    ['area','Area','text'],
    ['rol','Rol','select',[
      { value: 'plataforma', label: 'Superadmin TIDEO' },
      { value: 'admin', label: 'Super Administrador' },
      { value: 'comercial', label: 'Jefe Comercial' },
      { value: 'tecnico', label: 'Tecnico de Campo' },
      { value: 'finanzas', label: 'Finanzas' }
    ]],
    ['empresa_id','Tenant asignado','tenant'],
    ['telefono','Telefono celular','text']
  ] },
  cuentas: { title: 'Nueva cuenta', fields: [['razon_social','Razon social','text'], ['ruc','RUC','ruc'], ['industria','Industria','industria'], ['responsable_comercial','Responsable comercial','user_comercial'], ['telefono','Telefono','text'], ['email','Email','email']] },
  leads: { title: 'Nuevo lead', fields: [
    ['nombre','Contacto','text'], ['responsable','Responsable comercial','user_comercial'],
    ['empresa_contacto','Empresa','text'], ['ruc','RUC','ruc'],
    ['razon_social','Razon social','text'], ['industria','Industria','industria'],
    ['telefono','Telefono','text'], ['email','Email','email'],
    ['fuente','Fuente','select',['Campo','Web','Referido','LinkedIn','Evento / Feria']], ['presupuesto_estimado','Presupuesto estimado','number'],
    ['necesidad','Necesidad','textarea', null, { span: 2 }]
  ] },
  pipeline: { title: 'Nueva oportunidad', fields: [['nombre','Nombre oportunidad','text'], ['cuenta_id','Cuenta','cuenta'], ['servicio_interes','Servicio de interes','servicio'], ['monto_estimado','Monto estimado','number'], ['responsable','Responsable','user_comercial'], ['fecha_cierre_estimada','Fecha cierre estimada','date']] },
  actividades: { title: 'Nueva actividad', fields: [['tipo','Tipo','select',['llamada','reunion','email','visita','tarea','nota']], ['asunto','Asunto','text'], ['cuenta_id','Cuenta','cuenta'], ['responsable','Responsable','user'], ['fecha','Fecha','date'], ['resultado','Resultado / nota','textarea']] },
  agenda_comercial: { title: 'Nuevo evento en agenda', fields: [['tipo','Tipo de evento','select',['visita','reunion','llamada','demo']], ['titulo','Titulo breve','text'], ['cuenta_id','Cuenta o Prospecto','cuenta'], ['vendedor','Comercial responsable','user_comercial'], ['fecha','Fecha programada','date'], ['hora','Hora','time']] },
  cotizaciones: { title: 'Nueva cotizacion', fields: [['cuenta_id','Cuenta','cuenta'], ['oportunidad_id','Oportunidad ID','text'], ['alcance','Alcance tecnico','textarea'], ['subtotal','Subtotal','number'], ['condicion_pago','Condicion de pago','text'], ['validez','Validez','text']] },
  os_cliente: { title: 'Nueva OS Cliente', fields: [['cuenta_id','Cuenta','cuenta'], ['numero_doc_cliente','OC / pedido cliente','text'], ['monto_aprobado','Monto aprobado','number'], ['condicion_pago','Condicion de pago','text'], ['fecha_inicio','Fecha inicio','date'], ['fecha_fin','Fecha fin','date']] },
  ot: { title: 'Nueva OT', fields: [['cuenta_id','Cuenta','cuenta'], ['tipo','Tipo','select',['cliente','interna','tercerizada','garantia','correctiva','preventiva','emergencia','proyecto']], ['servicio','Servicio','servicio'], ['responsable','Responsable','user_tecnico'], ['direccion_ejecucion','Direccion ejecucion','text'], ['ubicacion_gps','Ubicacion GPS','text'], ['descripcion','Alcance','textarea']] },
  partes: { title: 'Nuevo parte diario', fields: [['ot_id','OT','ot'], ['tecnico','Tecnico','user_tecnico'], ['fecha','Fecha','date'], ['horas','Horas','number'], ['avance_reportado','Avance %','number'], ['actividades','Actividades ejecutadas','textarea']] },
  backlog: { title: 'Nuevo requerimiento', fields: [['cuenta_id','Cuenta','cuenta'], ['titulo','Titulo','text'], ['origen','Origen','select',['Cliente','Tecnico en campo','Backoffice','Ticket']], ['prioridad','Prioridad','select',['alta','media','baja']], ['descripcion','Descripcion','textarea']] },
  inventario: { title: 'Registrar entrada de inventario', fields: [['sku','SKU','text'], ['nombre','Material / insumo','text'], ['categoria','Categoria','text'], ['almacen','Almacen','text'], ['unidad','Unidad','text'], ['stock_actual','Cantidad','number'], ['costo_promedio','Costo unitario','number']] },
  solpe: { title: 'Nueva SOLPE', fields: [['ot_id','OT','ot'], ['solicitante','Solicitante','user'], ['centro_costo','Centro de costo','centro_costo'], ['urgencia','Urgencia','select',['alta','media','baja']], ['items_texto','Items solicitados','textarea']] },
  remision: { title: 'Emitir guia / traslado', fields: [['ot','OT destino','ot'], ['destino','Punto de llegada','text'], ['transportista','Transportista / chofer','text'], ['fecha','Fecha salida','date'], ['estado','Estado','select',['programado','en_transito','entregado']]] },
  compras: { title: 'Nuevo registro de compra / gasto', fields: [['proveedor','Proveedor','proveedor'], ['doc','Documento','text'], ['monto','Monto','number'], ['ot','OT / centro de costo','ot'], ['fecha','Fecha','date'], ['origen_registro','Origen','select',['backoffice','campo']]] },
  ventas: { title: 'Registrar venta', fields: [['cliente','Cliente','cuenta'], ['concepto','Concepto','text'], ['monto','Monto','number'], ['moneda','Moneda','select',['PEN','USD']], ['fecha','Fecha','date'], ['estado','Estado','select',['emitida','pendiente','cobrada']]] },
  caja: { title: 'Registrar gasto de caja chica', fields: [['responsable','Responsable','user'], ['concepto','Concepto','text'], ['comprobante','Comprobante','text'], ['monto','Monto','number'], ['fecha','Fecha','date'], ['estado','Estado','select',['pendiente','rendido','aprobado']]] },
  prestamos_personal: { title: 'Nuevo prestamo / anticipo', fields: [['empleado','Empleado','user'], ['monto','Monto','number'], ['cuotas','Cuotas','number'], ['fecha','Fecha otorgado','date'], ['descuento_nomina','Descontar automaticamente en nomina','select',['si','no']], ['estado','Estado','select',['vigente','cancelado']]] },
  cxp: { title: 'Registrar factura por pagar', fields: [['proveedor','Proveedor','text'], ['factura','Factura','text'], ['emision','Emision','date'], ['vencimiento','Vencimiento','date'], ['monto','Monto','number'], ['estado','Estado','select',['por_pagar','programado','pagada','vencido']]] },
  facturacion: { title: 'Nueva factura', fields: [['cliente','Cliente','text'], ['valorizacion','Valorizacion','text'], ['monto','Monto','number'], ['fecha','Fecha','date'], ['estado','Estado','select',['emitida','pagada','vencida']]] },
  presupuestos: { title: 'Solicitar ajuste presupuestal', fields: [['partida','Partida','text'], ['monto','Monto ajuste','number'], ['motivo','Motivo','textarea'], ['responsable','Responsable','text']] },
  rrhh_admin: { title: 'Nuevo colaborador administrativo', fields: [['nombre','Nombre','text'], ['dni','DNI','text'], ['cargo','Cargo','cargo'], ['area','Area','text'], ['sede','Sede asignada','sede'], ['tipo_contrato','Tipo contrato','select',['Indefinido','Plazo fijo','Practicante']], ['remuneracion','Remuneracion','number']] },
  rrhh_operativo: { title: 'Nuevo personal operativo', fields: [['nombre','Nombre','text'], ['cargo','Cargo','cargo_tecnico'], ['especialidad','Especialidad','text'], ['costo','Costo hora','number'], ['sede','Sede base','sede']] },
  tickets: { title: 'Nuevo ticket', fields: [['cliente','Cliente','text'], ['asunto','Asunto','text'], ['categoria','Categoria','select',['Consulta','Incidente','Reclamo','Garantia','Mejora']], ['prioridad','Prioridad','select',['critica','alta','media','baja']], ['descripcion','Descripcion','textarea']] },
  marketing: { title: 'Nueva secuencia de marketing', fields: [['nombre','Nombre secuencia','text'], ['segmento','Segmento','text'], ['objetivo','Objetivo','textarea'], ['canal','Canal','select',['Email','WhatsApp','LinkedIn']]] },
  planner: { title: 'Asignar turno / recurso', fields: [['recurso','Tecnico / cuadrilla','text'], ['ot','OT / actividad','text'], ['fecha','Fecha','date'], ['hora_inicio','Hora inicio','time'], ['hora_fin','Hora fin','time']] },
  cs_onboarding: { title: 'Nuevo onboarding', fields: [['cuenta_id','Cuenta ID','text'], ['responsable_cs','Responsable CS','text'], ['tipo_servicio','Tipo servicio','text'], ['fecha_inicio','Fecha inicio','date'], ['objetivo_cliente','Objetivo del cliente','textarea']] },
  cs_planes: { title: 'Nuevo plan de exito', fields: [['cuenta_id','Cuenta ID','text'], ['responsable_cs','Responsable CS','text'], ['objetivo','Objetivo','textarea'], ['periodicidad_reunion','Periodicidad','select',['Semanal','Quincenal','Mensual']]] },
  cs_renovaciones: { title: 'Nueva renovacion', fields: [['cuenta_id','Cuenta ID','text'], ['servicio','Servicio','text'], ['fecha_vencimiento','Fecha vencimiento','date'], ['monto_contrato','Monto contrato','number'], ['responsable_cs','Responsable CS','text']] },
  cs_fidelizacion: { title: 'Enviar encuesta NPS', fields: [['cuenta_id','Cuenta ID','text'], ['responsable_cs','Responsable CS','text'], ['ot_id','OT ID','text'], ['fecha_envio','Fecha envio','date']] },
  parametros: { title: 'Nuevo parametro', fields: [['modulo','Modulo','text'], ['clave','Clave','text'], ['valor','Valor','text'], ['descripcion','Descripcion','textarea']] },
  default: { title: 'Nuevo registro', fields: [['nombre','Nombre / titulo','text'], ['descripcion','Descripcion','textarea'], ['responsable','Responsable','text'], ['fecha','Fecha','date']] }
};

const SCREEN_LABELS = {
  dashboard: 'Dashboard General', bi_comercial: 'BI Comercial', bi_operativo: 'BI Operativo', bi_financiero: 'BI Financiero',
  tenants: 'Empresas / Tenants', planes: 'Planes y Licencias', metricas_saas: 'Metricas SaaS',
  cuentas: 'Cuentas y Contactos', leads: 'Leads', marketing: 'Marketing Automation', pipeline: 'Pipeline',
  actividades: 'Actividades', agenda_comercial: 'Agenda Comercial', hoja_costeo: 'Hoja de Costeo', cotizaciones: 'Cotizaciones', os_cliente: 'OS Cliente', planner: 'Planner',
  backlog: 'Backlog', ot: 'Orden de Trabajo', partes: 'Parte Diario', cierre: 'Cierre Tecnico',
  tickets: 'Tickets', inventario: 'Inventario', solpe: 'SOLPE', remision: 'Remision / Transporte',
  proveedores: 'Proveedores', cot_compras: 'Cotizaciones de Compra', ordenes_compra: 'Ordenes de Compra',
  ordenes_servicio: 'Ordenes de Servicio', recepciones: 'Recepciones',
  compras: 'Compras y Gastos', ventas: 'Ventas', caja: 'Caja Chica', prestamos_personal: 'Prestamos al Personal', financiamiento: 'Financiamiento y Deuda',
  cxc: 'Cuentas por Cobrar', cxp: 'Cuentas por Pagar', facturacion: 'Facturacion', tesoreria: 'Tesoreria',
  resultados: 'Estado de Resultados', presupuestos: 'Presupuesto vs Real', usuarios: 'Usuarios',
  roles: 'Roles y Permisos', maestros: 'Maestros', servicios: 'Servicios', tarifarios: 'Tarifarios',
  parametros: 'Parametros', rrhh_operativo: 'RRHH Operativo', rrhh_admin: 'RRHH Administrativo',
  asistencia: 'Control de Asistencia', turnos: 'Turnos y Horarios', nomina: 'Nomina',
  cs_onboarding: 'Onboarding', cs_planes: 'Plan de Exito', cs_health: 'Health Score',
  cs_renovaciones: 'Renovaciones', cs_fidelizacion: 'Fidelizacion / NPS', bi_cs: 'BI Customer Success',
  ia_comercial: 'IA Comercial', ia_operativa: 'IA Operativa', ia_financiera: 'IA Financiera'
};

const CARGOS_EMPRESA = [
  'Gerente General',
  'Administrador de Empresa',
  'Jefe Comercial',
  'Ejecutivo Comercial',
  'Jefe de Operaciones',
  'Supervisor de Operaciones',
  'Tecnico de Campo',
  'Comprador',
  'Jefe de Finanzas',
  'Analista Financiero',
  'Responsable Customer Success',
  'Almacenero'
];

const CARGOS_TECNICOS = [
  'Técnico Mecánico',
  'Técnico Electrónico',
  'Técnico de Instrumentación',
  'Técnica de Instrumentación',
  'Electricista Industrial',
  'Supervisor SSO',
  'Supervisora SSO',
  'Ayudante Técnico',
  'Técnico en Refrigeración',
  'Soldador Certificado',
  'Operario de Mantenimiento',
  'Técnico en Automatización',
  'Técnico PLC / SCADA',
];

const CENTROS_COSTO = ['Comercial', 'Operaciones', 'Mantenimiento', 'Logistica', 'Administracion', 'Finanzas'];
const INDUSTRIAS = [
  'Mineria',
  'Industrial',
  'Construccion',
  'Agroindustria',
  'Facilities',
  'Energia',
  'Petroleo & Gas',
  'Logistica',
  'Retail',
  'Salud',
  'Educacion',
  'Tecnologia',
  'Servicios profesionales',
  'Sector publico',
  'Otro'
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36).slice(-6)}`;
}

function CreatedRecordsStrip({ screen }) {
  const { createdRecords } = useApp();
  const records = createdRecords[screen] || [];
  if (!records.length) return null;
  return (
    <div className="card" style={{marginBottom:16, borderColor:'var(--green)', background:'rgba(22,163,74,0.06)'}}>
      <div className="card-head">
        <h3>Registros creados en esta sesion</h3>
        <span className="badge badge-green">{records.length}</span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>ID</th><th>Registro</th><th>Detalle</th><th>Fecha</th></tr></thead>
          <tbody>{records.slice(0, 5).map(r => (
            <tr key={r.id}>
              <td className="mono">{r.id}</td>
              <td><strong>{r.title}</strong></td>
              <td className="text-muted">{r.detail}</td>
              <td className="text-muted">{r.created_at}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function QuickCreateModal({ active, onClose }) {
  const app = useApp();
  const template = FORM_TEMPLATES[active] || {
    ...FORM_TEMPLATES.default,
    title: `Nuevo registro - ${SCREEN_LABELS[active] || active}`
  };
  const [values, setValues] = useState(() => Object.fromEntries(template.fields.map(([name, , type]) => [name, type === 'date' ? today() : ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (name, value) => setValues(prev => ({ ...prev, [name]: value }));
  const val = name => values[name] || '';

  const renderField = ([name, label, type, options]) => {
    if (type === 'textarea') {
      return <textarea className="input" rows="4" value={val(name)} onChange={e => update(name, e.target.value)} placeholder={label}/>;
    }
    if (type === 'select') {
      const visibleOptions = active === 'usuarios' && name === 'rol' && !app.role.permisos?.plataforma
        ? options.filter(o => (typeof o === 'string' ? o : o.value) !== 'plataforma')
        : options;
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar...</option>
          {visibleOptions.map(o => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          })}
        </select>
      );
    }
    if (type === 'tenant') {
      const tenantOptions = app.role.permisos?.plataforma ? (app.empresasPlataforma || MOCK.empresas) : [app.empresa];
      return (
        <select
          className="select"
          value={val(name) || app.empresa.id}
          onChange={e => update(name, e.target.value)}
          disabled={!app.role.permisos?.plataforma}
          title={app.role.permisos?.plataforma ? 'Seleccionar tenant' : 'Solo puedes asignar usuarios a tu tenant'}
        >
          {tenantOptions.map(e => <option key={e.id} value={e.id}>{e.nombre} · {e.plan}</option>)}
        </select>
      );
    }
    if (type === 'cargo') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar cargo...</option>
          {CARGOS_EMPRESA.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (type === 'cargo_tecnico') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar cargo...</option>
          {CARGOS_TECNICOS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (type === 'user' || type === 'user_comercial' || type === 'user_tecnico') {
      const roleFilter = type === 'user_comercial' ? ['comercial', 'admin'] : type === 'user_tecnico' ? ['tecnico', 'admin'] : null;
      const users = app.usuarios.filter(u => !roleFilter || roleFilter.includes(u.rol));
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar usuario...</option>
          {users.map(u => <option key={u.id} value={u.nombre}>{u.nombre} · {MOCK.roles[u.rol]?.nombre || u.rol}</option>)}
        </select>
      );
    }
    if (type === 'cuenta') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar cuenta...</option>
          {app.cuentas.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
        </select>
      );
    }
    if (type === 'ot') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar OT...</option>
          {app.ots.map(o => <option key={o.id} value={o.id}>{o.numero} · {o.descripcion || o.servicio || o.estado}</option>)}
        </select>
      );
    }
    if (type === 'servicio') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar servicio...</option>
          {MOCK.servicios.map(s => <option key={s.id} value={s.descripcion}>{s.descripcion}</option>)}
        </select>
      );
    }
    if (type === 'proveedor') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar proveedor...</option>
          {app.proveedores
            .filter(p => p.estado !== 'bloqueado' && !(MOCK.documentosProveedor || []).some(d => d.proveedor_id === p.id && d.estado === 'vencido'))
            .map(p => <option key={p.id} value={p.razon_social}>{p.razon_social}</option>)}
        </select>
      );
    }
    if (type === 'centro_costo') {
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar centro de costo...</option>
          {CENTROS_COSTO.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (type === 'industria') {
      const opcionesIndustria = app.industrias?.length ? app.industrias.map(i => i.nombre || i) : INDUSTRIAS;
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Seleccionar industria...</option>
          {opcionesIndustria.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      );
    }
    if (type === 'ruc') {
      return (
        <input
          className="input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{11}"
          maxLength={11}
          value={val(name)}
          onChange={e => update(name, e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="11 digitos"
        />
      );
    }
    if (type === 'sede') {
      const SEDES_MST = [
        { codigo:'SED-001', nombre:'Planta Norte', direccion:'Av. Industrial 1450, Ate Vitarte, Lima' },
        { codigo:'SED-002', nombre:'Sede Sur', direccion:'Jr. Los Incas 320, Villa El Salvador, Lima Sur' },
      ];
      return (
        <select className="select" value={val(name)} onChange={e => update(name, e.target.value)}>
          <option value="">Sin sede asignada</option>
          {SEDES_MST.map(s => (
            <option key={s.codigo} value={s.nombre}>{s.nombre} — {s.direccion}</option>
          ))}
        </select>
      );
    }
    return <input className="input" type={type} value={val(name)} onChange={e => update(name, e.target.value)} placeholder={label}/>;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const number = (v) => v === '' ? 0 : Number(v);
    if (values.ruc && !/^\d{11}$/.test(values.ruc)) {
      setError('El RUC debe tener exactamente 11 numeros.');
      return;
    }
    const genericRecord = {
      id: makeId(active || 'reg'),
      title: values.razon_social || values.nombre || values.asunto || values.concepto || values.servicio || values.proveedor || values.cliente || values.partida || values.modulo || template.title,
      detail: values.descripcion || values.necesidad || values.alcance || values.objetivo || values.motivo || values.doc || values.factura || values.email || 'Registro capturado desde formulario',
      data: values,
      created_at: new Date().toLocaleString('es-PE')
    };

    setSaving(true);
    setError('');
    try {
    if (active === 'tenants') {
      if (!values.razon_social || !values.admin_email) {
        throw new Error('Completa razon social y email del admin.');
      }
      const result = await app.crearTenantConAdmin({
        razon_social: values.razon_social,
        nombre_comercial: values.nombre_comercial || values.razon_social,
        ruc: values.ruc,
        pais: values.pais || 'PE',
        moneda_base: values.moneda || 'PEN',
        estado: values.estado || 'activa',
        admin_email: values.admin_email,
        admin_nombre: values.admin_nombre || 'Administrador del tenant',
      });
      genericRecord.id = result?.empresa_id || genericRecord.id;
      genericRecord.detail = result?.admin_vinculado
        ? `Admin vinculado: ${values.admin_email}`
        : `Tenant creado; admin pendiente: ${values.admin_email}`;
    } else if (active === 'usuarios') {
      const rolSeguro = values.rol === 'plataforma' && !app.role.permisos?.plataforma ? 'admin' : (values.rol || 'admin');
      app.setUsuarios(prev => [...prev, {
        id: makeId('u'),
        nombre: values.nombre || 'Nuevo usuario',
        email: values.email || 'usuario@tideo.pe',
        rol: rolSeguro,
        area: values.area || 'Sin area',
        cargo: values.cargo || 'Por definir',
        telefono: values.telefono || '',
        sede: values.sede || '',
        empresa_id: values.empresa_id || app.empresa.id,
        campo: ['tecnico'].includes(values.rol),
        campoPerfil: values.rol === 'tecnico' ? 'Tecnico' : undefined,
        estado: 'Activo',
        ultimo: 'Nuevo'
      }]);
    } else if (active === 'leads') {
      app.crearLead({
        id: makeId('lead'), empresa_id: app.empresa.id, estado: 'nuevo', convertido: false,
        registrado_desde: values.fuente === 'Campo' ? 'campo' : 'web',
        fecha_creacion: today(), dias_sin_actividad: 0,
        cargo: 'Por definir', urgencia: 'media', responsable: app.role.nombre,
        presupuesto_estimado: number(values.presupuesto_estimado), ...values
      });
    } else if (active === 'cuentas') {
      app.crearCuenta({
        id: makeId('cta'), empresa_id: app.empresa.id, nombre_comercial: values.razon_social,
        tipo: 'prospecto', tamano: 'Por definir', estado: 'activo', condicion_pago: 'Por definir',
        limite_credito: 0, riesgo_financiero: 'bajo', health_score: null, saldo_cxc: 0,
        fecha_ultima_compra: null, margen_acumulado: null, direccion: 'Por definir', ...values
      });
    } else if (active === 'pipeline') {
      app.crearOportunidad({
        etapa: 'calificacion', cuenta_id: values.cuenta_id || app.cuentas[0]?.id,
        monto_estimado: number(values.monto_estimado), ...values
      });
    } else if (active === 'actividades') {
      app.registrarActividad({ fecha: values.fecha || today(), ...values });
    } else if (active === 'agenda_comercial') {
      app.crearAgendaEvento({
        empresa_id: app.empresa.id,
        titulo: values.titulo || 'Nuevo evento',
        tipo: values.tipo || 'reunion',
        cuenta_id: values.cuenta_id || null,
        vendedor: values.vendedor || app.role.nombre || 'Por asignar',
        registrado_por: values.vendedor || app.role.nombre || 'Por asignar',
        fecha: values.fecha || today(),
        hora: values.hora || '09:00',
        duracion_minutos: 60,
        estado: 'programado',
      });
    } else if (active === 'cotizaciones') {
      const subtotal = number(values.subtotal);
      await app.crearCotizacion({
        estado: 'borrador',
        fecha: today(),
        moneda: 'PEN',
        subtotal,
        base_imponible: subtotal,
        igv: subtotal * 0.18,
        total: subtotal * 1.18,
        items: [{ descripcion: values.alcance || 'Servicio cotizado', cantidad: 1, precio_unitario: subtotal, tipo: 'servicio' }],
        ...values
      });
    } else if (active === 'ot') {
      app.crearOT({
        cuenta_id: values.cuenta_id || app.cuentas[0]?.id, cliente: values.cuenta_id || app.cuentas[0]?.id,
        costoEst: 0, costoReal: 0, avance: 0, estado: 'programada', ...values
      });
    } else if (active === 'partes') {
      app.registrarParteDiario({ fecha: values.fecha || today(), horas: number(values.horas), avance_reportado: number(values.avance_reportado), ...values });
    } else if (active === 'backlog') {
      app.setBacklog(prev => [{ id: makeId('bkl'), empresa_id: app.empresa.id, estado: 'pendiente', fecha: today(), ...values }, ...prev]);
    } else if (active === 'inventario') {
      app.setInventario(prev => [...prev, { id: makeId('inv'), stock_actual: number(values.stock_actual), costo_promedio: number(values.costo_promedio), ...values }]);
    } else if (active === 'solpe') {
      app.crearSOLPE({
        fecha: today(),
        items: [{ nombre: values.items_texto || 'Item solicitado', cantidad: 1 }],
        ...values
      });
    } else if (active === 'os_cliente') {
      await app.crearOSClienteManual({
        id: makeId('osc'), empresa_id: app.empresa.id, numero: `OSC-${new Date().getFullYear()}-${String(app.osClientes.length + 1).padStart(4, '0')}`,
        estado: 'en_ejecucion', fecha_emision: today(), moneda: 'PEN',
        monto_aprobado: number(values.monto_aprobado), saldo_por_ejecutar: number(values.monto_aprobado),
        saldo_por_valorizar: number(values.monto_aprobado), saldo_por_facturar: number(values.monto_aprobado),
        monto_facturado: 0, monto_cobrado: 0, ots_asociadas: [], ...values
      });
    } else if (active === 'cs_onboarding') {
      app.crearOnboarding({ fecha_inicio: values.fecha_inicio || today(), ...values });
    } else if (active === 'cs_fidelizacion') {
      app.setNpsEncuestas(prev => [{ id: makeId('nps'), empresa_id: app.empresa.id, estado: 'enviado', fecha_envio: today(), score: null, clasificacion: null, comentario: null, ...values }, ...prev]);
    } else if (active === 'cs_renovaciones') {
      app.setRenovaciones(prev => [{ id: makeId('ren'), empresa_id: app.empresa.id, estado: 'pendiente_contacto', oportunidad_generada: false, dias_restantes: 60, monto_contrato: number(values.monto_contrato), ...values }, ...prev]);
    }

    app.addCreatedRecord(active, genericRecord);
    app.addNotificacion(`Registro creado desde ${template.title}.`);
    onClose();
    } catch (err) {
      const message = err?.message || 'No se pudo guardar el registro.';
      setError(message);
      app.addNotificacion(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width: active === 'leads' ? 'min(720px, 96vw)' : 'min(620px, 96vw)'}}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Formulario de registro</div>
            <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{template.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <form className="side-panel-body" onSubmit={submit}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="quick-form-grid">
            {template.fields.map(field => {
              const layout = field[4] || {};
              const isFull = field[2] === 'textarea' || layout.span === 2;
              return (
                <div key={field[0]} className={'input-group ' + (isFull ? 'full' : '')}>
                  <label>{field[1]}</label>
                  {renderField(field)}
                </div>
              );
            })}
          </div>
          <div className="row mt-6" style={{justifyContent:'flex-end'}}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar registro'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

function MainLayout() {
  const { 
    active, navigate, role, roleKey, setRoleKey, isSuperadmin,
    empresa, setEmpresa, dark, setDark, mobileMode, setMobileMode,
    mobileProfile, setMobileProfile
  } = useApp();
  const [quickCreate, setQuickCreate] = useState(null);

  const allowed = role.permisos.todo ? null : new Set(role.permisos.ver || []);
  const shouldOpenCreate = (target) => {
    const button = target.closest?.('button');
    if (!button || button.disabled || !button.classList.contains('btn-primary')) return false;
    if (button.dataset.localForm === 'true') return false;
    if (button.type === 'submit' && button.closest('form')) return false;
    const text = (button.textContent || '').trim().toLowerCase();
    if (!text) return false;
    return CREATE_WORDS.some(x => text.includes(x));
  };

  const handleCreateCapture = (event) => {
    if (!shouldOpenCreate(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setQuickCreate(active);
  };

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (quickCreate || !shouldOpenCreate(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setQuickCreate(active);
    };
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [active, quickCreate]);

  useEffect(() => {
    if (!isSuperadmin && quickCreate && PLATFORM_PAGES.has(quickCreate)) {
      setQuickCreate(null);
    }
  }, [isSuperadmin, quickCreate]);

  useEffect(() => {
    document.documentElement.className = dark ? 'dark' : '';
  }, [dark]);

  // Auto-redirect if current page is not allowed for role
  useEffect(() => {
    if (active === 'campo') { setMobileMode(true); return; }
    if (!isSuperadmin && PLATFORM_PAGES.has(active)) {
      navigate('dashboard');
      return;
    }
    if (allowed && !allowed.has(active)) {
      navigate('dashboard');
    }
  }, [roleKey, active, isSuperadmin]);

  if (mobileMode) {
    return <MobileFieldView onExit={() => setMobileMode(false)} profile={mobileProfile} setProfile={setMobileProfile} dark={dark} setDark={setDark}/>;
  }

  const Page = () => {
    switch (active) {
      case 'dashboard': return <Dashboard role={role}/>;
      case 'bi_comercial': return <BIComercial />;
      case 'bi_operativo': return <BIOperativo />;
      case 'marketing': return <Marketing />;
      case 'planner': return <Planner />;
      case 'rrhh_operativo': return <RRHH_Operativo />;
      case 'asistencia': return <ControlAsistencia />;
      case 'turnos': return <TurnosHorarios />;
      case 'nomina': return <Nomina />;
      case 'tickets': return <Tickets />;
      case 'presupuestos': return <Presupuestos />;
      case 'cuentas': return <Cuentas/>;
      case 'leads': return <Leads/>;
      case 'pipeline': return <Pipeline/>;
      case 'ot': return <OT role={role}/>;
      case 'partes': return <Partes/>;
      case 'proveedores': return <Proveedores/>;
      case 'cot_compras': return <CotizacionesCompras/>;
      case 'ordenes_compra': return <OrdenesCompra/>;
      case 'ordenes_servicio': return <OrdenesServicio/>;
      case 'recepciones': return <Recepciones/>;
      case 'compras': return <Compras/>;
      case 'cxc': return <CxC/>;
      case 'tesoreria': return <Tesoreria/>;
      case 'resultados': return <Resultados role={role}/>;
      case 'facturacion': return <Facturacion/>;
      case 'roles': return <Roles/>;
      case 'usuarios': return <Usuarios/>;
      case 'tenants': return isSuperadmin ? <Tenants/> : <Dashboard role={role}/>;
      case 'planes': return isSuperadmin ? <Planes/> : <Dashboard role={role}/>;
      case 'actividades': return <Actividades/>;
      case 'agenda_comercial': return <AgendaComercial/>;
      case 'hoja_costeo': return <HojaCosteo/>;
      case 'cotizaciones': return <Cotizaciones/>;
      case 'os_cliente': return <OSCliente/>;
      case 'backlog': return <Backlog/>;
      case 'cierre': return <Cierre/>;
      case 'remision': return <Remision/>;
      case 'valorizacion': return <Valorizacion role={role}/>;
      case 'inventario': return <Inventario/>;
      case 'solpe': return <SOLPE/>;
      case 'ventas': return <Ventas/>;
      case 'caja': return <CajaChica/>;
      case 'prestamos_personal': return <PrestamosPersonal/>;
      case 'financiamiento': return <FinanciamientoDeuda/>;
      case 'cxp': return <CxP/>;
      case 'maestros': return <Maestros/>;
      case 'servicios': return <Servicios/>;
      case 'tarifarios': return <Tarifarios/>;
      case 'parametros': return <Parametros/>;
      case 'rrhh_admin': return <RRHHAdmin/>;
      case 'metricas_saas': return isSuperadmin ? <MetricasSaaS/> : <Dashboard role={role}/>;
      case 'cs_onboarding': return <CSOnboarding/>;
      case 'cs_planes': return <CSPlanes/>;
      case 'cs_health': return <CSHealthScore/>;
      case 'cs_renovaciones': return <CSRenovaciones/>;
      case 'cs_fidelizacion': return <CSFidelizacion/>;
      case 'bi_cs': return <BICustomerSuccess/>;
      case 'ia_comercial': return <IAComercial/>;
      case 'ia_operativa': return <IAOperativa/>;
      case 'ia_financiera': return <IAFinanciera/>;
      case 'bi_financiero': return <BIFinanciero/>;
      default: return <Dashboard role={role}/>;
    }
  };

  return (
    <div className="app-shell" onClickCapture={handleCreateCapture}>
      <Sidebar active={active} onNav={(p) => navigate(p)} role={role} isSuperadmin={isSuperadmin}/>
      <div className="main-col">
        <Header active={active} empresa={empresa} setEmpresa={setEmpresa} role={role} roleKey={roleKey} setRoleKey={setRoleKey} dark={dark} setDark={setDark} setMobileMode={setMobileMode}/>
        <main className="main">
          <CreatedRecordsStrip screen={active}/>
          {Page()}
        </main>
      </div>
      {quickCreate && <QuickCreateModal active={quickCreate} onClose={() => setQuickCreate(null)}/>}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AuthGate>
          <MainLayout />
        </AuthGate>
      </AppProvider>
    </ErrorBoundary>
  );
}
