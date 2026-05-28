import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { rrhhService } from './services/rrhhService.js';
import * as ticketsService from './services/ticketsService.js';
import * as storageService from './services/storageService.js';
import { FileUpload } from './components/FileUpload.jsx';
import { getAssignableUsers, canUserSeeOwner } from './lib/hierarchy.js';
import { PHONE_PATTERN, RUC_PATTERN, isValidPhone, isValidRuc, sanitizePhone, sanitizeRuc } from './lib/formValidators.js';

// Operations: OT, Partes, Valorization & Cuentas

// ============ CUENTAS Y CONTACTOS ============
function Cuentas() {
  const { cuentas, setCuentas, crearCuenta, actualizarCuenta, actualizarLogoCuenta, contactos, setContactos, crearContactoCuenta, actualizarContactoCuenta, oportunidades, cotizaciones, osClientes, leads, historialEstados, actividades, hojasCosteo, ots, valorizaciones, facturas, cxc, oppHistorialEtapas, usuarios, roles, navigate, empresa, addNotificacion, role, authUser, healthScoresDetalle, onboardings, planesExito, npsEncuestas, renovaciones } = useApp();
  const [sel, setSel] = useState(null);
  const [condEdit, setCondEdit] = useState({});
  const [condEditing, setCondEditing] = useState(false);
  const [condSaving, setCondSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [logoUploading, setLogoUploading] = useState(null);
  const [contactEditId, setContactEditId] = useState(null);
  const [contactForm, setContactForm] = useState({ nombre:'', cargo:'', telefono:'', email:'', principal:false });
  const [formCuenta, setFormCuenta] = useState({
    razon_social: '',
    nombre_comercial: '',
    ruc: '',
    pais: 'Perú',
    tipo: 'prospecto',
    industria: '',
    tamano: '',
    telefono_empresa: '',
    email_corporativo: '',
    direccion: '',
    nombre_contacto: '',
    cargo_contacto: '',
    telefono: '',
    email: '',
    responsable_comercial: '',
    fuente_origen: '',
    notas: ''
  });
  const [activeTab, setActiveTab] = useState('Resumen');
  const canFinanzas = role?.permisos?.ver_finanzas;
  const [editingCuenta, setEditingCuenta] = useState(null);
  const [editCuentaForm, setEditCuentaForm] = useState({});
  const [confirmDelCuenta, setConfirmDelCuenta] = useState(null);
  const [confirmDelContacto, setConfirmDelContacto] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroIndustria, setFiltroIndustria] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [filtroCondiciones, setFiltroCondiciones] = useState('');
  const comercialesAsignables = getAssignableUsers({ users: usuarios, roles, categories: ['comercial'], includeAdmins: true, empresaId: empresa?.id, viewer: authUser });
  const cuentaContactos = sel ? contactos.filter(c => c.cuenta_id === sel.id) : [];
  const contactoPrincipal = cuentaContactos.find(c => c.principal || c.es_principal) || cuentaContactos[0] || null;

  const csHealth  = sel ? healthScoresDetalle.find(h => h.cuenta_id === sel.id) : null;
  const csOb      = sel ? onboardings.find(o => o.cuenta_id === sel.id) : null;
  const csPlan    = sel ? planesExito.find(p => p.cuenta_id === sel.id) : null;
  const csNps     = sel ? [...npsEncuestas].filter(n => n.cuenta_id === sel.id).sort((a,b) => (b.fecha_respuesta||'').localeCompare(a.fecha_respuesta||''))[0] : null;
  const csRenov   = sel ? renovaciones.find(r => r.cuenta_id === sel.id) : null;
  const dimLabels = { comercial:'Comercial', operativa:'Operativa', financiera:'Financiera', soporte:'Soporte', satisfaccion:'Satisfacción' };

  const [tlFiltro, setTlFiltro] = useState('todos');
  const [tlDesde, setTlDesde] = useState('');
  const [tlHasta, setTlHasta] = useState('');

  const TL_COLOR = { lead:'var(--cyan)', actividad:'var(--navy)', oportunidad:'var(--green)', cotizacion:'var(--orange)', hoja_costeo:'var(--fg-muted)', os_cliente:'var(--purple)', ot:'var(--navy)', valorizacion:'var(--green)', factura:'var(--green)', cobranza:'var(--orange)', soporte:'var(--danger)', cs:'var(--purple)' };
  const TL_ICON  = { lead:I.users, actividad:I.calendar, oportunidad:I.pipe, cotizacion:I.file, hoja_costeo:I.clipboard, os_cliente:I.package, ot:I.wrench, valorizacion:I.receipt, factura:I.receipt, cobranza:I.dollar, soporte:I.alert, cs:I.sparkles };
  const TL_CAT   = { lead:'lead', actividad:'actividades', oportunidad:'oportunidades', cotizacion:'cotizaciones', hoja_costeo:'operaciones', os_cliente:'operaciones', ot:'operaciones', valorizacion:'finanzas', factura:'finanzas', cobranza:'finanzas', soporte:'soporte', cs:'cs' };

  const tlEventos = useMemo(() => {
    if (!sel) return [];
    const eventos = [];
    const cId = sel.id;
    const opps = oportunidades.filter(o => o.cuenta_id === cId);
    const oppIds = new Set(opps.map(o => o.id));
    const osIds  = new Set(osClientes.filter(os => os.cuenta_id === cId).map(os => os.id));

    // Lead origen y su historial
    const leadOrig = sel.lead_origen ? leads.find(l => l.id === sel.lead_origen) : null;
    if (leadOrig) {
      eventos.push({ id:`lead-crea-${leadOrig.id}`, tipo:'lead', fecha:leadOrig.fecha_creacion, titulo:'Lead registrado', descripcion:`${leadOrig.nombre} · ${leadOrig.empresa_contacto} · ${leadOrig.fuente||''}`, usuario:leadOrig.responsable, nav:'leads', navParams:null });
      historialEstados.filter(h => h.lead_id === leadOrig.id).forEach(h => {
        eventos.push({ id:`lead-hist-${h.id}`, tipo:'lead', fecha:(h.creado_en||'').slice(0,10), titulo:`Lead: ${h.estado_desde} → ${h.estado_hasta}`, descripcion:h.motivo||'', usuario:null, nav:null });
      });
      if (leadOrig.convertido) {
        eventos.push({ id:`lead-conv-${leadOrig.id}`, tipo:'lead', fecha:leadOrig.fecha_conversion||leadOrig.fecha_creacion, titulo:'Lead convertido en cuenta', descripcion:`Origen de ${sel.razon_social}`, usuario:leadOrig.responsable, nav:'leads', navParams:null });
      }
    }

    // Actividades
    actividades.filter(a => a.cuenta_id===cId || (a.vinculo_tipo==='oportunidad' && oppIds.has(a.vinculo_id))).forEach(a => {
      eventos.push({ id:`act-${a.id}`, tipo:'actividad', fecha:a.fecha, titulo:a.tipo.charAt(0).toUpperCase()+a.tipo.slice(1), descripcion:a.descripcion, usuario:a.responsable, nav:null });
    });

    // Oportunidades
    opps.forEach(o => {
      eventos.push({ id:`opp-${o.id}`, tipo:'oportunidad', fecha:o.fecha_creacion, titulo:`Oportunidad creada: ${o.nombre}`, descripcion:`${o.etapa} · ${money(o.monto_estimado)}`, usuario:o.responsable, nav:'pipeline', navParams:{ panel:o.id } });
      if (o.fecha_cierre_real && o.estado==='ganada') eventos.push({ id:`opp-won-${o.id}`, tipo:'oportunidad', fecha:o.fecha_cierre_real, titulo:`Oportunidad ganada: ${o.nombre}`, descripcion:money(o.monto_estimado), usuario:o.responsable, nav:'pipeline', navParams:{ panel:o.id } });
      if (o.estado==='perdida') eventos.push({ id:`opp-lost-${o.id}`, tipo:'oportunidad', fecha:o.fecha_cierre_real||o.fecha_cierre_estimada, titulo:`Oportunidad perdida: ${o.nombre}`, descripcion:o.motivo_perdida||'', usuario:o.responsable, nav:'pipeline', navParams:{ panel:o.id } });
    });
    // Cambios de etapa en oportunidades
    (oppHistorialEtapas || []).filter(h => oppIds.has(h.opp_id)).forEach(h => {
      const oppNombre = opps.find(o => o.id === h.opp_id)?.nombre || '';
      eventos.push({ id:`ohe-${h.id}`, tipo:'oportunidad', fecha:h.fecha, titulo:`Etapa: ${h.etapa_desde} → ${h.etapa_hasta}`, descripcion:oppNombre, usuario:h.usuario, nav:'pipeline', navParams:{ panel:h.opp_id } });
    });

    // Cotizaciones
    cotizaciones.filter(c => c.cuenta_id===cId).forEach(c => {
      const cotSym = c.moneda === 'USD' ? 'US$' : c.moneda === 'EUR' ? '€' : 'S/';
      eventos.push({ id:`cot-${c.id}`, tipo:'cotizacion', fecha:c.fecha, titulo:`Cotización ${c.numero} v${c.version||1}`, descripcion:`${c.estado} · ${money(c.total_impl || c.total, cotSym)}`, usuario:c.responsable, nav:'cotizaciones', navParams:{ detail:c.id } });
    });

    // Hojas de costeo aprobadas
    hojasCosteo.filter(h => h.cuenta_id===cId && h.estado==='aprobada').forEach(h => {
      eventos.push({ id:`hc-${h.id}`, tipo:'hoja_costeo', fecha:h.fecha, titulo:`Hoja de costeo aprobada: ${h.numero}`, descripcion:money(h.costo_total), usuario:h.responsable_costeo, nav:null });
    });

    // OS Cliente
    osClientes.filter(os => os.cuenta_id===cId).forEach(os => {
      const sym = os.moneda === 'USD' ? 'US$' : os.moneda === 'EUR' ? '€' : 'S/';
      eventos.push({ id:`os-${os.id}`, tipo:'os_cliente', fecha:os.fecha_emision, titulo:`OS Cliente: ${os.numero}`, descripcion:`${os.estado} · ${money(os.monto_aprobado, sym)}`, usuario:null, nav:'os_cliente', navParams:{ detail:os.id } });
    });

    // OTs
    ots.filter(o => o.cuenta_id===cId || osIds.has(o.os_cliente_id)).forEach(o => {
      eventos.push({ id:`ot-ini-${o.id}`, tipo:'ot', fecha:o.fecha_inicio, titulo:`OT abierta: ${o.numero}`, descripcion:`${o.tipo} — ${o.descripcion||''}`, usuario:o.responsable, nav:'ot', navParams:{ detail:o.id } });
      if (['cerrada','completada'].includes(o.estado) && o.fecha_fin) eventos.push({ id:`ot-fin-${o.id}`, tipo:'ot', fecha:o.fecha_fin, titulo:`OT cerrada: ${o.numero}`, descripcion:`Costo real: ${money(o.costoReal||0)}`, usuario:o.responsable, nav:'ot', navParams:{ detail:o.id } });
    });

    // Valorizaciones
    valorizaciones.filter(v => osIds.has(v.os_cliente_id)).forEach(v => {
      eventos.push({ id:`val-${v.id}`, tipo:'valorizacion', fecha:v.fecha, titulo:`Valorización ${v.numero}`, descripcion:`${v.estado} · ${money(v.total)}`, usuario:null, nav:'os_cliente', navParams:{ detail:v.os_cliente_id } });
    });

    // Facturas
    facturas.filter(f => f.cuenta_id===cId).forEach(f => {
      eventos.push({ id:`fac-${f.id}`, tipo:'factura', fecha:f.fecha_emision||f.fecha, titulo:`Factura ${f.numero||''}`, descripcion:`${f.estado} · ${money(f.monto_total||f.total||0)}`, usuario:null, nav:null });
    });

    // CxC por nombre
    cxc.filter(c => c.cliente===sel.razon_social).forEach(c => {
      eventos.push({ id:`cxc-${c.id}`, tipo:'cobranza', fecha:c.emision, titulo:`Cobranza: ${c.factura}`, descripcion:`${c.estado} · ${money(c.total)}`, usuario:null, nav:null });
    });

    // Customer Success
    const csObLoc = onboardings.find(o => o.cuenta_id===cId);
    if (csObLoc?.estado==='completado') eventos.push({ id:'cs-ob', tipo:'cs', fecha:csObLoc.fecha_cierre||csObLoc.fecha_inicio, titulo:'Onboarding completado', descripcion:csObLoc.tipo_servicio, usuario:null, nav:null });
    const csNpsLoc = [...npsEncuestas].filter(n => n.cuenta_id===cId).sort((a,b)=>(b.fecha_respuesta||'').localeCompare(a.fecha_respuesta||''))[0];
    if (csNpsLoc) eventos.push({ id:'cs-nps', tipo:'cs', fecha:csNpsLoc.fecha_respuesta, titulo:`NPS registrado: ${csNpsLoc.score}`, descripcion:`${csNpsLoc.clasificacion}${csNpsLoc.comentario?` · "${csNpsLoc.comentario}"`:''}`, usuario:null, nav:null });
    const csRenovLoc = renovaciones.find(r => r.cuenta_id===cId);
    if (csRenovLoc) eventos.push({ id:'cs-renov', tipo:'cs', fecha:csRenovLoc.fecha_renovacion||csRenovLoc.fecha_vencimiento, titulo:`Renovación: ${csRenovLoc.servicio}`, descripcion:`${csRenovLoc.estado||''} · ${money(csRenovLoc.monto_contrato)}`, usuario:null, nav:null });
    const csHLoc = healthScoresDetalle.find(h => h.cuenta_id===cId);
    if (csHLoc?.score_total < 40) eventos.push({ id:'cs-health', tipo:'cs', fecha:csHLoc.fecha||new Date().toISOString().slice(0,10), titulo:'Health score bajo umbral crítico', descripcion:`Score: ${csHLoc.score_total} · ${csHLoc.semaforo}`, usuario:null, nav:null });

    return eventos.filter(e => e.fecha).sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''));
  }, [sel, leads, historialEstados, actividades, oportunidades, cotizaciones, hojasCosteo, osClientes, ots, valorizaciones, facturas, cxc, oppHistorialEtapas, onboardings, npsEncuestas, renovaciones, healthScoresDetalle]);

  const getHealthColor = (score) => {
    if (score === null || score === undefined) return 'gray';
    if (score >= 70) return 'green';
    if (score >= 40) return 'orange';
    return 'red';
  };

  const cuentaHealthBase = sel ? [
    sel.ruc && sel.ruc !== 'Pendiente' ? 15 : 0,
    contactoPrincipal ? 20 : 0,
    sel.responsable_comercial && sel.responsable_comercial !== 'Sin asignar' ? 15 : 0,
    sel.condicion_pago && sel.condicion_pago !== 'Por definir' ? 15 : 0,
    Number(sel.saldo_cxc || 0) <= 0 && Number(sel.dias_mora || 0) <= 0 ? 15 : 0,
    tlEventos.length > 0 ? 10 : 0,
    sel.industria && sel.industria !== 'Por definir' ? 10 : 0,
  ].reduce((sum, value) => sum + value, 0) : 0;
  const cuentaHealthRaw = csHealth?.score_total ?? sel?.health_score ?? cuentaHealthBase;
  const cuentaHealthScore = Math.max(0, Math.min(100, Math.round(Number(cuentaHealthRaw) || 0)));
  const cuentaHealthColor = cuentaHealthScore >= 70 ? 'var(--green)' : cuentaHealthScore >= 40 ? 'var(--orange)' : 'var(--danger)';
  const cuentaHealthBg = cuentaHealthScore >= 70 ? 'rgba(76,175,80,0.10)' : cuentaHealthScore >= 40 ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.10)';
  const cuentaHealthLabel = cuentaHealthScore >= 70 ? 'Cuenta sana' : cuentaHealthScore >= 40 ? 'En seguimiento' : 'Cuenta en riesgo';
  const cuentaHealthCriterios = sel ? [
    { ok: Boolean(sel.ruc && sel.ruc !== 'Pendiente'), label: sel.ruc && sel.ruc !== 'Pendiente' ? 'RUC registrado' : 'RUC pendiente' },
    { ok: Boolean(contactoPrincipal), label: contactoPrincipal ? 'Contacto principal asignado' : 'Sin contacto principal' },
    { ok: Boolean(sel.responsable_comercial && sel.responsable_comercial !== 'Sin asignar'), label: sel.responsable_comercial && sel.responsable_comercial !== 'Sin asignar' ? 'Responsable comercial asignado' : 'Responsable comercial pendiente' },
    { ok: Boolean(sel.condicion_pago && sel.condicion_pago !== 'Por definir'), label: sel.condicion_pago && sel.condicion_pago !== 'Por definir' ? 'Condiciones comerciales definidas' : 'Condiciones comerciales pendientes' },
    { ok: Number(sel.saldo_cxc || 0) <= 0 && Number(sel.dias_mora || 0) <= 0, label: Number(sel.dias_mora || 0) > 0 ? 'CxC con mora' : 'CxC sin mora' },
    { ok: tlEventos.length > 0, label: tlEventos.length > 0 ? 'Actividad registrada' : 'Sin actividad reciente' },
  ] : [];

  const getTipoBadge = (tipo) => {
    switch(tipo) {
      case 'estrategico': return 'badge-purple';
      case 'en_riesgo': return 'badge-red';
      case 'prospecto': return 'badge-cyan';
      default: return 'badge-green';
    }
  };

  const getCuentaLogo = (cuenta) => cuenta.logo_url || null;

  const getInitials = (name = '') => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'CT';
    return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
  };

  const handleLogoUpload = async (cuenta, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addNotificacion?.('El archivo seleccionado no es una imagen.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addNotificacion?.('El logo no debe superar 2 MB.');
      return;
    }

    try {
      setLogoUploading(cuenta.id);
      const actualizada = await actualizarLogoCuenta(cuenta, file);
      if (actualizada) setSel(prev => prev?.id === cuenta.id ? { ...prev, ...actualizada } : prev);
    } catch (error) {
      addNotificacion?.(`No se pudo guardar el logo: ${error?.message || 'error desconocido'}`);
    } finally {
      setLogoUploading(null);
    }
  };

  const updateCuentaForm = (field, value) => {
    setFormCuenta(prev => ({ ...prev, [field]: value }));
  };

  const formCuentaBase = { razon_social:'', nombre_comercial:'', ruc:'', pais:'Perú', tipo:'prospecto', industria:'', tamano:'', telefono_empresa:'', email_corporativo:'', direccion:'', nombre_contacto:'', cargo_contacto:'', telefono:'', email:'', responsable_comercial:'', fuente_origen:'', notas:'' };
  const contactFormBase = { nombre:'', cargo:'', telefono:'', email:'', principal:false };

  const startNuevoContacto = () => {
    setContactEditId('nuevo');
    setContactForm({ ...contactFormBase, principal: cuentaContactos.length === 0 });
  };

  const startEditarContacto = (contacto) => {
    setContactEditId(contacto.id);
    setContactForm({
      nombre: contacto.nombre || '',
      cargo: contacto.cargo || '',
      telefono: sanitizePhone(contacto.telefono || ''),
      email: contacto.email || '',
      principal: Boolean(contacto.principal || contacto.es_principal),
    });
  };

  const cancelarContacto = () => {
    setContactEditId(null);
    setContactForm(contactFormBase);
  };

  const guardarContacto = async (e) => {
    e.preventDefault();
    if (!sel?.id) return;
    if (!contactForm.nombre.trim()) {
      addNotificacion?.('El nombre del contacto es obligatorio.');
      return;
    }
    if (contactForm.telefono && !isValidPhone(contactForm.telefono)) {
      addNotificacion?.('El telefono debe tener 9 digitos y comenzar con 9.');
      return;
    }

    const payload = {
      nombre: contactForm.nombre.trim(),
      cargo: contactForm.cargo.trim() || null,
      telefono: contactForm.telefono.trim() || null,
      email: contactForm.email.trim() || null,
      principal: Boolean(contactForm.principal),
      es_principal: Boolean(contactForm.principal),
      estado: 'activo',
    };

    if (!contactEditId || contactEditId === 'nuevo') {
      await crearContactoCuenta(sel.id, payload);
    } else {
      await actualizarContactoCuenta(contactEditId, payload);
    }
    cancelarContacto();
  };

  const guardarEditCuenta = async () => {
    if (!editingCuenta) return;
    const actualizada = await actualizarCuenta(editingCuenta.id, editCuentaForm);
    if (sel?.id === editingCuenta.id) setSel(prev => ({ ...prev, ...editCuentaForm, ...actualizada }));
    setEditingCuenta(null);
    addNotificacion?.('Cuenta actualizada');
  };

  const confirmarEliminarCuenta = () => {
    setCuentas(prev => prev.filter(c => c.id !== confirmDelCuenta.id));
    if (sel?.id === confirmDelCuenta.id) setSel(null);
    setConfirmDelCuenta(null);
    addNotificacion?.(`Cuenta "${confirmDelCuenta.razon_social}" eliminada`);
  };

  const confirmarEliminarContacto = () => {
    setContactos(prev => prev.filter(c => c.id !== confirmDelContacto.id));
    setConfirmDelContacto(null);
    addNotificacion?.(`Contacto "${confirmDelContacto.nombre}" eliminado`);
  };

  const startEditarCondiciones = () => {
    setCondEdit({});
    setCondEditing(true);
  };

  const cancelarCondiciones = () => {
    setCondEdit({});
    setCondEditing(false);
  };

  const guardarCondiciones = async () => {
    if (!sel?.id) return;
    if (condEdit.ruc && !isValidRuc(condEdit.ruc)) {
      addNotificacion?.('El RUC debe tener 11 numeros y comenzar con 1 o 2.');
      return;
    }
    try {
      setCondSaving(true);
      const actualizada = await actualizarCuenta(sel.id, condEdit);
      setSel(prev => ({ ...prev, ...actualizada }));
      setCondEdit({});
      setCondEditing(false);
    } catch (error) {
      addNotificacion?.(`No se pudieron guardar las condiciones: ${error?.message || 'error desconocido'}`);
    } finally {
      setCondSaving(false);
    }
  };

  const guardarCuenta = (e) => {
    e.preventDefault();
    if (formCuenta.ruc && !isValidRuc(formCuenta.ruc)) {
      addNotificacion?.('El RUC debe tener 11 numeros y comenzar con 1 o 2.');
      return;
    }
    if (formCuenta.telefono && !isValidPhone(formCuenta.telefono)) {
      addNotificacion?.('El telefono debe tener 9 digitos y comenzar con 9.');
      return;
    }
    const nueva = {
      id: `cta_${Date.now().toString(36)}`,
      empresa_id: empresa.id,
      razon_social: formCuenta.razon_social || 'Nueva cuenta sin nombre',
      nombre_comercial: formCuenta.nombre_comercial || formCuenta.razon_social || 'Nueva cuenta',
      tipo: formCuenta.tipo || 'prospecto',
      pais: formCuenta.pais || 'Perú',
      industria: formCuenta.industria || 'Por definir',
      tamano: formCuenta.tamano || 'Por definir',
      estado: 'activo',
      responsable_comercial: formCuenta.responsable_comercial || 'Sin asignar',
      responsable_cs: null,
      condicion_pago: 'Por definir',
      limite_credito: 0,
      riesgo_financiero: 'bajo',
      health_score: null,
      riesgo_churn: null,
      fecha_ultima_compra: null,
      margen_acumulado: null,
      saldo_cxc: 0,
      direccion: formCuenta.direccion || 'Por definir',
      telefono_empresa: formCuenta.telefono_empresa || null,
      email_corporativo: formCuenta.email_corporativo || null,
      telefono: formCuenta.telefono,
      email: formCuenta.email,
      ruc: formCuenta.ruc || 'Pendiente',
      fuente_origen: formCuenta.fuente_origen || null,
      notas: formCuenta.notas || null,
      nombre_contacto: formCuenta.nombre_contacto,
      cargo_contacto: formCuenta.cargo_contacto
    };
    crearCuenta(nueva);
    addNotificacion?.(`Cuenta creada: ${nueva.razon_social}`);
    setNewOpen(false);
    setFormCuenta(formCuentaBase);
  };

  const canVerEquipo = role?.permisos?.ver_agenda_equipo || role?.permisos?.todo;
  const industriasDisponibles = [...new Set(cuentas.map(c => c.industria).filter(Boolean).filter(i => i !== 'Por definir'))].sort();
  const responsablesDisponibles = [...new Set(cuentas.map(c => c.responsable_comercial).filter(Boolean).filter(r => r !== 'Sin asignar'))].sort();

  const cuentasBase = cuentas.filter(c => canUserSeeOwner({ viewer: authUser, ownerUserId: c.responsable_id, ownerName: c.responsable_comercial, users: usuarios, roles }));
  const cuentasFiltradas = cuentasBase.filter(c => {
    const txt = filtroTexto.trim().toLowerCase();
    if (txt && ![ c.nombre_comercial, c.razon_social, c.ruc ].some(v => (v||'').toLowerCase().includes(txt))) return false;
    if (filtroTipo && c.tipo !== filtroTipo) return false;
    if (filtroIndustria && c.industria !== filtroIndustria) return false;
    if (filtroResponsable && c.responsable_comercial !== filtroResponsable) return false;
    if (filtroCondiciones === 'completas' && (!c.condicion_pago || c.condicion_pago === 'Por definir')) return false;
    if (filtroCondiciones === 'pendientes' && c.condicion_pago && c.condicion_pago !== 'Por definir') return false;
    return true;
  });
  const hayFiltros = filtroTexto || filtroTipo || filtroIndustria || filtroResponsable || filtroCondiciones;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas y Contactos</h1>
          <div className="page-sub">{hayFiltros ? `${cuentasFiltradas.length} de ${cuentasBase.length} cuentas` : `${cuentasBase.length} cuentas activas`}</div>
        </div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setNewOpen(true)}>{I.plus} Nueva cuenta</button>
      </div>
      <div style={{marginBottom:16, padding:'12px 16px', background:'rgba(6,182,212,0.06)', border:'1px solid var(--border)', borderLeft:'3px solid var(--cyan)', borderRadius:8, fontSize:13}}>
        <strong>Recomendación: </strong><span className="text-muted">El flujo ideal es registrar primero un <strong>Lead</strong> y convertirlo desde el módulo de Leads. Esto pre-completa la cuenta con el RUC, razón social e industria del prospecto.</span>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:12}} onClick={()=>navigate('leads')}>Ir a Leads</button>
      </div>

      {/* ── Barra de filtros ── */}
      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:16, alignItems:'center'}}>
        <input
          className="input"
          style={{height:34, width:220, fontSize:13}}
          placeholder="Buscar por nombre, razón social o RUC..."
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
        />
        <select className="select" style={{height:34, fontSize:13, width:'auto', minWidth:140}} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="cliente">Cliente</option>
          <option value="prospecto">Prospecto</option>
          <option value="partner">Partner</option>
          <option value="proveedor_estrategico">Proveedor estratégico</option>
        </select>
        <select className="select" style={{height:34, fontSize:13, width:'auto', minWidth:140}} value={filtroIndustria} onChange={e => setFiltroIndustria(e.target.value)}>
          <option value="">Todas las industrias</option>
          {industriasDisponibles.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        {canVerEquipo && (
          <select className="select" style={{height:34, fontSize:13, width:'auto', minWidth:160}} value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)}>
            <option value="">Todos los responsables</option>
            {responsablesDisponibles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <select className="select" style={{height:34, fontSize:13, width:'auto', minWidth:180}} value={filtroCondiciones} onChange={e => setFiltroCondiciones(e.target.value)}>
          <option value="">Estado de condiciones</option>
          <option value="completas">Condiciones completas</option>
          <option value="pendientes">Condiciones pendientes</option>
        </select>
        {hayFiltros && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroTexto(''); setFiltroTipo(''); setFiltroIndustria(''); setFiltroResponsable(''); setFiltroCondiciones(''); }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="account-gallery">
        {cuentasFiltradas.length === 0 && (
          <div style={{gridColumn:'1/-1', padding:'32px 16px', textAlign:'center', color:'var(--fg-muted)', fontSize:13}}>
            No hay cuentas que coincidan con los filtros aplicados.
          </div>
        )}
        {cuentasFiltradas.map(c => {
          const logoUrl = getCuentaLogo(c);
          return (
            <article key={c.id} className="account-card" onClick={() => { setSel({ ...c, logo_url: logoUrl }); setActiveTab('Resumen'); setContactEditId(null); setCondEditing(false); setCondEdit({}); }}>
              <div className="account-logo-wrap">
                {logoUrl ? (
                  <img className="account-logo" src={logoUrl} alt={`Logo de ${c.razon_social}`} />
                ) : (
                  <div className="account-logo-empty">
                    <div className="account-logo-initials">{getInitials(c.razon_social)}</div>
                    <span>Subir logotipo de empresa</span>
                  </div>
                )}
                <label className="account-logo-upload" onClick={(e) => e.stopPropagation()}>
                  {logoUploading === c.id ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  <input type="file" accept="image/*" disabled={logoUploading === c.id} onChange={(e) => handleLogoUpload(c, e.target.files?.[0])} />
                </label>
              </div>
              <div className="account-card-body">
                <div>
                  <h2 className="account-title">{c.razon_social}</h2>
                  <div className="text-muted" style={{fontSize:12, marginTop:4}}>{c.ruc || 'RUC pendiente'}</div>
                </div>
                <div className="account-meta">
                  <div><span>Tipo</span><strong className={'badge ' + getTipoBadge(c.tipo)}>{c.tipo.replace('_', ' ')}</strong></div>
                  <div><span>Industria</span><strong>{c.industria || 'Por definir'}</strong></div>
                  <div><span>Responsable</span><strong>{c.responsable_comercial || 'Sin asignar'}</strong></div>
                  <div><span>Última compra</span><strong>{c.fecha_ultima_compra || '—'}</strong></div>
                </div>
                <div className="account-footer">
                  <div className="row" style={{gap:8}}>
                    <span className={'health-dot health-'+getHealthColor(c.health_score)}/>
                    <span className="text-muted">Health {c.health_score || 'N/A'}</span>
                  </div>
                  <div className="row" style={{gap:8, alignItems:'center'}}>
                    <strong style={{fontSize:11}}>{c.saldo_cxc > 0 ? money(c.saldo_cxc) : 'Sin CxC'}</strong>
                    <div className="row" style={{gap:2}} onClick={e => e.stopPropagation()}>
                      <button type="button" className="icon-btn" title="Editar cuenta"
                        style={{width:26, height:26, color:'var(--fg-muted)', borderRadius:6}}
                        onClick={e => { e.stopPropagation(); setEditingCuenta(c); setEditCuentaForm({ razon_social:c.razon_social||'', ruc:c.ruc||'', industria:c.industria||'', tipo:c.tipo||'prospecto', responsable_comercial:c.responsable_comercial||'' }); }}>
                        {I.edit}
                      </button>
                      <button type="button" className="icon-btn" title="Eliminar cuenta"
                        style={{width:26, height:26, color:'var(--danger)', borderRadius:6}}
                        onClick={e => { e.stopPropagation(); setConfirmDelCuenta(c); }}>
                        {I.trash}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {newOpen && <>
        <div className="side-panel-backdrop" onClick={() => setNewOpen(false)}/>
        <div className="side-panel" style={{width:'min(620px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Formulario de registro</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nueva cuenta</div>
            </div>
            <button className="icon-btn" onClick={() => setNewOpen(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarCuenta}>
            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Datos de la empresa</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Razón social *</label><input className="input" required value={formCuenta.razon_social} onChange={e=>updateCuentaForm('razon_social', e.target.value)} autoFocus placeholder="Nombre legal de la empresa"/></div>
              <div className="input-group"><label>RUC <span style={{fontSize:11,color:'var(--fg-subtle)',fontWeight:400}}>· 11 dígitos</span></label><input className="input" value={formCuenta.ruc} onChange={e=>updateCuentaForm('ruc', sanitizeRuc(e.target.value))} placeholder="20xxxxxxxxx" inputMode="numeric" pattern={RUC_PATTERN} maxLength={11}/></div>
              <div className="input-group"><label>Nombre comercial</label><input className="input" value={formCuenta.nombre_comercial} onChange={e=>updateCuentaForm('nombre_comercial', e.target.value)} placeholder="Si es diferente a la razón social"/></div>
              <div className="input-group"><label>País</label><select className="select" value={formCuenta.pais} onChange={e=>updateCuentaForm('pais', e.target.value)}>
                {['Perú','Chile','Colombia','México','Ecuador','Bolivia','Argentina','Brasil','Uruguay','Otro'].map(p=><option key={p}>{p}</option>)}
              </select></div>
              <div className="input-group"><label>Tipo de cuenta</label><select className="select" value={formCuenta.tipo} onChange={e=>updateCuentaForm('tipo', e.target.value)}>
                <option value="prospecto">Prospecto</option>
                <option value="cliente">Cliente</option>
                <option value="partner">Partner</option>
                <option value="proveedor_estrategico">Proveedor estratégico</option>
              </select></div>
              <div className="input-group"><label>Industria</label><select className="select" value={formCuenta.industria} onChange={e=>updateCuentaForm('industria', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Minería','Industrial','Construcción','Agroindustria','Facilities','Energía','Petróleo & Gas','Logística','Otro'].map(i=><option key={i}>{i}</option>)}
              </select></div>
              <div className="input-group"><label>Tamaño empresa</label><select className="select" value={formCuenta.tamano} onChange={e=>updateCuentaForm('tamano', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['pequeña','mediana','grande','corporativo'].map(t=><option key={t}>{t}</option>)}
              </select></div>
              <div className="input-group"><label>Teléfono empresa</label><input className="input" type="tel" inputMode="numeric" value={formCuenta.telefono_empresa} onChange={e=>updateCuentaForm('telefono_empresa', e.target.value)} placeholder="01XXXXXXX o 9XXXXXXXX"/></div>
              <div className="input-group"><label>Email corporativo</label><input className="input" type="email" value={formCuenta.email_corporativo} onChange={e=>updateCuentaForm('email_corporativo', e.target.value)} placeholder="info@empresa.pe"/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Dirección</label><input className="input" value={formCuenta.direccion} onChange={e=>updateCuentaForm('direccion', e.target.value)} placeholder="Dirección fiscal o principal"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Contacto principal</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Nombre del contacto</label><input className="input" value={formCuenta.nombre_contacto} onChange={e=>updateCuentaForm('nombre_contacto', e.target.value)} placeholder="Nombre y apellido"/></div>
              <div className="input-group"><label>Cargo</label><input className="input" value={formCuenta.cargo_contacto} onChange={e=>updateCuentaForm('cargo_contacto', e.target.value)} placeholder="Ej: Gerente de Operaciones"/></div>
              <div className="input-group"><label>Teléfono directo</label><input className="input" type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={formCuenta.telefono} onChange={e=>updateCuentaForm('telefono', sanitizePhone(e.target.value))} placeholder="9XXXXXXXX"/></div>
              <div className="input-group"><label>Email personal</label><input className="input" type="email" value={formCuenta.email} onChange={e=>updateCuentaForm('email', e.target.value)} placeholder="contacto@empresa.pe"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Asignación</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Responsable comercial *</label><select className="select" required value={formCuenta.responsable_comercial} onChange={e=>updateCuentaForm('responsable_comercial', e.target.value)}>
                <option value="">Seleccionar...</option>
                {comercialesAsignables.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select></div>
              <div className="input-group"><label>Fuente de origen</label><select className="select" value={formCuenta.fuente_origen} onChange={e=>updateCuentaForm('fuente_origen', e.target.value)}>
                <option value="">Seleccionar...</option>
                {['Referido','Prospección directa','Evento / Feria','Web','Otro'].map(f=><option key={f}>{f}</option>)}
              </select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, marginBottom:10, color:'var(--fg-muted)'}}>Notas iniciales</div>
            <div style={{marginBottom:20}}>
              <textarea className="input" rows={3} style={{resize:'vertical', minHeight:72}} value={formCuenta.notas} onChange={e=>updateCuentaForm('notas', e.target.value)} placeholder="Contexto inicial, cómo llegó el prospecto, observaciones relevantes..."/>
            </div>

            <div style={{padding:'10px 14px', background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:8, fontSize:12, color:'var(--fg-muted)', marginBottom:20}}>
              Las <strong>condiciones comerciales</strong> (crédito, forma de pago, clasificación) se completan en una segunda etapa desde el área de Finanzas/Administración.
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={() => setNewOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar cuenta</button>
            </div>
          </form>
        </div>
      </>}

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel account-profile-panel ficha-detail-panel">
          <div className="account-profile-hero">
            <div className="account-profile-logo">
              {getCuentaLogo(sel) ? <img src={getCuentaLogo(sel)} alt={`Logo de ${sel.razon_social}`} /> : <span>{getInitials(sel.razon_social)}</span>}
              <label title="Cambiar logotipo">
                {I.plus}
                <input type="file" accept="image/*" disabled={logoUploading === sel.id} onChange={(e) => handleLogoUpload(sel, e.target.files?.[0])} />
              </label>
            </div>
            <div className="account-profile-title">
              <div className="eyebrow">Ficha 360° · Cliente</div>
              <h2 className="ficha-detail-title">{sel.razon_social}</h2>
              <div className="account-profile-tags">
                <span className={'badge ' + getTipoBadge(sel.tipo)}>{(sel.tipo || 'cliente').replace('_', ' ')}</span>
                <span className="badge badge-gray">{sel.industria || 'Industria pendiente'}</span>
                {sel.condicion_pago === 'Por definir' && <span className="badge badge-orange">Condiciones pendientes</span>}
              </div>
            </div>
            <div className="account-profile-contact">
              <div className="eyebrow">Contacto principal</div>
              <strong>{contactoPrincipal?.nombre || 'Sin contacto'}</strong>
              <span>{contactoPrincipal?.cargo || 'Cargo pendiente'}</span>
              <span>{contactoPrincipal?.telefono || contactoPrincipal?.email || 'Datos pendientes'}</span>
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <div className="account-profile-health" style={{background: cuentaHealthBg}}>
            <div className="row" style={{alignItems:'center', gap:8, marginBottom:10}}>
              <strong className="ficha-detail-score" style={{color:cuentaHealthColor}}>{cuentaHealthScore}</strong>
              <span style={{fontSize:12, color:'var(--fg-muted)'}}>/ 100</span>
              <span className="badge" style={{borderColor:cuentaHealthColor, color:cuentaHealthColor, background:'var(--surface)'}}>{cuentaHealthLabel}</span>
            </div>
            <div style={{height:5, borderRadius:999, background:'rgba(15,35,70,0.12)', overflow:'hidden', marginBottom:12}}>
              <div style={{width:`${cuentaHealthScore}%`, height:'100%', borderRadius:999, background:cuentaHealthColor}}/>
            </div>
            <div className="account-profile-health-grid">
              {cuentaHealthCriterios.map((criterio, idx) => (
                <div key={`${criterio.label}-${idx}`} style={{display:'flex', gap:8, alignItems:'center', minWidth:0}}>
                  <span style={{width:12, color:criterio.ok ? 'var(--green)' : 'var(--fg-muted)', fontWeight:800}}>{criterio.ok ? I.check : <span style={{fontSize:14, lineHeight:1}}>-</span>}</span>
                  <span style={{fontSize:12, color:'var(--fg-muted)', overflow:'hidden', textOverflow:'ellipsis'}}>{criterio.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="side-panel-body">
            <div className="tabs account-profile-tabs ficha-detail-tabs">
              {['Timeline', 'Resumen', 'Oportunidades', 'Cotizaciones', 'OS Cliente', 'Contactos', 'Customer Success', ...(canFinanzas ? ['Condiciones comerciales'] : [])].map(t => (
                <div key={t} className={`tab ficha-detail-tab ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>{t}</div>
              ))}
            </div>
            <div className="ficha-detail-content">
            
            {activeTab === 'Timeline' && (() => {
              const filtrados = tlEventos.filter(e => {
                if (tlFiltro !== 'todos' && TL_CAT[e.tipo] !== tlFiltro) return false;
                if (tlDesde && e.fecha < tlDesde) return false;
                if (tlHasta && e.fecha > tlHasta) return false;
                return true;
              });
              const today = new Date().toISOString().slice(0,10);
              const ayer  = new Date(Date.now()-86400000).toISOString().slice(0,10);
              const fmtDia = f => f===today?'Hoy':f===ayer?'Ayer':f.split('-').reverse().join('/');
              const grupos = {};
              filtrados.forEach(e => { const d=(e.fecha||'').slice(0,10)||'Sin fecha'; if(!grupos[d])grupos[d]=[]; grupos[d].push(e); });
              const fechas = Object.keys(grupos).sort((a,b)=>b.localeCompare(a));
              return (
                <div style={{paddingTop:4}}>
                  <div style={{display:'flex', gap:8, paddingBottom:14, flexWrap:'wrap', alignItems:'center'}}>
                    <select className="select" style={{height:32, fontSize:12, padding:'0 8px', width:'auto', minWidth:130}} value={tlFiltro} onChange={e=>setTlFiltro(e.target.value)}>
                      {[['todos','Todos'],['lead','Lead'],['actividades','Actividades'],['oportunidades','Oportunidades'],['cotizaciones','Cotizaciones'],['operaciones','Operaciones'],['finanzas','Finanzas'],['soporte','Soporte'],['cs','Customer Success']].map(([v,l])=>(
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <input type="date" className="input" style={{height:32, fontSize:12, padding:'0 8px', width:'auto'}} value={tlDesde} onChange={e=>setTlDesde(e.target.value)} />
                    <span style={{fontSize:12, color:'var(--fg-muted)'}}>–</span>
                    <input type="date" className="input" style={{height:32, fontSize:12, padding:'0 8px', width:'auto'}} value={tlHasta} onChange={e=>setTlHasta(e.target.value)} />
                    {(tlFiltro!=='todos'||tlDesde||tlHasta) && (
                      <button className="btn btn-ghost btn-sm" onClick={()=>{setTlFiltro('todos');setTlDesde('');setTlHasta('');}}>
                        {I.x} Limpiar
                      </button>
                    )}
                  </div>
                  {filtrados.length===0 && (
                    <div style={{textAlign:'center', padding:'28px 0', color:'var(--fg-muted)', fontSize:13}}>Sin actividad registrada para esta cuenta.</div>
                  )}
                  <div style={{position:'relative'}}>
                    <div style={{position:'absolute', left:15, top:0, bottom:0, width:2, background:'var(--border)', zIndex:0, borderRadius:1}}/>
                    {fechas.map(fecha => (
                      <div key={fecha}>
                        <div style={{display:'flex', alignItems:'center', gap:8, margin:'14px 0 10px', position:'relative', zIndex:1}}>
                          <div style={{width:32}}/>
                          <span style={{fontSize:10, fontWeight:700, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.07em', background:'var(--bg)', padding:'2px 8px', borderRadius:10, border:'1px solid var(--border)'}}>
                            {fmtDia(fecha)}
                          </span>
                        </div>
                        {grupos[fecha].map(ev => (
                          <div key={ev.id} style={{display:'flex', gap:10, marginBottom:10, position:'relative', zIndex:1}}>
                            <div style={{flexShrink:0, width:32, height:32, borderRadius:'50%', background:'var(--white)', border:`2px solid ${TL_COLOR[ev.tipo]||'#94a3b8'}`, display:'flex', alignItems:'center', justifyContent:'center', color:TL_COLOR[ev.tipo]||'#94a3b8', zIndex:2}}>
                              <span style={{width:14, height:14, display:'flex'}}>{TL_ICON[ev.tipo]}</span>
                            </div>
                            <div style={{flex:1, background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', minWidth:0}}>
                              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:2}}>
                                <span style={{fontWeight:700, fontSize:13, color:'var(--navy)', lineHeight:1.3}}>{ev.titulo}</span>
                                <span style={{fontSize:11, color:'var(--fg-muted)', flexShrink:0}}>{fmtDia(fecha)}</span>
                              </div>
                              {ev.descripcion && <p style={{fontSize:12, color:'var(--fg-muted)', margin:'0 0 4px', lineHeight:1.4}}>{ev.descripcion}</p>}
                              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4}}>
                                <span style={{fontSize:11, color:'var(--fg-subtle)'}}>{ev.usuario||''}</span>
                                {ev.nav && (
                                  <button className="btn btn-ghost btn-sm" style={{fontSize:11, height:22, padding:'0 8px'}}
                                    onClick={()=>navigate(ev.nav, ev.navParams||{})}>
                                    Ver en módulo
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {activeTab === 'Resumen' && (
              <>
                <div className="account-profile-kpis">
                  <div><span>Health score</span><strong><span className={'health-dot health-'+getHealthColor(cuentaHealthScore)}/>{cuentaHealthScore}</strong></div>
                  <div><span>Saldo CxC</span><strong>{money(sel.saldo_cxc)}</strong></div>
                  <div><span>Días mora</span><strong className={(sel.dias_mora||0)>30?'danger':(sel.dias_mora||0)>0?'warning':'success'}>{sel.dias_mora || 0}d</strong></div>
                  <div><span>Última compra</span><strong>{sel.fecha_ultima_compra || '—'}</strong></div>
                </div>
                <div className="account-profile-grid">
                  <div className="account-info-card">
                    <div className="card-head"><h3>Datos de empresa</h3></div>
                    <div className="account-info-list">
                      <div><span>RUC</span><strong>{sel.ruc || 'Pendiente'}</strong></div>
                      <div><span>Razón social</span><strong>{sel.razon_social}</strong></div>
                      <div><span>Dirección</span><strong>{sel.direccion || 'Pendiente'}</strong></div>
                      <div><span>Responsable comercial</span><strong>{sel.responsable_comercial || 'Sin asignar'}</strong></div>
                      <div><span>Teléfono empresa</span><strong>{sel.telefono || contactoPrincipal?.telefono || 'Pendiente'}</strong></div>
                      <div><span>Email empresa</span><strong>{sel.email || contactoPrincipal?.email || 'Pendiente'}</strong></div>
                    </div>
                  </div>
                  <div className="account-info-card">
                    <div className="card-head">
                      <h3>Contactos</h3>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setActiveTab('Contactos'); startNuevoContacto(); }}>{I.plus} Agregar</button>
                    </div>
                    <div className="account-contact-mini-list">
                      {cuentaContactos.slice(0, 3).map(c => (
                        <button key={c.id} onClick={() => { setActiveTab('Contactos'); startEditarContacto(c); }}>
                          <span>{getInitials(c.nombre)}</span>
                          <strong>{c.nombre}</strong>
                          <small>{c.cargo || c.email || c.telefono || 'Sin datos'}</small>
                        </button>
                      ))}
                      {cuentaContactos.length === 0 && <div className="account-empty-note">Aún no hay contactos registrados.</div>}
                    </div>
                  </div>
                </div>
                <div className="account-info-card">
                  <div className="card-head"><h3>Actividad reciente</h3></div>
                  <div className="account-timeline">
                    {['Revisión de cuenta · hace 2 días', 'Llamada seguimiento · hace 1 semana'].map((t,i)=>(
                      <div key={i}><span/><p>{t}</p></div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'Oportunidades' && (
              <div className="col" style={{gap:10}}>
                {oportunidades.filter(o => o.cuenta_id === sel.id).map(o => (
                  <div key={o.id} className="card p-3 hover-raise" onClick={() => navigate('pipeline', { panel: o.id })} style={{cursor:'pointer'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong style={{color:'var(--cyan)'}}>{o.nombre}</strong>
                      <span className="badge badge-gray">{o.etapa}</span>
                    </div>
                    <div className="row mt-2" style={{justifyContent:'space-between', fontSize:12}}>
                      <span className="text-muted">Monto: <strong style={{color:'var(--fg)'}}>{money(o.monto_estimado)}</strong></span>
                      <span className="text-muted">Prob: {o.probabilidad}%</span>
                    </div>
                  </div>
                ))}
                {oportunidades.filter(o => o.cuenta_id === sel.id).length === 0 && <div className="p-4 text-muted">No hay oportunidades activas.</div>}
              </div>
            )}

            {activeTab === 'Cotizaciones' && (
              <div className="col" style={{gap:10}}>
                {cotizaciones.filter(c => oportunidades.some(o => o.id === c.oportunidad_id && o.cuenta_id === sel.id)).map(c => (
                  <div key={c.id} className="card p-3 hover-raise" onClick={() => navigate('cotizaciones', { detail: c.id })} style={{cursor:'pointer'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong style={{color:'var(--cyan)'}}>{c.numero}</strong>
                      <span className="badge badge-gray">{c.estado}</span>
                    </div>
                    <div className="row mt-2" style={{justifyContent:'space-between', fontSize:12}}>
                      <span className="text-muted">Total: <strong style={{color:'var(--fg)'}}>{money(c.total_impl || c.total, c.moneda === 'USD' ? 'US$' : c.moneda === 'EUR' ? '€' : 'S/')}</strong></span>
                      <span className="text-muted">{c.fecha}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'OS Cliente' && (
              <div className="col" style={{gap:10}}>
                {osClientes.filter(os => os.cuenta_id === sel.id).map(os => (
                  <div key={os.id} className="card p-3 hover-raise" onClick={() => navigate('os_cliente', { detail: os.id })} style={{cursor:'pointer'}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <strong style={{color:'var(--cyan)'}}>{os.numero}</strong>
                      <span className="badge badge-gray">{os.estado}</span>
                    </div>
                    <div className="row mt-2" style={{justifyContent:'space-between', fontSize:12}}>
                      <span className="text-muted">Monto Aprobado: <strong style={{color:'var(--fg)'}}>{money(os.monto_aprobado, os.moneda === 'USD' ? 'US$' : os.moneda === 'EUR' ? '€' : 'S/')}</strong></span>
                      <span className="text-muted">{os.fecha_emision}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Contactos' && (
              <div className="account-contacts-layout">
                <div className="account-info-card">
                  <div className="card-head">
                    <h3>{cuentaContactos.length} contactos</h3>
                    <button className="btn btn-primary btn-sm" data-local-form="true" onClick={startNuevoContacto}>{I.plus} Nuevo contacto</button>
                  </div>
                  <div className="account-contact-list">
                    {cuentaContactos.map(c => (
                      <button key={c.id} className={contactEditId === c.id ? 'active' : ''} onClick={() => startEditarContacto(c)}>
                        <span className="account-contact-avatar">{getInitials(c.nombre)}</span>
                        <span className="account-contact-main">
                          <strong>{c.nombre}</strong>
                          <small>{c.cargo || 'Cargo pendiente'}</small>
                        </span>
                        <span className="row" style={{gap:3}} onClick={e => e.stopPropagation()}>
                          {(c.principal || c.es_principal) && <span className="badge badge-cyan">Principal</span>}
                          <span role="button" className="icon-btn" title="Editar"
                            style={{width:24, height:24, color:'var(--fg-muted)', borderRadius:5, flexShrink:0}}
                            onClick={e => { e.stopPropagation(); startEditarContacto(c); }}>
                            {I.edit}
                          </span>
                          <span role="button" className="icon-btn" title="Eliminar"
                            style={{width:24, height:24, color:'var(--danger)', borderRadius:5, flexShrink:0}}
                            onClick={e => { e.stopPropagation(); setConfirmDelContacto(c); }}>
                            {I.trash}
                          </span>
                        </span>
                      </button>
                    ))}
                    {cuentaContactos.length === 0 && <div className="account-empty-note">Registra al primer contacto de esta empresa.</div>}
                  </div>
                </div>

                <div className="account-info-card">
                  <div className="card-head">
                    <h3>{contactEditId && contactEditId !== 'nuevo' ? 'Editar contacto' : 'Nuevo contacto'}</h3>
                    {contactEditId && <button className="btn btn-ghost btn-sm" onClick={cancelarContacto}>Limpiar</button>}
                  </div>
                  <form className="account-contact-form" onSubmit={guardarContacto}>
                    <div className="input-group">
                      <label>Nombre completo *</label>
                      <input className="input" value={contactForm.nombre} onChange={e=>setContactForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre y apellido" />
                    </div>
                    <div className="input-group">
                      <label>Cargo</label>
                      <input className="input" value={contactForm.cargo} onChange={e=>setContactForm(p=>({...p,cargo:e.target.value}))} placeholder="Ej: Jefe de Compras" />
                    </div>
                    <div className="input-group">
                      <label>Teléfono</label>
                      <input className="input" type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={contactForm.telefono} onChange={e=>setContactForm(p=>({...p,telefono:sanitizePhone(e.target.value)}))} placeholder="9XXXXXXXX" />
                    </div>
                    <div className="input-group">
                      <label>Email</label>
                      <input className="input" type="email" value={contactForm.email} onChange={e=>setContactForm(p=>({...p,email:e.target.value}))} placeholder="contacto@empresa.pe" />
                    </div>
                    <label className="account-check">
                      <input type="checkbox" checked={contactForm.principal} onChange={e=>setContactForm(p=>({...p,principal:e.target.checked}))} />
                      <span>Marcar como contacto principal</span>
                    </label>
                    <div className="row" style={{justifyContent:'flex-end', gap:10}}>
                      <button type="button" className="btn btn-secondary" onClick={cancelarContacto}>Cancelar</button>
                      <button type="submit" className="btn btn-primary">{contactEditId === 'nuevo' ? 'Crear contacto' : 'Guardar cambios'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'Customer Success' && (
              <div className="col" style={{gap:14}}>
                {/* ── Health Score ── */}
                {csHealth ? (
                  <div className="card p-4">
                    <div className="row" style={{justifyContent:'space-between', marginBottom:10}}>
                      <div className="eyebrow">Health Score</div>
                      <span className={'badge ' + (csHealth.semaforo==='verde'?'badge-green':csHealth.semaforo==='amarillo'?'badge-yellow':'badge-red')}>{csHealth.semaforo}</span>
                    </div>
                    <div className="row" style={{alignItems:'flex-end', gap:12, marginBottom:14}}>
                      <div style={{fontSize:48, fontWeight:800, lineHeight:1, color: csHealth.score_total>=70?'var(--green)':csHealth.score_total>=40?'var(--warning)':'var(--danger)'}}>{csHealth.score_total}</div>
                      <div style={{fontSize:12, color:'var(--fg-subtle)', marginBottom:8}}>Tendencia: <strong>{csHealth.tendencia}</strong></div>
                    </div>
                    {csHealth.dimensiones && (
                      <div className="col" style={{gap:8}}>
                        {Object.entries(csHealth.dimensiones).map(([dim, d]) => (
                          <div key={dim} style={{display:'grid', gridTemplateColumns:'90px 1fr 36px', gap:8, alignItems:'center'}}>
                            <span style={{fontSize:11, color:'var(--fg-subtle)'}}>{dimLabels[dim] || dim}</span>
                            <div style={{background:'var(--bg-subtle)', borderRadius:3, height:6}}>
                              <div style={{width:(d.score||0)+'%', height:'100%', background:(d.score||0)>=70?'var(--green)':(d.score||0)>=40?'var(--warning)':'var(--danger)', borderRadius:3}}/>
                            </div>
                            <span style={{fontSize:11, fontWeight:600, textAlign:'right'}}>{d.score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin health score registrado para este cliente.</div>
                )}

                {/* ── Onboarding ── */}
                {csOb ? (
                  <div className="card p-4">
                    <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                      <div className="eyebrow">Onboarding</div>
                      <span className={'badge ' + (csOb.estado==='completado'?'badge-green':csOb.estado==='en_progreso'?'badge-cyan':'badge-gray')}>{csOb.estado}</span>
                    </div>
                    <div style={{fontSize:13, fontWeight:600, marginBottom:6}}>{csOb.tipo_servicio || csOb.nombre || '—'}</div>
                    {csOb.checklist?.length > 0 && (
                      <>
                        <div style={{fontSize:12, color:'var(--fg-subtle)', marginBottom:6}}>
                          {csOb.checklist.filter(c=>c.completado).length}/{csOb.checklist.length} hitos completados
                        </div>
                        <div style={{background:'var(--bg-subtle)', borderRadius:3, height:6}}>
                          <div style={{width: Math.round(csOb.checklist.filter(c=>c.completado).length/csOb.checklist.length*100)+'%', height:'100%', background:'var(--cyan)', borderRadius:3}}/>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin onboarding registrado para este cliente.</div>
                )}

                {/* ── Plan de Éxito ── */}
                {csPlan ? (
                  <div className="card p-4">
                    <div className="eyebrow" style={{marginBottom:8}}>Plan de Éxito</div>
                    <div style={{fontSize:13, fontWeight:600, marginBottom:6}}>{csPlan.objetivo || csPlan.nombre || '—'}</div>
                    <div className="row" style={{gap:16, fontSize:12, color:'var(--fg-subtle)'}}>
                      {csPlan.adopcion_pct != null && <span>Adopción: <strong style={{color:'var(--cyan)'}}>{csPlan.adopcion_pct}%</strong></span>}
                      {csPlan.reuniones?.length > 0 && <span>Reuniones: {csPlan.reuniones.length}</span>}
                    </div>
                    {csPlan.alertas?.length > 0 && (
                      <div style={{marginTop:8, padding:'6px 10px', background:'rgba(251,191,36,0.1)', borderRadius:6, fontSize:12, color:'var(--warning)'}}>
                        ⚠ {csPlan.alertas[0]}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin plan de éxito registrado para este cliente.</div>
                )}

                {/* ── Renovación ── */}
                {csRenov ? (
                  <div className="card p-4">
                    <div className="eyebrow" style={{marginBottom:8}}>Renovación</div>
                    <div className="row" style={{justifyContent:'space-between', marginBottom:4}}>
                      <span style={{fontSize:13, fontWeight:600}}>{csRenov.servicio || csRenov.nombre || '—'}</span>
                      {csRenov.dias_restantes != null && <span className={'badge ' + (csRenov.dias_restantes<=30?'badge-red':csRenov.dias_restantes<=60?'badge-yellow':'badge-green')}>{csRenov.dias_restantes}d restantes</span>}
                    </div>
                    <div style={{fontSize:12, color:'var(--fg-subtle)'}}>Vence: {csRenov.fecha_vencimiento || '—'}{csRenov.monto_contrato ? ` · ${money(csRenov.monto_contrato)}` : ''}</div>
                  </div>
                ) : (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin renovación registrada para este cliente.</div>
                )}

                {/* ── Último NPS ── */}
                {csNps ? (
                  <div className="card p-4">
                    <div className="eyebrow" style={{marginBottom:8}}>Último NPS</div>
                    <div className="row" style={{alignItems:'center', gap:12}}>
                      <div style={{fontSize:40, fontWeight:800, color:csNps.score>=9?'var(--green)':csNps.score>=7?'var(--warning)':'var(--danger)'}}>{csNps.score}</div>
                      <div>
                        {csNps.clasificacion && <span className={'badge ' + (csNps.clasificacion==='promotor'?'badge-green':csNps.clasificacion==='neutro'?'badge-yellow':'badge-red')}>{csNps.clasificacion}</span>}
                        <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>{csNps.fecha_respuesta}</div>
                      </div>
                    </div>
                    {csNps.comentario && <div style={{fontSize:12, color:'var(--fg-subtle)', marginTop:8, fontStyle:'italic'}}>"{csNps.comentario}"</div>}
                  </div>
                ) : (
                  <div className="card p-4 text-center text-muted" style={{fontSize:13}}>Sin NPS registrado aún para este cliente.</div>
                )}
              </div>
            )}

            {activeTab === 'Condiciones comerciales' && canFinanzas && (
              <div className="col" style={{gap:16}}>
                <div style={{padding:'10px 14px', background:'rgba(6,182,212,0.06)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, color:'var(--fg-muted)'}}>
                  Visible solo para Finanzas y Administración. {condEditing ? 'Editando condiciones comerciales.' : 'Modo lectura.'}
                </div>
                <div className="card">
                  <div className="card-head">
                    <h3>Condiciones de pago y crédito</h3>
                    {!condEditing && <button className="btn btn-secondary btn-sm" onClick={startEditarCondiciones}>{I.edit} Editar</button>}
                  </div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      {[
                        { k:'condicion_pago', label:'Condición de pago', type:'select', opts:['Contado','7 días','15 días','30 días','45 días','60 días','Por definir'] },
                        { k:'limite_credito', label:'Límite de crédito (S/)', type:'number' },
                        { k:'moneda', label:'Moneda', type:'select', opts:['PEN','USD','EUR'] },
                        { k:'requiere_oc', label:'Requiere OC', type:'select', opts:['Sí','No','A veces'] },
                        { k:'riesgo_financiero', label:'Riesgo financiero', type:'select', opts:['bajo','medio','alto'] },
                        { k:'clasificacion_interna', label:'Clasificación interna', type:'select', opts:['A','B','C','VIP'] },
                      ].map(({k, label, type, opts}) => (
                        <div className="input-group" key={k}>
                          <label style={{fontSize:11}}>{label}</label>
                          {type === 'select' ? (
                            <select className="select" disabled={!condEditing || condSaving} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}>
                              {opts.map(o=><option key={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className="input" disabled={!condEditing || condSaving} type={type} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}/>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Datos fiscales</h3></div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      {[
                        { k:'ruc', label:'RUC', type:'text' },
                        { k:'razon_social', label:'Razón social legal', type:'text' },
                        { k:'direccion', label:'Dirección fiscal', type:'text' },
                        { k:'condicion_tributaria', label:'Condición tributaria', type:'select', opts:['Habido','No Habido','No hallado','Suspensión temporal'] },
                      ].map(({k, label, type, opts}) => (
                        <div className="input-group" key={k}>
                          <label style={{fontSize:11}}>{label}</label>
                          {type === 'select' ? (
                            <select className="select" disabled={!condEditing || condSaving} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}>
                              {opts.map(o=><option key={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className="input" disabled={!condEditing || condSaving} type="text" inputMode={k === 'ruc' ? 'numeric' : undefined} pattern={k === 'ruc' ? RUC_PATTERN : undefined} maxLength={k === 'ruc' ? 11 : undefined} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]: k === 'ruc' ? sanitizeRuc(e.target.value) : e.target.value}))}/>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Cuenta bancaria del cliente</h3><span className="text-muted" style={{fontSize:12}}>Para devoluciones y transferencias al cliente</span></div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:16}}>
                      {[
                        { k:'banco_cliente', label:'Banco', type:'text', placeholder:'Ej: BCP, Interbank, BBVA' },
                        { k:'tipo_cuenta_bancaria', label:'Tipo de cuenta', type:'select', opts:['','Corriente','Ahorros'] },
                        { k:'nro_cuenta_cliente', label:'Número de cuenta', type:'text', placeholder:'Nro. de cuenta' },
                        { k:'cci_cliente', label:'CCI', type:'text', placeholder:'Código de cuenta interbancario' },
                      ].map(({k, label, type, opts, placeholder}) => (
                        <div className="input-group" key={k}>
                          <label style={{fontSize:11}}>{label}</label>
                          {type === 'select' ? (
                            <select className="select" disabled={!condEditing || condSaving} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}>
                              {opts.map(o=><option key={o} value={o}>{o || 'Seleccionar...'}</option>)}
                            </select>
                          ) : (
                            <input className="input" disabled={!condEditing || condSaving} type="text" placeholder={placeholder} value={condEdit[k] ?? sel[k] ?? ''} onChange={e => setCondEdit(p=>({...p,[k]:e.target.value}))}/>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {condEditing && (
                  <div className="row" style={{justifyContent:'flex-end', gap:10}}>
                    <button className="btn btn-secondary" disabled={condSaving} onClick={cancelarCondiciones}>Cancelar</button>
                    <button className="btn btn-primary" disabled={condSaving} onClick={guardarCondiciones}>{condSaving ? 'Guardando...' : 'Guardar condiciones'}</button>
                  </div>
                )}
              </div>
            )}
            </div>

          </div>
        </div>
      </>}

      {/* Modal editar cuenta */}
      {editingCuenta && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:520}}>
            <div className="modal-head">
              <h2>Editar cuenta</h2>
              <button className="icon-btn" onClick={() => setEditingCuenta(null)}>{I.x}</button>
            </div>
            <div className="modal-body col" style={{gap:14}}>
              <div className="grid-2">
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Razón Social</label>
                  <input className="input" value={editCuentaForm.razon_social} onChange={e=>setEditCuentaForm(p=>({...p,razon_social:e.target.value}))} autoFocus/>
                </div>
                <div className="input-group">
                  <label>RUC <span style={{fontSize:11,color:'var(--fg-subtle)',fontWeight:400}}>(11 dígitos)</span></label>
                  <input className="input" value={editCuentaForm.ruc} maxLength={11}
                    onChange={e=>setEditCuentaForm(p=>({...p,ruc:sanitizeRuc(e.target.value)}))}/>
                </div>
                <div className="input-group">
                  <label>Tipo</label>
                  <select className="select" value={editCuentaForm.tipo} onChange={e=>setEditCuentaForm(p=>({...p,tipo:e.target.value}))}>
                    {['prospecto','cliente','estrategico','en_riesgo','inactivo'].map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Industria</label>
                  <select className="select" value={editCuentaForm.industria} onChange={e=>setEditCuentaForm(p=>({...p,industria:e.target.value}))}>
                    <option value="">Seleccionar...</option>
                    {['Minería','Industrial','Construcción','Agroindustria','Facilities','Energía','Petróleo & Gas','Logística','Otro'].map(i=><option key={i}>{i}</option>)}
                  </select>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Responsable Comercial</label>
                  <select className="select" value={editCuentaForm.responsable_comercial} onChange={e=>setEditCuentaForm(p=>({...p,responsable_comercial:e.target.value}))}>
                    <option value="">Sin asignar</option>
                    {comercialesAsignables.map(u=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditingCuenta(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarEditCuenta}>{I.save} Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar cuenta */}
      {confirmDelCuenta && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-head">
              <h2>Eliminar cuenta</h2>
              <button className="icon-btn" onClick={() => setConfirmDelCuenta(null)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <p>¿Eliminar <strong>{confirmDelCuenta.razon_social}</strong>? Esta acción no se puede deshacer.</p>
              <p className="text-muted" style={{fontSize:12, marginTop:8}}>Las oportunidades y contactos vinculados quedarán sin cuenta asociada.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmDelCuenta(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{background:'var(--danger)', borderColor:'var(--danger)'}} onClick={confirmarEliminarCuenta}>{I.trash} Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar contacto */}
      {confirmDelContacto && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:380}}>
            <div className="modal-head">
              <h2>Eliminar contacto</h2>
              <button className="icon-btn" onClick={() => setConfirmDelContacto(null)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <p>¿Eliminar a <strong>{confirmDelContacto.nombre}</strong>?</p>
              {(confirmDelContacto.principal || confirmDelContacto.es_principal) && (
                <p className="text-muted" style={{fontSize:12, marginTop:8}}>Este es el contacto principal de la cuenta.</p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmDelContacto(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{background:'var(--danger)', borderColor:'var(--danger)'}} onClick={confirmarEliminarContacto}>{I.trash} Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OT({ role }) {
  const { ots, cuentas, partes, osClientes, usuarios, activeParams, navigate, actualizarOT, cerrarTecnicamenteOT, plannerAsignaciones, personalOperativo, personalAdmin, registrarParteDiario, actualizarBorradorParteDiario, crearAsignacionesRango, crearOT, crearOTDesdeOS, centrosCosto, centrosBeneficio, tiposServicio, authUser, inventario, materiales: catalogoMateriales, almacenes, addNotificacion, cotizaciones, hojasCosteo, cierresTecnicos, recalcularCostoRealOT, enviarParteARevision } = useApp();
  const [sel, setSel] = useState(null);
  const [activeTab, setActiveTab] = useState('Resumen');
  const [panel] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);

  const formNuevaOTBase = { tipo: 'interna', os_cliente_id: '', centro_costo_id: '', centro_beneficio_id: '', servicio: '', descripcion: '', tecnico_responsable_id: '', prioridad: 'normal', fecha_programada: '', est_mo: '', est_materiales: '', est_terceros: '', est_logistica: '' };
  const [panelNuevaOT, setPanelNuevaOT] = useState(false);
  const [formNuevaOT, setFormNuevaOT] = useState(formNuevaOTBase);
  const [errorNuevaOT, setErrorNuevaOT] = useState('');
  const [savingNuevaOT, setSavingNuevaOT] = useState(false);

  const tiposConOSObligatoria = ['cliente', 'garantia'];
  const tiposConOSOpcional = ['correctiva'];
  const permiteOSCliente = tipo => tiposConOSObligatoria.includes(tipo) || tiposConOSOpcional.includes(tipo);
  const updNuevaOT = (k, v) => setFormNuevaOT(p => {
    const next = { ...p, [k]: v };
    if (k === 'tipo' && !permiteOSCliente(v)) next.os_cliente_id = '';
    if (k === 'os_cliente_id' && v) next.centro_beneficio_id = '';
    return next;
  });
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const cebesActivos = (centrosBeneficio || []).filter(c => c.estado === 'activo');
  const tiposActivos = (tiposServicio || []).filter(t => t.estado !== 'inactivo');
  const personal = [...(personalOperativo || []), ...(personalAdmin || [])].filter(p => p.estado === 'activo');

  const debeTenerOSCliente = tiposConOSObligatoria.includes(formNuevaOT.tipo);
  const puedeTenerOSCliente = permiteOSCliente(formNuevaOT.tipo);
  const osSeleccionada = puedeTenerOSCliente && formNuevaOT.os_cliente_id ? osClientes.find(o => o.id === formNuevaOT.os_cliente_id) : null;
  const cebeHeredado = osSeleccionada ? (centrosBeneficio || []).find(c => c.id === osSeleccionada.centro_beneficio_id) : null;

  const hcReferencia = (() => {
    if (!osSeleccionada?.cotizacion_id) return null;
    const cot = (cotizaciones || []).find(c => c.id === osSeleccionada.cotizacion_id);
    if (!cot?.hoja_costeo_id) return null;
    return (hojasCosteo || []).find(h => h.id === cot.hoja_costeo_id && h.estado === 'aprobada') ?? null;
  })();

  const itemsCotizacion = (() => {
    if (!osSeleccionada?.cotizacion_id) return [];
    const cot = (cotizaciones || []).find(c => c.id === osSeleccionada.cotizacion_id);
    return (cot?.items || []).map(i => i.descripcion || i.nombre).filter(Boolean);
  })();

  const totalEstimadoNuevaOT = (
    (parseFloat(formNuevaOT.est_mo) || 0) +
    (parseFloat(formNuevaOT.est_materiales) || 0) +
    (parseFloat(formNuevaOT.est_terceros) || 0) +
    (parseFloat(formNuevaOT.est_logistica) || 0)
  );

  const cerrarPanelNuevaOT = () => { setPanelNuevaOT(false); setFormNuevaOT(formNuevaOTBase); setErrorNuevaOT(''); };

  const submitNuevaOT = async () => {
    if (savingNuevaOT) return;
    if (!formNuevaOT.centro_costo_id) { setErrorNuevaOT('Selecciona un CECO antes de continuar.'); return; }
    if (debeTenerOSCliente && !formNuevaOT.os_cliente_id) {
      setErrorNuevaOT('Selecciona la OS Cliente vinculada.'); return;
    }
    if (formNuevaOT.os_cliente_id) {
      if (!osSeleccionada?.centro_beneficio_id) { setErrorNuevaOT('La OS Cliente seleccionada no tiene CEBE asignado. Asígnalo desde la ficha de la OS.'); return; }
    }
    setSavingNuevaOT(true);
    setErrorNuevaOT('');
    try {
      const datos = {
        tipo: formNuevaOT.tipo,
        centro_costo_id: formNuevaOT.centro_costo_id,
        servicio: formNuevaOT.servicio || (formNuevaOT.tipo === 'garantia' ? 'Garantia' : formNuevaOT.tipo === 'correctiva' ? 'Correctiva' : 'Servicio cliente'),
        descripcion: formNuevaOT.descripcion,
        tecnico_responsable_id: formNuevaOT.tecnico_responsable_id,
        prioridad: formNuevaOT.prioridad,
        fecha_programada: formNuevaOT.fecha_programada || null,
        estado: 'programada',
      };
      if (formNuevaOT.os_cliente_id) {
        await crearOTDesdeOS(formNuevaOT.os_cliente_id, {
          ...datos,
          est_mo: formNuevaOT.est_mo !== '' ? Number(formNuevaOT.est_mo) : null,
          est_materiales: formNuevaOT.est_materiales !== '' ? Number(formNuevaOT.est_materiales) : null,
          est_terceros: formNuevaOT.est_terceros !== '' ? Number(formNuevaOT.est_terceros) : null,
          est_logistica: formNuevaOT.est_logistica !== '' ? Number(formNuevaOT.est_logistica) : null,
          costo_estimado: totalEstimadoNuevaOT,
        });
      } else {
        crearOT({ ...datos, centro_beneficio_id: formNuevaOT.centro_beneficio_id });
      }
      cerrarPanelNuevaOT();
    } catch (err) {
      setErrorNuevaOT(err?.message || 'No se pudo crear la OT.');
    } finally {
      setSavingNuevaOT(false);
    }
  };
  const [showNuevaTarea, setShowNuevaTarea] = useState(false);
  const [nuevaTareaForm, setNuevaTareaForm] = useState({ descripcion: '', responsable_id: '', fecha_limite: '' });
  const [showAsignarTec, setShowAsignarTec] = useState(false);
  const [asignarTecForm, setAsignarTecForm] = useState({ tecnico_id: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '', hora_inicio: '', hora_fin: '' });
  const [showNuevoParte, setShowNuevoParte] = useState(false);
  const [parteEditandoId, setParteEditandoId] = useState(null);
  const [showCierreForm, setShowCierreForm] = useState(false);
  const [cierreForm, setCierreForm] = useState({ descripcion_trabajo: '', fecha_inicio_real: '', fecha_fin_real: '', horas_total: '', avance_final: 100, conformidad: 'pendiente', conformidad_archivo: null, observaciones_finales: '', costo_terceros: '', costo_logistica: '' });
  const [cierreConfirmandoLink, setCierreConfirmandoLink] = useState(null);
  const [parteFormOT, setParteFormOT] = useState({ tecnico_id: '', fecha: new Date().toISOString().split('T')[0], horas: 8, tareas_trabajadas: [], actividades_adicionales: [] });
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [formDatos, setFormDatos] = useState({});
  const [estDetalle, setEstDetalle] = useState({ mano_obra: [], materiales: [], terceros: [], logistica: [] });
  const [expandedCostSections, setExpandedCostSections] = useState({ mano_obra: false, materiales: false, terceros: false, logistica: false });
  const [showHCRefCostos, setShowHCRefCostos] = useState(false);
  useEffect(() => {
    if (sel?.id) {
      setEstDetalle(sel.est_detalle || { mano_obra: [], materiales: [], terceros: [], logistica: [] });
      setExpandedCostSections({ mano_obra: false, materiales: false, terceros: false, logistica: false });
    }
  }, [sel?.id]);
  const abrirEditDatos = () => {
    setFormDatos({
      centro_costo_id: sel?.centro_costo_id || '',
      tipo: sel?.tipo || '',
      prioridad: sel?.prioridad || 'normal',
      facturable: sel?.facturable !== false,
      tecnico_responsable_id: sel?.tecnico_responsable_id || '',
      supervisor: sel?.supervisor || '',
      sede: sel?.sede || osVinculada?.sede || '',
      fecha_programada: sel?.fecha_programada || '',
      descripcion: sel?.descripcion || '',
      est_mo: sel?.est_mo ?? '',
      est_materiales: sel?.est_materiales ?? '',
      est_terceros: sel?.est_terceros ?? '',
      est_logistica: sel?.est_logistica ?? '',
    });
    setEditandoDatos(true);
  };
  const guardarDatos = async () => {
    await actualizarOT(sel.id, formDatos);
    setSel(s => ({ ...s, ...formDatos }));
    setEditandoDatos(false);
  };

  const canCost = role.permisos.ver_costos || role.permisos.todo;
  const getCuenta = (id) => cuentas.find(c => c.id === id)?.razon_social || id;
  const otSym = (ot) => { const m = osClientes.find(o => o.id === ot.os_cliente_id)?.moneda; return m === 'USD' ? 'US$' : m === 'EUR' ? '€' : 'S/'; };

  const badges = {
    borrador: ['badge-gray','Borrador'], programada: ['badge-cyan','Programada'],
    ejecucion: ['badge-orange','En ejecución'], cerrada: ['badge-purple','Cerrada técnica'],
    valorizada: ['badge-green','Valorizada'], facturada: ['badge-navy','Facturada'], anulada: ['badge-red','Anulada']
  };

  const partesOT = sel ? partes.filter(p => p.ot_id === sel.id) : [];

  const osVinculada = sel?.os_cliente_id ? osClientes.find(o => o.id === sel.os_cliente_id) : null;
  const responsableNombre = sel
    ? (usuarios.find(u => u.id === sel.tecnico_responsable_id)?.nombre || sel.responsable || '—')
    : '—';
  const supervisorNombre = sel?.supervisor || '—';
  const prioridadMeta = { normal: ['badge-gray','Normal'], urgente: ['badge-orange','Urgente'], critica: ['badge-red','Crítica'] };
  const asignacionesOT = sel ? plannerAsignaciones.filter(a => a.ot_id === sel.id && a.estado !== 'cancelado') : [];
  const tecnicosAsignadosOT = new Set(asignacionesOT.map(a => a.tecnico_id)).size;
  const tecnicosDeOT = [...new Set(asignacionesOT.map(a => a.tecnico_id))].map(id => [...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === id)).filter(Boolean);
  const tareasOT = sel?.tareas || [];
  const tareasCompletadasOT = tareasOT.filter(t => t.completado || t.estado === 'completada').length;
  const avanceOperativo = sel ? (
    sel.estado === 'anulada' ? 0 :
    ['facturada','valorizada'].includes(sel.estado) ? 100 :
    ['cerrada','cerrada_tecnica'].includes(sel.estado) ? 85 :
    sel.estado === 'ejecucion' ? Math.max(45, Math.min(80, 45 + Math.round((sel.avance || 0) * 0.35))) :
    sel.estado === 'programada' ? (tecnicosAsignadosOT > 0 ? 35 : 25) :
    15
  ) : 0;
  const avanceColor = avanceOperativo >= 80 ? 'var(--green)' : avanceOperativo >= 45 ? 'var(--orange)' : 'var(--cyan)';
  const avanceBg = avanceOperativo >= 80 ? 'rgba(16,185,129,0.08)' : avanceOperativo >= 45 ? 'rgba(249,115,22,0.08)' : 'rgba(6,182,212,0.08)';
  const criteriosOT = sel ? [
    { ok: !!sel.centro_costo_id, text: 'CECO asignado' },
    { ok: !!sel.fecha_programada, text: 'Fecha comprometida' },
    { ok: tecnicosAsignadosOT > 0, text: `${tecnicosAsignadosOT || 'Sin'} tecnico${tecnicosAsignadosOT === 1 ? '' : 's'} asignado${tecnicosAsignadosOT === 1 ? '' : 's'}` },
    { ok: sel.sla !== 'vencido', warn: sel.sla === 'riesgo', text: sel.sla === 'vencido' ? 'SLA vencido' : sel.sla === 'riesgo' ? 'SLA en riesgo' : 'SLA OK' },
    { ok: partesOT.length > 0, text: `${partesOT.length || 'Sin'} parte${partesOT.length === 1 ? '' : 's'} diario${partesOT.length === 1 ? '' : 's'}` },
    { ok: tareasOT.length === 0 || tareasCompletadasOT === tareasOT.length, warn: tareasOT.length > 0 && tareasCompletadasOT < tareasOT.length, text: tareasOT.length ? `${tareasCompletadasOT}/${tareasOT.length} tareas completas` : 'Sin tareas pendientes' },
  ] : [];
  const puedeIniciarOT = !!sel?.centro_costo_id && tecnicosAsignadosOT > 0;
  const tooltipIniciarOT = !sel?.centro_costo_id && tecnicosAsignadosOT === 0
    ? 'Asigna un CECO y al menos un técnico antes de iniciar'
    : !sel?.centro_costo_id ? 'Asigna un CECO antes de iniciar'
    : 'Asigna al menos un técnico antes de iniciar';
  const OtField = ({ label, value, children, strong = false }) => (
    <div>
      <div className="eyebrow" style={{marginBottom:6}}>{label}</div>
      <div style={{fontWeight:strong ? 700 : 500, fontSize:13, color:value || children ? 'var(--fg)' : 'var(--fg-muted)'}}>{children || value || 'Pendiente'}</div>
    </div>
  );
  const OtCardTitle = ({ icon, title, color }) => (
    <div className="row" style={{gap:10, marginBottom:16}}>
      <span style={{width:32, height:32, borderRadius:8, background:`color-mix(in srgb, ${color} 12%, transparent)`, color, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>{icon}</span>
      <strong style={{fontSize:13}}>{title}</strong>
    </div>
  );

  const agregarTarea = () => {
    if (!nuevaTareaForm.descripcion.trim()) return;
    const tareas = [...(sel.tareas || []), { id: Date.now(), descripcion: nuevaTareaForm.descripcion, responsable_id: nuevaTareaForm.responsable_id, fecha_limite: nuevaTareaForm.fecha_limite, estado: 'pendiente', completado: false }];
    actualizarOT(sel.id, { tareas });
    setSel(s => ({ ...s, tareas }));
    setNuevaTareaForm({ descripcion: '', responsable_id: '', fecha_limite: '' });
    setShowNuevaTarea(false);
  };

  const toggleTarea = (tareaId) => {
    const tareas = (sel.tareas || []).map(t => {
      if (t.id !== tareaId) return t;
      const completado = !t.completado;
      return { ...t, completado, estado: completado ? 'completada' : 'pendiente' };
    });
    actualizarOT(sel.id, { tareas });
    setSel(s => ({ ...s, tareas }));
  };

  const abrirFormCierre = () => {
    const partesDeOT = partes.filter(p => p.ot_id === sel?.id);
    const aprobados = partesDeOT.filter(p => p.estado === 'aprobado').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const pendientes = partesDeOT.filter(p => !['aprobado', 'rechazado'].includes(p.estado));
    if (!aprobados.length) { addNotificacion('No puedes cerrar una OT sin partes diarios aprobados.', 'error'); return; }
    if (pendientes.length) { addNotificacion(`No puedes cerrar esta OT. Tienes ${pendientes.length} parte(s) pendiente(s) de aprobación.`, 'error'); return; }
    const horasTotal = aprobados.reduce((s, p) => s + (p.horas || 0), 0);
    const descripcion = [...new Set(aprobados.map(p => p.actividades).filter(Boolean))].join('\n');
    setCierreForm({
      descripcion_trabajo: descripcion,
      fecha_inicio_real: aprobados[0]?.fecha || sel?.fecha_inicio || '',
      fecha_fin_real: aprobados[aprobados.length - 1]?.fecha || new Date().toISOString().split('T')[0],
      horas_total: horasTotal,
      avance_final: 100,
      conformidad: 'pendiente',
      observaciones_finales: '',
    });
    setShowCierreForm(true);
  };

  const confirmarCierreOT = async () => {
    const result = await cerrarTecnicamenteOT(sel.id, {
      fecha: cierreForm.fecha_fin_real,
      fecha_fin_real: cierreForm.fecha_fin_real,
      fecha_inicio_real: cierreForm.fecha_inicio_real,
      resultado: 'conforme',
      descripcion_trabajo: cierreForm.descripcion_trabajo,
      horas_total: Number(cierreForm.horas_total),
      avance_final: Number(cierreForm.avance_final),
      conformidad_cliente: { tipo: cierreForm.conformidad },
      conformidad_archivo: cierreForm.conformidad_archivo,
      observaciones: cierreForm.observaciones_finales,
      costo_terceros: Number(cierreForm.costo_terceros || 0),
      costo_logistica: Number(cierreForm.costo_logistica || 0),
    });
    setSel(s => ({ ...s, estado: 'cerrada' }));
    setShowCierreForm(false);
    if (result?.tokenConformidad) {
      const link = `${window.location.origin}${window.location.pathname}#conformidad-ot/${result.tokenConformidad}`;
      navigator.clipboard?.writeText(link).catch(() => {});
      setCierreConfirmandoLink(link);
    }
  };

  const abrirNuevoParte = () => {
    const hoyStr = new Date().toISOString().split('T')[0];
    const tecAutoId = authUser ? ([...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === authUser.id)?.id || '') : '';
    setParteFormOT({
      tecnico_id: tecAutoId,
      fecha: hoyStr,
      horas: (() => {
        if (!tecAutoId) return 8;
        const asig = (sel?.id ? plannerAsignaciones.filter(a => a.ot_id === sel.id && a.tecnico_id === tecAutoId && a.fecha === hoyStr) : []);
        const a = asig[0];
        if (a?.hora_inicio_estimada && a?.hora_fin_estimada) {
          const [h1, m1] = a.hora_inicio_estimada.split(':').map(Number);
          const [h2, m2] = a.hora_fin_estimada.split(':').map(Number);
          return Math.max(1, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
        }
        return 8;
      })(),
      tareas_trabajadas: (sel?.tareas || []).map(t => ({
        tarea_id: t.id,
        nombre: t.descripcion,
        estado_actual: t.completado ? 'completada' : (t.estado || 'pendiente'),
        trabajado: false,
        avance_hoy: 0,
      })),
      actividades_adicionales: [],
      avance_global: '',
      avance_ajustado_manual: false,
      materiales_lineas: [],
      evidencias: [],
      observaciones: '',
      es_restriccion: false,
    });
    setActiveTab('Partes');
    setParteEditandoId(null);
    setShowNuevoParte(true);
  };

  const abrirEditarBorrador = (parte) => {
    const otTareas = (sel?.tareas || []).map(t => {
      const worked = (parte.tareas_trabajadas || []).find(pt => pt.tarea_id === t.id);
      return { tarea_id: t.id, nombre: t.descripcion, estado_actual: t.completado ? 'completada' : (t.estado || 'pendiente'), trabajado: !!worked, avance_hoy: worked?.avance_hoy || 0 };
    });
    setParteFormOT({
      tecnico_id: parte.tecnico_id || parte.tecnico || '',
      fecha: parte.fecha || new Date().toISOString().split('T')[0],
      horas: parte.horas || 8,
      tareas_trabajadas: otTareas,
      actividades_adicionales: parte.actividades_adicionales || [],
      avance_global: parte.avance_global || parte.avance_reportado || 0,
      avance_ajustado_manual: parte.avance_ajustado_manual || (!parte.tareas_trabajadas?.length && !parte.actividades_adicionales?.length && (parte.avance_reportado || 0) > 0),
      materiales_lineas: (parte.materiales_usados || []).map(m => ({ inv_id: m.inv_id || m.sku || '', cantidad: m.cantidad || 0, almacen_id: m.almacen_id || '' })),
      terceros_lineas: (parte.terceros_lineas || []).map(l => ({ descripcion: l.descripcion || '', monto: l.monto ?? '' })),
      logistica_lineas: (parte.logistica_lineas || []).map(l => ({ descripcion: l.descripcion || '', monto: l.monto ?? '' })),
      evidencias: parte.evidencias || [],
      observaciones: parte.observaciones || '',
      es_restriccion: parte.es_restriccion || false,
    });
    setParteEditandoId(parte.id);
    setActiveTab('Partes');
    setShowNuevoParte(true);
  };

  const updParteHorasTecnico = (tecnicoId) => {
    const hoyStr = parteFormOT.fecha || new Date().toISOString().split('T')[0];
    const asig = plannerAsignaciones.find(a => a.ot_id === sel?.id && a.tecnico_id === tecnicoId && a.fecha === hoyStr);
    let horas = 8;
    if (asig?.hora_inicio_estimada && asig?.hora_fin_estimada) {
      const [h1, m1] = asig.hora_inicio_estimada.split(':').map(Number);
      const [h2, m2] = asig.hora_fin_estimada.split(':').map(Number);
      horas = Math.max(1, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
    }
    setParteFormOT(s => ({ ...s, tecnico_id: tecnicoId, horas }));
  };

  const buildPartePayload = (modo) => {
    const tecnicoObj = [...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === parteFormOT.tecnico_id);
    const tareasActivas = parteFormOT.tareas_trabajadas.filter(t => t.trabajado);
    const actividadesTexto = [
      ...tareasActivas.map(t => `${t.nombre}${t.avance_hoy ? ` (+${t.avance_hoy}%)` : ''}`),
      ...parteFormOT.actividades_adicionales.filter(a => a.descripcion.trim()).map(a => a.descripcion + (a.avance_estimado ? ` (+${a.avance_estimado}%)` : '')),
    ].join('\n');
    const avanceCalculado = tareasActivas.reduce((s, t) => s + (Number(t.avance_hoy) || 0), 0) + parteFormOT.actividades_adicionales.reduce((s, a) => s + (Number(a.avance_estimado) || 0), 0);
    const materialesUsados = parteFormOT.materiales_lineas.filter(m => m.mat_id && Number(m.cantidad) > 0).map(m => {
      const cat = (catalogoMateriales || []).find(x => x.id === m.mat_id);
      const inv = (inventario || []).find(x => x.material_id === m.mat_id);
      return { material_id: m.mat_id, sku: cat?.codigo || inv?.sku || m.mat_id, nombre: cat?.descripcion || inv?.nombre || '', unidad: cat?.unidad || inv?.unidad || '', cantidad: Number(m.cantidad), costo_unitario: Number(cat?.costo_promedio || inv?.costo_promedio || 0) };
    });
    const estadoParte = modo === 'borrador' ? 'borrador' : parteFormOT.es_restriccion ? 'con_restriccion' : 'en_revision';
    return {
      estado: estadoParte,
      ot_id: sel.id,
      tecnico: tecnicoObj?.nombre || parteFormOT.tecnico_id,
      tecnico_id: parteFormOT.tecnico_id,
      fecha: parteFormOT.fecha,
      horas: Number(parteFormOT.horas || 0),
      avance_reportado: parteFormOT.avance_ajustado_manual ? Number(parteFormOT.avance_global) : avanceCalculado,
      avance_ajustado_manual: parteFormOT.avance_ajustado_manual,
      actividades: actividadesTexto,
      actividad: actividadesTexto,
      tareas_trabajadas: tareasActivas,
      actividades_adicionales: parteFormOT.actividades_adicionales,
      materiales_usados: materialesUsados,
      terceros_lineas: (parteFormOT.terceros_lineas || []).filter(l => l.descripcion?.trim() && Number(l.monto) > 0).map(l => ({ descripcion: l.descripcion, monto: Number(l.monto) })),
      logistica_lineas: (parteFormOT.logistica_lineas || []).filter(l => l.descripcion?.trim() && Number(l.monto) > 0).map(l => ({ descripcion: l.descripcion, monto: Number(l.monto) })),
      evidencias: parteFormOT.evidencias.map(e => ({ nombre: e.nombre, tipo: e.tipo, tamanio: e.tamanio })),
      observaciones: parteFormOT.observaciones,
      es_restriccion: parteFormOT.es_restriccion,
    };
  };
  const parteFormReset = { tecnico_id: '', fecha: new Date().toISOString().split('T')[0], horas: 8, tareas_trabajadas: [], actividades_adicionales: [], avance_global: '', avance_ajustado_manual: false, materiales_lineas: [], terceros_lineas: [], logistica_lineas: [], evidencias: [], observaciones: '', es_restriccion: false };
  const submitParteDesdOT = async (e, modo = 'revision') => {
    if (e) e.preventDefault();
    if (!parteFormOT.tecnico_id) return;
    const tareasActivas = parteFormOT.tareas_trabajadas.filter(t => t.trabajado);
    if (modo !== 'borrador' && !parteEditandoId && tareasActivas.length === 0 && parteFormOT.actividades_adicionales.filter(a => a.descripcion.trim()).length === 0 && !parteFormOT.avance_ajustado_manual && !parteFormOT.observaciones?.trim()) return;
    const payload = buildPartePayload(modo);
    if (parteEditandoId) {
      actualizarBorradorParteDiario(parteEditandoId, payload);
    } else {
      await registrarParteDiario(payload);
    }
    setShowNuevoParte(false);
    setParteEditandoId(null);
    setParteFormOT(parteFormReset);
  };

  const submitAsignarTec = async (e) => {
    e.preventDefault();
    if (!asignarTecForm.tecnico_id || !asignarTecForm.fecha_inicio) return;
    try {
      await crearAsignacionesRango({ otId: sel.id, tecnicoIds: [asignarTecForm.tecnico_id], fechaInicio: asignarTecForm.fecha_inicio, fechaFin: asignarTecForm.fecha_fin || asignarTecForm.fecha_inicio, horaInicio: asignarTecForm.hora_inicio || null, horaFin: asignarTecForm.hora_fin || null });
      setShowAsignarTec(false);
      setAsignarTecForm({ tecnico_id: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '', hora_inicio: '', hora_fin: '' });
    } catch (err) {
      addNotificacion(`No se pudo asignar el tecnico: ${err?.message || err}`, 'error');
    }
  };

  const historialOT = sel ? [
    { id: 'create', fecha: sel.created_at || sel.fecha_inicio || '', usuario: '—', evento: `OT ${sel.numero} creada`, tipo: 'creacion' },
    ...partesOT.map(p => ({ id: p.id, fecha: p.fecha, usuario: p.tecnico, evento: `Parte diario registrado · ${p.horas}h · +${p.avance_reportado}% avance`, tipo: 'parte' })),
    ...(['cerrada','valorizada','facturada'].includes(sel.estado) ? [{ id: 'close', fecha: sel.fecha_fin || '', usuario: '—', evento: 'OT cerrada técnicamente', tipo: 'cierre' }] : []),
  ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')) : [];

  useEffect(() => {
    if (!activeParams?.detail) return;
    const ot = ots.find(o => o.id === activeParams.detail);
    if (ot) {
      setSel(ot);
      setActiveTab(activeParams.tab || 'Resumen');
    }
  }, [activeParams?.detail, activeParams?.tab, ots]);

  const calcCostoRealLive = (ot) => {
    const aprobados = (partes || []).filter(p => p.ot_id === ot.id && p.estado === 'aprobado');
    if (!aprobados.length) return ot.costoReal || 0;
    const costoHoraTec = (id) => {
      const tec = [...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === id);
      const moItem = (ot.est_detalle?.mano_obra || []).find(m => m.tecnico_id === id);
      if (moItem?.costo_hora > 0) return moItem.costo_hora;
      const explicit = Number(tec?.costo_hora_real ?? tec?.costo ?? tec?.costo_hora ?? 0);
      if (explicit > 0) return explicit;
      const rem = Number(tec?.remuneracion ?? 0);
      return rem > 0 ? Math.round(rem / 240 * 100) / 100 : 0;
    };
    const mo = aprobados.reduce((s, p) => s + (p.horas || 0) * costoHoraTec(p.tecnico_id), 0);
    const mat = aprobados.reduce((s, p) =>
      s + (p.materiales_usados || []).reduce((sm, m) => {
        const inv = (inventario || []).find(i => i.sku === m.sku);
        return sm + (m.cantidad || 0) * (inv?.costo_promedio || m.costo_unitario || 0);
      }, 0), 0);
    const ter = aprobados.reduce((s, p) =>
      s + (p.terceros_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);
    const log = aprobados.reduce((s, p) =>
      s + (p.logistica_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0);
    return mo + mat + ter + log;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes de Trabajo</h1>
          <div className="page-sub">{ots.length} OTs totales</div>
        </div>
        <div className="row">
          <button className="btn btn-secondary">{I.filter} Filtrar</button>
          <button className="btn btn-primary" data-local-form="true" onClick={() => setPanelNuevaOT(true)}>{I.plus} Nueva OT</button>
        </div>
      </div>

      <div className="flow">
        <span className="flow-step done"><span className="flow-dot"/>Lead</span><span className="flow-sep">→</span>
        <span className="flow-step done"><span className="flow-dot"/>Oportunidad</span><span className="flow-sep">→</span>
        <span className="flow-step done"><span className="flow-dot"/>Cotización</span><span className="flow-sep">→</span>
        <span className="flow-step done"><span className="flow-dot"/>OS Cliente</span><span className="flow-sep">→</span>
        <span className="flow-step current"><span className="flow-dot"/>OT</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Parte</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Cierre</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Valorización</span><span className="flow-sep">→</span>
        <span className="flow-step"><span className="flow-dot"/>Factura</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>OT</th><th>Cliente</th><th>Sede</th><th>Tipo</th><th>Estado</th><th>SLA</th>
              <th>Responsable</th>{canCost && <th>Costo est/real</th>}<th>Avance</th>
            </tr></thead>
            <tbody>{ots.map(o => {
              const asigs = plannerAsignaciones.filter(a => a.ot_id === o.id && a.estado !== 'cancelado');
              const uniqueTecs = new Set(asigs.map(a => a.tecnico_id)).size;
              
              let displayEstado = o.estado;
              let badgeColor = badges[o.estado]?.[0] || 'badge-gray';
              let label = badges[o.estado]?.[1] || o.estado;

              if (o.estado === 'programada' && uniqueTecs > 0) {
                displayEstado = 'asignada';
                badgeColor = 'badge-purple';
                label = 'Asignada';
              }

              return (
                <tr key={o.id} onClick={() => { setSel(o); setActiveTab(uniqueTecs > 0 ? 'Personal y Recursos' : 'Resumen'); navigate('ot', { detail: o.id }); }} className="hover-row" style={{cursor:'pointer'}}>
                  <td>
                    <div className="mono" style={{fontWeight:600}}>{o.numero}</div>
                    {o.gps && <span className="badge badge-cyan" style={{marginTop:4}}>{I.mapPin}GPS</span>}
                  </td>
                  <td>{getCuenta(o.cuenta_id) || o.cliente}</td>
                  <td className="text-muted">{o.sede}</td>
                  <td>{o.tipo}</td>
                  <td>
                    <div style={{display:'flex', flexDirection:'column', gap:4, alignItems:'flex-start'}}>
                      <span className={'badge '+badgeColor}>{label}</span>
                      {uniqueTecs > 0 && (
                        <span style={{fontSize:10, color:'var(--purple)', fontWeight:600, display:'flex', alignItems:'center', gap:4}}>
                          👥 {uniqueTecs} técnicos
                        </span>
                      )}
                    </div>
                  </td>
                  <td><span className={'badge '+(o.sla==='vencido'?'badge-red':o.sla==='riesgo'?'badge-orange':'badge-green')}>{o.sla==='vencido'?'Vencido':o.sla==='riesgo'?'Riesgo':'OK'}</span></td>
                  <td className="text-muted">{o.responsable}</td>
                  {canCost && <td className="num">{money(calcCostoRealLive(o), otSym(o))}<span className="text-subtle"> / {money(o.costoEst||0, otSym(o))}</span></td>}
                  <td style={{width:120}}>
                    <div className="bar"><div style={{width:(o.avance||0)+'%', background: o.avance===100?'var(--green)':'var(--cyan)'}}/></div>
                    <div style={{fontSize:11,marginTop:2}}>{o.avance||0}%</div>
                  </td>
                </tr>
              );
            })}
            {ots.length===0 && <tr><td colSpan="9" style={{textAlign:'center', padding:40}}>No hay órdenes de trabajo</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {panel && <>
        <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
        <div className="side-panel" style={{width:'min(620px,96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Ejecucion operativa</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700}}>Nuevo parte diario</div>
            </div>
            <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={crearParte}>
            <div className="grid-2" style={{gap:12}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>OT</label>
                <select className="select" value={form.ot_id} onChange={e => updateForm('ot_id', e.target.value)} required>
                  <option value="">Seleccionar OT...</option>
                  {otsDisponibles.map(o => (
                    <option key={o.id} value={o.id}>{o.numero} - {o.tipo || o.servicio || o.descripcion || 'Servicio'}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Tecnico</label>
                <input className="input" value={form.tecnico} onChange={e => updateForm('tecnico', e.target.value)} placeholder="Nombre del tecnico" required />
              </div>
              <div className="input-group">
                <label>Fecha</label>
                <input className="input" type="date" value={form.fecha} onChange={e => updateForm('fecha', e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Horas normales</label>
                <input className="input" type="number" min="0" step="0.5" value={form.horas} onChange={e => updateForm('horas', e.target.value)} />
              </div>
              <div className="input-group">
                <label>Avance reportado (%)</label>
                <input className="input" type="number" min="0" max="100" value={form.avance_reportado} onChange={e => updateForm('avance_reportado', e.target.value)} />
              </div>
              <div className="input-group" style={{gridColumn:'1/-1'}}>
                <label>Actividades realizadas</label>
                <textarea className="input" rows="4" value={form.actividades} onChange={e => updateForm('actividades', e.target.value)} required />
              </div>
            </div>

            <div className="card mt-6" style={{padding:14}}>
              <div className="card-head" style={{padding:0, border:0, marginBottom:12}}>
                <h3 style={{fontSize:15}}>Material usado opcional</h3>
              </div>
              <div className="grid-3" style={{gap:12}}>
                <div className="input-group">
                  <label>SKU</label>
                  <input className="input" value={form.material_sku} onChange={e => updateForm('material_sku', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Descripcion</label>
                  <input className="input" value={form.material_nombre} onChange={e => updateForm('material_nombre', e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Cantidad</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.material_cantidad} onChange={e => updateForm('material_cantidad', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="row mt-6" style={{justifyContent:'flex-end'}}>
              <button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.save} Enviar a revision</button>
            </div>
          </form>
        </div>
      </>}

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => { setSel(null); navigate('ot'); }}/>
        <div className="side-panel ficha-detail-panel" style={{width:'min(680px,96vw)'}}>

          {/* HEADER */}
          <div className="side-panel-head" style={{flexDirection:'column', alignItems:'stretch', gap:10, paddingBottom:12}}>
            {/* Breadcrumb */}
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--fg-muted)'}}>
              {osVinculada ? (
                <>
                  <button className="btn btn-ghost" style={{padding:0, fontSize:12, color:'var(--cyan)', fontWeight:600}}
                    onClick={() => { setSel(null); navigate('os_cliente', { detail: osVinculada.id }); }}>
                    {osVinculada.numero}
                  </button>
                  <span>›</span>
                  <span style={{color:'var(--fg)', fontWeight:600}}>{sel.numero}</span>
                </>
              ) : (
                <span style={{color:'var(--fg-muted)'}}>Órdenes de Trabajo › {sel.numero}</span>
              )}
            </div>

            {/* Título + cerrar */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                <div className="eyebrow">Ficha de OT</div>
                <div className="font-display mono ficha-detail-title" style={{marginTop:4}}>{sel.numero}</div>
              </div>
              <div className="row" style={{gap:8, alignItems:'center'}}>
                {!['cerrada','cerrada_tecnica','facturada','anulada'].includes(sel.estado) && (
                  confirmAnular
                    ? <div className="row" style={{gap:6, alignItems:'center'}}>
                        <span style={{fontSize:12, color:'var(--danger)'}}>¿Confirmar anulación?</span>
                        <button className="btn btn-secondary" style={{fontSize:11, padding:'2px 8px'}} onClick={() => setConfirmAnular(false)}>No</button>
                        <button className="btn" style={{fontSize:11, padding:'2px 8px', background:'var(--danger)', color:'#fff'}} onClick={() => { actualizarOT(sel.id, { estado: 'anulada' }); setConfirmAnular(false); setSel(s => ({ ...s, estado: 'anulada' })); }}>Sí, anular</button>
                      </div>
                    : <button className="btn btn-secondary" style={{fontSize:12, color:'var(--danger)'}} onClick={() => setConfirmAnular(true)}>Anular OT</button>
                )}
                <button className="icon-btn" onClick={() => { setSel(null); setConfirmAnular(false); navigate('ot'); }}>{I.x}</button>
              </div>
            </div>

            {/* Estado + botones de acción */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
              <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                <span className={'badge '+(badges[sel.estado]?.[0]||'badge-gray')}>{badges[sel.estado]?.[1]||sel.estado}</span>
                <span className={'badge '+(sel.sla==='vencido'?'badge-red':sel.sla==='riesgo'?'badge-orange':'badge-green')}>SLA {sel.sla==='vencido'?'Vencido':sel.sla==='riesgo'?'Riesgo':'OK'}</span>
                {sel.gps && <span className="badge badge-cyan">{I.mapPin}GPS</span>}
              </div>
              <div className="row" style={{gap:8}}>
                {sel.estado === 'programada' && (
                  <button
                    className="btn btn-primary"
                    style={{fontSize:13, ...(!puedeIniciarOT ? {opacity:0.45, cursor:'not-allowed'} : {})}}
                    title={!puedeIniciarOT ? tooltipIniciarOT : ''}
                    onClick={() => {
                      if (!puedeIniciarOT) return;
                      actualizarOT(sel.id, { estado: 'ejecucion', fecha_inicio_real: new Date().toISOString() });
                      setSel(s => ({ ...s, estado: 'ejecucion' }));
                    }}
                  >
                    {I.play} Iniciar OT
                  </button>
                )}
                {sel.estado === 'ejecucion' && <>
                  <button className="btn btn-secondary" style={{fontSize:13}} onClick={abrirNuevoParte}>
                    {I.plus} Registrar Parte Diario
                  </button>
                  {(() => {
                    const aprobados = partesOT.filter(p => p.estado === 'aprobado');
                    const pendientes = partesOT.filter(p => !['aprobado', 'rechazado'].includes(p.estado));
                    const bloqueado = aprobados.length === 0 || pendientes.length > 0;
                    const tooltip = partesOT.length === 0
                      ? 'Registra al menos un parte diario antes de cerrar la OT'
                      : pendientes.length > 0
                        ? `Tienes ${pendientes.length} parte(s) pendiente(s) de aprobación`
                        : aprobados.length === 0
                          ? 'Necesitas al menos un parte diario aprobado para cerrar la OT'
                          : '';
                    return (
                      <button
                        className="btn btn-primary"
                        style={{fontSize:13, ...(bloqueado ? {opacity:0.45, cursor:'not-allowed'} : {})}}
                        title={tooltip}
                        onClick={abrirFormCierre}
                      >
                        {I.check} Cerrar OT
                      </button>
                    );
                  })()}
                </>}
                {(sel.estado === 'cerrada' || sel.estado === 'cerrada_tecnica') && (
                  <button className="btn btn-secondary" style={{fontSize:13}} onClick={() => navigate('cierre', { detail: sel.id, tab: 'conformidad' })}>
                    {I.file} Ver cierre técnico
                  </button>
                )}
                {sel.estado === 'cerrada' && (
                  <button className="btn btn-secondary" style={{fontSize:13}}>{I.truck} Enviar a remisión</button>
                )}
              </div>
            </div>
          </div>

          {/* BODY */}
          <div className="side-panel-body" style={{padding:0}}>
            <div style={{padding:'16px 22px 18px', borderBottom:'1px solid var(--border)', background:avanceBg}}>
              <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:14}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:8}}>
                    <span className="ficha-detail-score" style={{color:avanceColor}}>{avanceOperativo}</span>
                    <span style={{fontSize:12, color:'var(--fg-muted)'}}>/ 100</span>
                    <span style={{fontSize:11, fontWeight:700, color:avanceColor, padding:'2px 10px', borderRadius:99, border:`1px solid ${avanceColor}`}}>Salud operativa</span>
                  </div>
                  <div style={{height:6, borderRadius:99, background:'var(--border)', overflow:'hidden'}}>
                    <div style={{width:`${avanceOperativo}%`, height:'100%', borderRadius:99, background:avanceColor, transition:'width 0.4s'}}/>
                  </div>
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 20px'}}>
                {criteriosOT.map((c, i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{width:14, height:14, flex:'0 0 14px', display:'inline-flex', alignItems:'center', justifyContent:'center', color:c.ok ? 'var(--green)' : c.warn ? 'var(--orange)' : 'var(--fg-muted)'}}>
                      {c.ok ? I.check : <span style={{fontSize:14, lineHeight:1}}>–</span>}
                    </span>
                    <span style={{fontSize:10.5, lineHeight:1.3, color:c.ok || c.warn ? 'var(--fg)' : 'var(--fg-muted)'}}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="ficha-detail-tabs" style={{padding:'0 22px', borderBottom:'1px solid var(--border)', display:'flex', gap:4, flexWrap:'wrap'}}>
              {['Resumen', 'Tareas', 'Checklists y Calidad', 'Personal y Recursos', 'Partes', ...(canCost ? ['Costos'] : []), 'Evidencias', 'Historial'].map(t => (
                <button key={t} className={`ficha-detail-tab ${activeTab===t?'active':''}`} onClick={() => setActiveTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="ficha-detail-content">

            {/* ── TAB RESUMEN ── */}
            {activeTab === 'Resumen' && (
              <div className="col" style={{gap:16, padding:22}}>
                <div style={{display:'grid', gridTemplateColumns:'1.35fr 1fr', gap:16, alignItems:'stretch'}}>
                  <div style={{padding:18, border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)', boxShadow:'var(--shadow-sm)'}}>
                    <div className="eyebrow" style={{marginBottom:8}}>Cliente / OS origen</div>
                    <div style={{fontSize:20, fontWeight:800, color:'var(--navy)', lineHeight:1.15}}>{getCuenta(sel.cuenta_id) || sel.cliente || 'Cliente pendiente'}</div>
                    <div className="text-muted" style={{fontSize:12, marginTop:8}}>
                      {osVinculada
                        ? <button className="btn btn-ghost" style={{padding:0, color:'var(--cyan)', fontWeight:700, fontSize:12}} onClick={() => { setSel(null); navigate('os_cliente', { detail: osVinculada.id }); }}>{osVinculada.numero}</button>
                        : 'Sin OS Cliente vinculada'}
                    </div>
                  </div>
                  <div style={{padding:18, border:'1px solid var(--border)', borderRadius:10, background:'var(--surface)', boxShadow:'var(--shadow-sm)'}}>
                    <div className="eyebrow" style={{marginBottom:8}}>Avance operativo</div>
                    <div className="font-display" style={{fontSize:24, fontWeight:800, color:'var(--navy)'}}>{sel.avance || 0}%</div>
                    <div className="text-muted" style={{fontSize:12, marginTop:8}}>{partesOT.length} parte(s) · {tecnicosAsignadosOT} tecnico(s)</div>
                  </div>
                </div>
                <div style={{border:'1px solid var(--border)', borderRadius:10, padding:16, background:'var(--surface)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                    <div className="row" style={{gap:10}}>
                      <span style={{width:32, height:32, borderRadius:8, background:'color-mix(in srgb, var(--cyan) 12%, transparent)', color:'var(--cyan)', display:'inline-flex', alignItems:'center', justifyContent:'center'}}>{I.clipboard || I.file}</span>
                      <div style={{fontWeight:700, fontSize:13, color:'var(--fg)'}}>Datos operativos</div>
                    </div>
                    {!editandoDatos && !['cerrada','facturada','anulada'].includes(sel.estado) && (
                      <button className="btn btn-secondary" style={{fontSize:11, padding:'2px 10px'}} onClick={abrirEditDatos}>Editar</button>
                    )}
                  </div>
                  {editandoDatos ? (
                    <div className="col" style={{gap:14}}>
                      <div className="grid-3" style={{gap:14}}>
                        <div className="input-group" style={{gridColumn:'1/-1'}}>
                          <label>CECO</label>
                          <select className="select" value={formDatos.centro_costo_id} onChange={e => setFormDatos(p => ({...p, centro_costo_id: e.target.value}))}>
                            <option value="">Sin CECO</option>
                            {cecosActivos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ${c.nombre}` : c.nombre}</option>)}
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Tipo</label>
                          <select className="select" value={formDatos.tipo} onChange={e => setFormDatos(p => ({...p, tipo: e.target.value}))}>
                            <option value="">—</option>
                            {(tiposActivos.length > 0
                              ? tiposActivos.map(t => t.nombre)
                              : ['interna','cliente','garantia','correctiva']
                            ).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Prioridad</label>
                          <select className="select" value={formDatos.prioridad} onChange={e => setFormDatos(p => ({...p, prioridad: e.target.value}))}>
                            <option value="normal">Normal</option>
                            <option value="urgente">Urgente</option>
                            <option value="critica">Crítica</option>
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Facturación</label>
                          <select className="select" value={formDatos.facturable ? 'si' : 'no'} onChange={e => setFormDatos(p => ({...p, facturable: e.target.value === 'si'}))}>
                            <option value="si">Facturable</option>
                            <option value="no">No facturable</option>
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Responsable</label>
                          <select className="select" value={formDatos.tecnico_responsable_id} onChange={e => setFormDatos(p => ({...p, tecnico_responsable_id: e.target.value}))}>
                            <option value="">Sin asignar</option>
                            {personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Supervisor</label>
                          <select className="select" value={formDatos.supervisor} onChange={e => setFormDatos(p => ({...p, supervisor: e.target.value}))}>
                            <option value="">Sin asignar</option>
                            {personal.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                          </select>
                        </div>
                        <div className="input-group">
                          <label>Sede</label>
                          <input className="input" value={formDatos.sede} onChange={e => setFormDatos(p => ({...p, sede: e.target.value}))} placeholder="Sede" />
                        </div>
                        <div className="input-group">
                          <label>Fecha fin comprometida</label>
                          <input className="input" type="date" value={formDatos.fecha_programada} onChange={e => setFormDatos(p => ({...p, fecha_programada: e.target.value}))} />
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Descripción / Alcance</label>
                        <textarea className="input" rows={3} value={formDatos.descripcion} onChange={e => setFormDatos(p => ({...p, descripcion: e.target.value}))} placeholder="Describe el alcance de la OT..." style={{resize:'vertical'}} />
                      </div>
                      <div className="row" style={{gap:8, justifyContent:'flex-end'}}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditandoDatos(false)}>Cancelar</button>
                        <button className="btn btn-primary btn-sm" onClick={guardarDatos}>Guardar cambios</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid-3" style={{gap:14}}>
                        <div>
                          <div className="eyebrow">OS Cliente</div>
                          {osVinculada
                            ? <button className="btn btn-ghost" style={{padding:0, color:'var(--cyan)', fontWeight:600, fontSize:13, textDecoration:'underline'}}
                                onClick={() => { setSel(null); navigate('os_cliente', { detail: osVinculada.id }); }}>
                                {osVinculada.numero}
                              </button>
                            : <span className="text-muted">—</span>
                          }
                        </div>
                        <div><div className="eyebrow">Cliente</div><div>{getCuenta(sel.cuenta_id) || sel.cliente || '—'}</div></div>
                        <div><div className="eyebrow">Sede</div><div>{sel.sede || '—'}</div></div>
                        <div><div className="eyebrow">Tipo</div><div>{sel.tipo || '—'}</div></div>
                        <div>
                          <div className="eyebrow">Prioridad</div>
                          <span className={`badge ${prioridadMeta[sel.prioridad || 'normal']?.[0] || 'badge-gray'}`}>
                            {prioridadMeta[sel.prioridad || 'normal']?.[1] || 'Normal'}
                          </span>
                        </div>
                        <div>
                          <div className="eyebrow">Facturación</div>
                          <span className={`badge ${sel.facturable === false ? 'badge-gray' : 'badge-green'}`}>
                            {sel.facturable === false ? 'No facturable' : 'Facturable'}
                          </span>
                        </div>
                        <div><div className="eyebrow">Responsable</div><div>{responsableNombre}</div></div>
                        <div><div className="eyebrow">Supervisor</div><div>{supervisorNombre}</div></div>
                        <div><div className="eyebrow">Fecha comprometida</div><div>{sel.fecha_programada || '—'}</div></div>
                        <div><div className="eyebrow">Inicio real</div><div>{partesOT.some(p => p.estado === 'aprobado') ? (sel.fecha_inicio || '—') : <span style={{fontSize:11,color:'var(--fg-muted)'}}>Pendiente primer parte</span>}</div></div>
                        <div><div className="eyebrow">Fin real</div><div>{partesOT.some(p => p.estado === 'aprobado') ? (sel.fecha_fin || '—') : <span style={{fontSize:11,color:'var(--fg-muted)'}}>En ejecución</span>}</div></div>
                      </div>
                      <div style={{background:'var(--bg-subtle)', padding:16, borderRadius:8, marginTop:14}}>
                        <div className="eyebrow" style={{marginBottom:8}}>Descripción / Alcance</div>
                        <p style={{fontSize:13, lineHeight:1.5, margin:0}}>{sel.descripcion || 'Sin descripción detallada.'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB TAREAS ── */}
            {activeTab === 'Tareas' && (
              <div style={{padding:22}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                  <div>
                    <h3 style={{margin:0}}>Tareas</h3>
                    {(sel.tareas?.length || 0) > 0 && (() => {
                      const total = sel.tareas.length;
                      const done = sel.tareas.filter(t => t.completado || t.estado === 'completada').length;
                      const pct = Math.round((done / total) * 100);
                      return (
                        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:4}}>
                          <span style={{fontSize:12, color:'var(--fg-muted)'}}>{done} de {total} completadas</span>
                          <div style={{width:80, height:6, background:'var(--border)', borderRadius:3}}>
                            <div style={{width:`${pct}%`, height:'100%', background:'var(--green)', borderRadius:3}}/>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  {!['cerrada','facturada','anulada'].includes(sel.estado) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowNuevaTarea(s => !s)}>{I.plus} Nueva tarea</button>
                  )}
                </div>

                {showNuevaTarea && (
                  <div className="card" style={{padding:16, marginBottom:16, border:'1px solid var(--cyan)'}}>
                    <div className="grid-2" style={{gap:12}}>
                      <div className="input-group" style={{gridColumn:'1/-1'}}>
                        <label>Descripción *</label>
                        <input className="input" value={nuevaTareaForm.descripcion} onChange={e => setNuevaTareaForm(s => ({...s, descripcion: e.target.value}))} placeholder="Describe la tarea..." autoFocus />
                      </div>
                      <div className="input-group">
                        <label>Responsable</label>
                        <select className="select" value={nuevaTareaForm.responsable_id} onChange={e => setNuevaTareaForm(s => ({...s, responsable_id: e.target.value}))}>
                          <option value="">Sin asignar</option>
                          {personalOperativo.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Fecha límite</label>
                        <input className="input" type="date" value={nuevaTareaForm.fecha_limite} onChange={e => setNuevaTareaForm(s => ({...s, fecha_limite: e.target.value}))} />
                      </div>
                    </div>
                    <div className="row mt-4" style={{justifyContent:'flex-end', gap:8}}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowNuevaTarea(false)}>Cancelar</button>
                      <button className="btn btn-primary btn-sm" onClick={agregarTarea} disabled={!nuevaTareaForm.descripcion.trim()}>Agregar tarea</button>
                    </div>
                  </div>
                )}

                {(sel.tareas?.length || 0) > 0 ? (
                  <div style={{display:'flex', flexDirection:'column', gap:8}}>
                    {sel.tareas.map(t => {
                      const completado = t.completado || t.estado === 'completada';
                      const estadoBadge = completado ? ['badge-green','Completada'] : (t.estado === 'en_progreso' ? ['badge-orange','En progreso'] : ['badge-gray','Pendiente']);
                      const resp = personalOperativo.find(p => p.id === t.responsable_id);
                      return (
                        <div key={t.id} style={{padding:12, border:'1px solid var(--border)', borderRadius:6, background:'var(--bg)', display:'flex', gap:12, alignItems:'flex-start'}}>
                          <input type="checkbox" checked={completado} onChange={() => toggleTarea(t.id)} style={{marginTop:3, cursor:'pointer'}} />
                          <div style={{flex:1, minWidth:0}}>
                            <div style={{textDecoration: completado?'line-through':'none', color: completado?'var(--fg-muted)':'var(--fg)', fontWeight:500}}>{t.descripcion}</div>
                            <div className="row" style={{gap:12, marginTop:5, fontSize:11, color:'var(--fg-muted)'}}>
                              {resp && <span>👤 {resp.nombre}</span>}
                              {t.fecha_limite && <span>📅 {t.fecha_limite}</span>}
                            </div>
                          </div>
                          <span className={`badge ${estadoBadge[0]}`} style={{fontSize:10, flexShrink:0}}>{estadoBadge[1]}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted" style={{padding:32, textAlign:'center'}}>
                    No hay tareas para esta OT.
                    {!['cerrada','facturada','anulada'].includes(sel.estado) && <div style={{marginTop:6, fontSize:12}}>Usa &quot;+ Nueva tarea&quot; para agregar.</div>}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB CHECKLISTS ── */}
            {activeTab === 'Checklists y Calidad' && (
              <div className="col" style={{gap:20, padding:22}}>
                <div className="card">
                  <div className="card-head">
                    <h3 style={{fontSize:16}}>Checklist de Seguridad Inicial (SSOMA)</h3>
                    <span className="badge badge-green">Completado</span>
                  </div>
                  <div className="card-body">
                    <div className="grid-2" style={{gap:12}}>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> Charla de 5 minutos realizada</label>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> EPPs completos y en buen estado</label>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> Área de trabajo delimitada</label>
                      <label style={{display:'flex', gap:8, alignItems:'center'}}><input type="checkbox" checked readOnly/> Permisos de trabajo de alto riesgo (PTAR) firmados</label>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-head">
                    <h3 style={{fontSize:16}}>Incidentes Reportados</h3>
                    <button className="btn btn-sm btn-secondary">{I.plus} Registrar Incidente</button>
                  </div>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>ID</th><th>Fecha</th><th>Severidad</th><th>Descripción</th><th>Estado</th></tr></thead>
                      <tbody>
                        <tr><td colSpan="5" style={{textAlign:'center', padding:24, color:'var(--fg-muted)'}}>Sin incidentes registrados</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB PERSONAL Y RECURSOS ── */}
            {activeTab === 'Personal y Recursos' && (
              <div style={{padding:22}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                  <h3 style={{margin:0}}>Personal Asignado</h3>
                  <div className="row" style={{gap:8}}>
                    {!['cerrada','facturada','anulada'].includes(sel.estado) && (
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowAsignarTec(s => !s)}>{I.plus} Asignar colaborador</button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('planner')}>Gestionar en Planner</button>
                  </div>
                </div>

                {showAsignarTec && (
                  <form className="card" style={{padding:16, marginBottom:16, border:'1px solid var(--cyan)'}} onSubmit={submitAsignarTec}>
                    <div className="grid-3" style={{gap:12}}>
                      <div className="input-group" style={{gridColumn:'1/-1'}}>
                        <label>Colaborador *</label>
                        <select className="select" value={asignarTecForm.tecnico_id} onChange={e => setAsignarTecForm(s => ({...s, tecnico_id: e.target.value}))} required>
                          <option value="">Seleccionar...</option>
                          {[...(personalOperativo || []), ...(personalAdmin || [])].filter(p => p.estado === 'activo').map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.cargo || 'Colaborador'}</option>)}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Fecha inicio *</label>
                        <input className="input" type="date" value={asignarTecForm.fecha_inicio} onChange={e => setAsignarTecForm(s => ({...s, fecha_inicio: e.target.value}))} required />
                      </div>
                      <div className="input-group">
                        <label>Fecha fin</label>
                        <input className="input" type="date" value={asignarTecForm.fecha_fin} onChange={e => setAsignarTecForm(s => ({...s, fecha_fin: e.target.value}))} />
                      </div>
                      <div className="input-group" style={{visibility:'hidden'}} />
                      <div className="input-group">
                        <label>Hora inicio (por día)</label>
                        <input className="input" type="time" value={asignarTecForm.hora_inicio} onChange={e => setAsignarTecForm(s => ({...s, hora_inicio: e.target.value}))} />
                      </div>
                      <div className="input-group">
                        <label>Hora fin (por día)</label>
                        <input className="input" type="time" value={asignarTecForm.hora_fin} onChange={e => setAsignarTecForm(s => ({...s, hora_fin: e.target.value}))} />
                      </div>
                    </div>
                    <div className="row mt-4" style={{justifyContent:'flex-end', gap:8}}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAsignarTec(false)}>Cancelar</button>
                      <button type="submit" className="btn btn-primary btn-sm">Asignar</button>
                    </div>
                  </form>
                )}

                {(() => {
                  const asigs = plannerAsignaciones.filter(a => a.ot_id === sel.id && a.estado !== 'cancelado');
                  if (asigs.length === 0) return <div className="card" style={{padding:32, textAlign:'center', color:'var(--fg-muted)'}}>No hay personal asignado a esta OT todavía.</div>;
                  const porTecnico = {};
                  asigs.forEach(a => {
                    if (!porTecnico[a.tecnico_id]) porTecnico[a.tecnico_id] = [];
                    porTecnico[a.tecnico_id].push(a);
                  });
                  return (
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16}}>
                      {Object.entries(porTecnico).map(([tecId, items]) => {
                        const tec = [...(personalOperativo || []), ...(personalAdmin || [])].find(t => t.id === tecId) || {};
                        const totalHoras = items.reduce((s, a) => {
                          if (!a.hora_inicio_estimada || !a.hora_fin_estimada) return s;
                          const [h1, m1] = a.hora_inicio_estimada.split(':').map(Number);
                          const [h2, m2] = a.hora_fin_estimada.split(':').map(Number);
                          return s + (h2 * 60 + m2 - h1 * 60 - m1) / 60;
                        }, 0);
                        const sorted = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha));
                        return (
                          <div key={tecId} className="card" style={{padding:16}}>
                            <div style={{fontWeight:700, fontSize:15, marginBottom:2}}>{tec.nombre || tecId}</div>
                            <div style={{fontSize:12, color:'var(--fg-muted)'}}>{tec.cargo || 'Técnico'}</div>
                            {totalHoras > 0 && <div style={{fontSize:12, color:'var(--cyan)', fontWeight:600, marginTop:4}}>{totalHoras.toFixed(1)}h asignadas</div>}
                            <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:8, marginTop:2}}>Desde {sorted[0].fecha}</div>
                            <div style={{display:'flex', flexDirection:'column', gap:4}}>
                              {sorted.map(a => (
                                <div key={a.id} style={{fontSize:11, display:'flex', justifyContent:'space-between', padding:'3px 8px', background:'var(--bg-subtle)', borderRadius:4}}>
                                  <span style={{fontWeight:600}}>{a.fecha}</span>
                                  <span style={{color:'var(--cyan)'}}>{a.hora_inicio_estimada?.slice(0,5)||'--'} – {a.hora_fin_estimada?.slice(0,5)||'--'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── TAB PARTES ── */}
            {activeTab === 'Partes' && (
              <div style={{padding:22}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                  <h3 style={{margin:0}}>Partes Diarios</h3>
                  {sel.estado === 'ejecucion' && !showNuevoParte && (
                    <button className="btn btn-secondary btn-sm" onClick={abrirNuevoParte}>{I.plus} Nuevo parte diario</button>
                  )}
                </div>

                {showNuevoParte && (() => {
                  const hoyStr = new Date().toISOString().split('T')[0];
                  const tareasActivas = parteFormOT.tareas_trabajadas.filter(t => t.trabajado);
                  const avancePreview =
                    tareasActivas.reduce((s, t) => s + (Number(t.avance_hoy) || 0), 0) +
                    parteFormOT.actividades_adicionales.reduce((s, a) => s + (Number(a.avance_estimado) || 0), 0);
                  const puedeEnviar = !!parteFormOT.tecnico_id && (
                    !!parteEditandoId ||
                    tareasActivas.length > 0 ||
                    parteFormOT.actividades_adicionales.some(a => a.descripcion.trim()) ||
                    parteFormOT.avance_ajustado_manual ||
                    parteFormOT.observaciones?.trim()
                  );

                  return (
                    <form className="card" style={{padding:20, marginBottom:20, border:'1px solid var(--cyan)'}} onSubmit={submitParteDesdOT}>
                      <div style={{marginBottom:16, paddingBottom:12, borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <h4 style={{margin:0, color:'var(--cyan)'}}>{parteEditandoId ? 'Editar Borrador' : 'Nuevo Parte Diario'}</h4>
                        {avancePreview > 0 && <span style={{fontSize:12, color:'var(--fg-muted)'}}>Avance total reportado: <strong style={{color:'var(--cyan)'}}>{avancePreview}%</strong></span>}
                      </div>

                      {/* — Encabezado — */}
                      <div style={{background:'var(--bg-subtle)', padding:14, borderRadius:8, marginBottom:16}}>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
                          <div className="input-group">
                            <label>OT vinculada</label>
                            <div style={{fontWeight:600, fontSize:13, padding:'6px 0'}}>{sel.numero}</div>
                          </div>
                          <div className="input-group">
                            <label>Fecha *</label>
                            <input className="input" type="date" max={hoyStr} value={parteFormOT.fecha} onChange={e => setParteFormOT(s => ({...s, fecha: e.target.value}))} required />
                          </div>
                          <div className="input-group">
                            <label>Horas trabajadas</label>
                            <input className="input" type="number" min="0.5" step="0.5" max="24" value={parteFormOT.horas} onChange={e => setParteFormOT(s => ({...s, horas: Number(e.target.value)}))} />
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Colaborador *</label>
                          {tecnicosDeOT.length > 0 ? (
                            <select className="select" value={parteFormOT.tecnico_id} onChange={e => updParteHorasTecnico(e.target.value)} required>
                              <option value="">Seleccionar...</option>
                              {tecnicosDeOT.map(t => <option key={t.id} value={t.id}>{t.nombre}{t.cargo ? ` — ${t.cargo}` : ''}</option>)}
                            </select>
                          ) : (
                            <div style={{fontSize:12, color:'var(--fg-muted)', padding:'6px 0'}}>No hay colaboradores asignados a esta OT en el Planner. Asigna uno desde la pestaña Personal y Recursos.</div>
                          )}
                        </div>
                      </div>

                      {/* — Sección 1: Tareas de la OT — */}
                      {parteFormOT.tareas_trabajadas.length > 0 && (
                        <div style={{marginBottom:16}}>
                          <div style={{fontWeight:600, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
                            Tareas de la OT
                            <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Marca las tareas en las que trabajaste hoy</span>
                          </div>
                          <div className="col" style={{gap:8}}>
                            {parteFormOT.tareas_trabajadas.map((t, idx) => (
                              <div key={t.tarea_id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:'1px solid var(--border)', borderRadius:6, background: t.trabajado ? 'color-mix(in srgb, var(--cyan) 5%, transparent)' : 'var(--bg)'}}>
                                <input type="checkbox" checked={t.trabajado} onChange={e => setParteFormOT(s => ({ ...s, tareas_trabajadas: s.tareas_trabajadas.map((x, i) => i === idx ? {...x, trabajado: e.target.checked, avance_hoy: e.target.checked ? x.avance_hoy : 0} : x) }))} style={{cursor:'pointer', width:16, height:16, flexShrink:0}} />
                                <div style={{flex:1, minWidth:0}}>
                                  <div style={{fontSize:13, fontWeight:500, color: t.trabajado ? 'var(--fg)' : 'var(--fg-muted)'}}>{t.nombre}</div>
                                </div>
                                <span className={`badge ${t.estado_actual === 'completada' ? 'badge-green' : t.estado_actual === 'en_progreso' ? 'badge-orange' : 'badge-gray'}`} style={{fontSize:10, flexShrink:0}}>{t.estado_actual}</span>
                                {t.trabajado && (
                                  <div style={{display:'flex', alignItems:'center', gap:6, flexShrink:0}}>
                                    <label style={{fontSize:11, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Avance hoy</label>
                                    <input className="input" type="number" min="0" max="100" style={{width:72, padding:'3px 8px', fontSize:12}} value={t.avance_hoy} onChange={e => setParteFormOT(s => ({ ...s, tareas_trabajadas: s.tareas_trabajadas.map((x, i) => i === idx ? {...x, avance_hoy: Number(e.target.value)} : x) }))} />
                                    <span style={{fontSize:11}}>%</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* — Sección 2: Actividades adicionales — */}
                      <div style={{marginBottom:16}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
                          Actividades adicionales
                          <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Actividades no contempladas en tareas</span>
                        </div>
                        <div className="col" style={{gap:8}}>
                          {parteFormOT.actividades_adicionales.map((a, idx) => (
                            <div key={idx} style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                              <input className="input" style={{flex:1}} placeholder="Descripción de la actividad *" value={a.descripcion} onChange={e => setParteFormOT(s => ({ ...s, actividades_adicionales: s.actividades_adicionales.map((x, i) => i === idx ? {...x, descripcion: e.target.value} : x) }))} />
                              <div style={{display:'flex', alignItems:'center', gap:4, flexShrink:0}}>
                                <input className="input" type="number" min="0" max="100" style={{width:72, padding:'6px 8px', fontSize:12}} placeholder="0" value={a.avance_estimado} onChange={e => setParteFormOT(s => ({ ...s, actividades_adicionales: s.actividades_adicionales.map((x, i) => i === idx ? {...x, avance_estimado: Number(e.target.value)} : x) }))} />
                                <span style={{fontSize:11, color:'var(--fg-muted)'}}>%</span>
                              </div>
                              <button type="button" className="icon-btn" style={{flexShrink:0}} onClick={() => setParteFormOT(s => ({ ...s, actividades_adicionales: s.actividades_adicionales.filter((_, i) => i !== idx) }))}>{I.x}</button>
                            </div>
                          ))}
                        </div>
                        <button type="button" className="btn btn-ghost" style={{fontSize:12, marginTop:8}} onClick={() => setParteFormOT(s => ({ ...s, actividades_adicionales: [...s.actividades_adicionales, { descripcion: '', avance_estimado: 0 }] }))}>
                          {I.plus} Agregar actividad
                        </button>
                      </div>

                      {/* — Sección 3: Avance global del día — */}
                      <div style={{marginBottom:16, padding:14, background:'var(--bg-subtle)', borderRadius:8}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10}}>Avance global del día</div>
                        <div style={{display:'flex', alignItems:'center', gap:12}}>
                          <div style={{flex:1}}>
                            <div style={{display:'flex', alignItems:'center', gap:8}}>
                              <input
                                className="input"
                                type="number" min="0" max="100"
                                style={{width:90, fontSize:16, fontWeight:700, textAlign:'center'}}
                                value={parteFormOT.avance_ajustado_manual ? parteFormOT.avance_global : avancePreview}
                                onChange={e => {
                                  const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                  setParteFormOT(s => ({ ...s, avance_global: val, avance_ajustado_manual: val !== avancePreview }));
                                }}
                              />
                              <span style={{fontSize:14, fontWeight:600}}>%</span>
                              {parteFormOT.avance_ajustado_manual && (
                                <span style={{fontSize:11, color:'var(--orange)', background:'color-mix(in srgb, var(--orange) 10%, transparent)', padding:'2px 8px', borderRadius:99, border:'1px solid var(--orange)'}}>Ajustado manualmente</span>
                              )}
                            </div>
                            <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>
                              Calculado automáticamente: {avancePreview}% · Puedes ajustarlo si no refleja la realidad
                            </div>
                          </div>
                          {parteFormOT.avance_ajustado_manual && (
                            <button type="button" className="btn btn-ghost" style={{fontSize:11}} onClick={() => setParteFormOT(s => ({ ...s, avance_global: avancePreview, avance_ajustado_manual: false }))}>
                              Restablecer
                            </button>
                          )}
                        </div>
                      </div>

                      {/* — Sección 4: Materiales usados — */}
                      <div style={{marginBottom:16}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
                          Materiales usados
                          <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Opcional — solo si se consumieron materiales</span>
                        </div>
                        {parteFormOT.materiales_lineas.length > 0 && (
                          <div className="col" style={{gap:8, marginBottom:8}}>
                            {parteFormOT.materiales_lineas.map((m, idx) => {
                              const cat = (catalogoMateriales || []).find(x => x.id === m.mat_id);
                              const filtrados = m.query
                                ? (catalogoMateriales || []).filter(x => `${x.codigo} ${x.descripcion}`.toLowerCase().includes(m.query.toLowerCase())).slice(0, 8)
                                : [];
                              const updLine = (patch) => setParteFormOT(s => ({ ...s, materiales_lineas: s.materiales_lineas.map((x, i) => i === idx ? {...x, ...patch} : x) }));
                              return (
                                <div key={idx} style={{display:'grid', gridTemplateColumns:'2fr 1fr auto', gap:8, alignItems:'start'}}>
                                  <div style={{position:'relative'}}>
                                    <input
                                      className="input"
                                      placeholder="Buscar material por código o nombre..."
                                      value={m.mat_id ? `${cat?.codigo} — ${cat?.descripcion}` : (m.query || '')}
                                      onChange={e => updLine({ query: e.target.value, mat_id: '' })}
                                      onFocus={e => { if (!m.mat_id) updLine({ query: e.target.value }); }}
                                      autoComplete="off"
                                    />
                                    {filtrados.length > 0 && (
                                      <div className="autocomplete-menu autocomplete-menu-inline" style={{maxHeight:200}}>
                                        {filtrados.map(it => (
                                          <div key={it.id}
                                            onMouseDown={e => { e.preventDefault(); updLine({ mat_id: it.id, query: '' }); }}
                                            className="autocomplete-option"
                                          >
                                            <div className="autocomplete-option-title"><span className="mono autocomplete-code">{it.codigo}</span>{it.descripcion}</div>
                                            <div className="autocomplete-option-meta">{it.unidad || 'Sin unidad'}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{display:'flex', alignItems:'center', gap:4}}>
                                    <input className="input" type="number" min="0.01" step="0.01" placeholder="Cant." value={m.cantidad} onChange={e => updLine({ cantidad: e.target.value })} />
                                    {cat && <span style={{fontSize:11, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>{cat.unidad}</span>}
                                  </div>
                                  <button type="button" className="icon-btn" style={{marginTop:6}} onClick={() => setParteFormOT(s => ({ ...s, materiales_lineas: s.materiales_lineas.filter((_, i) => i !== idx) }))}>{I.x}</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <button type="button" className="btn btn-ghost" style={{fontSize:12}} onClick={() => setParteFormOT(s => ({ ...s, materiales_lineas: [...s.materiales_lineas, { mat_id: '', query: '', cantidad: '' }] }))}>
                          {I.plus} Agregar material
                        </button>
                      </div>

                      {/* — Sección 5: Servicios de terceros — */}
                      <div style={{marginBottom:16}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
                          Servicios de terceros
                          <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Opcional — subcontratistas, alquileres, servicios externos</span>
                        </div>
                        {(parteFormOT.terceros_lineas || []).length > 0 && (
                          <div className="col" style={{gap:8, marginBottom:8}}>
                            {parteFormOT.terceros_lineas.map((l, idx) => (
                              <div key={idx} style={{display:'grid', gridTemplateColumns:'2fr 1fr auto', gap:8, alignItems:'center'}}>
                                <input className="input" placeholder="Descripción del servicio" value={l.descripcion} onChange={e => setParteFormOT(s => ({ ...s, terceros_lineas: s.terceros_lineas.map((x, i) => i === idx ? {...x, descripcion: e.target.value} : x) }))} />
                                <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={l.monto} onChange={e => setParteFormOT(s => ({ ...s, terceros_lineas: s.terceros_lineas.map((x, i) => i === idx ? {...x, monto: e.target.value} : x) }))} />
                                <button type="button" className="icon-btn" onClick={() => setParteFormOT(s => ({ ...s, terceros_lineas: s.terceros_lineas.filter((_, i) => i !== idx) }))}>{I.x}</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button type="button" className="btn btn-ghost" style={{fontSize:12}} onClick={() => setParteFormOT(s => ({ ...s, terceros_lineas: [...(s.terceros_lineas || []), { descripcion: '', monto: '' }] }))}>
                          {I.plus} Agregar servicio de tercero
                        </button>
                      </div>

                      {/* — Sección 6: Logística y viáticos — */}
                      <div style={{marginBottom:16}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
                          Logística y viáticos
                          <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Opcional — transporte, hospedaje, alimentación, combustible</span>
                        </div>
                        {(parteFormOT.logistica_lineas || []).length > 0 && (
                          <div className="col" style={{gap:8, marginBottom:8}}>
                            {parteFormOT.logistica_lineas.map((l, idx) => (
                              <div key={idx} style={{display:'grid', gridTemplateColumns:'2fr 1fr auto', gap:8, alignItems:'center'}}>
                                <input className="input" placeholder="Descripción del gasto" value={l.descripcion} onChange={e => setParteFormOT(s => ({ ...s, logistica_lineas: s.logistica_lineas.map((x, i) => i === idx ? {...x, descripcion: e.target.value} : x) }))} />
                                <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={l.monto} onChange={e => setParteFormOT(s => ({ ...s, logistica_lineas: s.logistica_lineas.map((x, i) => i === idx ? {...x, monto: e.target.value} : x) }))} />
                                <button type="button" className="icon-btn" onClick={() => setParteFormOT(s => ({ ...s, logistica_lineas: s.logistica_lineas.filter((_, i) => i !== idx) }))}>{I.x}</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button type="button" className="btn btn-ghost" style={{fontSize:12}} onClick={() => setParteFormOT(s => ({ ...s, logistica_lineas: [...(s.logistica_lineas || []), { descripcion: '', monto: '' }] }))}>
                          {I.plus} Agregar gasto logístico
                        </button>
                      </div>

                      {/* — Sección 7: Evidencias — */}
                      <div style={{marginBottom:16}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
                          Evidencias
                          <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Opcional — fotos o documentos del trabajo ejecutado hoy</span>
                        </div>
                        {parteFormOT.evidencias.length > 0 && (
                          <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:8}}>
                            {parteFormOT.evidencias.map((ev, idx) => (
                              <div key={idx} style={{position:'relative', width:80, height:80, borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'var(--bg-subtle)'}}>
                                {ev.tipo.startsWith('image/') ? (
                                  <img src={ev.url} alt={ev.nombre} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                                ) : (
                                  <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4}}>
                                    <span style={{fontSize:22}}>📄</span>
                                    <span style={{fontSize:9, color:'var(--fg-muted)', textAlign:'center', padding:'0 4px', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%'}}>{ev.nombre}</span>
                                  </div>
                                )}
                                <button type="button" onClick={() => setParteFormOT(s => ({ ...s, evidencias: s.evidencias.filter((_, i) => i !== idx) }))} style={{position:'absolute', top:2, right:2, width:18, height:18, borderRadius:'50%', background:'rgba(0,0,0,0.55)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, lineHeight:1}}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="btn btn-ghost" style={{fontSize:12, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}>
                          📎 Adjuntar archivo (imagen, PDF, Word)
                          <input type="file" accept="image/*,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple style={{display:'none'}} onChange={e => {
                            const files = Array.from(e.target.files || []);
                            const nuevas = files.map(f => ({ nombre: f.name, tipo: f.type, tamanio: f.size, url: URL.createObjectURL(f) }));
                            setParteFormOT(s => ({ ...s, evidencias: [...s.evidencias, ...nuevas] }));
                            e.target.value = '';
                          }} />
                        </label>
                      </div>

                      {/* — Sección 8: Observaciones / Restricciones — */}
                      <div style={{marginBottom:16}}>
                        <div style={{fontWeight:600, fontSize:13, marginBottom:10}}>Observaciones o restricciones</div>
                        <textarea
                          className="input" rows={3}
                          placeholder="Reporta cualquier problema, restricción o novedad del día (falta de materiales, acceso restringido, condiciones climáticas, equipos defectuosos...)"
                          value={parteFormOT.observaciones}
                          onChange={e => setParteFormOT(s => ({...s, observaciones: e.target.value}))}
                          style={{resize:'vertical'}}
                        />
                        <label style={{display:'flex', alignItems:'center', gap:10, marginTop:10, cursor:'pointer', userSelect:'none', padding:'10px 14px', borderRadius:8, border:`1px solid ${parteFormOT.es_restriccion ? 'var(--danger)' : 'var(--border)'}`, background: parteFormOT.es_restriccion ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : 'var(--bg-subtle)'}}>
                          <div style={{position:'relative', width:36, height:20, flexShrink:0}}>
                            <input type="checkbox" checked={parteFormOT.es_restriccion} onChange={e => setParteFormOT(s => ({...s, es_restriccion: e.target.checked}))} style={{opacity:0, position:'absolute', width:'100%', height:'100%', margin:0, cursor:'pointer'}} />
                            <div style={{position:'absolute', inset:0, borderRadius:99, background: parteFormOT.es_restriccion ? 'var(--danger)' : 'var(--border)', transition:'background 0.2s'}} />
                            <div style={{position:'absolute', top:2, left: parteFormOT.es_restriccion ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}} />
                          </div>
                          <div>
                            <div style={{fontSize:13, fontWeight:600, color: parteFormOT.es_restriccion ? 'var(--danger)' : 'var(--fg)'}}>Reportar como restricción</div>
                            <div style={{fontSize:11, color:'var(--fg-muted)'}}>El parte quedará marcado como "Con restricción" y se generará una alerta al supervisor</div>
                          </div>
                        </label>
                      </div>

                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:14, borderTop:'1px solid var(--border)'}}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNuevoParte(false); setParteEditandoId(null); setParteFormOT(parteFormReset); }}>Cancelar</button>
                        <div className="row" style={{gap:8}}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={e => submitParteDesdOT(null, 'borrador')} disabled={!parteFormOT.tecnico_id}>{I.save} Guardar borrador</button>
                          <button type="submit" className="btn btn-primary btn-sm" disabled={!puedeEnviar}>
                            {parteFormOT.es_restriccion ? '⚠ Enviar con restricción' : <>{I.check} Enviar a revisión</>}
                          </button>
                        </div>
                      </div>
                    </form>
                  );
                })()}

                {partesOT.length > 0 ? (
                  <>
                    {(() => {
                      const aprobados = partesOT.filter(p => p.estado === 'aprobado');
                      const avanceTotal = aprobados.length > 0
                        ? Math.round(aprobados.reduce((s, p) => s + (p.avance_reportado || 0), 0) / aprobados.length)
                        : (sel.avance || 0);
                      return (
                        <div style={{display:'flex', gap:24, padding:14, background:'var(--bg-subtle)', borderRadius:8, marginBottom:16}}>
                          <div><div className="eyebrow">Avance total</div><div style={{fontWeight:700, fontSize:18, color:'var(--cyan)'}}>{avanceTotal}%</div></div>
                          <div><div className="eyebrow">Partes registrados</div><div style={{fontWeight:700, fontSize:18}}>{partesOT.length}</div></div>
                          <div><div className="eyebrow">Aprobados</div><div style={{fontWeight:700, fontSize:18, color:'var(--green)'}}>{aprobados.length}</div></div>
                        </div>
                      );
                    })()}
                    <div style={{display:'flex', flexDirection:'column', gap:10}}>
                      {partesOT.map(p => (
                        <div key={p.id} style={{padding:14, border:'1px solid var(--border)', borderRadius:6, background:'var(--bg)'}}>
                          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                            <div style={{fontWeight:600, fontSize:13}}>{p.tecnico}</div>
                            <div style={{display:'flex', alignItems:'center', gap:8}}>
                              {(['borrador','rechazado','observado'].includes(p.estado)) && !showNuevoParte && (<>
                                <button type="button" className="btn btn-ghost btn-sm" style={{padding:'2px 10px', fontSize:12}} onClick={() => abrirEditarBorrador(p)}>
                                  {I.edit} Editar
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" style={{padding:'2px 10px', fontSize:12}} onClick={() => enviarParteARevision(p.id)}>
                                  Enviar a revisión
                                </button>
                              </>)}
                              <span className={`badge ${p.estado==='aprobado'?'badge-green':p.estado==='rechazado'?'badge-red':p.estado==='observado'?'badge-orange':p.estado==='con_restriccion'?'badge-red':p.estado==='borrador'?'badge-gray':'badge-orange'}`}>
                                {p.estado==='aprobado'?'Aprobado':p.estado==='rechazado'?'Rechazado':p.estado==='observado'?'Observado':p.estado==='con_restriccion'?'Con restricción':p.estado==='borrador'?'Borrador':'Pendiente'}
                              </span>
                            </div>
                          </div>
                          <div className="grid-3" style={{fontSize:12, gap:8, marginBottom:8}}>
                            <div><span className="text-muted">Fecha:</span> {p.fecha}</div>
                            <div><span className="text-muted">Horas:</span> {p.horas}h</div>
                            <div><span className="text-muted">Avance:</span> +{p.avance_reportado}%</div>
                          </div>
                          <div style={{fontSize:12, color:'var(--fg-muted)', lineHeight:1.4}}>{p.actividades}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-muted" style={{padding:32, textAlign:'center'}}>
                    Aún no se han registrado partes diarios.
                    {sel.estado === 'ejecucion' && <div style={{marginTop:6, fontSize:12}}>Usa &quot;+ Nuevo parte diario&quot; para registrar.</div>}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB COSTOS ── */}
            {activeTab === 'Costos' && canCost && (() => {
              const cierreOT = (cierresTecnicos || []).find(ct => ct.ot_id === sel.id);
              const partesAprobados = partesOT.filter(p => p.estado === 'aprobado');
              const costoHoraTec = (personaId) => {
                const tec = [...(personalOperativo || []), ...(personalAdmin || [])].find(p => p.id === personaId);
                const explicit = Number(tec?.costo_hora_real ?? tec?.costo ?? tec?.costo_hora ?? 0);
                if (explicit > 0) return explicit;
                const rem = Number(tec?.remuneracion ?? 0);
                return rem > 0 ? Math.round(rem / 240 * 100) / 100 : 0;
              };
              const costoHoraOT = (tecnicoId) => {
                const moItem = (sel.est_detalle?.mano_obra || []).find(m => m.tecnico_id === tecnicoId);
                if (moItem?.costo_hora > 0) return moItem.costo_hora;
                return costoHoraTec(tecnicoId);
              };
              const moReal = (() => {
                if (cierreOT?.horas_total) return cierreOT.horas_total * costoHoraOT(sel.tecnico_responsable_id);
                return partesAprobados.reduce((s, p) => s + (p.horas || 0) * costoHoraOT(p.tecnico_id), 0);
              })();
              const matReal = partesAprobados.reduce((s, p) =>
                s + (p.materiales_usados || []).reduce((sm, m) => sm + (m.costo_unitario || 0) * (m.cantidad || 0), 0), 0);
              const terceroReal = partesAprobados.reduce((s, p) => s + (p.terceros_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0) + (cierreOT?.costo_terceros || 0);
              const logisticaReal = partesAprobados.reduce((s, p) => s + (p.logistica_lineas || []).reduce((sm, l) => sm + (Number(l.monto) || 0), 0), 0) + (cierreOT?.costo_logistica || 0);
              const costoRealTotal = moReal + matReal + terceroReal + logisticaReal;

              // MEJORA 2: HC vinculada a través de OS Cliente
              const hcVinculadaCostos = (() => {
                if (!osVinculada?.cotizacion_id) return null;
                const cot = (cotizaciones || []).find(c => c.id === osVinculada.cotizacion_id);
                if (!cot?.hoja_costeo_id) return null;
                return (hojasCosteo || []).find(h => h.id === cot.hoja_costeo_id && h.estado === 'aprobada') ?? null;
              })();

              // MEJORA 1 & 3: totales desde desglose o desde campos agregados
              const sumSection = (key) => (estDetalle[key] || []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
              const estMoFinal   = (estDetalle.mano_obra  || []).length > 0 ? sumSection('mano_obra')  : (sel.est_mo         ?? null);
              const estMatFinal  = (estDetalle.materiales || []).length > 0 ? sumSection('materiales') : (sel.est_materiales  ?? null);
              const estTerFinal  = (estDetalle.terceros   || []).length > 0 ? sumSection('terceros')   : (sel.est_terceros    ?? null);
              const estLogFinal  = (estDetalle.logistica  || []).length > 0 ? sumSection('logistica')  : (sel.est_logistica   ?? null);
              const costoEstTotal = (estMoFinal || 0) + (estMatFinal || 0) + (estTerFinal || 0) + (estLogFinal || 0);

              // Item helpers
              const updItem = (section, idx, field, value) =>
                setEstDetalle(prev => ({
                  ...prev,
                  [section]: (prev[section] || []).map((it, i) => {
                    if (i !== idx) return it;
                    const upd = { ...it, [field]: value };
                    upd.subtotal = section === 'mano_obra'
                      ? Number(upd.dias || 0) * Number(upd.horas_dia || 0) * Number(upd.costo_hora || 0)
                      : Number(upd.cantidad || 0) * Number(upd.costo_unit || 0);
                    return upd;
                  }),
                }));

              const addItem = (section) =>
                setEstDetalle(prev => ({
                  ...prev,
                  [section]: [...(prev[section] || []),
                    section === 'mano_obra'  ? { tecnico_id: '', nombre: '', dias: 1, horas_dia: 8, costo_hora: 0, subtotal: 0 }
                    : section === 'materiales' ? { inv_id: '', nombre: '', cantidad: 1, unidad: '', costo_unit: 0, subtotal: 0 }
                    : { descripcion: '', cantidad: 1, unidad: 'und', costo_unit: 0, subtotal: 0 }
                  ],
                }));

              const removeItem = (section, idx) =>
                setEstDetalle(prev => ({ ...prev, [section]: (prev[section] || []).filter((_, i) => i !== idx) }));

              const guardarEstimado = () => {
                const updates = {
                  est_mo: estMoFinal, est_materiales: estMatFinal,
                  est_terceros: estTerFinal, est_logistica: estLogFinal,
                  costoEst: costoEstTotal, est_detalle: estDetalle,
                };
                actualizarOT(sel.id, updates);
                setSel(s => ({ ...s, ...updates }));
                addNotificacion('Estimado actualizado.');
              };

              const varPct = (est, real) => {
                if (est == null || real == null || est === 0) return null;
                return Math.round(((real - est) / est) * 100);
              };
              const varColor = (pct) => pct === null ? 'var(--fg-muted)' : pct <= 0 ? 'var(--green)' : 'var(--danger)';
              const margen = costoEstTotal > 0 && costoRealTotal > 0
                ? Math.round(((costoEstTotal - costoRealTotal) / costoEstTotal) * 100) : 0;

              const sections = [
                { key: 'mano_obra',  label: 'Mano de obra',         est: estMoFinal,  real: moReal > 0      ? moReal      : null },
                { key: 'materiales', label: 'Materiales',            est: estMatFinal, real: matReal > 0     ? matReal     : null },
                { key: 'terceros',   label: 'Servicios terceros',    est: estTerFinal, real: terceroReal > 0  ? terceroReal  : null },
                { key: 'logistica',  label: 'Logística y viáticos',  est: estLogFinal, real: logisticaReal > 0 ? logisticaReal : null },
              ];
              const inputSt = { fontSize: 12, padding: '3px 6px' };
              const monedaOT = osVinculada?.moneda || 'PEN';
              const monSym = monedaOT === 'USD' ? 'US$' : monedaOT === 'EUR' ? '€' : 'S/';

              return (
                <div className="col" style={{ gap: 16, padding: 22 }}>

                  {/* ── MEJORA 2: Referencia HC ── */}
                  {hcVinculadaCostos && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 0, fontSize: 13 }}
                        onClick={() => setShowHCRefCostos(v => !v)}>
                        <span>📋 Referencia Hoja de Costeo</span>
                        <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{showHCRefCostos ? '▲ ocultar' : '▼ ver'}</span>
                      </button>
                      {showHCRefCostos && (
                        <div style={{ padding: '0 16px 14px' }}>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 0', color: 'var(--fg-muted)', fontWeight: 600 }}>Concepto</th>
                                <th style={{ textAlign: 'right', padding: '4px 0', color: 'var(--fg-muted)', fontWeight: 600 }}>HC aprobada</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ['Mano de obra',       hcVinculadaCostos.total_mano_obra],
                                ['Materiales',         hcVinculadaCostos.total_materiales],
                                ['Servicios terceros', hcVinculadaCostos.total_servicios_terceros],
                                ['Logística',          hcVinculadaCostos.total_logistica],
                              ].map(([lbl, val]) => (
                                <tr key={lbl} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                  <td style={{ padding: '5px 0' }}>{lbl}</td>
                                  <td style={{ textAlign: 'right', padding: '5px 0', fontWeight: 600 }}>{val != null ? money(val, monSym) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── MEJORA 1: Tabla comparativa con desglose expandible ── */}
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 28 }} />
                          <th>Categoría</th>
                          <th className="num">Estimado</th>
                          <th className="num">Real</th>
                          <th className="num">VAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map(({ key, label, est, real }) => {
                          const expanded = expandedCostSections[key];
                          const items = estDetalle[key] || [];
                          const pct = varPct(est, real);
                          const toggleExpand = () => setExpandedCostSections(p => ({ ...p, [key]: !p[key] }));
                          return (
                            <React.Fragment key={key}>
                              <tr style={{ cursor: 'pointer' }} onClick={toggleExpand}>
                                <td style={{ textAlign: 'center', fontSize: 10, color: 'var(--fg-muted)' }}>{expanded ? '▼' : '▶'}</td>
                                <td>
                                  {label}
                                  {items.length > 0 && <span style={{ fontSize: 11, color: 'var(--cyan)', marginLeft: 6 }}>{items.length} ítem{items.length !== 1 ? 's' : ''}</span>}
                                </td>
                                <td className="num">{est != null ? money(est, monSym) : '—'}</td>
                                <td className="num">{real != null ? money(real, monSym) : '—'}</td>
                                <td className="num" style={{ color: varColor(pct), fontWeight: 600 }}>
                                  {pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}
                                </td>
                              </tr>
                              {expanded && (
                                <tr>
                                  <td colSpan={5} style={{ padding: 0, background: 'var(--bg-subtle)' }}>
                                    <div style={{ padding: '10px 12px 12px 28px' }}>
                                      {items.length > 0 && (
                                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
                                          <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                              {key === 'mano_obra' ? (
                                                <>
                                                  <th style={{ textAlign: 'left', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600 }}>Técnico</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 56 }}>Días</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 62 }}>Hrs/día</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 80 }}>Costo/h</th>
                                                </>
                                              ) : key === 'materiales' ? (
                                                <>
                                                  <th style={{ textAlign: 'left', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600 }}>Material</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 60 }}>Cant.</th>
                                                  <th style={{ textAlign: 'left', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 52 }}>Unidad</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 90 }}>Costo u.</th>
                                                </>
                                              ) : (
                                                <>
                                                  <th style={{ textAlign: 'left', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600 }}>Descripción</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 60 }}>Cant.</th>
                                                  <th style={{ textAlign: 'left', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 60 }}>Unidad</th>
                                                  <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 90 }}>Costo u.</th>
                                                </>
                                              )}
                                              <th style={{ textAlign: 'right', padding: '3px 4px', color: 'var(--fg-muted)', fontWeight: 600, width: 82 }}>Subtotal</th>
                                              <th style={{ width: 28 }} />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {items.map((item, idx) => (
                                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                {key === 'mano_obra' ? (
                                                  <>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <select className="select" style={inputSt} value={item.tecnico_id}
                                                        onChange={e => {
                                                          const ch = costoHoraTec(e.target.value);
                                                          const tec = [...(personalOperativo || []), ...(personalAdmin || [])].find(t => t.id === e.target.value);
                                                          setEstDetalle(prev => ({
                                                            ...prev,
                                                            mano_obra: (prev.mano_obra || []).map((it, i) => {
                                                              if (i !== idx) return it;
                                                              const upd = { ...it, tecnico_id: e.target.value, nombre: tec?.nombre || '', costo_hora: ch };
                                                              upd.subtotal = Number(upd.dias || 0) * Number(upd.horas_dia || 0) * ch;
                                                              return upd;
                                                            }),
                                                          }));
                                                        }}>
                                                        <option value="">Técnico...</option>
                                                        {[...(personalOperativo || []), ...(personalAdmin || [])].filter(t => t.estado !== 'inactivo').map(t => (
                                                          <option key={t.id} value={t.id}>{t.nombre}</option>
                                                        ))}
                                                      </select>
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" type="number" min="0.5" step="0.5" style={{ ...inputSt, width: '100%', textAlign: 'right' }}
                                                        value={item.dias} onChange={e => updItem('mano_obra', idx, 'dias', e.target.value)} />
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" type="number" min="0.5" max="24" step="0.5" style={{ ...inputSt, width: '100%', textAlign: 'right' }}
                                                        value={item.horas_dia} onChange={e => updItem('mano_obra', idx, 'horas_dia', e.target.value)} />
                                                    </td>
                                                    <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--fg-muted)' }}>
                                                      {item.costo_hora > 0 ? money(item.costo_hora, monSym) : '—'}
                                                    </td>
                                                  </>
                                                ) : key === 'materiales' ? (
                                                  <>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <select className="select" style={inputSt} value={item.inv_id}
                                                        onChange={e => {
                                                          const inv = (inventario || []).find(i => i.id === e.target.value);
                                                          const cu = Number(inv?.costo_promedio || 0);
                                                          setEstDetalle(prev => ({
                                                            ...prev,
                                                            materiales: (prev.materiales || []).map((it, i) => {
                                                              if (i !== idx) return it;
                                                              const upd = { ...it, inv_id: e.target.value, nombre: inv?.nombre || '', unidad: inv?.unidad || '', costo_unit: cu };
                                                              upd.subtotal = Number(upd.cantidad || 0) * cu;
                                                              return upd;
                                                            }),
                                                          }));
                                                        }}>
                                                        <option value="">Material...</option>
                                                        {(inventario || []).map(inv => (
                                                          <option key={inv.id} value={inv.id}>{inv.sku} — {inv.nombre}</option>
                                                        ))}
                                                      </select>
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" type="number" min="0" step="0.01" style={{ ...inputSt, width: '100%', textAlign: 'right' }}
                                                        value={item.cantidad} onChange={e => updItem('materiales', idx, 'cantidad', e.target.value)} />
                                                    </td>
                                                    <td style={{ padding: '3px 4px', fontSize: 11, color: 'var(--fg-muted)' }}>{item.unidad || '—'}</td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" type="number" min="0" step="0.01" style={{ ...inputSt, width: '100%', textAlign: 'right' }}
                                                        value={item.costo_unit} onChange={e => updItem('materiales', idx, 'costo_unit', e.target.value)} />
                                                    </td>
                                                  </>
                                                ) : (
                                                  <>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" style={{ ...inputSt, width: '100%' }} placeholder="Descripción..."
                                                        value={item.descripcion} onChange={e => updItem(key, idx, 'descripcion', e.target.value)} />
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" type="number" min="0" step="0.01" style={{ ...inputSt, width: '100%', textAlign: 'right' }}
                                                        value={item.cantidad} onChange={e => updItem(key, idx, 'cantidad', e.target.value)} />
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" style={{ ...inputSt, width: '100%' }} placeholder="und"
                                                        value={item.unidad} onChange={e => updItem(key, idx, 'unidad', e.target.value)} />
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                      <input className="input" type="number" min="0" step="0.01" style={{ ...inputSt, width: '100%', textAlign: 'right' }}
                                                        value={item.costo_unit} onChange={e => updItem(key, idx, 'costo_unit', e.target.value)} />
                                                    </td>
                                                  </>
                                                )}
                                                <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 600 }}>
                                                  {item.subtotal > 0 ? money(item.subtotal, monSym) : '—'}
                                                </td>
                                                <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                                                  <button type="button" className="icon-btn" style={{ fontSize: 11 }} onClick={() => removeItem(key, idx)}>{I.x}</button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => addItem(key)}>
                                        {I.plus} Agregar ítem
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700, background: 'var(--bg-subtle)' }}>
                          <td />
                          <td>Total</td>
                          <td className="num">{costoEstTotal > 0 ? money(costoEstTotal, monSym) : '—'}</td>
                          <td className="num">{costoRealTotal > 0 ? money(costoRealTotal, monSym) : '—'}</td>
                          <td className="num" style={{ color: varColor(varPct(costoEstTotal || null, costoRealTotal > 0 ? costoRealTotal : null)), fontWeight: 700 }}>
                            {costoEstTotal > 0 && costoRealTotal > 0 ? `${margen <= 0 ? '+' : ''}${-margen}%` : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Margen */}
                  <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Margen actual</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: margen >= 0 ? 'var(--green)' : 'var(--danger)' }}>{margen}%</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
                      {cierreOT ? 'Basado en datos del cierre técnico' : 'Basado en partes aprobados — pendiente de cierre'}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    {partesAprobados.length > 0 && (
                      <div>
                        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => recalcularCostoRealOT(sel.id)}>
                          Recalcular costo real
                        </button>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>Recalcula MO con la tarifa actual de cada técnico</div>
                      </div>
                    )}
                    <button className="btn btn-primary" style={{ fontSize: 13, marginLeft: 'auto' }} onClick={guardarEstimado}>
                      Guardar estimado
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── TAB EVIDENCIAS ── */}
            {activeTab === 'Evidencias' && (() => {
              const evidenciasOT = partesOT.flatMap(p =>
                (p.evidencias || []).map(ev => ({ ...ev, parte_numero: p.id, parte_fecha: p.fecha, tecnico: p.tecnico }))
              );
              return (
                <div style={{padding:22}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                    <div>
                      <h3 style={{margin:0}}>Evidencias</h3>
                      <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>Archivos adjuntos a los partes diarios de esta OT</div>
                    </div>
                  </div>
                  {evidenciasOT.length === 0 ? (
                    <div style={{padding:48, textAlign:'center', color:'var(--fg-muted)', border:'2px dashed var(--border)', borderRadius:8}}>
                      <div style={{fontSize:36, marginBottom:8}}>📎</div>
                      <div style={{fontWeight:600, marginBottom:6}}>Sin evidencias registradas</div>
                      <div style={{fontSize:12}}>Las fotos y documentos adjuntos al registrar partes diarios aparecerán aquí automáticamente.</div>
                    </div>
                  ) : (
                    <div style={{display:'flex', flexWrap:'wrap', gap:12}}>
                      {evidenciasOT.map((ev, idx) => (
                        <div key={idx} style={{width:120, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', background:'var(--surface)'}}>
                          <div style={{width:'100%', height:80, background:'var(--bg-subtle)', display:'flex', alignItems:'center', justifyContent:'center'}}>
                            {ev.tipo?.startsWith('image/') && ev.url ? (
                              <img src={ev.url} alt={ev.nombre} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                            ) : (
                              <span style={{fontSize:32}}>📄</span>
                            )}
                          </div>
                          <div style={{padding:'6px 8px'}}>
                            <div style={{fontSize:11, fontWeight:600, color:'var(--fg)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={ev.nombre}>{ev.nombre}</div>
                            <div style={{fontSize:10, color:'var(--fg-muted)', marginTop:2}}>{ev.tecnico} · {ev.parte_fecha}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── TAB HISTORIAL ── */}
            {activeTab === 'Historial' && (
              <div style={{padding:22}}>
                <h3 style={{marginBottom:16}}>Historial de eventos</h3>
                {historialOT.length > 0 ? (
                  <div style={{position:'relative'}}>
                    <div style={{position:'absolute', left:13, top:8, bottom:8, width:2, background:'var(--border)', borderRadius:2}}/>
                    <div style={{display:'flex', flexDirection:'column', gap:14}}>
                      {historialOT.map(ev => (
                        <div key={ev.id} style={{display:'flex', gap:16, paddingLeft:36, position:'relative'}}>
                          <div style={{
                            position:'absolute', left:6, top:8, width:16, height:16, borderRadius:'50%',
                            background: ev.tipo==='creacion'?'var(--cyan)':ev.tipo==='parte'?'var(--green)':ev.tipo==='cierre'?'var(--purple)':'var(--border)',
                            border:'2px solid var(--bg-card)',
                          }}/>
                          <div style={{flex:1, padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:6}}>
                            <div style={{display:'flex', justifyContent:'space-between', gap:12}}>
                              <div style={{fontSize:13, fontWeight:600}}>{ev.evento}</div>
                              <div style={{fontSize:11, color:'var(--fg-muted)', flexShrink:0}}>{ev.fecha}</div>
                            </div>
                            {ev.usuario !== '—' && <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:3}}>{ev.usuario}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-muted" style={{padding:32, textAlign:'center'}}>No hay eventos registrados.</div>
                )}
              </div>
            )}
            </div>

          </div>
        </div>
      </>}

      {showCierreForm && sel && (() => {
        const partesAprobados = partes.filter(p => p.ot_id === sel.id && p.estado === 'aprobado');
        const costoHoraTecObj = (tec) => { const e = Number(tec?.costo_hora_real ?? tec?.costo ?? tec?.costo_hora ?? 0); if (e > 0) return e; return Math.round(Number(tec?.remuneracion ?? 0) / 240 * 100) / 100; };
        const tecResp = [...(personalOperativo || []), ...(personalAdmin || [])].find(t => t.id === sel.tecnico_responsable_id);
        const moReal = Number(cierreForm.horas_total || 0) * costoHoraTecObj(tecResp);
        const matReal = partesAprobados.reduce((s, p) => s + (p.materiales_usados || []).reduce((sm, m) => sm + (m.costo_unitario || 0) * (m.cantidad || 0), 0), 0);
        const costoEst = sel.costoEst || 0;
        const costoReal = moReal + matReal + Number(cierreForm.costo_terceros || 0) + Number(cierreForm.costo_logistica || 0);
        const margen = costoEst > 0 ? Math.round(((costoEst - costoReal) / costoEst) * 100) : null;
        const sym = otSym(sel);
        return (
          <>
            <div className="side-panel-backdrop" onClick={() => setShowCierreForm(false)}/>
            <div className="side-panel" style={{width:'min(680px, 96vw)'}}>
              <div className="side-panel-head">
                <div>
                  <div style={{fontSize:11, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:4}}>Cierre técnico</div>
                  <h2 style={{margin:0, fontSize:18}}>{sel.numero}</h2>
                </div>
                <button className="icon-btn" onClick={() => setShowCierreForm(false)}>{I.x}</button>
              </div>

              <div style={{flex:1, overflowY:'auto', minHeight:0}}>
              {/* ── Sección 1: Resumen de ejecución ── */}
              <div style={{padding:'20px 24px', borderBottom:'1px solid var(--border)'}}>
                <div style={{fontWeight:700, fontSize:13, marginBottom:14, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:.5}}>1. Resumen de ejecución</div>
                <div className="input-group" style={{marginBottom:12}}>
                  <label>Descripción del trabajo ejecutado</label>
                  <textarea className="input" rows={4} value={cierreForm.descripcion_trabajo} onChange={e => setCierreForm(v => ({...v, descripcion_trabajo: e.target.value}))} placeholder="Resumen de las actividades realizadas..." style={{resize:'vertical'}}/>
                </div>
                <div className="grid-2" style={{gap:12, marginBottom:12}}>
                  <div className="input-group">
                    <label>Fecha real de inicio</label>
                    <input className="input" type="date" value={cierreForm.fecha_inicio_real} onChange={e => setCierreForm(v => ({...v, fecha_inicio_real: e.target.value}))}/>
                  </div>
                  <div className="input-group">
                    <label>Fecha real de fin</label>
                    <input className="input" type="date" value={cierreForm.fecha_fin_real} onChange={e => setCierreForm(v => ({...v, fecha_fin_real: e.target.value}))}/>
                  </div>
                </div>
                <div className="grid-2" style={{gap:12}}>
                  <div className="input-group">
                    <label>Total horas trabajadas</label>
                    <input className="input" type="number" min="0" step="0.5" value={cierreForm.horas_total} onChange={e => setCierreForm(v => ({...v, horas_total: e.target.value}))}/>
                  </div>
                  <div className="input-group">
                    <label>Avance final (%)</label>
                    <input className="input" type="number" min="0" max="100" value={cierreForm.avance_final} onChange={e => setCierreForm(v => ({...v, avance_final: e.target.value}))}/>
                  </div>
                </div>
              </div>

              {/* ── Sección 2: Costos (solo con permiso) ── */}
              {canCost && (
                <div style={{padding:'20px 24px', borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:700, fontSize:13, marginBottom:14, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:.5}}>2. Resumen de costos</div>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border)'}}>
                        <th style={{textAlign:'left', padding:'6px 0', color:'var(--fg-muted)', fontWeight:600}}>Concepto</th>
                        <th style={{textAlign:'right', padding:'6px 0', color:'var(--fg-muted)', fontWeight:600}}>Estimado</th>
                        <th style={{textAlign:'right', padding:'6px 0', color:'var(--fg-muted)', fontWeight:600}}>Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Mano de obra', sel.est_mo ?? null, moReal],
                        ['Materiales', sel.est_materiales ?? null, matReal],
                      ].map(([label, est, real]) => (
                        <tr key={label} style={{borderBottom:'1px solid var(--border-subtle)'}}>
                          <td style={{padding:'8px 0'}}>{label}</td>
                          <td style={{textAlign:'right', padding:'8px 0', color:'var(--fg-muted)'}}>{est != null ? money(est, sym) : '—'}</td>
                          <td style={{textAlign:'right', padding:'8px 0', fontWeight: real > 0 ? 600 : 400, color:'var(--fg-muted)', fontSize:12}}>{real > 0 ? money(real, sym) : '—'} <span style={{fontSize:10, color:'var(--fg-muted)'}}>auto</span></td>
                        </tr>
                      ))}
                      <tr style={{borderBottom:'1px solid var(--border-subtle)'}}>
                        <td style={{padding:'6px 0'}}>Servicios terceros</td>
                        <td style={{textAlign:'right', padding:'6px 0', color:'var(--fg-muted)'}}>{sel.est_terceros != null ? money(sel.est_terceros, sym) : '—'}</td>
                        <td style={{textAlign:'right', padding:'4px 0'}}><input className="input" type="number" min="0" step="0.01" value={cierreForm.costo_terceros} onChange={e => setCierreForm(v => ({...v, costo_terceros: e.target.value}))} style={{width:110, textAlign:'right', padding:'4px 8px', fontSize:13}}/></td>
                      </tr>
                      <tr style={{borderBottom:'1px solid var(--border-subtle)'}}>
                        <td style={{padding:'6px 0'}}>Logística y viáticos</td>
                        <td style={{textAlign:'right', padding:'6px 0', color:'var(--fg-muted)'}}>{sel.est_logistica != null ? money(sel.est_logistica, sym) : '—'}</td>
                        <td style={{textAlign:'right', padding:'4px 0'}}><input className="input" type="number" min="0" step="0.01" value={cierreForm.costo_logistica} onChange={e => setCierreForm(v => ({...v, costo_logistica: e.target.value}))} style={{width:110, textAlign:'right', padding:'4px 8px', fontSize:13}}/></td>
                      </tr>
                      <tr style={{borderTop:'2px solid var(--border)'}}>
                        <td style={{padding:'8px 0', fontWeight:700}}>Total</td>
                        <td style={{textAlign:'right', padding:'8px 0', fontWeight:700, color:'var(--fg-muted)'}}>{costoEst > 0 ? money(costoEst, sym) : '—'}</td>
                        <td style={{textAlign:'right', padding:'8px 0', fontWeight:700, color: costoReal > costoEst && costoEst > 0 ? 'var(--danger)' : 'var(--green)'}}>{money(costoReal, sym)}</td>
                      </tr>
                      {margen !== null && (
                        <tr>
                          <td colSpan={3} style={{textAlign:'right', fontSize:12, padding:'4px 0', color: margen < 0 ? 'var(--danger)' : 'var(--green)'}}>
                            Margen: <strong>{margen > 0 ? '+' : ''}{margen}%</strong>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Sección 3: Conformidad del cliente ── */}
              <div style={{padding:'20px 24px', borderBottom:'1px solid var(--border)'}}>
                <div style={{fontWeight:700, fontSize:13, marginBottom:14, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:.5}}>3. Conformidad del cliente</div>
                <div className="col" style={{gap:10}}>
                  {[
                    { val: 'digital', label: 'Sí — firma digital', desc: 'Se genera un link único para que el cliente firme en línea con nombre y DNI.' },
                    { val: 'fisico', label: 'Sí — documento físico', desc: 'Adjunta el documento de conformidad firmado (PDF o imagen).' },
                    { val: 'pendiente', label: 'No — pendiente', desc: 'La OT se cierra técnicamente. La conformidad queda pendiente.' },
                  ].map(opt => (
                    <label key={opt.val} style={{display:'flex', gap:12, padding:'12px 14px', borderRadius:8, border:`1.5px solid ${cierreForm.conformidad === opt.val ? 'var(--cyan)' : 'var(--border)'}`, background: cierreForm.conformidad === opt.val ? 'color-mix(in srgb, var(--cyan) 6%, transparent)' : 'var(--bg)', cursor:'pointer'}}>
                      <input type="radio" name="conformidad" value={opt.val} checked={cierreForm.conformidad === opt.val} onChange={() => setCierreForm(v => ({...v, conformidad: opt.val, conformidad_archivo: null}))} style={{marginTop:2, flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600, fontSize:13, display:'flex', alignItems:'center', gap:6}}>
                          {opt.label}
                          {opt.val === 'pendiente' && <span className="badge badge-orange" style={{fontSize:10}}>Queda pendiente</span>}
                        </div>
                        <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{opt.desc}</div>
                        {opt.val === 'fisico' && cierreForm.conformidad === 'fisico' && (
                          <div style={{marginTop:10}}>
                            <input type="file" accept=".pdf,image/*" style={{display:'none'}} id="conf-archivo-input"
                              onChange={e => { const f = e.target.files?.[0]; if (f) setCierreForm(v => ({...v, conformidad_archivo: f})); }}
                            />
                            {cierreForm.conformidad_archivo ? (
                              <div style={{display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--bg-subtle)', borderRadius:6, fontSize:12}}>
                                <span>📄</span>
                                <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{cierreForm.conformidad_archivo.name}</span>
                                <button type="button" className="btn btn-ghost" style={{fontSize:11, padding:'2px 6px'}} onClick={() => setCierreForm(v => ({...v, conformidad_archivo: null}))}>Quitar</button>
                              </div>
                            ) : (
                              <label htmlFor="conf-archivo-input" className="btn btn-secondary" style={{fontSize:12, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}>
                                + Adjuntar documento
                              </label>
                            )}
                          </div>
                        )}
                        {opt.val === 'digital' && cierreForm.conformidad === 'digital' && (
                          <div style={{marginTop:8, padding:'8px 10px', background:'color-mix(in srgb, var(--cyan) 8%, transparent)', borderRadius:6, fontSize:12, color:'var(--fg-muted)'}}>
                            Al confirmar el cierre se generará un link único. Cópialo y envíaselo al cliente para que firme en línea.
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Sección 4: Observaciones finales ── */}
              <div style={{padding:'20px 24px'}}>
                <div style={{fontWeight:700, fontSize:13, marginBottom:14, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:.5}}>4. Observaciones finales</div>
                <div className="input-group">
                  <label>Notas del supervisor <span className="text-muted">(lecciones aprendidas, garantías, próximas intervenciones...)</span></label>
                  <textarea className="input" rows={3} value={cierreForm.observaciones_finales} onChange={e => setCierreForm(v => ({...v, observaciones_finales: e.target.value}))} placeholder="Opcional" style={{resize:'vertical'}}/>
                </div>
              </div>
              </div>{/* fin scroll */}

              {/* ── Pie ── */}
              <div style={{padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, background:'var(--bg-card)'}}>
                <button className="btn btn-ghost" onClick={() => setShowCierreForm(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={!cierreForm.fecha_fin_real} onClick={confirmarCierreOT}>
                  {I.check} Confirmar cierre
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {cierreConfirmandoLink && (
        <>
          <div className="modal-backdrop" onClick={() => setCierreConfirmandoLink(null)}/>
          <div className="modal" style={{maxWidth:480}}>
            <div className="modal-head">
              <h3 style={{margin:0}}>Link de firma generado</h3>
              <button className="icon-btn" onClick={() => setCierreConfirmandoLink(null)}>×</button>
            </div>
            <div style={{padding:'20px 24px'}}>
              <p style={{fontSize:13, color:'var(--fg-muted)', marginBottom:16}}>Copia este link y envíaselo al cliente para que firme la conformidad en línea con su nombre y DNI.</p>
              <div style={{display:'flex', gap:8, alignItems:'center', padding:'10px 12px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)'}}>
                <span style={{flex:1, fontSize:12, wordBreak:'break-all', color:'var(--fg-muted)'}}>{cierreConfirmandoLink}</span>
                <button className="btn btn-secondary" style={{flexShrink:0, fontSize:12}} onClick={() => { navigator.clipboard?.writeText(cierreConfirmandoLink); }}>Copiar</button>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => setCierreConfirmandoLink(null)}>Listo</button>
            </div>
          </div>
        </>
      )}

      {panelNuevaOT && (
        <>
          <div className="side-panel-backdrop" onClick={cerrarPanelNuevaOT}/>
          <div className="side-panel" style={{width:'min(580px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Formulario de registro</div>
                <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>Nueva Orden de Trabajo</div>
              </div>
              <button className="icon-btn" onClick={cerrarPanelNuevaOT}>×</button>
            </div>
            <div className="side-panel-body">
              {errorNuevaOT && <div className="alert alert-danger" style={{marginBottom:16}}>{errorNuevaOT}</div>}

              <div className="eyebrow" style={{marginBottom:12}}>Clasificación</div>
              <div className="grid-2" style={{gap:16, marginBottom:20}}>
                <div className="input-group">
                  <label>Tipo de OT <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" value={formNuevaOT.tipo} onChange={e => updNuevaOT('tipo', e.target.value)}>
                    <option value="cliente">Servicio Cliente</option>
                    <option value="interna">Interna</option>
                    <option value="correctiva">Correctiva</option>
                    <option value="preventiva">Preventiva</option>
                    <option value="tercerizada">Tercerizada</option>
                    <option value="garantia">Garantía</option>
                    <option value="emergencia">Emergencia</option>
                    <option value="proyecto">Proyecto</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Prioridad</label>
                  <select className="select" value={formNuevaOT.prioridad} onChange={e => updNuevaOT('prioridad', e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="urgente">Urgente</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
              </div>

              {puedeTenerOSCliente && (
                <>
                  <div className="eyebrow" style={{marginBottom:12}}>OS Cliente vinculada</div>
                  <div className="input-group" style={{marginBottom:20}}>
                    <label>OS Cliente {debeTenerOSCliente && <span style={{color:'var(--danger)'}}>*</span>}</label>
                    <select className="select" value={formNuevaOT.os_cliente_id} onChange={e => updNuevaOT('os_cliente_id', e.target.value)}>
                      <option value="">{debeTenerOSCliente ? 'Seleccionar OS Cliente...' : 'Sin OS Cliente vinculada'}</option>
                      {osClientes.filter(o => !['cerrada','anulada'].includes(o.estado)).map(o => (
                        <option key={o.id} value={o.id}>{o.numero} — {cuentas.find(c => c.id === o.cuenta_id)?.razon_social || o.cuenta_id}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="eyebrow" style={{marginBottom:12}}>Vinculación contable</div>
              <div className="grid-2" style={{gap:16, marginBottom:20}}>
                <div className="input-group">
                  <label>CECO <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" value={formNuevaOT.centro_costo_id} onChange={e => updNuevaOT('centro_costo_id', e.target.value)}>
                    <option value="">{cecosActivos.length ? 'Seleccionar CECO...' : 'Sin CECOs activos — crea uno en Maestros Base'}</option>
                    {cecosActivos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>CEBE</label>
                  {formNuevaOT.os_cliente_id ? (
                    <input className="input" readOnly style={{opacity:0.75}}
                      value={cebeHeredado ? `${cebeHeredado.codigo ? cebeHeredado.codigo + ' - ' : ''}${cebeHeredado.nombre}` : ''}
                      placeholder={formNuevaOT.os_cliente_id ? 'Sin CEBE en la OS — asígnalo primero' : 'Se hereda de la OS Cliente'}
                    />
                  ) : (
                    <select className="select" value={formNuevaOT.centro_beneficio_id} onChange={e => updNuevaOT('centro_beneficio_id', e.target.value)}>
                      <option value="">{cebesActivos.length ? 'Seleccionar CEBE...' : 'Sin CEBEs activos — crea uno en Maestros Base'}</option>
                      {cebesActivos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div className="eyebrow" style={{marginBottom:12}}>Detalle del trabajo</div>
              <div className="grid-2" style={{gap:16, marginBottom:20}}>
                <div className="input-group">
                  <label>Servicio / tipo de trabajo</label>
                  {itemsCotizacion.length > 0 ? (
                    <>
                      <input className="input" list="svc-sugerencias-nueva-ot" value={formNuevaOT.servicio} onChange={e => updNuevaOT('servicio', e.target.value)} placeholder="Elige de la cotización o escribe..." />
                      <datalist id="svc-sugerencias-nueva-ot">
                        {itemsCotizacion.map((s, i) => <option key={i} value={s} />)}
                      </datalist>
                    </>
                  ) : tiposActivos.length > 0 ? (
                    <select className="select" value={formNuevaOT.servicio} onChange={e => updNuevaOT('servicio', e.target.value)}>
                      <option value="">Seleccionar servicio...</option>
                      {tiposActivos.map(t => <option key={t.id} value={t.nombre}>{t.codigo ? `[${t.codigo}] ` : ''}{t.nombre}</option>)}
                    </select>
                  ) : (
                    <input className="input" value={formNuevaOT.servicio} onChange={e => updNuevaOT('servicio', e.target.value)} placeholder="Ej. Mantenimiento preventivo" />
                  )}
                </div>
                <div className="input-group">
                  <label>Responsable técnico</label>
                  <select className="select" value={formNuevaOT.tecnico_responsable_id} onChange={e => updNuevaOT('tecnico_responsable_id', e.target.value)}>
                    <option value="">Sin asignar</option>
                    {personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Fecha fin comprometida</label>
                  <input className="input" type="date" value={formNuevaOT.fecha_programada} onChange={e => updNuevaOT('fecha_programada', e.target.value)} />
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Descripción / alcance</label>
                  <textarea className="input" rows="3" value={formNuevaOT.descripcion} onChange={e => updNuevaOT('descripcion', e.target.value)} placeholder="Describe el trabajo a realizar..." />
                </div>
              </div>

              <div className="eyebrow" style={{marginBottom:12}}>Estimado de costos <span style={{fontSize:11, fontWeight:400, color:'var(--fg-muted)'}}>— opcional</span></div>
              {formNuevaOT.os_cliente_id && !hcReferencia && (
                <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom:12, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:6}}>
                  Sin hoja de costeo vinculada. El estimado es referencial.
                </div>
              )}
              <div className="grid-2" style={{gap:16, marginBottom:8}}>
                {[
                  { key: 'est_mo', label: 'Mano de obra', hcVal: hcReferencia?.total_mano_obra ?? null },
                  { key: 'est_materiales', label: 'Materiales', hcVal: hcReferencia?.total_materiales ?? null },
                  { key: 'est_terceros', label: 'Servicios terceros', hcVal: hcReferencia?.total_servicios_terceros ?? null },
                  { key: 'est_logistica', label: 'Logística', hcVal: hcReferencia?.total_logistica ?? null },
                ].map(({ key, label, hcVal }) => (
                  <div className="input-group" key={key}>
                    <label style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                      <span>{label}</span>
                      {hcVal != null && <span style={{fontSize:11, color:'var(--fg-muted)', fontWeight:400}}>Ref. HC: {money(hcVal)}</span>}
                    </label>
                    <input className="input" type="number" min="0" step="0.01" value={formNuevaOT[key]} onChange={e => updNuevaOT(key, e.target.value)} placeholder="0.00" />
                  </div>
                ))}
              </div>
              {totalEstimadoNuevaOT > 0 && (
                <div style={{display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:6, marginBottom:20}}>
                  <span style={{fontSize:12, color:'var(--fg-muted)'}}>Total estimado:</span>
                  <span style={{fontWeight:700, fontSize:15}}>{money(totalEstimadoNuevaOT)}</span>
                </div>
              )}
              {totalEstimadoNuevaOT === 0 && <div style={{marginBottom:20}}/>}

              <div className="row" style={{justifyContent:'flex-end', gap:8}}>
                <button className="btn btn-secondary" onClick={cerrarPanelNuevaOT}>Cancelar</button>
                <button className="btn btn-primary" disabled={savingNuevaOT} onClick={submitNuevaOT}>{I.check} {savingNuevaOT ? 'Creando...' : 'Crear OT'}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Partes() {
  const { partes, ots, cuentas, aprobarParteDiario, observarParteDiario, rechazarParteDiario, reabrirParteDiario, enviarParteARevision, navigate } = useApp();
  const [sel, setSel] = useState(null);
  const [modoAccion, setModoAccion] = useState(null); // null | 'aprobar' | 'observar' | 'rechazar' | 'reabrir'
  const [avanceAprobacion, setAvanceAprobacion] = useState(0);
  const [motivoAccion, setMotivoAccion] = useState('');
  const [filtroOT, setFiltroOT] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  const hoy = new Date().toISOString().split('T')[0];
  const getOT = id => ots.find(o => o.id === id);
  const getOTNumero = id => getOT(id)?.numero || '—';
  const getCuenta = otId => {
    const ot = getOT(otId);
    return (cuentas || []).find(c => c.id === ot?.cuenta_id)?.razon_social || '—';
  };

  // Número de parte legible: PD-YYYY-NNNN basado en orden de creación por año
  const partesOrdenados = [...partes].sort((a, b) => (a.created_at || a.fecha || '') < (b.created_at || b.fecha || '') ? -1 : 1);
  const getNumeroParte = p => {
    if (p.numero) return p.numero;
    const anio = (p.created_at || p.fecha || hoy).substring(0, 4);
    const delAnio = partesOrdenados.filter(x => (x.created_at || x.fecha || '').startsWith(anio));
    const idx = delAnio.findIndex(x => x.id === p.id);
    return `PD-${anio}-${String(idx + 1).padStart(4, '0')}`;
  };

  // KPIs
  const partesHoy = partes.filter(p => p.fecha === hoy);
  const pendientesTotal = partes.filter(p => p.estado === 'en_revision').length;
  const aprobadosHoy = partesHoy.filter(p => p.estado === 'aprobado').length;
  const observadosHoy = partesHoy.filter(p => p.estado === 'observado').length;

  // Listas para filtros
  const tecnicosFiltro = [...new Set(partes.map(p => p.tecnico).filter(Boolean))].sort();
  const otsFiltro = ots.filter(o => partes.some(p => p.ot_id === o.id));
  const clientesFiltro = (cuentas || []).filter(c => otsFiltro.some(o => o.cuenta_id === c.id));

  const hayFiltros = filtroOT || filtroTecnico || filtroEstado || filtroDesde || filtroHasta || filtroCliente;
  const partesFiltrados = partes.filter(p => {
    if (filtroOT && p.ot_id !== filtroOT) return false;
    if (filtroTecnico && p.tecnico !== filtroTecnico) return false;
    if (filtroEstado && p.estado !== filtroEstado) return false;
    if (filtroDesde && p.fecha < filtroDesde) return false;
    if (filtroHasta && p.fecha > filtroHasta) return false;
    if (filtroCliente && getOT(p.ot_id)?.cuenta_id !== filtroCliente) return false;
    return true;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Partes Diarios</h1>
          <div className="page-sub">Vista de supervisión · {partes.length} partes totales</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20}}>
        <div className="card" style={{padding:'14px 18px'}}>
          <div className="eyebrow" style={{marginBottom:6}}>Total partes del día</div>
          <div style={{fontSize:28, fontWeight:800, color:'var(--navy)'}}>{partesHoy.length}</div>
        </div>
        <div className="card" style={{padding:'14px 18px', borderLeft:'3px solid var(--orange)'}}>
          <div className="eyebrow" style={{marginBottom:6}}>Pendientes de aprobación</div>
          <div style={{fontSize:28, fontWeight:800, color:'var(--orange)'}}>{pendientesTotal}</div>
        </div>
        <div className="card" style={{padding:'14px 18px', borderLeft:'3px solid var(--green)'}}>
          <div className="eyebrow" style={{marginBottom:6}}>Aprobados hoy</div>
          <div style={{fontSize:28, fontWeight:800, color:'var(--green)'}}>{aprobadosHoy}</div>
        </div>
        <div className="card" style={{padding:'14px 18px', borderLeft:'3px solid var(--danger)'}}>
          <div className="eyebrow" style={{marginBottom:6}}>Observados hoy</div>
          <div style={{fontSize:28, fontWeight:800, color:'var(--danger)'}}>{observadosHoy}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{padding:'12px 16px', marginBottom:12}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr auto', gap:8, alignItems:'end'}}>
          <select className="select" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientesFiltro.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
          <select className="select" value={filtroOT} onChange={e => setFiltroOT(e.target.value)}>
            <option value="">Todas las OTs</option>
            {otsFiltro.map(o => <option key={o.id} value={o.id}>{o.numero}</option>)}
          </select>
          <select className="select" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}>
            <option value="">Todos los técnicos</option>
            {tecnicosFiltro.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="en_revision">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="observado">Observado</option>
          </select>
          <input className="input" type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} title="Fecha desde" />
          <input className="input" type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} title="Fecha hasta" />
          {hayFiltros && <button className="btn btn-ghost" style={{fontSize:12, whiteSpace:'nowrap'}} onClick={() => { setFiltroOT(''); setFiltroTecnico(''); setFiltroEstado(''); setFiltroDesde(''); setFiltroHasta(''); setFiltroCliente(''); }}>✕ Limpiar</button>}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° Parte</th><th>OT</th><th>Cliente</th><th>Técnico</th>
                <th>Fecha</th><th className="num">Horas</th><th>Avance rep.</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {partesFiltrados.map(p => (
                <tr key={p.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => setSel(p)}>
                  <td className="mono" style={{fontWeight:600}}>{getNumeroParte(p)}</td>
                  <td className="mono">{getOTNumero(p.ot_id)}</td>
                  <td style={{maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{getCuenta(p.ot_id)}</td>
                  <td style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>{p.tecnico}{['campo','mobile'].includes(p.origen) && <span className="badge badge-cyan" style={{fontSize:10}}>{I.camera}Campo</span>}</td>
                  <td className="text-muted">{p.fecha}</td>
                  <td className="num">{p.horas}h</td>
                  <td style={{width:110}}>
                    <div className="bar"><div style={{width:(p.avance_reportado||0)+'%', background:'var(--cyan)'}}/></div>
                    <div style={{fontSize:11, marginTop:2}}>+{p.avance_reportado||0}%</div>
                  </td>
                  <td>
                    <span className={`badge ${p.estado==='aprobado'?'badge-green':p.estado==='rechazado'?'badge-red':p.estado==='observado'?'badge-orange':p.estado==='borrador'?'badge-gray':'badge-orange'}`}>
                      {p.estado === 'en_revision' ? 'Pendiente' : p.estado === 'borrador' ? 'Borrador' : p.estado === 'rechazado' ? 'Rechazado' : p.estado.replace('_', ' ')}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{whiteSpace:'nowrap'}}>
                    {['borrador','rechazado','observado'].includes(p.estado) && (
                      <button className="btn btn-primary" style={{fontSize:11, padding:'2px 8px'}} onClick={() => enviarParteARevision(p.id)}>Enviar a revisión</button>
                    )}
                    {p.estado === 'en_revision' && <>
                      <button className="btn btn-primary" style={{fontSize:11, padding:'2px 8px', marginRight:4}} onClick={() => aprobarParteDiario(p.id)}>{I.check}</button>
                      <button className="btn btn-secondary" style={{fontSize:11, padding:'2px 8px', color:'var(--danger)'}} onClick={() => observarParteDiario(p.id)}>Obs.</button>
                    </>}
                  </td>
                </tr>
              ))}
              {partesFiltrados.length === 0 && (
                <tr><td colSpan="9" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                  {hayFiltros ? 'Sin partes con los filtros aplicados.' : 'No hay partes diarios registrados.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel lateral de detalle / revisión */}
      {sel && (() => {
        const estadoBadge = sel.estado === 'aprobado' ? 'badge-green' : sel.estado === 'rechazado' ? 'badge-red' : sel.estado === 'observado' ? 'badge-orange' : sel.estado === 'con_restriccion' ? 'badge-red' : sel.estado === 'borrador' ? 'badge-gray' : 'badge-orange';
        const estadoLabel = { aprobado: 'Aprobado', rechazado: 'Rechazado', observado: 'Observado', con_restriccion: 'Con restricción', borrador: 'Borrador', en_revision: 'Pendiente revisión' }[sel.estado] || sel.estado;
        const revisable = ['en_revision', 'con_restriccion'].includes(sel.estado);
        const avanceParte = sel.avance_validado !== undefined ? sel.avance_validado : sel.avance_reportado || 0;
        const parteHealthColor = sel.estado === 'aprobado' ? 'var(--green)' : sel.estado === 'rechazado' ? 'var(--danger)' : sel.estado === 'observado' ? 'var(--orange)' : 'var(--cyan)';
        const parteHealthBg = sel.estado === 'aprobado' ? 'rgba(16,185,129,0.08)' : sel.estado === 'rechazado' ? 'rgba(239,68,68,0.08)' : sel.estado === 'observado' ? 'rgba(249,115,22,0.08)' : 'rgba(0,188,212,0.08)';
        const cerrarPanel = () => { setSel(null); setModoAccion(null); setMotivoAccion(''); setAvanceAprobacion(0); };
        return (<>
          <div className="side-panel-backdrop" onClick={cerrarPanel}/>
          <div className="side-panel ficha-detail-panel parte-review-panel" style={{width:'min(560px, 96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Revision de parte diario</div>
                <div className="font-display ficha-detail-title mono" style={{marginTop:4}}>{getNumeroParte(sel)}</div>
              </div>
              <button className="icon-btn" onClick={cerrarPanel}>{I.x}</button>
            </div>
            <div className="side-panel-body">

              <div className="parte-review-chips">
                <span className={`badge ${estadoBadge}`}>{estadoLabel}</span>
                {['campo','mobile'].includes(sel.origen) && <span className="badge badge-cyan" style={{fontSize:10}}>{I.camera}Campo</span>}
                <button className="btn btn-ghost" style={{padding:0, color:'var(--cyan)', fontWeight:600, fontSize:12}} onClick={() => { cerrarPanel(); navigate('ot', { detail: sel.ot_id }); }}>{getOTNumero(sel.ot_id)} ↗</button>
                <span className="badge badge-gray">{getCuenta(sel.ot_id)}</span>
                {sel.es_restriccion && <span className="badge badge-red">Restriccion reportada</span>}
              </div>

              <div className="parte-review-health" style={{background:parteHealthBg}}>
                <div className="parte-review-score" style={{color:parteHealthColor}}>{avanceParte}%</div>
                <div className="parte-review-health-copy">
                  <div><span style={{borderColor:parteHealthColor, color:parteHealthColor}}>{sel.es_restriccion ? 'Requiere atencion' : estadoLabel}</span></div>
                  <div className="text-muted">{sel.horas}h registradas - {sel.fecha}</div>
                </div>
                <div className="parte-review-progress">
                  <div style={{width:`${Math.min(100, Math.max(0, avanceParte))}%`, background:parteHealthColor}}/>
                </div>
              </div>

              <div className="parte-review-metrics">
                <div><span>Tecnico</span><strong>{sel.tecnico}</strong></div>
                <div><span>Fecha</span><strong>{sel.fecha}</strong></div>
                <div><span>Horas</span><strong>{sel.horas}h</strong></div>
                <div><span>Avance global</span><strong style={{color:'var(--cyan)'}}>{avanceParte}%{sel.avance_ajustado_manual && <em>Ajustado</em>}</strong></div>
              </div>

              <div className="ficha-detail-content parte-review-content">

                {/* Tareas trabajadas */}
                {(sel.tareas_trabajadas?.length || 0) > 0 && (
                  <div className="parte-review-section">
                    <div className="parte-review-section-title">Tareas trabajadas</div>
                    <div className="col" style={{gap:6}}>
                      {sel.tareas_trabajadas.map((t, i) => (
                        <div key={i} className="parte-review-item">
                          <div style={{fontSize:13}}>{t.nombre}</div>
                          <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
                            <span className={`badge ${t.estado_actual==='completada'?'badge-green':t.estado_actual==='en_progreso'?'badge-orange':'badge-gray'}`} style={{fontSize:10}}>{t.estado_actual}</span>
                            {t.avance_hoy > 0 && <span style={{fontSize:12, fontWeight:600, color:'var(--cyan)'}}>+{t.avance_hoy}%</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actividades adicionales */}
                {(sel.actividades_adicionales?.length || 0) > 0 && (
                  <div className="parte-review-section">
                    <div className="parte-review-section-title">Actividades adicionales</div>
                    <div className="col" style={{gap:6}}>
                      {sel.actividades_adicionales.filter(a => a.descripcion).map((a, i) => (
                        <div key={i} className="parte-review-item">
                          <div style={{fontSize:13}}>{a.descripcion}</div>
                          {a.avance_estimado > 0 && <span style={{fontSize:12, fontWeight:600, color:'var(--cyan)', flexShrink:0}}>+{a.avance_estimado}%</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Texto libre de actividades (partes legacy sin tareas/actividades_adicionales) */}
                {!(sel.tareas_trabajadas?.length) && !(sel.actividades_adicionales?.length) && sel.actividades && (
                  <div className="parte-review-section">
                    <div className="parte-review-section-title">Actividades realizadas</div>
                    <div className="parte-review-note">{sel.actividades}</div>
                  </div>
                )}

                {/* Materiales */}
                {(sel.materiales_usados?.length || 0) > 0 && (
                  <div>
                    <div style={{fontWeight:600, fontSize:13, marginBottom:8}}>Materiales usados</div>
                    <table className="tbl" style={{fontSize:12}}>
                      <thead><tr><th>SKU</th><th>Descripción</th><th className="num">Cant.</th></tr></thead>
                      <tbody>
                        {sel.materiales_usados.map((m, i) => <tr key={i}><td className="mono text-muted">{m.sku}</td><td>{m.nombre}</td><td className="num">{m.cantidad}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Terceros */}
                {(sel.terceros_lineas?.length || 0) > 0 && (
                  <div>
                    <div style={{fontWeight:600, fontSize:13, marginBottom:8}}>Servicios de terceros</div>
                    <table className="tbl" style={{fontSize:12}}>
                      <thead><tr><th>Descripción</th><th className="num">Monto</th></tr></thead>
                      <tbody>
                        {sel.terceros_lineas.map((l, i) => (
                          <tr key={i}>
                            <td>{l.descripcion}</td>
                            <td className="num" style={{fontWeight:600}}>{Number(l.monto || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Logística */}
                {(sel.logistica_lineas?.length || 0) > 0 && (
                  <div>
                    <div style={{fontWeight:600, fontSize:13, marginBottom:8}}>Logística y viáticos</div>
                    <table className="tbl" style={{fontSize:12}}>
                      <thead><tr><th>Descripción</th><th className="num">Monto</th></tr></thead>
                      <tbody>
                        {sel.logistica_lineas.map((l, i) => (
                          <tr key={i}>
                            <td>{l.descripcion}</td>
                            <td className="num" style={{fontWeight:600}}>{Number(l.monto || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Evidencias */}
                {(sel.evidencias?.length || 0) > 0 && (
                  <div>
                    <div style={{fontWeight:600, fontSize:13, marginBottom:8}}>Evidencias ({sel.evidencias.length})</div>
                    <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                      {sel.evidencias.map((ev, i) => (
                        <div key={i} style={{width:72, height:72, borderRadius:6, overflow:'hidden', border:'1px solid var(--border)', background:'var(--bg-subtle)', display:'flex', alignItems:'center', justifyContent:'center'}} title={ev.nombre}>
                          {ev.tipo?.startsWith('image/') && ev.url ? <img src={ev.url} alt={ev.nombre} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span style={{fontSize:24}}>📄</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observaciones / Restricción */}
                {sel.observaciones && (
                  <div>
                    <div style={{fontWeight:600, fontSize:13, marginBottom:8, display:'flex', alignItems:'center', gap:8}}>
                      Observaciones
                      {sel.es_restriccion && <span className="badge badge-red" style={{fontSize:10}}>⚠ Con restricción</span>}
                    </div>
                    <div style={{background: sel.es_restriccion ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : 'var(--bg-subtle)', padding:12, borderRadius:6, fontSize:13, lineHeight:1.6, border: sel.es_restriccion ? '1px solid var(--danger)' : 'none'}}>{sel.observaciones}</div>
                  </div>
                )}

                {/* Motivo de observación/rechazo previo */}
                {sel.motivo_observacion && (
                  <div style={{background:'color-mix(in srgb, var(--orange) 8%, transparent)', border:'1px solid var(--orange)', borderRadius:6, padding:12}}>
                    <div style={{fontWeight:600, fontSize:12, color:'var(--orange)', marginBottom:4}}>Observación del supervisor</div>
                    <div style={{fontSize:13}}>{sel.motivo_observacion}</div>
                  </div>
                )}
                {sel.motivo_rechazo && (
                  <div style={{background:'color-mix(in srgb, var(--danger) 8%, transparent)', border:'1px solid var(--danger)', borderRadius:6, padding:12}}>
                    <div style={{fontWeight:600, fontSize:12, color:'var(--danger)', marginBottom:4}}>Motivo de rechazo</div>
                    <div style={{fontSize:13}}>{sel.motivo_rechazo}</div>
                  </div>
                )}

                {/* ── Reabrir parte aprobado ── */}
                {sel.estado === 'aprobado' && (
                  <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
                    <div style={{padding:'12px 16px', background:'var(--bg-subtle)', fontWeight:600, fontSize:13, borderBottom:'1px solid var(--border)'}}>Corrección</div>
                    {modoAccion !== 'reabrir' ? (
                      <div style={{padding:16}}>
                        <div style={{fontSize:12, color:'var(--fg-muted)', marginBottom:10}}>
                          Reabrir el parte lo devuelve a borrador. Los costos y avance de la OT se recalculan sin este parte hasta que sea re-aprobado.
                        </div>
                        <button className="btn btn-secondary" style={{color:'var(--orange)', borderColor:'var(--orange)'}} onClick={() => setModoAccion('reabrir')}>
                          Reabrir para editar
                        </button>
                      </div>
                    ) : (
                      <div style={{padding:16, gap:12}} className="col">
                        <div style={{fontSize:13, color:'var(--fg-muted)'}}>El parte volverá a borrador y el técnico podrá editarlo. El avance y costo de la OT se recalcularán en ese momento.</div>
                        <div className="input-group">
                          <label style={{fontSize:12}}>Motivo de reapertura <span style={{color:'var(--fg-muted)'}}>(opcional)</span></label>
                          <textarea className="input" rows={2} placeholder="Ej: Error en horas registradas..." value={motivoAccion} onChange={e => setMotivoAccion(e.target.value)} style={{resize:'vertical'}} autoFocus />
                        </div>
                        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setModoAccion(null); setMotivoAccion(''); }}>Cancelar</button>
                          <button className="btn btn-sm" style={{background:'var(--orange)', color:'#fff'}} onClick={() => { reabrirParteDiario(sel.id, motivoAccion); cerrarPanel(); }}>
                            Confirmar reapertura
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Bloque de aprobación ── */}
                {revisable && (
                  <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
                    <div style={{padding:'12px 16px', background:'var(--bg-subtle)', fontWeight:600, fontSize:13, borderBottom:'1px solid var(--border)'}}>Decisión del supervisor</div>

                    {/* Sin modo seleccionado: tres botones */}
                    {!modoAccion && (
                      <div style={{padding:16, display:'flex', gap:8}}>
                        <button className="btn btn-primary" style={{flex:1}} onClick={() => { setModoAccion('aprobar'); setAvanceAprobacion(sel.avance_reportado || 0); }}>{I.check} Aprobar</button>
                        <button className="btn btn-secondary" style={{flex:1}} onClick={() => setModoAccion('observar')}>Observar</button>
                        <button className="btn btn-secondary" style={{flex:1, color:'var(--danger)'}} onClick={() => setModoAccion('rechazar')}>Rechazar</button>
                      </div>
                    )}

                    {/* Modo: Aprobar */}
                    {modoAccion === 'aprobar' && (
                      <div style={{padding:16, gap:12}} className="col">
                        <div style={{fontSize:13, color:'var(--fg-muted)'}}>Confirma el avance final que se sumará a la OT. Puedes ajustarlo si el técnico lo sobreestimó.</div>
                        <div style={{display:'flex', alignItems:'center', gap:10}}>
                          <label style={{fontSize:13, fontWeight:600, whiteSpace:'nowrap'}}>Avance validado:</label>
                          <input className="input" type="number" min="0" max="100" style={{width:80, textAlign:'center', fontWeight:700, fontSize:16}} value={avanceAprobacion} onChange={e => setAvanceAprobacion(Math.min(100, Math.max(0, Number(e.target.value))))} />
                          <span style={{fontSize:14, fontWeight:600}}>%</span>
                        </div>
                        <div style={{fontSize:11, color:'var(--fg-muted)'}}>
                          Esto también registrará salidas de inventario por los materiales usados y sumará el costo de mano de obra al tab Costos de la OT.
                        </div>
                        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setModoAccion(null)}>Cancelar</button>
                          <button className="btn btn-primary btn-sm" onClick={() => { aprobarParteDiario(sel.id, avanceAprobacion); cerrarPanel(); }}>{I.check} Confirmar aprobación</button>
                        </div>
                      </div>
                    )}

                    {/* Modo: Observar */}
                    {modoAccion === 'observar' && (
                      <div style={{padding:16, gap:12}} className="col">
                        <div style={{fontSize:13, color:'var(--fg-muted)'}}>El parte volverá al técnico para corrección. Escribe el motivo — será visible para el técnico.</div>
                        <textarea className="input" rows={3} placeholder="Motivo de la observación (obligatorio)..." value={motivoAccion} onChange={e => setMotivoAccion(e.target.value)} autoFocus style={{resize:'vertical'}} />
                        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setModoAccion(null); setMotivoAccion(''); }}>Cancelar</button>
                          <button className="btn btn-secondary btn-sm" style={{color:'var(--orange)'}} disabled={!motivoAccion.trim()} onClick={() => { observarParteDiario(sel.id, motivoAccion); cerrarPanel(); }}>Enviar observación</button>
                        </div>
                      </div>
                    )}

                    {/* Modo: Rechazar */}
                    {modoAccion === 'rechazar' && (
                      <div style={{padding:16, gap:12}} className="col">
                        <div style={{fontSize:13, color:'var(--fg-muted)'}}>El parte quedará <strong>rechazado definitivamente</strong>. Las horas y materiales no se imputarán a la OT. Escribe el motivo — será visible para el técnico.</div>
                        <textarea className="input" rows={3} placeholder="Motivo del rechazo (obligatorio)..." value={motivoAccion} onChange={e => setMotivoAccion(e.target.value)} autoFocus style={{resize:'vertical', borderColor:'var(--danger)'}} />
                        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setModoAccion(null); setMotivoAccion(''); }}>Cancelar</button>
                          <button className="btn btn-sm" style={{background:'var(--danger)', color:'#fff'}} disabled={!motivoAccion.trim()} onClick={() => { rechazarParteDiario(sel.id, motivoAccion); cerrarPanel(); }}>Confirmar rechazo</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        </>);
      })()}
    </>
  );
}

function estadoProveedorClass(estado) {
  return estado === 'homologado' ? 'badge-green'
    : estado === 'en_evaluacion' ? 'badge-orange'
    : estado === 'potencial' ? 'badge-cyan'
    : estado === 'observado' ? 'badge-orange'
    : estado === 'bloqueado' ? 'badge-red'
    : 'badge-gray';
}

function ratingText(value) {
  if (!value) return 'Sin evaluar';
  return `${value.toFixed(1)} / 5`;
}

export function PlaceholderCompras({ titulo }) {
  return (
    <div style={{ padding:'40px' }}>
      <div className="card-head"><h3>{titulo}</h3></div>
      <p style={{ color:'var(--fg-muted)', marginTop:'8px' }}>
        Modulo en construccion - Se completa en el siguiente sprint.
      </p>
    </div>
  );
}

function Proveedores() {
  const { proveedores, setProveedores, evaluacionesProveedor, usuarios, roles, empresa, role, addNotificacion, registrarProveedor, actualizarProveedorCtx } = useApp();
  const [tab, setTab] = useState('todos');
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [detailTab, setDetailTab] = useState('resumen');
  const [form, setForm] = useState({
    ruc:'', pais:'Peru', razon_social:'', nombre_comercial:'', categoria:'Materiales', estado:'potencial',
    servicios:'', contacto_nombre:'', contacto_cargo:'', telefono:'', email:'', web:'', direccion:'',
    responsable_compras:'', notas:''
  });
  const docs = MOCK.documentosProveedor || [];
  const evals = evaluacionesProveedor?.length ? evaluacionesProveedor : (MOCK.evaluacionesProveedor || []);
  const contactosProv = MOCK.contactosProveedor || [];
  const responsables = getAssignableUsers({ users: usuarios, roles, categories: ['compras', 'logistica', 'finanzas'], includeAdmins: true, empresaId: empresa?.id });
  const visibleTabs = role.permisos?.ver_finanzas
    ? ['resumen','finanzas','documentos','evaluaciones','historial','contactos']
    : ['resumen','documentos','evaluaciones','historial','contactos'];
  const list = proveedores.filter(p => {
    if (tab === 'homologados') return p.estado === 'homologado';
    if (tab === 'evaluacion') return p.estado === 'en_evaluacion' || p.estado === 'potencial';
    if (tab === 'riesgo') return p.estado === 'observado' || p.estado === 'bloqueado';
    return true;
  });
  const kpi = {
    homologados: proveedores.filter(p => p.estado === 'homologado').length,
    evaluacion: proveedores.filter(p => p.estado === 'en_evaluacion' || p.estado === 'potencial').length,
    observados: proveedores.filter(p => p.estado === 'observado').length,
    bloqueados: proveedores.filter(p => p.estado === 'bloqueado').length
  };
  const update = (name, value) => setForm(prev => ({ ...prev, [name]: value }));
  const resetForm = () => setForm({
    ruc:'', pais:'Peru', razon_social:'', nombre_comercial:'', categoria:'Materiales', estado:'potencial',
    servicios:'', contacto_nombre:'', contacto_cargo:'', telefono:'', email:'', web:'', direccion:'',
    responsable_compras:'', notas:''
  });
  const saveProveedor = async (e) => {
    e.preventDefault();
    if (form.pais === 'Peru' && !isValidRuc(form.ruc)) {
      addNotificacion('El RUC peruano debe tener 11 numeros y comenzar con 1 o 2.');
      return;
    }
    if (!isValidPhone(form.telefono)) {
      addNotificacion('El telefono debe tener 9 digitos y comenzar con 9.');
      return;
    }
    const next = proveedores.length + 1;
    const payload = {
      id: `prv_${String(next).padStart(3,'0')}`,
      empresa_id: empresa.id,
      codigo: `PRV-${String(next).padStart(3,'0')}`,
      calificacion_promedio: null,
      total_evaluaciones: 0,
      condicion_pago: '',
      moneda: 'PEN',
      sujeto_retencion: false,
      pct_retencion: 0,
      limite_gasto_mensual: 0,
      total_ocs: 0,
      monto_total_comprado: 0,
      fecha_ultima_oc: null,
      fecha_homologacion: form.estado === 'homologado' ? new Date().toISOString().slice(0,10) : null,
      ...form
    };
    try {
      await registrarProveedor(payload);
    } catch (_) {
      setProveedores(prev => [...prev, payload]);
    }
    addNotificacion(`Proveedor ${payload.codigo} registrado.`);
    resetForm();
    setPanel(false);
  };

  if (sel) {
    const proveedorDocs = docs.filter(d => d.proveedor_id === sel.id);
    const proveedorEvals = evals.filter(ev => ev.proveedor_id === sel.id);
    const hom = proveedorEvals.find(ev => ev.tipo === 'homologacion');
    const postOc = proveedorEvals.filter(ev => ev.tipo === 'post_oc' || ev.tipo === 'post_os');
    const contactos = contactosProv.filter(c => c.proveedor_id === sel.id);
    const vencidos = proveedorDocs.filter(d => d.estado === 'vencido');
    const ocRows = [
      { id:'OC-2025-0089', tipo:'Compra', concepto:'Materiales electricos', monto:4200, estado:'Recibida', emision:'15/04', recepcion:'20/04' },
      { id:'OC-2025-0071', tipo:'Compra', concepto:'EPP y herramientas', monto:1850, estado:'Recibida', emision:'01/04', recepcion:'05/04' },
      { id:'OS-2025-0012', tipo:'Servicio', concepto:'Transporte de materiales', monto:800, estado:'Cerrada', emision:'20/03', recepcion:'22/03' }
    ];
    const tabLabels = {
      resumen:'Resumen', finanzas:'Condiciones financieras', documentos:'Documentos',
      evaluaciones:'Evaluaciones', historial:'Historial OC', contactos:'Contactos'
    };
    return (
      <>
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Volver a Proveedores</button>
            <h1 className="page-title" style={{marginTop:12}}>{sel.razon_social}</h1>
            <div className="page-sub">{sel.nombre_comercial} - Categoria: {sel.categoria} - {sel.codigo} - RUC: {sel.ruc}</div>
          </div>
          <div className="row" style={{gap:10}}>
            {!sel.condicion_pago && <span className="badge badge-orange">Condiciones financieras pendientes</span>}
            <button className="btn btn-secondary">Solicitar cotizacion</button>
            <button className="btn btn-primary" data-local-form="true">{I.plus} Nueva OC</button>
          </div>
        </div>
        {vencidos.length > 0 && (
          <div className="card" style={{padding:14, marginBottom:16, borderLeft:'4px solid var(--danger)'}}>
            <strong>Este proveedor tiene {vencidos.length} documento vencido.</strong>
            <span className="text-muted" style={{marginLeft:8}}>No puede recibir nuevas ordenes hasta regularizar.</span>
          </div>
        )}
        <div className="card" style={{padding:16, marginBottom:16}}>
          <div className="row" style={{gap:10, flexWrap:'wrap'}}>
            <span className={'badge '+estadoProveedorClass(sel.estado)}>{sel.estado.replace('_',' ')}</span>
            <span className="badge badge-purple">Calificacion: {ratingText(sel.calificacion_promedio)}</span>
            <span className="badge badge-cyan">Ultima OC: {sel.fecha_ultima_oc || 'Sin compras'}</span>
          </div>
        </div>
        <div className="tabs">{visibleTabs.map(t => <div key={t} className={'tab '+(detailTab===t?'active':'')} onClick={()=>setDetailTab(t)}>{tabLabels[t]}</div>)}</div>
        {detailTab === 'resumen' && (
          <div className="grid-2">
            <div className="card" style={{padding:20}}>
              <div className="card-head"><h3>Datos generales</h3></div>
              {[
                ['RUC', sel.ruc], ['Razon social', sel.razon_social], ['Nombre comercial', sel.nombre_comercial],
                ['Categoria', sel.categoria], ['Pais', sel.pais], ['Direccion', sel.direccion || '-'],
                ['Sitio web', sel.web || '-'], ['Servicios', sel.servicios], ['Responsable', sel.responsable_compras], ['Notas', sel.notas || '-']
              ].map(([k,v]) => <div key={k} style={{display:'grid', gridTemplateColumns:'150px 1fr', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border-subtle)'}}><strong>{k}</strong><span className="text-muted">{v}</span></div>)}
            </div>
            <div className="card" style={{padding:20}}>
              <div className="card-head"><h3>Estado del proveedor</h3></div>
              <p><strong>Estado actual:</strong> {sel.estado.replace('_',' ')}</p>
              <p><strong>Desde:</strong> {sel.fecha_homologacion || 'Pendiente'}</p>
              <p><strong>Calificacion:</strong> {ratingText(sel.calificacion_promedio)} ({sel.total_evaluaciones} evaluaciones)</p>
              <p><strong>Docs vigentes:</strong> {proveedorDocs.filter(d=>d.estado==='vigente').length} de {proveedorDocs.length || 4}</p>
              <p><strong>Total OCs emitidas:</strong> {sel.total_ocs}</p>
              <p><strong>Monto total comprado:</strong> {money(sel.monto_total_comprado || 0)}</p>
              <p><strong>Ultima compra:</strong> {sel.fecha_ultima_oc || 'Sin compras'}</p>
            </div>
          </div>
        )}
        {detailTab === 'finanzas' && role.permisos?.ver_finanzas && (
          <div className="card" style={{padding:20}}>
            <div className="card-head"><h3>Condiciones financieras</h3><span className="text-muted">Editado por Finanzas</span></div>
            <div className="grid-2" style={{gap:14}}>
              <div className="input-group"><label>Condicion de pago</label><select className="select" defaultValue={sel.condicion_pago}><option>Contado</option><option>15 dias</option><option>30 dias</option><option>45 dias</option></select></div>
              <div className="input-group"><label>Moneda de facturacion</label><select className="select" defaultValue={sel.moneda}><option>PEN</option><option>USD</option></select></div>
              <div className="input-group"><label>Banco</label><input className="input" defaultValue={sel.banco || ''}/></div>
              <div className="input-group"><label>Tipo de cuenta</label><input className="input" defaultValue={sel.tipo_cuenta || ''}/></div>
              <div className="input-group"><label>Numero de cuenta</label><input className="input" defaultValue={sel.nro_cuenta || ''}/></div>
              <div className="input-group"><label>CCI</label><input className="input" defaultValue={sel.cci || ''}/></div>
              <div className="input-group"><label>Limite gasto mensual</label><input className="input" type="number" defaultValue={sel.limite_gasto_mensual || ''}/></div>
            </div>
            <button className="btn btn-primary mt-6">Guardar cambios</button>
          </div>
        )}
        {detailTab === 'documentos' && (
          <div className="card"><div className="card-head"><h3>Documentos habilitantes</h3><button className="btn btn-secondary btn-sm">{I.plus} Agregar documento</button></div><div className="table-wrap"><table className="tbl">
            <thead><tr><th>Documento</th><th>Vencimiento</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{proveedorDocs.map(d => <tr key={d.id}><td><strong>{d.tipo}</strong><div className="text-muted" style={{fontSize:11}}>{d.archivo}</div></td><td>{d.vencimiento || '-'}</td><td><span className={'badge '+(d.estado==='vigente'?'badge-green':d.estado==='por_vencer'?'badge-orange':'badge-red')}>{d.estado.replace('_',' ')}</span></td><td><button className="btn btn-sm btn-ghost">Ver</button> <button className="btn btn-sm btn-ghost">Actualizar</button></td></tr>)}</tbody>
          </table></div></div>
        )}
        {detailTab === 'evaluaciones' && (
          <div className="grid-2">
            <div className="card" style={{padding:20}}><div className="card-head"><h3>Evaluacion de homologacion</h3></div>
              {hom ? <><p className="text-muted">Realizada: {hom.fecha} - Responsable: {hom.evaluador}</p>{Object.entries(hom.criterios).map(([k,v]) => <div key={k} className="row" style={{justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border-subtle)'}}><span>{k.replaceAll('_',' ')}</span><strong>{v}/5</strong></div>)}<h3 style={{marginTop:14}}>Score total {hom.score_homologacion}/5</h3><p>{hom.comentario}</p></> : <p className="text-muted">Sin evaluacion de homologacion registrada.</p>}
            </div>
            <div className="card"><div className="card-head"><h3>Evaluaciones post-OC/OS</h3><button className="btn btn-secondary btn-sm">{I.plus} Nueva evaluacion</button></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Documento</th><th>Fecha</th><th>Plazo</th><th>Calidad</th><th>Score</th><th>Resultado</th></tr></thead><tbody>{postOc.map(ev => {
              const detalle = ev.detalle || {};
              const score = ev.puntaje ?? ev.score ?? 0;
              const calidad = detalle.calidad ?? ev.calidad ?? '-';
              const cumple = ev.cumple_plazo ?? Number(detalle.plazo || 0) >= 4;
              return <tr key={ev.id}><td className="mono">{detalle.documento || detalle.origen_id || ev.oc_id || ev.os_id || '-'}</td><td>{ev.fecha}</td><td>{cumple ? 'Si' : 'No'}</td><td>{calidad}/5</td><td><strong>{score}</strong></td><td><span className={'badge '+(ev.resultado === 'observado' ? 'badge-orange' : 'badge-green')}>{ev.resultado || 'conforme'}</span></td></tr>;
            })}</tbody></table></div></div>
          </div>
        )}
        {detailTab === 'historial' && (
          <div className="card"><div className="card-head"><h3>Historial OC</h3><strong>Total comprado: {money(sel.monto_total_comprado || 0)}</strong></div><div className="table-wrap"><table className="tbl"><thead><tr><th>N OC</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Emision</th><th>Recepcion</th></tr></thead><tbody>{ocRows.map(r => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.tipo}</td><td>{r.concepto}</td><td>{money(r.monto)}</td><td><span className="badge badge-green">{r.estado}</span></td><td>{r.emision}</td><td>{r.recepcion}</td></tr>)}</tbody></table></div></div>
        )}
        {detailTab === 'contactos' && (
          <div className="card"><div className="card-head"><h3>Contactos</h3><button className="btn btn-secondary btn-sm">{I.plus} Agregar contacto</button></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Nombre</th><th>Cargo</th><th>Telefono</th><th>Email</th><th>Principal</th></tr></thead><tbody>{contactos.map(c => <tr key={c.id}><td><strong>{c.nombre}</strong></td><td>{c.cargo}</td><td>{c.telefono}</td><td>{c.email}</td><td>{c.principal ? 'Si' : 'No'}</td></tr>)}</tbody></table></div></div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Proveedores</h1><div className="page-sub">Registro, homologacion, evaluacion y ficha completa</div></div>
        <div className="row" style={{gap:10}}>
          <button className="btn btn-secondary">{I.download} Importar Excel</button>
          <button className="btn btn-primary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Nuevo proveedor</button>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Proveedores homologados</div><div className="kpi-value">{kpi.homologados}</div></div>
        <div className="kpi-card"><div className="kpi-label">En evaluacion</div><div className="kpi-value">{kpi.evaluacion}</div></div>
        <div className="kpi-card"><div className="kpi-label">Observados</div><div className="kpi-value">{kpi.observados}</div></div>
        <div className="kpi-card"><div className="kpi-label">Bloqueados</div><div className="kpi-value">{kpi.bloqueados}</div></div>
      </div>
      <div className="tabs">{[
        ['todos','Todos'], ['homologados','Homologados'], ['evaluacion','En evaluacion'], ['riesgo','Observados / Bloqueados']
      ].map(([k,l]) => <div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div>
      <div className="row" style={{gap:10, marginBottom:14, flexWrap:'wrap'}}>
        {['Categoria','Estado','Calificacion','Responsable de compras'].map(f => <button key={f} className="btn btn-secondary btn-sm">{f}</button>)}
      </div>
      <div className="card"><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Codigo</th><th>Proveedor</th><th>Categoria</th><th>Servicios que ofrece</th><th>Calificacion</th><th>Estado</th><th>Docs</th><th>Ultima OC</th><th>Acciones</th></tr></thead>
        <tbody>{list.map(p => {
          const docEstado = docs.some(d => d.proveedor_id === p.id && d.estado === 'vencido') ? 'Vencido' : docs.some(d => d.proveedor_id === p.id && d.estado === 'por_vencer') ? 'Por vencer' : 'OK';
          return <tr key={p.id}>
            <td className="mono">{p.codigo}</td>
            <td><strong>{p.razon_social}</strong><div className="text-muted" style={{fontSize:11}}>{p.nombre_comercial}</div></td>
            <td><span className="badge badge-cyan">{p.categoria}</span></td>
            <td className="text-muted" style={{maxWidth:260}}>{p.servicios}</td>
            <td>{ratingText(p.calificacion_promedio)}</td>
            <td><span className={'badge '+estadoProveedorClass(p.estado)}>{p.estado.replace('_',' ')}</span></td>
            <td><span className={'badge '+(docEstado==='OK'?'badge-green':docEstado==='Por vencer'?'badge-orange':'badge-red')}>{docEstado}</span></td>
            <td>{p.fecha_ultima_oc || '-'}</td>
            <td><button className="btn btn-sm btn-secondary" onClick={() => { setSel(p); setDetailTab('resumen'); }}>Ver ficha</button> <button className="btn btn-sm btn-ghost" disabled={p.estado==='bloqueado' || docEstado==='Vencido'}>Nueva OC</button></td>
          </tr>;
        })}</tbody>
      </table></div></div>

      {panel && <>
        <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
        <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
          <div className="side-panel-head"><div><div className="eyebrow">Formulario de registro</div><div className="font-display" style={{fontSize:22, fontWeight:700}}>Nuevo proveedor</div><div className="text-muted" style={{fontSize:12}}>Los campos * son obligatorios</div></div><button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button></div>
          <form className="side-panel-body" onSubmit={saveProveedor}>
            <div className="eyebrow">Identificacion fiscal</div>
            <div className="grid-2" style={{gap:12, marginBottom:18}}>
              <div className="input-group"><label>RUC / NIT *</label><input className="input" required inputMode="numeric" pattern={RUC_PATTERN} maxLength={11} value={form.ruc} onChange={e=>update('ruc', sanitizeRuc(e.target.value))} placeholder="20xxxxxxxxx"/></div>
              <div className="input-group"><label>Pais *</label><select className="select" value={form.pais} onChange={e=>update('pais', e.target.value)}><option>Peru</option><option>Chile</option><option>Colombia</option><option>Mexico</option></select></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Razon social *</label><input className="input" required value={form.razon_social} onChange={e=>update('razon_social', e.target.value)}/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre comercial</label><input className="input" value={form.nombre_comercial} onChange={e=>update('nombre_comercial', e.target.value)} placeholder="Si es diferente a la razon social"/></div>
            </div>
            <div className="eyebrow">Clasificacion</div>
            <div className="grid-2" style={{gap:12, marginBottom:18}}>
              <div className="input-group"><label>Categoria *</label><select className="select" required value={form.categoria} onChange={e=>update('categoria', e.target.value)}>{['Materiales','Servicios','Transporte','Equipos','Mixto'].map(o=><option key={o}>{o}</option>)}</select></div>
              <div className="input-group"><label>Estado inicial *</label><select className="select" required value={form.estado} onChange={e=>update('estado', e.target.value)}><option value="potencial">Potencial</option><option value="en_evaluacion">En evaluacion</option><option value="homologado">Homologado</option></select></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Servicios que ofrece *</label><textarea className="input" required rows="3" value={form.servicios} onChange={e=>update('servicios', e.target.value)}/></div>
            </div>
            <div className="eyebrow">Contacto principal</div>
            <div className="grid-2" style={{gap:12, marginBottom:18}}>
              <div className="input-group"><label>Nombre del contacto *</label><input className="input" required value={form.contacto_nombre} onChange={e=>update('contacto_nombre', e.target.value)}/></div>
              <div className="input-group"><label>Cargo</label><input className="input" value={form.contacto_cargo} onChange={e=>update('contacto_cargo', e.target.value)}/></div>
              <div className="input-group"><label>Telefono *</label><input className="input" required type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={form.telefono} onChange={e=>update('telefono', sanitizePhone(e.target.value))} placeholder="9XXXXXXXX"/></div>
              <div className="input-group"><label>Email *</label><input className="input" required type="email" value={form.email} onChange={e=>update('email', e.target.value)}/></div>
              <div className="input-group"><label>Sitio web</label><input className="input" value={form.web} onChange={e=>update('web', e.target.value)} placeholder="https://"/></div>
              <div className="input-group"><label>Direccion</label><input className="input" value={form.direccion} onChange={e=>update('direccion', e.target.value)}/></div>
            </div>
            <div className="input-group" style={{marginBottom:18}}><label>Responsable de compras *</label><select className="select" required value={form.responsable_compras} onChange={e=>update('responsable_compras', e.target.value)}><option value="">Seleccionar...</option>{responsables.map(u=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}</select></div>
            <div className="input-group"><label>Notas internas</label><textarea className="input" rows="3" value={form.notas} onChange={e=>update('notas', e.target.value)}/></div>
            <div style={{padding:'12px 14px', background:'rgba(26,43,74,0.08)', borderLeft:'3px solid var(--cyan)', borderRadius:6, margin:'18px 0', fontSize:13}}>Las condiciones de pago y datos bancarios se completan en la ficha del proveedor, tab Condiciones financieras.</div>
            <div className="row" style={{justifyContent:'flex-end', gap:10}}><button type="button" className="btn btn-secondary" onClick={() => setPanel(false)}>Cancelar</button><button type="submit" className="btn btn-primary">Guardar proveedor</button></div>
          </form>
        </div>
      </>}
    </>
  );
}

function compraBadge(estado) {
  return estado === 'pendiente_cotizar' ? 'badge-gray'
    : estado === 'solicitud_enviada' ? 'badge-cyan'
    : estado === 'esperando_respuesta' ? 'badge-orange'
    : estado === 'comparativo_listo' ? 'badge-cyan'
    : estado === 'generada' || estado === 'oc_os_generada' ? 'badge-green'
    : estado === 'cancelado' ? 'badge-red'
    : 'badge-gray';
}

function estadoOcBadge(estado) {
  return ['cerrada','recibida_total','conforme'].includes(estado) ? 'badge-green'
    : ['confirmada','en_transito','en_ejecucion'].includes(estado) ? 'badge-cyan'
    : ['recibida_parcial','pendiente_conformidad','observada'].includes(estado) ? 'badge-orange'
    : estado === 'anulada' ? 'badge-red'
    : 'badge-gray';
}

function proveedorById(proveedores, id) {
  return proveedores.find(p => p.id === id) || { razon_social:'Proveedor no encontrado', nombre_comercial:'', calificacion_promedio:null, condicion_pago:'', estado:'inactivo' };
}

function docsVencidosProveedor(id) {
  return (MOCK.documentosProveedor || []).some(d => d.proveedor_id === id && d.estado === 'vencido');
}

function CotizacionesCompras() {
  const { procesosCompra, setProcesosCompra, respuestasCompra, setRespuestasCompra, proveedores, solpes, ots, usuarios, roles, empresa, setOrdenesCompra, setOrdenesServicio, navigate, addNotificacion } = useApp();
  const [tab, setTab] = useState('todas');
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [sel, setSel] = useState(null);
  const [detailTab, setDetailTab] = useState('detalle');
  const [winner, setWinner] = useState('');
  const responsablesCompra = getAssignableUsers({
    users: usuarios,
    roles,
    categories: ['compras', 'logistica', 'finanzas'],
    includeAdmins: true,
    empresaId: empresa?.id
  });
  const [form, setForm] = useState({
    origen_solpe:'si', solpe_id: solpes[0]?.id || '', descripcion: solpes[0]?.items?.[0]?.nombre || '',
    tipo:'bien', fecha_limite:'2025-04-30', responsable: responsablesCompra[0]?.nombre || usuarios[0]?.nombre || '',
    proveedores:[]
  });
  const filtrados = procesosCompra.filter(p => {
    if (tab === 'pendiente') return p.estado === 'pendiente_cotizar';
    if (tab === 'esperando') return p.estado === 'esperando_respuesta' || p.estado === 'solicitud_enviada';
    if (tab === 'listo') return p.estado === 'comparativo_listo';
    if (tab === 'generada') return p.estado === 'generada' || p.estado === 'oc_os_generada';
    return true;
  });
  const kpis = {
    pendientes: 3,
    espera: procesosCompra.filter(p => p.estado === 'esperando_respuesta' || p.estado === 'solicitud_enviada').length,
    listos: procesosCompra.filter(p => p.estado === 'comparativo_listo').length,
    generadas: 8
  };
  const proveedoresCompatibles = proveedores.filter(p => p.estado !== 'bloqueado' && (form.tipo === 'servicio' ? ['Servicios','Transporte','Mixto'].includes(p.categoria) : ['Materiales','Equipos','Mixto','Transporte'].includes(p.categoria)));
  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleProveedor = (id) => setForm(prev => ({ ...prev, proveedores: prev.proveedores.includes(id) ? prev.proveedores.filter(x=>x!==id) : [...prev.proveedores, id] }));
  const selectedSolpe = solpes.find(s => s.id === form.solpe_id);
  const createProceso = () => {
    const next = procesosCompra.length + 1;
    const proceso = {
      id: `pc_${String(next).padStart(3,'0')}`, empresa_id: empresa.id, codigo: `COT-COMP-${String(next).padStart(3,'0')}`,
      solpe_id: form.origen_solpe === 'si' ? form.solpe_id : null, ot_id: selectedSolpe?.ot_id || '', tipo: form.tipo,
      descripcion: form.descripcion || 'Requerimiento de compra', monto_referencial: 4500, proveedores_consultados: form.proveedores,
      fecha_limite: form.fecha_limite, responsable: form.responsable, estado: 'solicitud_enviada',
      proveedor_ganador: null, monto_seleccionado: null, documento_generado: null
    };
    const nuevasRespuestas = form.proveedores.map((pid, i) => ({
      id:`rpc_${Date.now()}_${i}`, proceso_id:proceso.id, proveedor_id:pid, estado:'enviada', solicitado:new Date().toISOString().slice(0,10),
      precio_total:null, plazo_entrega:'', condiciones:'', valido_hasta:'', observaciones:''
    }));
    setProcesosCompra(prev => [proceso, ...prev]);
    setRespuestasCompra(prev => [...nuevasRespuestas, ...prev]);
    addNotificacion(`Proceso ${proceso.codigo} creado y enviado a proveedores.`);
    setWizard(false);
    setStep(1);
  };
  const registrarRespuesta = (proceso, proveedorId) => {
    setRespuestasCompra(prev => prev.map(r => r.proceso_id === proceso.id && r.proveedor_id === proveedorId ? {
      ...r, estado:'respondida', precio_total: Math.round((proceso.monto_referencial || 1000) * (0.92 + Math.random() * 0.12)),
      plazo_entrega:'3 dias habiles', condiciones: proveedorById(proveedores, proveedorId).condicion_pago || 'Contado', valido_hasta:'2025-05-10', observaciones:'Respuesta registrada en prototipo'
    } : r));
    setProcesosCompra(prev => prev.map(p => p.id === proceso.id ? { ...p, estado:'comparativo_listo' } : p));
  };
  const generarDocumento = (proceso, proveedorId, tipoDoc) => {
    const prov = proveedorById(proveedores, proveedorId);
    const resp = respuestasCompra.find(r => r.proceso_id === proceso.id && r.proveedor_id === proveedorId);
    if (tipoDoc === 'bien') {
      const id = `oc_${String(Date.now()).slice(-5)}`;
      const oc = {
        id, empresa_id: empresa.id, codigo:`OC-2025-${String(Math.floor(Math.random()*9000)+1000)}`, proceso_compra_id: proceso.id,
        proveedor_id: proveedorId, ot_id: proceso.ot_id, descripcion: proceso.descripcion,
        items:[{ descripcion: proceso.descripcion, cantidad:1, unidad:'Glb', precio_unitario: resp?.precio_total || proceso.monto_referencial, subtotal: resp?.precio_total || proceso.monto_referencial }],
        subtotal: resp?.precio_total || proceso.monto_referencial, igv:(resp?.precio_total || proceso.monto_referencial)*0.18, total:(resp?.precio_total || proceso.monto_referencial)*1.18,
        condicion_pago: prov.condicion_pago || 'Contado', moneda:'PEN', fecha_emision:new Date().toISOString().slice(0,10), fecha_entrega_esperada:proceso.fecha_limite,
        almacen_destino:'ALM-001', estado:'emitida', porcentaje_recibido:0, notas_proveedor:'', notas_internas:'Generada desde comparativo'
      };
      setOrdenesCompra(prev => [oc, ...prev]);
      setProcesosCompra(prev => prev.map(p => p.id === proceso.id ? { ...p, estado:'generada', proveedor_ganador:proveedorId, monto_seleccionado:resp?.precio_total || proceso.monto_referencial, documento_generado:oc.codigo } : p));
      addNotificacion(`OC ${oc.codigo} generada desde ${proceso.codigo}.`);
      navigate('ordenes_compra');
    } else {
      const os = {
        id:`os_${String(Date.now()).slice(-5)}`, empresa_id:empresa.id, codigo:`OS-2025-${String(Math.floor(Math.random()*900)+100)}`,
        proveedor_id:proveedorId, ot_id:proceso.ot_id, descripcion:proceso.descripcion, alcance:proceso.descripcion, entregables:'Informe o evidencia de servicio',
        criterios_conformidad:'Servicio ejecutado segun alcance', total:resp?.precio_total || proceso.monto_referencial, moneda:'PEN',
        condicion_pago:prov.condicion_pago || 'Contado', fecha_emision:new Date().toISOString().slice(0,10), fecha_inicio:proceso.fecha_limite, fecha_fin:proceso.fecha_limite,
        responsable_validacion:proceso.responsable, estado:'emitida', notas:'Generada desde comparativo'
      };
      setOrdenesServicio(prev => [os, ...prev]);
      setProcesosCompra(prev => prev.map(p => p.id === proceso.id ? { ...p, estado:'generada', proveedor_ganador:proveedorId, monto_seleccionado:resp?.precio_total || proceso.monto_referencial, documento_generado:os.codigo } : p));
      addNotificacion(`OS ${os.codigo} generada desde ${proceso.codigo}.`);
      navigate('ordenes_servicio');
    }
  };

  if (sel) {
    const resps = respuestasCompra.filter(r => r.proceso_id === sel.id);
    const respondidas = resps.filter(r => r.estado === 'respondida');
    const barata = respondidas.length ? respondidas.reduce((a,b)=>a.precio_total <= b.precio_total ? a : b) : null;
    const tabLabels = { detalle:'Detalle', respuestas:'Respuestas de proveedores', comparativo:'Comparativo', resultado:'Resultado' };
    return (
      <>
        <div className="page-header"><div><button className="btn btn-ghost btn-sm" onClick={()=>setSel(null)}>Volver</button><h1 className="page-title">{sel.codigo}</h1><div className="page-sub">{sel.descripcion}</div></div></div>
        <div className="tabs">{Object.entries(tabLabels).map(([k,l])=><div key={k} className={'tab '+(detailTab===k?'active':'')} onClick={()=>setDetailTab(k)}>{l}</div>)}</div>
        {detailTab === 'detalle' && <div className="card" style={{padding:20}}><div className="card-head"><h3>Detalle del proceso</h3><span className={'badge '+compraBadge(sel.estado)}>{sel.estado.replace('_',' ')}</span></div><p><strong>Origen:</strong> {sel.solpe_id || 'Libre'}</p><p><strong>OT vinculada:</strong> {sel.ot_id || '-'}</p><p><strong>Tipo:</strong> {sel.tipo === 'bien' ? 'Bien - Orden de Compra' : 'Servicio - Orden de Servicio'}</p><p><strong>Monto referencial:</strong> {money(sel.monto_referencial)}</p><p><strong>Fecha limite:</strong> {sel.fecha_limite}</p><p><strong>Responsable:</strong> {sel.responsable}</p></div>}
        {detailTab === 'respuestas' && <div className="grid-2">{resps.map(r => { const p = proveedorById(proveedores, r.proveedor_id); return <div key={r.id} className="card" style={{padding:18}}><div className="card-head"><h3>{p.razon_social}</h3><span className={'badge '+(r.estado==='respondida'?'badge-green':'badge-orange')}>{r.estado}</span></div><p className="text-muted">Solicitado: {r.solicitado}</p>{r.estado==='respondida' ? <><p><strong>Precio total:</strong> {money(r.precio_total)}</p><p><strong>Plazo:</strong> {r.plazo_entrega}</p><p><strong>Condiciones:</strong> {r.condiciones}</p><p><strong>Valido hasta:</strong> {r.valido_hasta}</p><p>{r.observaciones}</p></> : <button className="btn btn-secondary" onClick={()=>registrarRespuesta(sel, r.proveedor_id)}>{I.plus} Registrar respuesta</button>}</div>})}</div>}
        {detailTab === 'comparativo' && <div className="card"><div className="card-head"><h3>Cuadro comparativo</h3>{barata && <button className="btn btn-primary" onClick={()=>setWinner(barata.proveedor_id)}>Seleccionar ganador</button>}</div><div className="table-wrap"><table className="tbl"><thead><tr><th>Proveedor</th><th>Precio total</th><th>Plazo</th><th>Condicion</th><th>Calificacion</th><th>Docs al dia</th></tr></thead><tbody>{respondidas.map(r => { const p = proveedorById(proveedores, r.proveedor_id); return <tr key={r.id}><td><strong>{p.razon_social}</strong>{barata?.id===r.id && <span className="badge badge-green" style={{marginLeft:8}}>★ menor precio</span>}</td><td>{money(r.precio_total)}</td><td>{r.plazo_entrega}</td><td>{r.condiciones}</td><td>{ratingText(p.calificacion_promedio)}</td><td>{docsVencidosProveedor(p.id) ? <span className="badge badge-red">No</span> : <span className="badge badge-green">Si</span>}</td></tr>})}</tbody></table></div>{barata && <p style={{padding:16}}><strong>Recomendacion:</strong> {proveedorById(proveedores, barata.proveedor_id).razon_social} - mejor precio, ahorro {money((sel.monto_referencial || 0) - barata.precio_total)} vs referencia.</p>}</div>}
        {detailTab === 'resultado' && <div className="card" style={{padding:20}}><div className="card-head"><h3>Resultado</h3></div>{sel.proveedor_ganador ? <><p><strong>Proveedor seleccionado:</strong> {proveedorById(proveedores, sel.proveedor_ganador).razon_social}</p><p><strong>Monto seleccionado:</strong> {money(sel.monto_seleccionado)}</p><p><strong>Documento generado:</strong> {sel.documento_generado || 'Pendiente'}</p></> : <p className="text-muted">Aun no se selecciono proveedor ganador.</p>}</div>}
        {winner && <><div className="side-panel-backdrop" onClick={()=>setWinner('')}/><div className="side-panel" style={{width:'min(520px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Seleccionar ganador</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{proveedorById(proveedores, winner).razon_social}</div></div><button className="icon-btn" onClick={()=>setWinner('')}>{I.x}</button></div><div className="side-panel-body"><p>Confirma la seleccion y genera el documento de compra.</p><textarea className="input" rows="4" placeholder="Justificacion si no eliges el menor precio"/><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setWinner('')}>Cancelar</button><button className="btn btn-primary" onClick={()=>generarDocumento(sel, winner, sel.tipo)}>Confirmar seleccion y generar {sel.tipo==='bien'?'OC':'OS'}</button></div></div></div></>}
      </>
    );
  }

  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Cotizaciones de Compra</h1><div className="page-sub">SOLPE a comparativo y seleccion de proveedor</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setWizard(true)}>{I.plus} Nuevo proceso de cotizacion</button></div>
      <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">SOLPEs pendientes</div><div className="kpi-value">{kpis.pendientes}</div></div><div className="kpi-card"><div className="kpi-label">En espera respuesta</div><div className="kpi-value">{kpis.espera}</div></div><div className="kpi-card"><div className="kpi-label">Comparativos listos</div><div className="kpi-value">{kpis.listos}</div></div><div className="kpi-card"><div className="kpi-label">Ordenes del mes</div><div className="kpi-value">{kpis.generadas}</div></div></div>
      <div className="tabs">{[['todas','Todas'],['pendiente','Pendiente de cotizar'],['esperando','Esperando respuesta'],['listo','Comparativo listo'],['generada','OC/OS generada']].map(([k,l])=><div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div>
      <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>N proceso</th><th>SOLPE origen</th><th>OT</th><th>Tipo</th><th>Descripcion</th><th>Monto ref.</th><th>Proveedores</th><th>Estado</th><th>Fecha limite</th><th>Responsable</th><th>Acciones</th></tr></thead><tbody>{filtrados.map(p => { const resps = respuestasCompra.filter(r=>r.proceso_id===p.id); const responded = resps.filter(r=>r.estado==='respondida').length; return <tr key={p.id}><td className="mono">{p.codigo}</td><td className="mono text-muted">{p.solpe_id || 'Libre'}</td><td className="mono">{p.ot_id || '-'}</td><td>{p.tipo === 'bien' ? 'Bien' : 'Servicio'}</td><td>{p.descripcion}</td><td>{money(p.monto_referencial)}</td><td>{responded} de {p.proveedores_consultados.length} respondieron</td><td><span className={'badge '+compraBadge(p.estado)}>{p.estado.replace('_',' ')}</span></td><td>{p.fecha_limite}</td><td>{p.responsable}</td><td><button className="btn btn-sm btn-secondary" onClick={()=>setSel(p)}>Ver proceso</button></td></tr>})}</tbody></table></div></div>
      {wizard && <><div className="side-panel-backdrop" onClick={()=>setWizard(false)}/><div className="side-panel" style={{width:'min(680px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Paso {step} de 3</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nuevo proceso de cotizacion</div></div><button className="icon-btn" onClick={()=>setWizard(false)}>{I.x}</button></div><div className="side-panel-body">
        {step===1 && <><div className="input-group"><label>Origen</label><select className="select" value={form.origen_solpe} onChange={e=>update('origen_solpe', e.target.value)}><option value="si">Si - seleccionar SOLPE aprobada</option><option value="no">No - descripcion libre</option></select></div>{form.origen_solpe==='si' && <div className="input-group"><label>SOLPE aprobada</label><select className="select" value={form.solpe_id} onChange={e=>update('solpe_id', e.target.value)}>{solpes.map(s=><option key={s.id} value={s.id}>{s.numero || s.id} - {s.items?.[0]?.nombre || s.estado}</option>)}</select></div>}<div className="input-group"><label>Descripcion detallada</label><textarea className="input" rows="4" value={form.descripcion} onChange={e=>update('descripcion', e.target.value)}/></div><div className="grid-2" style={{gap:12}}><div className="input-group"><label>Tipo</label><select className="select" value={form.tipo} onChange={e=>update('tipo', e.target.value)}><option value="bien">Bien - genera OC</option><option value="servicio">Servicio - genera OS</option></select></div><div className="input-group"><label>Fecha limite</label><input className="input" type="date" value={form.fecha_limite} onChange={e=>update('fecha_limite', e.target.value)}/></div></div><div className="input-group"><label>Responsable de compras</label><select className="select" value={form.responsable} onChange={e=>update('responsable', e.target.value)}>{responsablesCompra.map(u=><option key={u.id}>{u.nombre}</option>)}</select></div></>}
        {step===2 && <><p className="text-muted">Selecciona proveedores homologados. Observados o con documentos vencidos se muestran con advertencia.</p>{proveedoresCompatibles.map(p=><label key={p.id} className="card" style={{padding:12,display:'block',marginBottom:10,cursor:'pointer'}}><input type="checkbox" checked={form.proveedores.includes(p.id)} onChange={()=>toggleProveedor(p.id)} style={{marginRight:8}}/><strong>{p.codigo} {p.razon_social}</strong><div className="text-muted" style={{fontSize:12,marginLeft:24}}>{p.categoria} - {ratingText(p.calificacion_promedio)} - {p.condicion_pago || 'Sin condicion'} {p.estado==='observado' ? ' - Observado' : ''} {docsVencidosProveedor(p.id) ? ' - Documento vencido' : ''}</div></label>)}</>}
        {step===3 && <div className="card" style={{padding:16}}><p><strong>Origen:</strong> {form.origen_solpe==='si' ? form.solpe_id : 'Libre'}</p><p><strong>Tipo:</strong> {form.tipo === 'bien' ? 'Bien - Orden de Compra' : 'Servicio - Orden de Servicio'}</p><p><strong>Descripcion:</strong> {form.descripcion}</p><p><strong>Proveedores:</strong> {form.proveedores.map(id=>proveedorById(proveedores,id).razon_social).join(', ')}</p><p><strong>Fecha limite:</strong> {form.fecha_limite}</p><p><strong>Responsable:</strong> {form.responsable}</p></div>}
        <div className="row mt-6" style={{justifyContent:'space-between'}}><button className="btn btn-secondary" onClick={()=> step===1 ? setWizard(false) : setStep(s=>s-1)}>{step===1?'Cancelar':'Anterior'}</button><button className="btn btn-primary" data-local-form="true" disabled={step===2 && form.proveedores.length<1} onClick={()=> step===3 ? createProceso() : setStep(s=>s+1)}>{step===3?'Confirmar y crear proceso':'Siguiente'}</button></div>
      </div></div></>}
    </>
  );
}

function OrdenesCompra() {
  const { ordenesCompra, setOrdenesCompra, proveedores, procesosCompra, ots, empresa, addNotificacion, navigate, centrosCosto } = useApp();
  const [tab, setTab] = useState('todas');
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ proveedor_id:'prv_001', proceso_compra_id:'', ot_id:'', centro_costo_id:'', descripcion:'', total:1000, fecha_entrega_esperada:'2025-04-30' });
  const list = ordenesCompra.filter(o => tab === 'todas' || o.estado === tab);
  const homologados = proveedores.filter(p => p.estado === 'homologado' || p.estado === 'observado');
  const kpi = { emitidas: ordenesCompra.length, pendientes: ordenesCompra.filter(o=>o.porcentaje_recibido<100).length, parcial: ordenesCompra.filter(o=>o.estado==='recibida_parcial').length, total: ordenesCompra.reduce((s,o)=>s+(o.total||0),0) };
  const crear = (emitir=true) => {
    if (!form.centro_costo_id) { addNotificacion('Este campo es obligatorio. Selecciona un CECO antes de continuar.'); return; }
    const subtotal = Number(form.total) || 0;
    const p = proveedorById(proveedores, form.proveedor_id);
    const oc = { id:`oc_${Date.now()}`, empresa_id:empresa.id, codigo:`OC-2025-${String(ordenesCompra.length+91).padStart(4,'0')}`, proceso_compra_id:form.proceso_compra_id || null, proveedor_id:form.proveedor_id, ot_id:form.ot_id, centro_costo_id:form.centro_costo_id, descripcion:form.descripcion || 'Compra directa', items:[{descripcion:form.descripcion || 'Item de compra', cantidad:1, unidad:'Glb', precio_unitario:subtotal, subtotal}], subtotal, igv:subtotal*0.18, total:subtotal*1.18, condicion_pago:p.condicion_pago || 'Contado', moneda:'PEN', fecha_emision:new Date().toISOString().slice(0,10), fecha_entrega_esperada:form.fecha_entrega_esperada, almacen_destino:'ALM-001', estado:emitir?'emitida':'borrador', porcentaje_recibido:0, notas_proveedor:'', notas_internas:'' };
    setOrdenesCompra(prev=>[oc,...prev]); addNotificacion(`${oc.codigo} ${emitir?'emitida':'guardada como borrador'}.`); setPanel(false);
  };
  if (sel) return <DetalleOrden orden={sel} proveedor={proveedorById(proveedores, sel.proveedor_id)} onBack={()=>setSel(null)} onConfirmar={()=>setOrdenesCompra(prev=>prev.map(o=>o.id===sel.id?{...o,estado:'confirmada'}:o))} onRecepcion={()=>navigate('recepciones', { ocId: sel.id })}/>;
  return (
    <>
      <div className="page-header"><div><h1 className="page-title">Ordenes de Compra</h1><div className="page-sub">Bienes, materiales e ingreso a inventario</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setPanel(true)}>{I.plus} Nueva OC</button></div>
      <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">Emitidas este mes</div><div className="kpi-value">{kpi.emitidas}</div></div><div className="kpi-card"><div className="kpi-label">Pendientes recepcion</div><div className="kpi-value">{kpi.pendientes}</div></div><div className="kpi-card"><div className="kpi-label">Recibidas parcial</div><div className="kpi-value">{kpi.parcial}</div></div><div className="kpi-card"><div className="kpi-label">Valor total mes</div><div className="kpi-value">{money(kpi.total)}</div></div></div>
      <div className="tabs">{['todas','emitida','confirmada','en_transito','recibida_parcial','cerrada','anulada'].map(t=><div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t.replace('_',' ')}</div>)}</div>
      <OrdenesTable list={list} proveedores={proveedores} onSel={setSel} onRecepcion={(o)=>navigate('recepciones',{ocId:o.id})}/>
      {panel && <PanelOC form={form} setForm={setForm} proveedores={homologados} procesos={procesosCompra} ots={ots} centrosCosto={centrosCosto} onClose={()=>setPanel(false)} onCrear={crear}/>}
    </>
  );
}

function OrdenesTable({ list, proveedores, onSel, onRecepcion }) {
  return <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>N OC</th><th>Proveedor</th><th>Concepto</th><th>Monto total</th><th>OT</th><th>Estado</th><th>Emision</th><th>Entrega esperada</th><th>Recibido</th><th>Acciones</th></tr></thead><tbody>{list.map(o=>{ const p=proveedorById(proveedores,o.proveedor_id); return <tr key={o.id}><td className="mono">{o.codigo}</td><td><strong>{p.razon_social}</strong><div className="text-muted" style={{fontSize:11}}>{ratingText(p.calificacion_promedio)}</div></td><td>{o.descripcion}</td><td>{money(o.total||0)}</td><td className="mono">{o.ot_id||'-'}</td><td><span className={'badge '+estadoOcBadge(o.estado)}>{o.estado.replace('_',' ')}</span></td><td>{o.fecha_emision}</td><td>{o.fecha_entrega_esperada}</td><td><div style={{width:80,height:6,background:'var(--bg-subtle)',borderRadius:99}}><div style={{width:`${o.porcentaje_recibido||0}%`,height:6,background:'var(--green)',borderRadius:99}}/></div><span className="text-muted" style={{fontSize:11}}>{o.porcentaje_recibido||0}%</span></td><td><button className="btn btn-sm btn-secondary" onClick={()=>onSel(o)}>Ver detalle</button> <button className="btn btn-sm btn-ghost" onClick={()=>onRecepcion(o)}>Registrar recepcion</button></td></tr>})}</tbody></table></div></div>;
}

function PanelOC({ form, setForm, proveedores, procesos, ots, centrosCosto = [], onClose, onCrear }) {
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  return <><div className="side-panel-backdrop" onClick={onClose}/><div className="side-panel" style={{width:'min(620px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Orden de compra</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nueva OC</div></div><button className="icon-btn" onClick={onClose}>{I.x}</button></div><div className="side-panel-body"><div className="grid-2" style={{gap:12}}><div className="input-group"><label>Proceso de cotizacion</label><select className="select" value={form.proceso_compra_id} onChange={e=>setForm(v=>({...v,proceso_compra_id:e.target.value}))}><option value="">Compra directa</option>{procesos.map(p=><option key={p.id} value={p.id}>{p.codigo}</option>)}</select></div><div className="input-group"><label>Proveedor</label><select className="select" value={form.proveedor_id} onChange={e=>setForm(v=>({...v,proveedor_id:e.target.value}))}>{proveedores.map(p=><option key={p.id} value={p.id}>{p.razon_social}{p.estado==='observado'?' - observado':''}</option>)}</select></div><div className="input-group"><label>CECO *</label><select className="select" value={form.centro_costo_id} onChange={e=>setForm(v=>({...v,centro_costo_id:e.target.value}))}><option value="">{cecos.length ? 'Seleccionar CECO...' : 'No hay Centros de Costo activos. Crea uno en Maestros Base antes de continuar.'}</option>{cecos.map(c=><option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}</select></div><div className="input-group"><label>OT vinculada</label><select className="select" value={form.ot_id} onChange={e=>setForm(v=>({...v,ot_id:e.target.value}))}><option value="">Sin OT</option>{ots.map(o=><option key={o.id} value={o.id}>{o.numero || o.id}</option>)}</select></div><div className="input-group"><label>Fecha entrega esperada</label><input className="input" type="date" value={form.fecha_entrega_esperada} onChange={e=>setForm(v=>({...v,fecha_entrega_esperada:e.target.value}))}/></div><div className="input-group" style={{gridColumn:'1/-1'}}><label>Descripcion</label><textarea className="input" rows="3" value={form.descripcion} onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))}/></div><div className="input-group"><label>Monto subtotal</label><input className="input" type="number" value={form.total} onChange={e=>setForm(v=>({...v,total:e.target.value}))}/></div></div><div className="card mt-6" style={{padding:14}}><p><strong>Subtotal:</strong> {money(Number(form.total)||0)}</p><p><strong>IGV 18%:</strong> {money((Number(form.total)||0)*0.18)}</p><p><strong>Total:</strong> {money((Number(form.total)||0)*1.18)}</p></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>onCrear(false)}>Guardar borrador</button><button className="btn btn-primary" data-local-form="true" onClick={()=>onCrear(true)}>Emitir OC</button></div></div></div></>;
}

function DetalleOrden({ orden, proveedor, onBack, onConfirmar, onRecepcion }) {
  const [tab, setTab] = useState('detalle');
  return <><div className="page-header"><div><button className="btn btn-ghost btn-sm" onClick={onBack}>Volver</button><h1 className="page-title">{orden.codigo}</h1><div className="page-sub">{proveedor.razon_social} - {money(orden.total||0)}</div></div><div className="row">{orden.estado==='emitida' && <button className="btn btn-secondary" onClick={onConfirmar}>Marcar confirmada</button>}<button className="btn btn-primary" data-local-form="true" onClick={onRecepcion}>Registrar recepcion</button></div></div><div className="tabs">{['detalle','items','seguimiento','recepciones','documentos'].map(t=><div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t}</div>)}</div>{tab==='detalle' && <div className="card" style={{padding:20}}><p><strong>Descripcion:</strong> {orden.descripcion}</p><p><strong>Condicion pago:</strong> {orden.condicion_pago}</p><p><strong>Entrega esperada:</strong> {orden.fecha_entrega_esperada}</p><p><strong>Notas:</strong> {orden.notas_internas || '-'}</p></div>}{tab==='items' && <div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>Item</th><th>Cantidad</th><th>Unidad</th><th>P.Unit</th><th>Subtotal</th></tr></thead><tbody>{orden.items?.map((i,idx)=><tr key={idx}><td>{i.descripcion}</td><td>{i.cantidad}</td><td>{i.unidad}</td><td>{money(i.precio_unitario)}</td><td>{money(i.subtotal)}</td></tr>)}</tbody></table></div></div>}{tab==='seguimiento' && <div className="card" style={{padding:20}}>{['Emitida','Confirmada','En transito','Recibida'].map((s,i)=><div key={s} style={{padding:'10px 0',borderBottom:'1px solid var(--border-subtle)'}}><strong>{i===0 || orden.estado!=='emitida' ? '●' : '○'} {s}</strong><span className="text-muted" style={{marginLeft:12}}>{i===0 ? orden.fecha_emision : '-'}</span></div>)}</div>}{['recepciones','documentos'].includes(tab) && <div className="card" style={{padding:20}}><p className="text-muted">Informacion vinculada disponible desde el modulo Recepciones.</p></div>}</>;
}

function OrdenesServicio() {
  const { ordenesServicio, setOrdenesServicio, proveedores, ots, empresa, addNotificacion, navigate, centrosCosto } = useApp();
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState('todas');
  const [form, setForm] = useState({ proveedor_id:'prv_003', ot_id:'', centro_costo_id:'', descripcion:'', total:800, fecha_inicio:'2025-04-30', fecha_fin:'2025-04-30', responsable_validacion:'Roberto Quispe' });
  const list = ordenesServicio.filter(o => tab === 'todas' || o.estado === tab);
  const provs = proveedores.filter(p => (p.estado === 'homologado' || p.estado === 'observado') && ['Servicios','Transporte','Mixto'].includes(p.categoria));
  const cecos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const crear = () => { if (!form.centro_costo_id) { addNotificacion('Este campo es obligatorio. Selecciona un CECO antes de continuar.'); return; } const p=proveedorById(proveedores,form.proveedor_id); const os={id:`os_${Date.now()}`,empresa_id:empresa.id,codigo:`OS-2025-${String(ordenesServicio.length+13).padStart(4,'0')}`,proveedor_id:form.proveedor_id,ot_id:form.ot_id,centro_costo_id:form.centro_costo_id,descripcion:form.descripcion||'Servicio tercerizado',alcance:form.descripcion||'Servicio tercerizado',entregables:'Evidencia del servicio',criterios_conformidad:'Conforme a alcance',total:Number(form.total)||0,moneda:'PEN',condicion_pago:p.condicion_pago||'Contado',fecha_emision:new Date().toISOString().slice(0,10),fecha_inicio:form.fecha_inicio,fecha_fin:form.fecha_fin,responsable_validacion:form.responsable_validacion,estado:'emitida',notas:''}; setOrdenesServicio(prev=>[os,...prev]); addNotificacion(`${os.codigo} emitida.`); setPanel(false); };
  return <><div className="page-header"><div><h1 className="page-title">Ordenes de Servicio</h1><div className="page-sub">Servicios tercerizados, conformidad y cierre</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setPanel(true)}>{I.plus} Nueva OS</button></div><div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">Emitidas</div><div className="kpi-value">{ordenesServicio.length}</div></div><div className="kpi-card"><div className="kpi-label">En ejecucion</div><div className="kpi-value">{ordenesServicio.filter(o=>o.estado==='en_ejecucion').length}</div></div><div className="kpi-card"><div className="kpi-label">Pendiente conformidad</div><div className="kpi-value">{ordenesServicio.filter(o=>o.estado==='pendiente_conformidad').length}</div></div><div className="kpi-card"><div className="kpi-label">Valor total</div><div className="kpi-value">{money(ordenesServicio.reduce((s,o)=>s+(o.total||0),0))}</div></div></div><div className="tabs">{['todas','emitida','confirmada','en_ejecucion','pendiente_conformidad','cerrada','observada'].map(t=><div key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t.replace('_',' ')}</div>)}</div><div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>OS</th><th>Proveedor</th><th>Servicio</th><th>Monto</th><th>OT</th><th>Estado</th><th>Inicio</th><th>Fin</th><th>Validador</th><th>Acciones</th></tr></thead><tbody>{list.map(o=>{const p=proveedorById(proveedores,o.proveedor_id);return <tr key={o.id}><td className="mono">{o.codigo}</td><td><strong>{p.razon_social}</strong></td><td>{o.descripcion}</td><td>{money(o.total)}</td><td className="mono">{o.ot_id||'-'}</td><td><span className={'badge '+estadoOcBadge(o.estado)}>{o.estado.replace('_',' ')}</span></td><td>{o.fecha_inicio}</td><td>{o.fecha_fin}</td><td>{o.responsable_validacion}</td><td><button className="btn btn-sm btn-secondary" onClick={()=>navigate('recepciones',{osId:o.id})}>Conformidad</button></td></tr>})}</tbody></table></div></div>{panel && <><div className="side-panel-backdrop" onClick={()=>setPanel(false)}/><div className="side-panel" style={{width:'min(620px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Orden de servicio</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Nueva OS</div></div><button className="icon-btn" onClick={()=>setPanel(false)}>{I.x}</button></div><div className="side-panel-body"><div className="grid-2" style={{gap:12}}><div className="input-group"><label>Proveedor</label><select className="select" value={form.proveedor_id} onChange={e=>setForm(v=>({...v,proveedor_id:e.target.value}))}>{provs.map(p=><option key={p.id} value={p.id}>{p.razon_social}</option>)}</select></div><div className="input-group"><label>OT</label><select className="select" value={form.ot_id} onChange={e=>setForm(v=>({...v,ot_id:e.target.value}))}><option value="">Sin OT</option>{ots.map(o=><option key={o.id} value={o.id}>{o.numero||o.id}</option>)}</select></div><div className="input-group" style={{gridColumn:'1/-1'}}><label>Servicio / alcance</label><textarea className="input" rows="4" value={form.descripcion} onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))}/></div><div className="input-group"><label>Fecha inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={e=>setForm(v=>({...v,fecha_inicio:e.target.value}))}/></div><div className="input-group"><label>Fecha fin</label><input className="input" type="date" value={form.fecha_fin} onChange={e=>setForm(v=>({...v,fecha_fin:e.target.value}))}/></div><div className="input-group"><label>Total</label><input className="input" type="number" value={form.total} onChange={e=>setForm(v=>({...v,total:e.target.value}))}/></div><div className="input-group"><label>Responsable validacion</label><input className="input" value={form.responsable_validacion} onChange={e=>setForm(v=>({...v,responsable_validacion:e.target.value}))}/></div></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" onClick={crear}>Emitir OS</button></div></div></div></>}</>;
}

function RecepcionesLegacy() {
  const { activeParams, ordenesCompra, setOrdenesCompra, ordenesServicio, setOrdenesServicio, recepciones, setRecepciones, proveedores, usuarios, empresa, setInventario, cxp, setCxp, addNotificacion } = useApp();
  const [tab, setTab] = useState('pendientes');
  const [panel, setPanel] = useState(Boolean(activeParams?.ocId || activeParams?.osId));
  const [origen, setOrigen] = useState(activeParams?.osId ? `os:${activeParams.osId}` : activeParams?.ocId ? `oc:${activeParams.ocId}` : '');
  const [obs, setObs] = useState('');
  const ocOrigen = origen.startsWith('oc:') ? ordenesCompra.find(o=>o.id===origen.slice(3)) : null;
  const osOrigen = origen.startsWith('os:') ? ordenesServicio.find(o=>o.id===origen.slice(3)) : null;
  const pendientes = ordenesCompra.filter(o=>(o.porcentaje_recibido||0)<100).length;
  const rows = recepciones.filter(r => tab === 'todos' || (tab === 'pendientes' ? false : tab === 'conforme' ? r.estado === 'conforme' : r.estado === 'observada'));
  const confirmarRecepcion = () => {
    const base = ocOrigen || osOrigen;
    if (!base) return;
    const isOC = Boolean(ocOrigen);
    const items = isOC ? (ocOrigen.items || []).map(i=>({ descripcion:i.descripcion, pedido:i.cantidad, recibido:i.cantidad, unidad:i.unidad, conforme:true, precio_unitario:i.precio_unitario })) : [];
    const nueva = { id:`rec_${String(recepciones.length+1).padStart(3,'0')}`, empresa_id:empresa.id, codigo:`REC-2025-${String(recepciones.length+19).padStart(4,'0')}`, oc_id:isOC?base.id:null, os_id:isOC?null:base.id, proveedor_id:base.proveedor_id, fecha:new Date().toISOString().slice(0,10), responsable:usuarios[0]?.nombre || 'Compras', almacen:'ALM-001', items_recibidos:items, tipo:obs?'observada':'total', estado:obs?'observada':'conforme', observaciones:obs, archivo_guia:'guia_proveedor.pdf', cxp_generada:true, cxp_id:`cxp_${cxp.length+1}` };
    if (isOC) {
      setOrdenesCompra(prev=>prev.map(o=>o.id===base.id?{...o,estado:'cerrada',porcentaje_recibido:100}:o));
      setInventario(prev=>[...prev, ...items.map((i,idx)=>({ id:`inv_${Date.now()}_${idx}`, sku:`CMP-${Date.now()}-${idx}`, nombre:i.descripcion, categoria:'Compras', almacen:'ALM-001', unidad:i.unidad, stock_actual:i.recibido, costo_promedio:i.precio_unitario || 0 }))]);
    } else {
      setOrdenesServicio(prev=>prev.map(o=>o.id===base.id?{...o,estado:'cerrada'}:o));
    }
    setCxp(prev=>[...prev,{ id:nueva.cxp_id, empresa_id:empresa.id, proveedor_id:base.proveedor_id, recepcion_id:nueva.id, oc_id:isOC?base.id:null, monto:isOC?base.total:base.total, moneda:base.moneda, condicion_pago:base.condicion_pago, fecha_emision:nueva.fecha, fecha_vencimiento:'2025-05-30', estado:'pendiente', descripcion:`${base.codigo} - ${base.descripcion}` }]);
    setRecepciones(prev=>[nueva,...prev]);
    addNotificacion(`Recepcion registrada - ${isOC ? 'OC cerrada' : 'OS conforme'} - CxP generada.`);
    setPanel(false); setOrigen(''); setObs('');
  };
  return <><div className="page-header"><div><h1 className="page-title">Recepciones</h1><div className="page-sub">Confirmacion de entrega, conformidad e impacto en inventario/CxP</div></div><button className="btn btn-primary" data-local-form="true" onClick={()=>setPanel(true)}>{I.plus} Nueva recepcion</button></div><div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">OCs pendientes</div><div className="kpi-value">{pendientes}</div></div><div className="kpi-card"><div className="kpi-label">Recibidas hoy</div><div className="kpi-value">1</div></div><div className="kpi-card"><div className="kpi-label">Con observaciones</div><div className="kpi-value">{recepciones.filter(r=>r.estado==='observada').length}</div></div><div className="kpi-card"><div className="kpi-label">CxP generadas</div><div className="kpi-value">{recepciones.filter(r=>r.cxp_generada).length}</div></div></div><div className="tabs">{[['pendientes','Pendientes'],['conforme','Recibidas conforme'],['observada','Con observaciones'],['todos','Todos']].map(([k,l])=><div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div><div className="card"><div className="table-wrap"><table className="tbl"><thead><tr><th>N Recepcion</th><th>OC/OS origen</th><th>Proveedor</th><th>Descripcion</th><th>Estado</th><th>Fecha</th><th>CxP</th><th>Responsable</th></tr></thead><tbody>{rows.map(r=>{const p=proveedorById(proveedores,r.proveedor_id);const oc=ordenesCompra.find(o=>o.id===r.oc_id);const os=ordenesServicio.find(o=>o.id===r.os_id);return <tr key={r.id}><td className="mono">{r.codigo}</td><td className="mono">{oc?.codigo || os?.codigo || '-'}</td><td>{p.razon_social}</td><td>{oc?.descripcion || os?.descripcion || '-'}</td><td><span className={'badge '+(r.estado==='conforme'?'badge-green':'badge-orange')}>{r.estado}</span></td><td>{r.fecha}</td><td>{r.cxp_generada?'Si':'Pendiente'}</td><td>{r.responsable}</td></tr>})}</tbody></table></div></div>{panel && <><div className="side-panel-backdrop" onClick={()=>setPanel(false)}/><div className="side-panel" style={{width:'min(600px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">{osOrigen?'Conformidad de servicio':'Registro de recepcion'}</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{ocOrigen?.codigo || osOrigen?.codigo || 'Nueva recepcion'}</div></div><button className="icon-btn" onClick={()=>setPanel(false)}>{I.x}</button></div><div className="side-panel-body"><div className="input-group"><label>OC/OS origen</label><select className="select" value={origen} onChange={e=>setOrigen(e.target.value)}><option value="">Seleccionar...</option>{ordenesCompra.filter(o=>(o.porcentaje_recibido||0)<100).map(o=><option key={o.id} value={`oc:${o.id}`}>{o.codigo} - {o.descripcion}</option>)}{ordenesServicio.filter(o=>o.estado!=='cerrada').map(o=><option key={o.id} value={`os:${o.id}`}>{o.codigo} - {o.descripcion}</option>)}</select></div>{ocOrigen && <div className="card" style={{padding:12}}><div className="card-head"><h3>Verificacion de items</h3></div>{ocOrigen.items.map((i,idx)=><div key={idx} className="row" style={{justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}><span>{i.descripcion}</span><span>{i.cantidad} {i.unidad} - Conforme</span></div>)}</div>}{osOrigen && <div className="card" style={{padding:12}}><p><strong>Servicio:</strong> {osOrigen.descripcion}</p><p><strong>Entregables:</strong> {osOrigen.entregables}</p><p><strong>Evaluacion rapida:</strong> plazo 5/5 - calidad 4/5 - comunicacion 4/5</p></div>}<div className="input-group mt-6"><label>Observaciones</label><textarea className="input" rows="4" value={obs} onChange={e=>setObs(e.target.value)} placeholder="Dejar vacio si todo esta conforme"/></div><div className="input-group"><label>Guia / evidencia</label><input className="input" defaultValue={osOrigen?'evidencia_servicio.pdf':'guia_proveedor.pdf'}/></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" disabled={!ocOrigen && !osOrigen} onClick={confirmarRecepcion}>Confirmar recepcion</button></div></div></div></>}</>;
}

function Recepciones() {
  const {
    ordenesCompra, ordenesServicio, recepciones, proveedores, cxp,
    registrarRecepcionConCxP
  } = useApp();
  const [panel, setPanel] = useState(false);
  const [origen, setOrigen] = useState('');
  const [obs, setObs] = useState('');
  const [tab, setTab] = useState('todos');
  const [facturaNum, setFacturaNum] = useState('');
  const [facturaEmision, setFacturaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [facturaVencimiento, setFacturaVencimiento] = useState('');
  const [facturaArchivoUrl, setFacturaArchivoUrl] = useState('');
  const cerrarPanel = () => { setPanel(false); setOrigen(''); setObs(''); setFacturaNum(''); setFacturaEmision(new Date().toISOString().split('T')[0]); setFacturaVencimiento(''); setFacturaArchivoUrl(''); };
  const proveedorNombre = id => proveedores.find(p => p.id === id)?.razon_social || id || '-';
  const origenInfo = r => {
    const ocId = r.orden_compra_id || r.oc_id;
    const osId = r.orden_servicio_id || r.os_id;
    const oc = ordenesCompra.find(o => o.id === ocId);
    const os = ordenesServicio.find(o => o.id === osId);
    return { codigo: oc?.codigo || os?.codigo || '-', proveedor_id: oc?.proveedor_id || os?.proveedor_id || r.proveedor_id, descripcion: oc?.descripcion || os?.descripcion || '-' };
  };
  const origenes = [
    ...ordenesCompra.filter(o => (o.porcentaje_recibido || 0) < 100 && o.estado !== 'cerrada').map(o => ({ tipo:'oc', id:o.id, codigo:o.codigo || o.id, proveedor_id:o.proveedor_id, descripcion:o.descripcion, total:o.total })),
    ...ordenesServicio.filter(o => o.estado !== 'cerrada').map(o => ({ tipo:'os', id:o.id, codigo:o.codigo || o.id, proveedor_id:o.proveedor_id, descripcion:o.descripcion, total:o.total }))
  ];
  const rows = recepciones.filter(r => tab === 'todos' || (tab === 'conforme' ? ['confirmada','conforme','total'].includes(r.estado) : r.estado === 'observada'));
  const guardar = async event => {
    event.preventDefault();
    const [tipo, id] = origen.split(':');
    if (!tipo || !id) return;
    const creada = await registrarRecepcionConCxP({
      origenTipo: tipo, origenId: id, observaciones: obs.trim(),
      facturaNumero: facturaNum.trim(), fechaEmision: facturaEmision,
      fechaVencimiento: facturaVencimiento, archivoFacturaUrl: facturaArchivoUrl
    });
    if (creada) cerrarPanel();
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Recepciones</h1><div className="page-sub">Conformidad de OC/OS y generacion de CxP</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Nueva recepcion</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Pendientes</div><div className="kpi-value">{origenes.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Recepciones</div><div className="kpi-value">{recepciones.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Observadas</div><div className="kpi-value">{recepciones.filter(r => r.estado === 'observada').length}</div></div>
        <div className="kpi-card"><div className="kpi-label">CxP abiertas</div><div className="kpi-value">{cxp.filter(c => c.estado !== 'pagada').length}</div></div>
      </div>
      <div className="tabs">{[['todos','Todos'],['conforme','Conforme'],['observada','Observada']].map(([k,l]) => <div key={k} className={'tab '+(tab===k?'active':'')} onClick={() => setTab(k)}>{l}</div>)}</div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Recepcion</th><th>Origen</th><th>Proveedor</th><th>Descripcion</th><th>Fecha</th><th>Estado</th><th>CxP</th></tr></thead>
            <tbody>{rows.length ? rows.map(r => {
              const info = origenInfo(r);
              return <tr key={r.id}><td className="mono">{r.codigo || r.id}</td><td className="mono">{info.codigo}</td><td>{proveedorNombre(info.proveedor_id)}</td><td>{info.descripcion}</td><td>{r.fecha}</td><td><span className={'badge '+(r.estado==='observada'?'badge-orange':'badge-green')}>{r.estado}</span></td><td>{r.cxp_generada ? 'Si' : '-'}</td></tr>;
            }) : <tr><td colSpan="7" className="text-center text-muted" style={{padding:32}}>No hay recepciones registradas.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={cerrarPanel}/>
          <div className="side-panel" style={{width:'min(600px,96vw)'}}>
            <div className="side-panel-head"><div><div className="eyebrow">Registro de recepcion</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>Conformidad proveedor</div></div><button className="icon-btn" onClick={cerrarPanel}>{I.x}</button></div>
            <form className="side-panel-body" onSubmit={guardar}>
              <div className="input-group">
                <label>OC/OS origen</label>
                <select className="select" value={origen} onChange={e => setOrigen(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {origenes.map(o => <option key={`${o.tipo}:${o.id}`} value={`${o.tipo}:${o.id}`}>{o.codigo} - {proveedorNombre(o.proveedor_id)} - {money(o.total || 0)}</option>)}
                </select>
              </div>
              <div className="input-group mt-4">
                <label>Observaciones</label>
                <textarea className="input" rows="3" value={obs} onChange={e => setObs(e.target.value)} placeholder="Dejar vacio para registrar conforme y generar CxP"/>
              </div>
              <div style={{borderTop:'1px solid var(--border)',marginTop:20,paddingTop:16}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Datos de la factura del proveedor</div>
                <div className="input-group">
                  <label>N° Factura <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input" value={facturaNum} onChange={e => setFacturaNum(e.target.value)} placeholder="E001-000123" required/>
                </div>
                <div className="grid-2 mt-4" style={{gap:12,gridTemplateColumns:'1fr 1fr'}}>
                  <div className="input-group">
                    <label>Fecha de emisión <span style={{color:'var(--danger)'}}>*</span></label>
                    <input className="input" type="date" value={facturaEmision} onChange={e => setFacturaEmision(e.target.value)} required/>
                  </div>
                  <div className="input-group">
                    <label>Fecha de vencimiento <span style={{color:'var(--danger)'}}>*</span></label>
                    <input className="input" type="date" value={facturaVencimiento} onChange={e => setFacturaVencimiento(e.target.value)} required/>
                  </div>
                </div>
                <div className="input-group mt-4">
                  <label>Adjuntar factura (foto o PDF)</label>
                  <input className="input" type="file" accept="image/*,.pdf" onChange={e => {
                    const file = e.target.files[0];
                    setFacturaArchivoUrl(file ? URL.createObjectURL(file) : '');
                  }}/>
                  {facturaArchivoUrl && <div style={{fontSize:12,color:'var(--green)',marginTop:4}}>Archivo adjunto listo.</div>}
                </div>
              </div>
              <div className="row mt-6" style={{justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={cerrarPanel}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={!origen || !facturaNum.trim() || !facturaEmision || !facturaVencimiento}>Confirmar recepcion</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

const GASTO_FORM_INIT = { descripcion: '', categoria: 'Materiales', monto: '', moneda: 'PEN', fecha: new Date().toISOString().split('T')[0], num_comprobante: '', tipo_comprobante: 'Factura', centro_costo_id: '' };

function Compras() {
  const { comprasGastos, proveedores, ordenesCompra, ordenesServicio, recepciones, crearGasto, generarCxP, centrosCosto } = useApp();
  const [sel, setSel] = useState(null);
  const [activeTab, setActiveTab] = useState('Compras en Campo');
  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoForm, setGastoForm] = useState(GASTO_FORM_INIT);
  const [errCecoGasto, setErrCecoGasto] = useState(false);
  const [gastoGeneraCxP, setGastoGeneraCxP] = useState(false);
  const [gastoCxpProvId, setGastoCxpProvId] = useState('');
  const [gastoCxpVence, setGastoCxpVence] = useState('');
  const comprasRows = comprasGastos.length ? comprasGastos : MOCK.compras;
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');

  const setG = (k, v) => { setGastoForm(p => ({ ...p, [k]: v })); if (k === 'centro_costo_id') setErrCecoGasto(false); };

  const resetGastoForm = () => { setGastoForm(GASTO_FORM_INIT); setErrCecoGasto(false); setGastoGeneraCxP(false); setGastoCxpProvId(''); setGastoCxpVence(''); setShowGastoForm(false); };

  const handleGastoSubmit = async () => {
    if (!gastoForm.centro_costo_id) { setErrCecoGasto(true); return; }
    if (gastoGeneraCxP && !gastoCxpVence) return;
    const gastoData = { ...gastoForm, monto: parseFloat(gastoForm.monto) || 0, tipo: 'gasto' };
    if (gastoGeneraCxP) {
      const cxpPrefixId = `cxp_${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
      const gasto = crearGasto({ ...gastoData, cxp_id: cxpPrefixId });
      await generarCxP({
        id: cxpPrefixId,
        proveedor_id: gastoCxpProvId || null,
        tipo_beneficiario: 'proveedor',
        factura_numero: gastoForm.num_comprobante || null,
        concepto: gastoForm.descripcion,
        fecha_emision: gastoForm.fecha,
        fecha_vencimiento: gastoCxpVence,
        monto_total: parseFloat(gastoForm.monto) || 0,
        moneda: gastoForm.moneda || 'PEN',
        estado: 'por_pagar',
        gasto_id: gasto.id,
      });
    } else {
      crearGasto(gastoData);
    }
    resetGastoForm();
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Compras, Gastos y Proveedores</h1><div className="page-sub">Abastecimiento estructurado y gestión de proveedores</div></div>
        <button className="btn btn-primary" onClick={() => setShowGastoForm(true)}>{I.plus} Nuevo Registro</button>
      </div>
      <div className="tabs">
        {['Compras en Campo', 'Proveedores', 'Órdenes de Compra (OC)', 'Órdenes de Servicio (OSI)', 'Recepción y Conformidad'].map(t => (
          <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</div>
        ))}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            {activeTab === 'Compras en Campo' && (
              <>
                <thead><tr><th>#</th><th>Proveedor</th><th>Documento</th><th>Monto</th><th>OT</th><th>Fecha</th><th>Estado</th><th>Origen</th><th>CxP</th></tr></thead>
                <tbody>{comprasRows.map(c => (
                  <tr key={c.id} onClick={() => c.campo && setSel(c)}>
                    <td className="mono">{c.id}</td>
                    <td><strong>{c.proveedor || c.categoria || 'Gasto interno'}</strong></td>
                    <td className="mono">{c.doc || c.descripcion}</td>
                    <td className="num"><strong>{money(c.monto)}</strong></td>
                    <td className="mono text-muted">{c.ot || c.periodo_nomina || '-'}</td>
                    <td className="text-muted">{c.fecha}</td>
                    <td><span className={'badge '+(c.estado==='pagado'||c.estado==='registrado'?'badge-green':c.estado==='pendiente_revision'?'badge-cyan':'badge-gray')}>{String(c.estado || 'registrado').replace('_',' ')}</span></td>
                    <td>{c.campo ? <span className="badge badge-cyan">{I.camera}Campo</span> : c.origen === 'nomina' ? <span className="badge badge-purple">Nomina</span> : null}</td>
                    <td>{c.cxp_id ? <span className="badge badge-green" title={c.cxp_id}>{I.receipt} CxP</span> : <span className="text-muted" style={{fontSize:12}}>—</span>}</td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Proveedores' && (
              <>
                <thead><tr><th>RUC</th><th>Razón Social</th><th>Categoría</th><th>Contacto</th><th>Teléfono</th><th>Calificación</th></tr></thead>
                <tbody>{(proveedores.length ? proveedores : MOCK.proveedores).map(p => (
                  <tr key={p.id}>
                    <td className="mono text-muted">{p.ruc}</td>
                    <td><strong>{p.razon_social}</strong></td>
                    <td>{p.categoria || p.rubro || '-'}</td>
                    <td>{p.contacto_nombre || p.contacto}</td>
                    <td>{p.telefono}</td>
                    <td>{p.calificacion_promedio ?? p.calificacion} {I.star}</td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Órdenes de Compra (OC)' && (
              <>
                <thead><tr><th>OC</th><th>Proveedor</th><th>Fecha</th><th>Monto</th><th>OT</th><th>Entrega</th><th>Estado</th></tr></thead>
                <tbody>{(ordenesCompra.length ? ordenesCompra : MOCK.ordenesCompra).map(oc => (
                  <tr key={oc.id}>
                    <td className="mono">{oc.codigo || oc.id}</td>
                    <td><strong>{(proveedores.find(p => p.id === oc.proveedor_id)?.razon_social) || oc.proveedor || oc.proveedor_id}</strong></td>
                    <td>{oc.fecha_emision || oc.fecha}</td>
                    <td className="num"><strong>{money(oc.total || oc.monto)}</strong></td>
                    <td className="mono text-muted">{oc.ot_id || oc.ot || '-'}</td>
                    <td>{oc.fecha_entrega_esperada || oc.entrega || '-'}</td>
                    <td><span className={'badge '+(oc.estado==='recibida_total'||oc.estado==='aprobada'?'badge-green':oc.estado==='cerrada'?'badge-gray':'badge-orange')}>{String(oc.estado).replace('_',' ')}</span></td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Órdenes de Servicio (OSI)' && (
              <>
                <thead><tr><th>OSI</th><th>Proveedor</th><th>Servicio</th><th>Monto</th><th>OT</th><th>Estado</th></tr></thead>
                <tbody>{(ordenesServicio.length ? ordenesServicio : MOCK.ordenesServicio).map(os => (
                  <tr key={os.id}>
                    <td className="mono">{os.codigo || os.id}</td>
                    <td><strong>{(proveedores.find(p => p.id === os.proveedor_id)?.razon_social) || os.proveedor || os.proveedor_id}</strong></td>
                    <td>{os.descripcion || os.servicio}</td>
                    <td className="num"><strong>{money(os.total || os.monto)}</strong></td>
                    <td className="mono text-muted">{os.ot_id || os.ot || '-'}</td>
                    <td><span className="badge badge-cyan">{String(os.estado).replace('_',' ')}</span></td>
                  </tr>
                ))}</tbody>
              </>
            )}
            {activeTab === 'Recepción y Conformidad' && (
              <>
                <thead><tr><th>Recepción</th><th>Documento (OC)</th><th>Proveedor</th><th>Fecha</th><th>Responsable</th><th>Estado</th></tr></thead>
                <tbody>{(recepciones.length ? recepciones : MOCK.recepciones).map(r => (
                  <tr key={r.id}>
                    <td className="mono">{r.codigo || r.id}</td>
                    <td className="mono text-muted">{r.orden_compra_id || r.oc || '-'}</td>
                    <td><strong>{(proveedores.find(p => p.id === r.proveedor_id)?.razon_social) || r.proveedor || '-'}</strong></td>
                    <td>{r.fecha}</td>
                    <td>{r.recibido_por || r.responsable || '-'}</td>
                    <td><span className="badge badge-green">{r.estado}</span></td>
                  </tr>
                ))}</tbody>
              </>
            )}
          </table>
        </div>
      </div>

      {sel && <>
        <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Compra desde campo</div>
              <div className="font-display mono" style={{fontSize:20, fontWeight:700, marginTop:2}}>{sel.id}</div>
            </div>
            <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
          </div>
          <div className="side-panel-body">
            <div className="row" style={{marginBottom:16}}>
              <span className="badge badge-cyan">{I.camera}Capturado desde campo</span>
              <span className="badge badge-orange">Pendiente revisión backoffice</span>
            </div>
            <div className="grid-2" style={{gap:16}}>
              <div className="card" style={{padding:0, overflow:'hidden'}}>
                <div style={{background:'linear-gradient(135deg, #1A2B4A, #0F1B30)', aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.7)', padding:20, fontFamily:'JetBrains Mono', fontSize:11, lineHeight:1.8}}>
                  <div style={{position:'absolute', top:14, right:14}} className="badge badge-cyan">Foto original</div>
                  <div style={{background:'rgba(255,255,255,0.95)', color:'#000', padding:20, borderRadius:4, fontSize:10, width:'100%', maxWidth:200}}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:6}}>FERRETERIA INDUSTRIAL SAC</div>
                    <div style={{opacity:0.6}}>RUC 20512345678</div>
                    <div style={{opacity:0.6,marginBottom:8}}>Av. Industrial 1234</div>
                    <div style={{borderTop:'1px dashed #aaa',paddingTop:6}}>F001-2341</div>
                    <div>22/04/2026</div>
                    <div style={{marginTop:6}}>Tornillos HX 3/8... S/ 180.00</div>
                    <div>Sellador poliuretano... S/ 120.00</div>
                    <div>Electrodos 6013... S/ 150.00</div>
                    <div style={{borderTop:'1px solid #000',marginTop:8,paddingTop:4,fontWeight:700}}>TOTAL: S/ 450.00</div>
                  </div>
                </div>
              </div>
              <div className="col" style={{gap:12}}>
                <div><div className="eyebrow row" style={{gap:6}}><span className="badge badge-purple" style={{padding:'1px 6px'}}>IA</span> Proveedor extraído</div><div style={{fontWeight:600}}>{sel.proveedor}</div></div>
                <div><div className="eyebrow row" style={{gap:6}}><span className="badge badge-purple" style={{padding:'1px 6px'}}>IA</span> N° documento</div><div className="mono">{sel.doc}</div></div>
                <div><div className="eyebrow row" style={{gap:6}}><span className="badge badge-purple" style={{padding:'1px 6px'}}>IA</span> Monto</div><div style={{fontFamily:'Sora',fontSize:22,fontWeight:700}}>{money(sel.monto)}</div></div>
                <div><div className="eyebrow">OT asignada</div><div className="mono">{sel.ot}</div></div>
                <div><div className="eyebrow">Capturado por</div><div>J. Quispe · {sel.fecha}</div></div>
              </div>
            </div>
            <div className="row mt-6">
              <button className="btn btn-primary flex-1">{I.check} Validar y registrar</button>
              <button className="btn btn-secondary">{I.edit} Corregir datos</button>
              <button className="btn btn-ghost">Rechazar</button>
            </div>
          </div>
        </div>
      </>}

      {showGastoForm && <>
        <div className="side-panel-backdrop" onClick={resetGastoForm} />
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Backoffice</div>
              <div className="font-display" style={{fontSize:18, fontWeight:700, marginTop:2}}>Registrar Gasto</div>
            </div>
            <button className="icon-btn" onClick={resetGastoForm}>{I.x}</button>
          </div>
          <div className="side-panel-body" style={{display:'flex', flexDirection:'column', gap:16}}>
            <div className="form-group">
              <label className="form-label">Proveedor / Descripción del gasto *</label>
              <input className="input" placeholder="Ej: Ferretería Industrial SAC, Viáticos Lima..." value={gastoForm.descripcion} onChange={e => setG('descripcion', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoría *</label>
              <select className="select" value={gastoForm.categoria} onChange={e => setG('categoria', e.target.value)}>
                <option value="Materiales">Materiales</option>
                <option value="Servicios terceros">Servicios terceros</option>
                <option value="Logística">Logística</option>
                <option value="Administrativos">Administrativos</option>
                <option value="Comerciales">Comerciales</option>
                <option value="Gastos financieros">Gastos financieros</option>
              </select>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:12}}>
              <div className="form-group">
                <label className="form-label">Monto *</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={gastoForm.monto} onChange={e => setG('monto', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Moneda</label>
                <select className="select" value={gastoForm.moneda} onChange={e => setG('moneda', e.target.value)}>
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Fecha *</label>
              <input className="input" type="date" value={gastoForm.fecha} onChange={e => setG('fecha', e.target.value)} />
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div className="form-group">
                <label className="form-label">N° Comprobante</label>
                <input className="input" placeholder="F001-0001" value={gastoForm.num_comprobante} onChange={e => setG('num_comprobante', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo comprobante</label>
                <select className="select" value={gastoForm.tipo_comprobante} onChange={e => setG('tipo_comprobante', e.target.value)}>
                  <option value="Factura">Factura</option>
                  <option value="Boleta">Boleta</option>
                  <option value="Recibo">Recibo</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Centro de Costo (CECO) *</label>
              <select className={`select ${errCecoGasto ? 'input-error' : ''}`} value={gastoForm.centro_costo_id} onChange={e => setG('centro_costo_id', e.target.value)}>
                <option value="">— Seleccionar CECO —</option>
                {cecosActivos.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
              {errCecoGasto && <div style={{color:'var(--danger, #ef4444)', fontSize:12, marginTop:4}}>El CECO es obligatorio para registrar un gasto.</div>}
            </div>
            <div style={{background:'var(--bg-subtle)',borderRadius:8,padding:'12px 14px'}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',margin:0}}>
                <input type="checkbox" checked={gastoGeneraCxP} onChange={e => setGastoGeneraCxP(e.target.checked)}/>
                <span style={{fontWeight:600,fontSize:13}}>Generar Cuenta por Pagar</span>
              </label>
              <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:4,paddingLeft:24}}>Esta factura quedará pendiente de pago en Administración.</div>
              {gastoGeneraCxP && (
                <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Proveedor (opcional)</label>
                    <select className="select" value={gastoCxpProvId} onChange={e => setGastoCxpProvId(e.target.value)}>
                      <option value="">— De la lista —</option>
                      {(proveedores || []).filter(p => p.estado !== 'inactivo').map(p => (
                        <option key={p.id} value={p.id}>{p.razon_social}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Fecha vencimiento <span style={{color:'var(--danger)'}}>*</span></label>
                    <input className="input" type="date" value={gastoCxpVence} onChange={e => setGastoCxpVence(e.target.value)}/>
                  </div>
                </div>
              )}
            </div>
            <div className="row" style={{gap:8, marginTop:8}}>
              <button className="btn btn-primary flex-1" onClick={handleGastoSubmit} disabled={gastoGeneraCxP && !gastoCxpVence}>{I.check} Registrar Gasto</button>
              <button className="btn btn-ghost" onClick={resetGastoForm}>Cancelar</button>
            </div>
          </div>
        </div>
      </>}
    </>
  );
}

function Backlog() {
  const { backlog, setBacklog, cuentas, convertirBacklogAOT, addNotificacion, empresa, searchQuery, centrosCosto } = useApp();
  const [view, setView] = useState('kanban');
  const [modalConvertir, setModalConvertir] = useState(null);
  const [cecoSeleccionado, setCecoSeleccionado] = useState('');
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const getCuenta = (id) => cuentas.find(c => c.id === id)?.razon_social || id;

  const confirmarConvertir = () => {
    if (!cecoSeleccionado) return;
    convertirBacklogAOT(modalConvertir.id, { centro_costo_id: cecoSeleccionado });
    setModalConvertir(null);
    setCecoSeleccionado('');
  };

  const query = searchQuery.toLowerCase();
  const filteredBacklog = backlog.filter(b => 
    b.descripcion.toLowerCase().includes(query) ||
    getCuenta(b.cuenta_id).toLowerCase().includes(query) ||
    (b.servicio || '').toLowerCase().includes(query)
  );

  const cols = [
    { k: 'pendiente', title: 'Pendientes', color: '#64748b' },
    { k: 'en_revision', title: 'En Revisión', color: '#06b6d4' },
    { k: 'convertido', title: 'Convertido', color: '#10b981' },
  ];

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      setBacklog(prev => prev.map(b => b.id === id ? { ...b, estado: targetStatus, moved_at: Date.now() } : b));
      addNotificacion(`Requerimiento movido a ${targetStatus.replace('_',' ')}`);
    }
  };

  const pendientes = backlog.filter(b => b.estado === 'pendiente');
  const enRevision = backlog.filter(b => b.estado === 'en_revision');

  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Backlog de Trabajo</h1>
          <div className="page-sub" style={{marginTop:4}}>
            Cola priorizada de requerimientos para programación de OTs
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={()=>setView('kanban')}>{I.grid} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={()=>setView('lista')}>{I.list} Lista</button>
          </div>
          <button className="btn btn-secondary">{I.filter} Filtros</button>
          <button className="btn btn-primary">{I.plus} Nuevo requerimiento</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        {cols.map((c, i) => {
          const list = filteredBacklog.filter(b => b.estado === c.k);
          const icons = [I.clock, I.search, I.check];
          const labels = ['Requerimientos', 'Analizando', 'A OTs'];
          return (
            <div key={c.k} className="pipeline-kpi-card hover-raise" style={{'--accent': c.color}}>
              <div className="pipeline-kpi-icon" style={{color: c.color}}>{icons[i]}</div>
              <div className="pipeline-kpi-label">{c.title}</div>
              <div className="pipeline-kpi-value">{list.length}</div>
              <div className="pipeline-kpi-count">{labels[i]}</div>
            </div>
          );
        })}
      </div>

      {view === 'kanban' ? (
        <div style={{overflowX:'auto', paddingBottom:20, marginTop:24}}>
          <div className="kanban-v2">
            {cols.map((c, i) => {
              const list = filteredBacklog
                .filter(b => b.estado === c.k)
                .sort((a, b) => (b.moved_at || 0) - (a.moved_at || 0) || (b.fecha_recepcion || '').localeCompare(a.fecha_recepcion || ''));
              return (
                <div
                  key={c.k}
                  className="kanban-col-v2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, c.k)}
                  style={{ '--accent': c.color }}
                >
                  <div className="kanban-col-head-v2">
                    <div className="kanban-col-title-v2">{c.title}</div>
                    <div className="kanban-col-count-v2">{list.length}</div>
                  </div>
                  
                  <div style={{flex:1}}>
                    {list.length > 0 ? (
                      list.map(b => (
                        <div 
                          key={b.id} 
                          className="kanban-card-v2"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)}
                        >
                          <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:10, lineHeight:1.4}}>
                            {b.servicio}
                          </div>
                          <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:10}}>
                            {getCuenta(b.cuenta_id)}
                          </div>
                          
                          <div style={{fontSize:14, fontWeight:800, color:'var(--navy)', marginBottom:12}}>
                            {money(b.monto || 0)}
                          </div>
  
                          <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
                            <div className="row" style={{gap:6}}>
                              <span className={`badge ${b.prioridad==='alta'?'badge-danger':'badge-gray'}`} style={{fontSize:9, padding:'1px 6px'}}>{b.prioridad}</span>
                              <div className="text-muted" style={{fontSize:10}}>{b.fecha_recepcion}</div>
                            </div>
                            <div className="row" style={{gap:6, alignItems:'center'}}>
                              {b.estado === 'en_revision' && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  style={{fontSize:10, padding:'2px 8px'}}
                                  onClick={e => { e.stopPropagation(); setCecoSeleccionado(''); setModalConvertir(b); }}
                                >
                                  {I.arrowUp} Convertir a OT
                                </button>
                              )}
                              <div className="avatar" style={{width:24, height:24, fontSize:10, margin:0, background:'var(--navy)', color:'#fff'}}>
                                {b.responsable?.charAt(0) || 'B'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card-empty-state">
                        <div style={{opacity:0.5}}>{[I.clock, I.search, I.check][i]}</div>
                        <p>No hay requerimientos en {c.title}<br/><span style={{fontSize:10}}>Los nuevos aparecerán aquí.</span></p>
                      </div>
                    )}
                  </div>
  
                  <button className="kanban-btn-add">
                    {I.plus} Agregar requerimiento
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card mt-6">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Cuenta</th>
                  <th>Monto</th>
                  <th>Prioridad</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredBacklog.map(b => (
                  <tr key={b.id} className="hover-row">
                    <td><div style={{fontWeight:600}}>{b.servicio}</div></td>
                    <td>{getCuenta(b.cuenta_id)}</td>
                    <td><strong>{money(b.monto)}</strong></td>
                    <td><span className={`badge ${b.prioridad==='alta'?'badge-danger':'badge-gray'}`}>{b.prioridad.toUpperCase()}</span></td>
                    <td className="text-muted">{b.fecha_recepcion}</td>
                    <td><span className={'badge badge-' + (b.estado==='convertido'?'green':'cyan')}>{b.estado.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalConvertir && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center'}}
          onClick={e => { if (e.target === e.currentTarget) setModalConvertir(null); }}>
          <div className="card" style={{width:420, padding:24, boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
            <div style={{fontWeight:800, fontSize:16, marginBottom:4}}>Convertir a OT</div>
            <div className="text-muted" style={{fontSize:13, marginBottom:20}}>
              {modalConvertir.servicio} · {getCuenta(modalConvertir.cuenta_id)}
            </div>
            <div className="input-group" style={{marginBottom:20}}>
              <label>Centro de Costo (CECO) <span style={{color:'var(--danger)'}}>*</span></label>
              <select
                className="select"
                value={cecoSeleccionado}
                onChange={e => setCecoSeleccionado(e.target.value)}
                autoFocus
              >
                <option value="">Seleccionar CECO...</option>
                {cecosActivos.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.codigo ? ` (${c.codigo})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="row" style={{gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={() => setModalConvertir(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={!cecoSeleccionado}
                style={!cecoSeleccionado ? {opacity:0.45, cursor:'not-allowed'} : {}}
                onClick={confirmarConvertir}
              >
                {I.check} Crear OT
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ CIERRE TÉCNICO ============
function Cierre() {
  const { ots, partes, cierresTecnicos, valorizaciones, osClientes, cuentas, personalOperativo, searchQuery, role, navigate, activeParams, actualizarCierreTecnico, addNotificacion } = useApp();
  const canCost = role?.permisos?.ver_costos || role?.permisos?.todo;
  const [sel, setSel] = useState(null);
  const [tabCierre, setTabCierre] = useState('resumen');
  const [confForm, setConfForm] = useState({ tipo: 'fisico', nombre_firmante: '', fecha_firma: new Date().toISOString().split('T')[0], referencia: '' });
  const [guardandoConf, setGuardandoConf] = useState(false);

  useEffect(() => {
    if (!activeParams?.detail) return;
    const ot = ots.find(o => o.id === activeParams.detail);
    if (ot) {
      setSel(ot);
      setTabCierre(activeParams.tab || 'resumen');
    }
  }, [activeParams?.detail, activeParams?.tab, ots]);
  const [filtros, setFiltros] = useState({ cliente: '', osCliente: '', conformidad: '', valoriz: '', desde: '', hasta: '', responsable: '' });

  const hoy = new Date().toISOString().split('T')[0];
  const mesActual = hoy.slice(0, 7);

  const getCuenta = (id) => { const c = cuentas.find(x => x.id === id); return c?.razon_social || c?.nombre_comercial || id || '—'; };
  const getTecnico = (id) => { const p = (personalOperativo || []).find(x => x.id === id); return p?.nombre || id || '—'; };
  const getOS = (id) => osClientes.find(o => o.id === id);

  const otsCerradas = ots.filter(o => ['cerrada', 'valorizada', 'facturada'].includes(o.estado));

  const conformidadTipo = (ot) => {
    const c = cierresTecnicos.find(ct => ct.ot_id === ot.id);
    return c?.conformidad_cliente?.tipo || 'pendiente';
  };
  const estadoValorizacion = (ot) => {
    if (['valorizada', 'facturada'].includes(ot.estado)) return 'valorizada';
    return 'lista';
  };
  const cierreDeOT = (ot) => cierresTecnicos.find(ct => ct.ot_id === ot.id);

  // KPIs
  const esteMes = otsCerradas.filter(o => { const c = cierreDeOT(o); return (c?.fecha || '').startsWith(mesActual); });
  const confCompleta = otsCerradas.filter(o => ['digital', 'fisico'].includes(conformidadTipo(o)));
  const confPendiente = otsCerradas.filter(o => conformidadTipo(o) === 'pendiente');
  const listasVaLorizar = otsCerradas.filter(o => estadoValorizacion(o) === 'lista');

  const query = searchQuery.toLowerCase();
  const filtered = otsCerradas.filter(o => {
    const c = cierreDeOT(o);
    if (filtros.cliente && o.cuenta_id !== filtros.cliente) return false;
    if (filtros.osCliente && o.os_cliente_id !== filtros.osCliente) return false;
    if (filtros.conformidad && conformidadTipo(o) !== filtros.conformidad) return false;
    if (filtros.valoriz && estadoValorizacion(o) !== filtros.valoriz) return false;
    if (filtros.desde && (c?.fecha || '') < filtros.desde) return false;
    if (filtros.hasta && (c?.fecha || '') > filtros.hasta) return false;
    if (filtros.responsable && !(o.responsable || '').toLowerCase().includes(filtros.responsable.toLowerCase())) return false;
    if (query) {
      const txt = [o.numero, getCuenta(o.cuenta_id), getOS(o.os_cliente_id)?.numero, o.responsable].join(' ').toLowerCase();
      if (!txt.includes(query)) return false;
    }
    return true;
  });
  const hayFiltros = Object.values(filtros).some(Boolean);

  const abrirFicha = (ot) => { setSel(ot); setTabCierre('resumen'); };

  const conformidadBadge = (tipo) => {
    if (tipo === 'digital') return <span className="badge badge-green">{I.check} Digital</span>;
    if (tipo === 'fisico') return <span className="badge badge-green">{I.file} Documento</span>;
    return <span className="badge badge-orange">Pendiente</span>;
  };
  const valorizBadge = (ot) => {
    const est = estadoValorizacion(ot);
    if (est === 'valorizada') return <span className="badge badge-gray">Valorizada</span>;
    return <span className="badge badge-cyan">Lista para valorizar</span>;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cierre Técnico</h1>
          <div className="page-sub">OTs cerradas, conformidad del cliente y estado de valorización</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20}}>
        {[
          { label: 'Cerradas este mes', value: esteMes.length, color: 'var(--navy)' },
          { label: 'Conformidad completa', value: confCompleta.length, color: 'var(--green)' },
          { label: 'Conformidad pendiente', value: confPendiente.length, color: 'var(--orange)' },
          { label: 'Listas para valorizar', value: listasVaLorizar.length, color: 'var(--cyan)' },
        ].map((k, idx) => (
          <div key={k.label} className="card" style={{padding:'14px 18px', borderLeft: idx === 0 ? undefined : `3px solid ${k.color}`}}>
            <div className="eyebrow" style={{marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:28, fontWeight:800, color:k.color}}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card" style={{padding:'12px 16px', marginBottom:12}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr auto', gap:8, alignItems:'end'}}>
          <div style={{margin:0}}>
            <select className="select" value={filtros.cliente} onChange={e => setFiltros(v => ({...v, cliente: e.target.value}))}>
              <option value="">Todos los clientes</option>
              {[...new Map(otsCerradas.map(o => [o.cuenta_id, getCuenta(o.cuenta_id)])).entries()].filter(([,n]) => n).map(([id, nombre]) => (
                <option key={id} value={id}>{nombre}</option>
              ))}
            </select>
          </div>
          <div style={{margin:0}}>
            <select className="select" value={filtros.osCliente} onChange={e => setFiltros(v => ({...v, osCliente: e.target.value}))}>
              <option value="">Todas las OS</option>
              {osClientes.filter(os => otsCerradas.some(o => o.os_cliente_id === os.id)).map(os => (
                <option key={os.id} value={os.id}>{os.numero}</option>
              ))}
            </select>
          </div>
          <div style={{margin:0}}>
            <select className="select" value={filtros.conformidad} onChange={e => setFiltros(v => ({...v, conformidad: e.target.value}))}>
              <option value="">Todas</option>
              <option value="digital">Firma digital</option>
              <option value="fisico">Documento físico</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
          <div style={{margin:0}}>
            <label style={{fontSize:11}}>Estado valorización</label>
            <select className="select" value={filtros.valoriz} onChange={e => setFiltros(v => ({...v, valoriz: e.target.value}))}>
              <option value="">Todos</option>
              <option value="lista">Lista para valorizar</option>
              <option value="valorizada">Valorizada</option>
            </select>
          </div>
          <div style={{margin:0}}>
            <input className="input" type="date" value={filtros.desde} onChange={e => setFiltros(v => ({...v, desde: e.target.value}))} title="Fecha cierre desde"/>
          </div>
          <div style={{margin:0}}>
            <input className="input" type="date" value={filtros.hasta} onChange={e => setFiltros(v => ({...v, hasta: e.target.value}))} title="Fecha cierre hasta"/>
          </div>
          <div style={{margin:0}}>
            <input className="input" placeholder="Responsable..." value={filtros.responsable} onChange={e => setFiltros(v => ({...v, responsable: e.target.value}))}/>
          </div>
          {hayFiltros && <button className="btn btn-ghost" style={{fontSize:12, whiteSpace:'nowrap'}} onClick={() => setFiltros({ cliente: '', osCliente: '', conformidad: '', valoriz: '', desde: '', hasta: '', responsable: '' })}>Limpiar</button>}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>OT</th>
                <th>Cliente</th>
                <th>OS Cliente</th>
                <th>Fecha cierre</th>
                <th>Avance</th>
                <th>Horas</th>
                {canCost && <th>Costo real</th>}
                <th>Conformidad</th>
                <th>Valorización</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const c = cierreDeOT(o);
                const os = getOS(o.os_cliente_id);
                const partesAp = partes.filter(p => p.ot_id === o.id && p.estado === 'aprobado');
                const horasReal = c?.horas_total ?? partesAp.reduce((s, p) => s + (p.horas || 0), 0);
                const _ch = (id) => { const t = [...(personalOperativo||[]),...(personalAdmin||[])].find(x=>x.id===id); const e=Number(t?.costo_hora_real??t?.costo??t?.costo_hora??0); return e>0?e:Math.round(Number(t?.remuneracion??0)/240*100)/100; };
                const moReal = (() => {
                  if (c?.horas_total) return c.horas_total * _ch(o.tecnico_responsable_id);
                  return partesAp.reduce((s, p) => s + (p.horas || 0) * _ch(p.tecnico_id), 0);
                })();
                const matReal = partesAp.reduce((s, p) => s + (p.materiales_usados || []).reduce((sm, m) => sm + (m.costo_unitario || 0) * (m.cantidad || 0), 0), 0);
                const costoReal = moReal + matReal;
                const confTipo = conformidadTipo(o);
                return (
                  <tr key={o.id} className="hover-row" onClick={() => abrirFicha(o)} style={{cursor:'pointer'}}>
                    <td className="mono" style={{fontWeight:600}}>{o.numero}</td>
                    <td style={{fontWeight:500}}>{getCuenta(o.cuenta_id) || o.cliente || '—'}</td>
                    <td>{os ? <span style={{fontSize:12}}>{os.numero}</span> : <span className="text-muted">—</span>}</td>
                    <td className="text-muted" style={{fontSize:12}}>{c?.fecha || '—'}</td>
                    <td style={{fontWeight:600, color:'var(--green)'}}>{c?.avance_final ?? o.avance ?? 0}%</td>
                    <td style={{fontSize:12}}>{horasReal > 0 ? `${horasReal}h` : '—'}</td>
                    {canCost && <td className="num" style={{fontSize:12}}>{costoReal > 0 ? money(costoReal) : '—'}</td>}
                    <td>{conformidadBadge(confTipo)}</td>
                    <td>{valorizBadge(o)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="row" style={{gap:4}}>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={() => abrirFicha(o)}>{I.eye} Detalle</button>
                        {confTipo === 'pendiente' && (
                          <button className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={() => { abrirFicha(o); setTabCierre('conformidad'); }}>{I.edit} Conformidad</button>
                        )}
                        {confTipo !== 'pendiente' && estadoValorizacion(o) === 'lista' && (
                          <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={() => navigate('valorizacion')}>{I.receipt} Valorizar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={canCost ? 10 : 9} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No hay OTs cerradas con los filtros aplicados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ficha de cierre — panel lateral de solo lectura */}
      {sel && (() => {
        const c = cierreDeOT(sel);
        const os = getOS(sel.os_cliente_id);
        const partesAp = partes.filter(p => p.ot_id === sel.id && p.estado === 'aprobado').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
        const horasReal = c?.horas_total ?? partesAp.reduce((s, p) => s + (p.horas || 0), 0);
        const _ch2 = (id) => { const t = [...(personalOperativo||[]),...(personalAdmin||[])].find(x=>x.id===id); const e=Number(t?.costo_hora_real??t?.costo??t?.costo_hora??0); return e>0?e:Math.round(Number(t?.remuneracion??0)/240*100)/100; };
        const moReal = (() => {
          if (c?.horas_total) return c.horas_total * _ch2(sel.tecnico_responsable_id);
          return partesAp.reduce((s, p) => s + (p.horas || 0) * _ch2(p.tecnico_id), 0);
        })();
        const matReal = partesAp.reduce((s, p) => s + (p.materiales_usados || []).reduce((sm, m) => sm + (m.costo_unitario || 0) * (m.cantidad || 0), 0), 0);
        const terceroReal = c?.costo_terceros || 0;
        const logisticaReal = c?.costo_logistica || 0;
        const costoEst = sel.costoEst || 0;
        const costoReal = moReal + matReal + terceroReal + logisticaReal;
        const margen = costoEst > 0 ? Math.round(((costoEst - costoReal) / costoEst) * 100) : null;
        const confTipo = conformidadTipo(sel);
        const avanceFinal = c?.avance_final ?? sel.avance ?? 0;
        const cierreHealthColor = confTipo !== 'pendiente' ? 'var(--green)' : 'var(--orange)';
        const cierreHealthBg = confTipo !== 'pendiente' ? 'rgba(16,185,129,0.08)' : 'rgba(249,115,22,0.08)';
        const cierreHealthLabel = confTipo !== 'pendiente' ? 'Cierre listo para valorizacion' : 'Conformidad pendiente';
        const tabs = ['resumen', ...(canCost ? ['costos'] : []), 'conformidad', 'partes', 'observaciones'];
        const tabLabel = { resumen: 'Resumen', costos: 'Costos', conformidad: 'Conformidad', partes: 'Partes aprobados', observaciones: 'Observaciones' };
        return (
          <>
            <div className="side-panel-backdrop" onClick={() => setSel(null)}/>
            <div className="side-panel ficha-detail-panel cierre-detail-panel" style={{width:'min(700px, 96vw)'}}>
              {/* Encabezado */}
              <div className="side-panel-head" style={{flexDirection:'column', alignItems:'flex-start', gap:10}}>
                <div style={{display:'flex', justifyContent:'space-between', width:'100%'}}>
                  <div>
                    <div className="eyebrow">Cierre tecnico</div>
                    <div className="font-display ficha-detail-title" style={{marginTop:4}}>{sel.numero}</div>
                  </div>
                  <button className="icon-btn" onClick={() => setSel(null)}>{I.x}</button>
                </div>
                <div className="cierre-detail-meta">
                  <span>Cliente: <strong>{getCuenta(sel.cuenta_id) || sel.cliente || '—'}</strong></span>
                  <span>OS Cliente: <strong>{os?.numero || '—'}</strong></span>
                  <span>Responsable: <strong>{sel.responsable || '—'}</strong></span>
                  <span>Fecha cierre: <strong>{c?.fecha || '—'}</strong></span>
                  <span className="cierre-detail-badge">Conformidad: {conformidadBadge(confTipo)}</span>
                </div>
              </div>

              <div className="cierre-detail-health" style={{background:cierreHealthBg}}>
                <div className="cierre-detail-score" style={{color:cierreHealthColor}}>{avanceFinal}%</div>
                <div className="cierre-detail-health-copy">
                  <div><span style={{borderColor:cierreHealthColor, color:cierreHealthColor}}>{cierreHealthLabel}</span></div>
                  <div className="text-muted">Horas: {horasReal > 0 ? `${horasReal}h` : '—'} - Partes aprobados: {partesAp.length}</div>
                </div>
                <div className="cierre-detail-progress">
                  <div style={{width:`${Math.min(100, Math.max(0, avanceFinal))}%`, background:cierreHealthColor}}/>
                </div>
              </div>

              {/* Tabs */}
              <div className="ficha-detail-tabs">
                {tabs.map(t => (
                  <button key={t} className={`ficha-detail-tab ${tabCierre === t ? 'active' : ''}`} onClick={() => setTabCierre(t)}>{tabLabel[t]}</button>
                ))}
              </div>

              <div className="ficha-detail-content">
                {/* Tab Resumen */}
                {tabCierre === 'resumen' && (
                  <div className="col" style={{gap:16}}>
                    <div className="input-group">
                      <label>Descripción del trabajo ejecutado</label>
                      <div style={{padding:'10px 12px', background:'var(--bg-subtle)', borderRadius:6, fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap', minHeight:80}}>{c?.descripcion_trabajo || '—'}</div>
                    </div>
                    <div className="grid-2" style={{gap:12}}>
                      <div><span className="text-muted" style={{fontSize:12}}>Fecha real de inicio</span><div style={{fontWeight:600}}>{c?.fecha_inicio_real || '—'}</div></div>
                      <div><span className="text-muted" style={{fontSize:12}}>Fecha real de fin</span><div style={{fontWeight:600}}>{c?.fecha || c?.fecha_fin_real || '—'}</div></div>
                      <div><span className="text-muted" style={{fontSize:12}}>Total horas trabajadas</span><div style={{fontWeight:600}}>{horasReal > 0 ? `${horasReal}h` : '—'}</div></div>
                      <div><span className="text-muted" style={{fontSize:12}}>Avance final</span><div style={{fontWeight:700, fontSize:18, color:'var(--green)'}}>{avanceFinal}%</div></div>
                    </div>
                  </div>
                )}

                {/* Tab Costos */}
                {tabCierre === 'costos' && canCost && (
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border)'}}>
                        <th style={{textAlign:'left', padding:'6px 0', color:'var(--fg-muted)', fontWeight:600}}>Concepto</th>
                        <th style={{textAlign:'right', padding:'6px 0', color:'var(--fg-muted)', fontWeight:600}}>Estimado</th>
                        <th style={{textAlign:'right', padding:'6px 0', color:'var(--fg-muted)', fontWeight:600}}>Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Mano de obra', sel.est_mo ?? null, moReal],
                        ['Materiales', sel.est_materiales ?? null, matReal],
                        ['Servicios terceros', sel.est_terceros ?? null, terceroReal],
                        ['Logística y viáticos', sel.est_logistica ?? null, logisticaReal],
                      ].map(([label, est, real]) => (
                        <tr key={label} style={{borderBottom:'1px solid var(--border-subtle)'}}>
                          <td style={{padding:'8px 0'}}>{label}</td>
                          <td style={{textAlign:'right', padding:'8px 0', color:'var(--fg-muted)'}}>{est != null ? money(est) : '—'}</td>
                          <td style={{textAlign:'right', padding:'8px 0', fontWeight: real > 0 ? 600 : 400}}>{real > 0 ? money(real) : '—'}</td>
                        </tr>
                      ))}
                      <tr style={{borderTop:'2px solid var(--border)'}}>
                        <td style={{padding:'8px 0', fontWeight:700}}>Total</td>
                        <td style={{textAlign:'right', padding:'8px 0', fontWeight:700, color:'var(--fg-muted)'}}>{costoEst > 0 ? money(costoEst) : '—'}</td>
                        <td style={{textAlign:'right', padding:'8px 0', fontWeight:700, color: costoReal > costoEst && costoEst > 0 ? 'var(--danger)' : 'var(--green)'}}>{money(costoReal)}</td>
                      </tr>
                      {margen !== null && (
                        <tr>
                          <td colSpan={3} style={{textAlign:'right', fontSize:12, padding:'4px 0', color: margen < 0 ? 'var(--danger)' : 'var(--green)'}}>
                            Margen: <strong>{margen > 0 ? '+' : ''}{margen}%</strong>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {/* Tab Conformidad */}
                {tabCierre === 'conformidad' && (
                  <div className="col" style={{gap:12}}>
                    <div style={{padding:'14px 16px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-subtle)'}}>
                      <div style={{fontWeight:700, marginBottom:4}}>Tipo de conformidad</div>
                      <div style={{display:'flex', alignItems:'center', gap:8, fontSize:13}}>{conformidadBadge(confTipo)}</div>
                    </div>
                    {confTipo === 'digital' && c?.conformidad_cliente && (
                      <div className="grid-2" style={{gap:12}}>
                        <div><span className="text-muted" style={{fontSize:12}}>Firmante</span><div style={{fontWeight:600}}>{c.conformidad_cliente.nombre || '—'}</div></div>
                        <div><span className="text-muted" style={{fontSize:12}}>DNI</span><div style={{fontWeight:600}}>{c.conformidad_cliente.dni || '—'}</div></div>
                        <div><span className="text-muted" style={{fontSize:12}}>Fecha y hora</span><div style={{fontWeight:600}}>{c.conformidad_cliente.firmado_at || '—'}</div></div>
                        <div><span className="text-muted" style={{fontSize:12}}>IP</span><div style={{fontWeight:600, fontFamily:'monospace', fontSize:12}}>{c.conformidad_cliente.ip || '—'}</div></div>
                      </div>
                    )}
                    {confTipo === 'fisico' && (
                      <div style={{fontSize:13, color:'var(--fg-muted)'}}>Documento físico adjunto al momento del cierre.</div>
                    )}
                    {confTipo === 'pendiente' && (
                      <div className="col" style={{gap:12}}>
                        <div style={{padding:'12px 14px', borderRadius:6, background:'color-mix(in srgb, var(--orange) 10%, transparent)', color:'var(--orange)', fontSize:13}}>
                          La conformidad del cliente no ha sido registrada. La OT puede ser valorizada cuando se complete.
                        </div>
                        <div style={{padding:'16px', border:'1px solid var(--border)', borderRadius:8}}>
                          <div style={{fontWeight:700, fontSize:13, marginBottom:12}}>Registrar conformidad</div>
                          <div className="col" style={{gap:8, marginBottom:14}}>
                            {[
                              { val: 'fisico', label: 'Documento físico', desc: 'El cliente firmó un documento físico de conformidad.' },
                              { val: 'digital', label: 'Conformidad digital', desc: 'Se registra nombre, fecha y referencia del documento digital.' },
                            ].map(opt => (
                              <label key={opt.val} style={{display:'flex', gap:10, padding:'10px 12px', borderRadius:6, border:`1.5px solid ${confForm.tipo === opt.val ? 'var(--cyan)' : 'var(--border)'}`, background: confForm.tipo === opt.val ? 'color-mix(in srgb, var(--cyan) 6%, transparent)' : 'var(--bg)', cursor:'pointer'}}>
                                <input type="radio" name="conf_tipo" value={opt.val} checked={confForm.tipo === opt.val} onChange={() => setConfForm(v => ({...v, tipo: opt.val}))} style={{marginTop:2, flexShrink:0}}/>
                                <div>
                                  <div style={{fontWeight:600, fontSize:13}}>{opt.label}</div>
                                  <div style={{fontSize:12, color:'var(--fg-muted)'}}>{opt.desc}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                          {confForm.tipo === 'digital' && (
                            <div className="col" style={{gap:8, marginBottom:14}}>
                              <div className="input-group" style={{margin:0}}>
                                <label style={{fontSize:12}}>Nombre completo del firmante <span style={{color:'var(--danger)'}}>*</span></label>
                                <input className="input" style={{fontSize:13}} value={confForm.nombre_firmante} onChange={e => setConfForm(v => ({...v, nombre_firmante: e.target.value}))} placeholder="Nombre y apellido"/>
                              </div>
                              <div className="input-group" style={{margin:0}}>
                                <label style={{fontSize:12}}>Fecha de firma <span style={{color:'var(--danger)'}}>*</span></label>
                                <input className="input" type="date" style={{fontSize:13}} value={confForm.fecha_firma} onChange={e => setConfForm(v => ({...v, fecha_firma: e.target.value}))}/>
                              </div>
                              <div className="input-group" style={{margin:0}}>
                                <label style={{fontSize:12}}>Código / referencia del documento <span className="text-muted">(opcional)</span></label>
                                <input className="input" style={{fontSize:13}} value={confForm.referencia} onChange={e => setConfForm(v => ({...v, referencia: e.target.value}))} placeholder="Ej: DOC-2026-001"/>
                              </div>
                            </div>
                          )}
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={guardandoConf || (confForm.tipo === 'digital' && (!confForm.nombre_firmante.trim() || !confForm.fecha_firma))}
                            onClick={async () => {
                              if (!c) return;
                              setGuardandoConf(true);
                              const payload = { tipo: confForm.tipo, registrado_at: new Date().toISOString() };
                              if (confForm.tipo === 'digital') {
                                payload.nombre_firmante = confForm.nombre_firmante.trim();
                                payload.fecha_firma = confForm.fecha_firma;
                                if (confForm.referencia.trim()) payload.referencia = confForm.referencia.trim();
                              }
                              await actualizarCierreTecnico(c.id, { conformidad_cliente: payload });
                              setGuardandoConf(false);
                              addNotificacion('Conformidad registrada correctamente.');
                            }}
                          >
                            {guardandoConf ? 'Guardando...' : 'Confirmar conformidad'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Partes aprobados */}
                {tabCierre === 'partes' && (
                  <div className="col" style={{gap:8}}>
                    {partesAp.length === 0 && <div className="text-muted" style={{textAlign:'center', padding:24}}>Sin partes aprobados.</div>}
                    {partesAp.map(p => (
                      <div key={p.id} style={{padding:'10px 14px', border:'1px solid var(--border)', borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                          <div style={{fontWeight:600, fontSize:13}}>{getTecnico(p.tecnico_id || p.tecnico)}</div>
                          <div style={{fontSize:12, color:'var(--fg-muted)'}}>{p.fecha} · {p.horas}h · +{p.avance_reportado}%</div>
                          {p.actividades && <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{p.actividades}</div>}
                        </div>
                        <span className="badge badge-green">{I.check} Aprobado</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab Observaciones */}
                {tabCierre === 'observaciones' && (
                  <div style={{padding:'12px 14px', background:'var(--bg-subtle)', borderRadius:6, fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', minHeight:100}}>
                    {c?.observaciones || <span className="text-muted">Sin observaciones registradas.</span>}
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}

// ============ GUÍAS DE REMISIÓN ============
function Remision() {
  const { searchQuery } = useApp();
  const query = searchQuery.toLowerCase();
  const filteredRemisiones = MOCK.remisiones.filter(r => 
    r.id.toLowerCase().includes(query) ||
    r.ot.toLowerCase().includes(query) ||
    r.destino.toLowerCase().includes(query) ||
    r.transportista.toLowerCase().includes(query)
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transporte y Logística</h1>
          <div className="page-sub">Traslado de materiales, guías de remisión y control de flotas</div>
        </div>
        <button className="btn btn-primary">{I.plus} Emitir Guía</button>
      </div>
      <div className="tabs">
        <div className="tab active">Guías de Remisión</div>
        <div className="tab">Flota y Choferes</div>
        <div className="tab">Rutas y Programación</div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° Guía</th>
                <th>OT Destino</th>
                <th>Punto de Llegada</th>
                <th>Transportista / Chofer</th>
                <th>Fecha Salida</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRemisiones.map(r => (
                <tr key={r.id} className="hover-row">
                  <td className="mono" style={{fontWeight:600}}>{r.id}</td>
                  <td className="mono">{r.ot}</td>
                  <td>{r.destino}</td>
                  <td>{r.transportista}</td>
                  <td className="text-muted">{r.fecha}</td>
                  <td>
                    <span className={'badge ' + (r.estado==='entregado'?'badge-green':'badge-cyan')}>
                      {r.estado.toUpperCase()}
                    </span>
                  </td>
                  <td><button className="icon-btn">{I.chev}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const SOLPE_FORM_INIT = { descripcion: '', tipo: 'bien', prioridad: 'normal', solicitante: '', centro_costo_id: '' };

function SOLPE() {
  const { solpes, ots, searchQuery, crearSOLPE, centrosCosto } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(SOLPE_FORM_INIT);
  const [errCeco, setErrCeco] = useState(false);

  const getOTNumero = (id) => ots.find(o => o.id === id)?.numero || id;
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');

  const query = searchQuery.toLowerCase();
  const filteredSolpes = solpes.filter(s =>
    (s.numero || '').toLowerCase().includes(query) ||
    getOTNumero(s.ot_id).toLowerCase().includes(query) ||
    (s.solicitante || '').toLowerCase().includes(query) ||
    (s.centro_costo || '').toLowerCase().includes(query)
  );

  const handleSubmit = () => {
    if (!form.centro_costo_id) { setErrCeco(true); return; }
    crearSOLPE({ ...form, fecha: new Date().toISOString().split('T')[0] });
    setForm(SOLPE_FORM_INIT);
    setErrCeco(false);
    setShowForm(false);
  };

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); if (k === 'centro_costo_id') setErrCeco(false); };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">SOLPE (Pedidos Internos)</h1>
          <div className="page-sub">Requerimientos de almacén generados por el equipo técnico</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>{I.plus} Nueva SOLPE</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° SOLPE</th>
                <th>OT Asociada</th>
                <th>Área / Solicitante</th>
                <th>Centro de Costo</th>
                <th>Tipo</th>
                <th>Urgencia</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredSolpes.map(s => {
                const ceco = cecosActivos.find(c => c.id === s.centro_costo_id);
                return (
                  <tr key={s.id} className="hover-row">
                    <td className="mono" style={{fontWeight:600}}>{s.numero}</td>
                    <td className="mono">{getOTNumero(s.ot_id)}</td>
                    <td>{s.solicitante}</td>
                    <td className="text-muted">{ceco ? `${ceco.codigo} — ${ceco.nombre}` : (s.centro_costo || '—')}</td>
                    <td>{s.tipo || '—'}</td>
                    <td>{s.prioridad || '—'}</td>
                    <td className="text-muted">{s.fecha}</td>
                    <td>
                      <span className={'badge ' + (s.estado==='atendida'?'badge-green':s.estado==='solicitada'?'badge-orange':'badge-gray')}>
                        {(s.estado || '').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {s.estado === 'solicitada' ? (
                        <button className="btn btn-sm btn-primary">Atender</button>
                      ) : (
                        <button className="btn btn-sm btn-ghost">Ver detalles</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredSolpes.length === 0 && (
                <tr><td colSpan="9" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No hay SOLPEs registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <>
        <div className="side-panel-backdrop" onClick={() => setShowForm(false)} />
        <div className="side-panel">
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">Nueva solicitud</div>
              <div className="font-display" style={{fontSize:18, fontWeight:700, marginTop:2}}>Nueva SOLPE</div>
            </div>
            <button className="icon-btn" onClick={() => setShowForm(false)}>{I.x}</button>
          </div>
          <div className="side-panel-body" style={{display:'flex', flexDirection:'column', gap:16}}>
            <div className="form-group">
              <label className="form-label">Descripción de la necesidad *</label>
              <textarea className="input" rows={3} placeholder="Describe el requerimiento..." value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="select" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  <option value="bien">Bien</option>
                  <option value="servicio">Servicio</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Urgencia *</label>
                <select className="select" value={form.prioridad} onChange={e => set('prioridad', e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Área solicitante *</label>
              <input className="input" placeholder="Ej: Mantenimiento, Operaciones..." value={form.solicitante} onChange={e => set('solicitante', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Centro de Costo (CECO) *</label>
              <select className={`select ${errCeco ? 'input-error' : ''}`} value={form.centro_costo_id} onChange={e => set('centro_costo_id', e.target.value)}>
                <option value="">— Seleccionar CECO —</option>
                {cecosActivos.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
              {errCeco && <div style={{color:'var(--danger, #ef4444)', fontSize:12, marginTop:4}}>El CECO es obligatorio para crear una SOLPE.</div>}
            </div>
            <div className="row" style={{gap:8, marginTop:8}}>
              <button className="btn btn-primary flex-1" onClick={handleSubmit}>{I.check} Crear SOLPE</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      </>}
    </>
  );
}


// ─── Planner v2 helpers ───────────────────────────────────────────────────────
function otPriorityColor(prioridad) {
  const p = (prioridad || 'normal').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if (p === 'critica') return '#ef4444';
  if (p === 'urgente') return '#f97316';
  return '#0ea5e9';
}
const PRIORIDAD_LABEL = { critica:'Crítica', urgente:'Urgente', normal:'Normal' };
const PRIORIDAD_ORDER = { critica:0, urgente:1, normal:2 };
function prioKey(p) { return (p||'normal').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }

function getSemana(offsetSemanas) {
  const hoy = new Date();
  const dow = hoy.getDay();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1) + offsetSemanas * 7);
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return { label: `${DIAS[i]} ${d.getDate()}`, fecha: d.toISOString().split('T')[0], esHoy: d.toDateString() === new Date().toDateString() };
  });
}

function ModalAsignacionRango({ otId, onClose, tecnicos, cuadrillas, onConfirm, ots, plannerAsignaciones, turnos }) {
  const ot = ots.find(o => o.id === otId);
  const hoy = new Date().toISOString().split('T')[0];
  const [fi, setFi] = useState(hoy);
  const [ff, setFf] = useState(hoy);
  const [hi, setHi] = useState('');
  const [hf, setHf] = useState('');
  const [selTecs, setSelTecs] = useState([]);
  const [cuadrilla, setCuadrilla] = useState('');
  const [paso, setPaso] = useState('form'); // 'form' | 'resumen'
  const [saving, setSaving] = useState(false);
  const [turnoAviso, setTurnoAviso] = useState(false);

  // Obtener horas de turno de un técnico
  const getTurnoHoras = (t) => {
    if (!t) return { hi: '', hf: '' };
    const turno = (turnos || []).find(x => x.id === t.turno_id);
    if (turno?.hora_entrada) return { hi: turno.hora_entrada.slice(0,5), hf: turno.hora_salida?.slice(0,5) || '' };
    if (t.hora_entrada) return { hi: t.hora_entrada.slice(0,5), hf: t.hora_salida?.slice(0,5) || '' };
    return { hi: '', hf: '' };
  };

  // Conflictos en tiempo real: técnico seleccionado con asignaciones en el rango
  const conflictosTecs = useMemo(() => {
    if (!fi || !ff) return {};
    const result = {};
    selTecs.forEach(tid => {
      const solapadas = (plannerAsignaciones || []).filter(a =>
        a.tecnico_id === tid &&
        a.estado !== 'cancelado' &&
        a.ot_id !== otId &&
        a.fecha >= fi && a.fecha <= ff
      );
      if (solapadas.length) result[tid] = solapadas;
    });
    return result;
  }, [selTecs, fi, ff, plannerAsignaciones, otId]);

  const toggleTec = (id) => {
    setSelTecs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      // Auto-fill horas desde el turno del primer técnico seleccionado
      if (!prev.includes(id) && prev.length === 0) {
        const tec = tecnicos.find(t => t.id === id);
        const { hi: h1, hf: h2 } = getTurnoHoras(tec);
        if (h1) { setHi(h1); setHf(h2); }
      }
      // Advertencia si los técnicos tienen turnos distintos
      if (!prev.includes(id) && prev.length > 0) {
        const primerTec = tecnicos.find(t => t.id === prev[0]);
        const nuevoTec = tecnicos.find(t => t.id === id);
        const t1 = primerTec?.turno_id;
        const t2 = nuevoTec?.turno_id;
        if (t1 && t2 && t1 !== t2) setTurnoAviso(true);
      }
      if (next.length === 0) setTurnoAviso(false);
      return next;
    });
  };

  const aplicarCuadrilla = (cid) => {
    setCuadrilla(cid);
    const c = cuadrillas.find(x => x.id === cid);
    if (c) {
      const ids = (c.cuadrilla_miembros || []).map(m => m.tecnico_id).filter(Boolean);
      setSelTecs(ids);
      if (ids.length > 0) {
        const tec = tecnicos.find(t => t.id === ids[0]);
        const { hi: h1, hf: h2 } = getTurnoHoras(tec);
        if (h1) { setHi(h1); setHf(h2); }
      }
    }
  };

  const handleConfirm = async () => {
    if (!selTecs.length || saving) return;
    setSaving(true);
    try {
      await onConfirm({
        otId,
        tecnicoIds: selTecs,
        fechaInicio: fi,
        fechaFin: ff,
        horaInicio: hi || null,
        horaFin: hf || null,
        cuadrillaOrigenId: cuadrilla || null,
        forzar: true,
      });
      onClose();
    } catch (e) { setSaving(false); }
  };

  const nConflictos = Object.keys(conflictosTecs).length;
  const diasRango = fi && ff ? Math.max(1, Math.round((new Date(ff) - new Date(fi)) / 86400000) + 1) : 1;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={onClose}>
      <div className="card" style={{width:'min(560px,96vw)',maxHeight:'92vh',overflow:'auto',padding:0}} onClick={e=>e.stopPropagation()}>
        <div className="card-head" style={{padding:'16px 20px'}}>
          <div>
            <h3 style={{margin:0}}>{paso==='resumen'?'Confirmar asignación':'Asignar OT — Rango de fechas'}</h3>
            <div style={{fontSize:12,color:'var(--cyan)',marginTop:2,fontWeight:600}}>{ot?.numero} — {ot?.servicio||ot?.descripcion}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{fontSize:18}}>×</button>
        </div>

        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>

          {paso === 'form' ? (<>
            {/* Fechas */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="input-group"><label>Fecha inicio</label><input className="input" type="date" value={fi} min={hoy} onChange={e=>setFi(e.target.value)}/></div>
              <div className="input-group"><label>Fecha fin</label><input className="input" type="date" value={ff} min={fi} onChange={e=>setFf(e.target.value)}/></div>
            </div>
            {/* Horas */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="input-group">
                <label>Hora inicio <span style={{fontWeight:400,color:'var(--fg-muted)',fontSize:10}}>(del turno)</span></label>
                <input className="input" type="time" value={hi} onChange={e=>setHi(e.target.value)}/>
              </div>
              <div className="input-group">
                <label>Hora fin</label>
                <input className="input" type="time" value={hf} onChange={e=>setHf(e.target.value)}/>
              </div>
            </div>
            {turnoAviso && (
              <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid var(--orange)',borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--orange-dk)'}}>
                ⚠ Los técnicos seleccionados tienen turnos diferentes. Verifica las horas.
              </div>
            )}
            {/* Cuadrilla */}
            {cuadrillas.length > 0 && (
              <div className="input-group">
                <label>Cuadrilla (atajo)</label>
                <select className="select" value={cuadrilla} onChange={e=>aplicarCuadrilla(e.target.value)}>
                  <option value="">— Seleccionar técnicos individualmente —</option>
                  {cuadrillas.map(c=><option key={c.id} value={c.id}>{c.nombre} ({(c.cuadrilla_miembros||[]).length} miembros)</option>)}
                </select>
              </div>
            )}
            {/* Lista de técnicos */}
            <div>
              <div className="label" style={{marginBottom:8}}>Técnicos ({selTecs.length} seleccionados)</div>
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
                {tecnicos.map(t => {
                  const sel = selTecs.includes(t.id);
                  const conflicto = conflictosTecs[t.id];
                  const turno = (turnos||[]).find(x=>x.id===t.turno_id);
                  return (
                    <label key={t.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 10px',borderRadius:8,border:`1px solid ${conflicto&&sel?'var(--danger)':sel?'var(--cyan)':'var(--border)'}`,cursor:'pointer',background:conflicto&&sel?'rgba(239,68,68,0.04)':sel?'rgba(0,188,212,0.06)':'var(--surface)'}}>
                      <input type="checkbox" className="checkbox" style={{marginTop:2}} checked={sel} onChange={()=>toggleTec(t.id)}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <span style={{fontWeight:600,fontSize:13}}>{t.nombre}</span>
                          {conflicto && sel && <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'var(--danger)',color:'#fff'}}>Conflicto</span>}
                        </div>
                        <div style={{fontSize:11,color:'var(--fg-muted)',marginTop:1}}>
                          {t.cargo}{(t.costo_hora_real??t.costo??t.costo_hora)?` · S/${t.costo_hora_real??t.costo??t.costo_hora}/h`:''}{turno?` · Turno: ${turno.nombre}`:''}
                        </div>
                        {conflicto && sel && (
                          <div style={{fontSize:11,color:'var(--danger)',marginTop:3}}>
                            {conflicto.map(a=>{
                              const otConf = ots.find(o=>o.id===a.ot_id);
                              return <div key={a.id}>Asignado a {otConf?.numero||a.ot_id} · {a.fecha}</div>;
                            })}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </>) : (<>
            {/* PASO RESUMEN */}
            <div style={{background:'var(--bg-subtle)',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:6}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--fg-muted)',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Resumen de asignación</div>
              <div style={{fontSize:13}}><strong>OT:</strong> {ot?.numero} — {ot?.servicio||ot?.descripcion}</div>
              <div style={{fontSize:13}}><strong>Rango:</strong> {fi} al {ff} <span style={{color:'var(--fg-muted)'}}>({diasRango} día{diasRango!==1?'s':''})</span></div>
              {(hi||hf) && <div style={{fontSize:13}}><strong>Horario:</strong> {hi||'--:--'} – {hf||'--:--'}</div>}
              <div style={{fontSize:13,marginTop:4}}><strong>Técnicos ({selTecs.length}):</strong></div>
              <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:2}}>
                {selTecs.map(tid=>{
                  const tec=tecnicos.find(x=>x.id===tid);
                  const conf=conflictosTecs[tid];
                  return (
                    <div key={tid} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,padding:'5px 8px',borderRadius:6,background:conf?'rgba(239,68,68,0.06)':'rgba(0,188,212,0.04)',border:`1px solid ${conf?'rgba(239,68,68,0.2)':'rgba(0,188,212,0.15)'}`}}>
                      <span style={{color:conf?'var(--danger)':'var(--green)'}}>●</span>
                      <span style={{fontWeight:600}}>{tec?.nombre||tid}</span>
                      {conf && <span style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'var(--danger)',color:'#fff'}}>Conflicto</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            {nConflictos > 0 && (
              <div style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'10px 12px',fontSize:12,color:'var(--danger)'}}>
                ⚠ {nConflictos} técnico{nConflictos!==1?'s tienen':' tiene'} conflictos de horario. ¿Confirmas la asignación?
              </div>
            )}
          </>)}

          <div className="row" style={{justifyContent:'flex-end',gap:8,marginTop:4}}>
            {paso==='resumen'
              ? <><button className="btn btn-secondary" onClick={()=>setPaso('form')}>← Volver</button>
                  <button className="btn btn-primary" data-local-form="true" disabled={saving} onClick={handleConfirm}>
                    {saving?'Asignando...':'Confirmar asignación'}
                  </button></>
              : <><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                  <button className="btn btn-primary" data-local-form="true" disabled={!selTecs.length} onClick={()=>setPaso('resumen')}>
                    Ver resumen →
                  </button></>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function PopupDetalleDia({ otId, fecha, asignaciones, tecnicos, partesPendientesSet, onQuitar, onActualizar, onAgregarTecnico, onClose, ots, navigate }) {
  const ot = ots.find(o => o.id === otId);
  const [motivo, setMotivo] = useState('');
  const [quitando, setQuitando] = useState(null);
  const [editando, setEditando] = useState(null); // asignacion id siendo editado
  const [editForm, setEditForm] = useState({ fecha: '', inicio: '', fin: '' });
  const [guardando, setGuardando] = useState(false);
  const [showAgregar, setShowAgregar] = useState(false);
  const [tecAdd, setTecAdd] = useState('');
  const [horas, setHoras] = useState({ inicio: '', fin: '' });

  const asigDia = asignaciones.filter(a => a.ot_id === otId && a.fecha === fecha && a.estado !== 'cancelado');
  const tecIdsAsig = new Set(asigDia.map(a => a.tecnico_id));

  const abrirEdicion = (a) => {
    setEditando(a.id);
    setQuitando(null);
    setEditForm({
      fecha: a.fecha,
      inicio: a.hora_inicio_estimada ? a.hora_inicio_estimada.slice(0, 5) : '',
      fin: a.hora_fin_estimada ? a.hora_fin_estimada.slice(0, 5) : '',
    });
  };

  const guardarEdicion = async (a) => {
    setGuardando(true);
    try {
      await onActualizar(a.id, {
        fecha: editForm.fecha || a.fecha,
        horaInicio: editForm.inicio || null,
        horaFin: editForm.fin || null,
      });
      setEditando(null);
    } finally { setGuardando(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={onClose}>
      <div className="card" style={{width:'min(480px,96vw)',padding:0}} onClick={e=>e.stopPropagation()}>
        <div className="card-head" style={{padding:'14px 18px', borderBottom:'1px solid var(--border)'}}>
          <div style={{flex:1}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:2}}>
              <span style={{fontWeight:800, fontSize:15, color:'var(--cyan)'}}>{ot?.numero}</span>
              <button className="btn btn-ghost btn-sm" style={{padding:'2px 8px', fontSize:11, height:24}} onClick={() => { navigate('ot', { detail: otId }); onClose(); }}>
                Ver Detalle OT →
              </button>
            </div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>Equipo asignado para el {fecha}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{fontSize:20}}>×</button>
        </div>

        <div style={{padding:'12px 18px',display:'flex',flexDirection:'column',gap:10,maxHeight:440,overflowY:'auto'}}>
          {asigDia.length === 0 && <div className="text-muted" style={{fontSize:13,textAlign:'center',padding:20}}>Sin colaboradores asignados este día.</div>}
          {asigDia.map(a => {
            const tec = tecnicos.find(t => t.id === a.tecnico_id) || {};
            const hasParte = !partesPendientesSet.has(`${a.tecnico_id}__${fecha}`);
            const esEdicion = editando === a.id;
            const esQuitando = quitando === a.id;

            return (
              <div key={a.id} style={{display:'flex',flexDirection:'column',gap:0,borderRadius:10,border:`1px solid ${esEdicion?'var(--cyan)':'var(--border)'}`,background:'var(--surface)',overflow:'hidden',transition:'border-color 0.15s'}}>
                {/* Fila principal */}
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{tec.nombre||a.tecnico_id}</div>
                    <div style={{fontSize:11,color:'var(--fg-muted)'}}>{tec.cargo||'—'}</div>
                  </div>
                  <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                    {!esQuitando && !esEdicion && (
                      <button className="icon-btn" style={{fontSize:13,color:'var(--fg-muted)'}} title="Editar fecha/horario" onClick={()=>abrirEdicion(a)}>{I.edit}</button>
                    )}
                    {!esEdicion && (
                      esQuitando ? (
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <input className="input" style={{width:100,fontSize:11,height:28}} placeholder="Motivo..." value={motivo} onChange={e=>setMotivo(e.target.value)} autoFocus/>
                          <button className="btn btn-danger btn-sm" style={{height:28,fontSize:11}} onClick={async()=>{await onQuitar(a.id,motivo);setQuitando(null);setMotivo('');}}>OK</button>
                          <button className="btn btn-ghost btn-sm" style={{height:28}} onClick={()=>setQuitando(null)}>✕</button>
                        </div>
                      ) : (
                        <button className="icon-btn" style={{fontSize:13,color:'var(--fg-muted)'}} title="Quitar de este día" onClick={()=>{setQuitando(a.id);setEditando(null);}}>✕</button>
                      )
                    )}
                  </div>
                </div>

                {/* Horario display / edit */}
                {esEdicion ? (
                  <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',background:'rgba(14,165,233,0.03)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
                      <div className="input-group">
                        <label style={{fontSize:10}}>Fecha</label>
                        <input className="input" style={{fontSize:12}} type="date" value={editForm.fecha} onChange={e=>setEditForm(f=>({...f,fecha:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label style={{fontSize:10}}>Hora inicio</label>
                        <input className="input" style={{fontSize:12}} type="time" value={editForm.inicio} onChange={e=>setEditForm(f=>({...f,inicio:e.target.value}))}/>
                      </div>
                      <div className="input-group">
                        <label style={{fontSize:10}}>Hora fin</label>
                        <input className="input" style={{fontSize:12}} type="time" value={editForm.fin} onChange={e=>setEditForm(f=>({...f,fin:e.target.value}))}/>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button className="btn btn-primary btn-sm" style={{flex:1}} disabled={guardando} onClick={()=>guardarEdicion(a)}>{guardando?'Guardando...':'Guardar'}</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>setEditando(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 12px 8px',borderTop:'1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{fontSize:11, color:'var(--cyan)', fontWeight:500}}>
                      {a.fecha !== fecha && <span style={{marginRight:6,color:'var(--orange)'}}>📅 {a.fecha}</span>}
                      {a.hora_inicio_estimada ? a.hora_inicio_estimada.slice(0,5) : '—'} – {a.hora_fin_estimada ? a.hora_fin_estimada.slice(0,5) : '—'}
                    </div>
                    {new Date(fecha) < new Date(new Date().toDateString()) && (
                      <span className={`badge ${hasParte?'badge-green':'badge-orange'}`} style={{fontSize:9}}>
                        {hasParte?'✓ Parte ok':'⚠ Sin parte'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {showAgregar && (
            <div className="card" style={{padding:12, background:'rgba(0,188,212,0.03)', border:'1px dashed var(--cyan)'}}>
              <div className="input-group" style={{marginBottom:10}}>
                <label style={{fontSize:11}}>Seleccionar colaborador</label>
                <select className="select" value={tecAdd} onChange={e=>setTecAdd(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {tecnicos.filter(t=>!tecIdsAsig.has(t.id)).map(t=><option key={t.id} value={t.id}>{t.nombre} — {t.cargo||'—'}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div className="input-group"><label style={{fontSize:11}}>Hora inicio</label><input className="input" type="time" value={horas.inicio} onChange={e=>setHoras(h=>({...h,inicio:e.target.value}))}/></div>
                <div className="input-group"><label style={{fontSize:11}}>Hora fin</label><input className="input" type="time" value={horas.fin} onChange={e=>setHoras(h=>({...h,fin:e.target.value}))}/></div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" style={{flex:1}} disabled={!tecAdd} onClick={async()=>{await onAgregarTecnico({otId,tecnicoId:tecAdd,fecha,horaInicio:horas.inicio,horaFin:horas.fin});setTecAdd('');setShowAgregar(false);}}>Agregar</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>setShowAgregar(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {!showAgregar && (
          <div style={{padding:'10px 18px',borderTop:'1px solid var(--border)'}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>setShowAgregar(true)}>+ Agregar colaborador este día</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TabCuadrillas({ cuadrillas, tecnicos, especialidades, crearCuadrillaCtx, actualizarCuadrillaCtx, eliminarCuadrillaCtx }) {
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [esp, setEsp] = useState('');
  const [selTecs, setSelTecs] = useState([]);
  const [liderId, setLiderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const toggle = id => setSelTecs(p => {
    const next = p.includes(id) ? p.filter(x => x !== id) : [...p, id];
    if (!next.includes(liderId)) setLiderId('');
    return next;
  });

  const handleSave = async () => {
    if (!nombre || !selTecs.length) return;
    setSaving(true);
    try {
      if (editId) {
        await actualizarCuadrillaCtx(editId, { nombre, descripcion, especialidad: esp, liderTecnicoId: liderId || null, tecnicoIds: selTecs });
      } else {
        await crearCuadrillaCtx({ nombre, descripcion, especialidad: esp, liderTecnicoId: liderId || null, tecnicoIds: selTecs });
      }
      handleClose();
    } finally { setSaving(false); }
  };

  const handleEdit = (c) => {
    setEditId(c.id);
    setNombre(c.nombre);
    setDescripcion(c.descripcion || '');
    setEsp(c.especialidad_principal || '');
    const ids = (c.cuadrilla_miembros || []).map(m => m.tecnico_id);
    setSelTecs(ids);
    setLiderId(c.lider_id || '');
    setShow(true);
  };

  const handleClose = () => {
    setShow(false); setEditId(null); setNombre(''); setDescripcion('');
    setEsp(''); setSelTecs([]); setLiderId('');
  };

  const liderTecs = selTecs.map(id => tecnicos.find(t => t.id === id)).filter(Boolean);

  return (
    <div style={{display:'grid', gap:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:13, color:'var(--fg-muted)'}}>{cuadrillas.length} cuadrilla{cuadrillas.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" data-local-form="true" onClick={() => setShow(true)}>+ Nueva cuadrilla</button>
      </div>

      {cuadrillas.length === 0
        ? <div className="card" style={{padding:40, textAlign:'center', color:'var(--fg-muted)'}}>No hay cuadrillas. Crea una para agilizar asignaciones en el planner.</div>
        : (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
              <thead>
                <tr style={{background:'var(--bg-subtle)', borderBottom:'1px solid var(--border)'}}>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'var(--fg-muted)'}}>Nombre</th>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'var(--fg-muted)'}}>Descripción</th>
                  <th style={{padding:'10px 14px', textAlign:'center', fontWeight:600, color:'var(--fg-muted)'}}>N° Técnicos</th>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'var(--fg-muted)'}}>Especialidad principal</th>
                  <th style={{padding:'10px 14px', textAlign:'center', fontWeight:600, color:'var(--fg-muted)'}}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuadrillas.map((c, i) => {
                  const miembros = c.cuadrilla_miembros || [];
                  const lider = tecnicos.find(t => t.id === c.lider_id);
                  return (
                    <tr key={c.id} style={{borderBottom: i < cuadrillas.length - 1 ? '1px solid var(--border)' : 'none', background:'var(--surface)'}}>
                      <td style={{padding:'12px 14px'}}>
                        <div style={{fontWeight:700}}>{c.nombre}</div>
                        {lider && <div style={{fontSize:11, color:'var(--cyan)', marginTop:2}}>Líder: {lider.nombre}</div>}
                      </td>
                      <td style={{padding:'12px 14px', color:'var(--fg-muted)', maxWidth:220}}>
                        {c.descripcion || <span style={{color:'var(--fg-muted)', opacity:0.5}}>—</span>}
                      </td>
                      <td style={{padding:'12px 14px', textAlign:'center'}}>
                        <span style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:'50%', background:'var(--bg-subtle)', fontWeight:700, fontSize:13, border:'1px solid var(--border)'}}>
                          {miembros.length}
                        </span>
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        {c.especialidad_principal
                          ? <span style={{fontSize:12, padding:'2px 8px', borderRadius:6, background:'rgba(0,188,212,0.08)', color:'var(--cyan)', border:'1px solid rgba(0,188,212,0.2)'}}>{c.especialidad_principal}</span>
                          : <span style={{color:'var(--fg-muted)', opacity:0.5}}>—</span>}
                      </td>
                      <td style={{padding:'12px 14px', textAlign:'center'}}>
                        <div style={{display:'flex', gap:4, justifyContent:'center'}}>
                          <button className="icon-btn" style={{fontSize:14}} onClick={() => handleEdit(c)} title="Editar">{I.edit}</button>
                          <button className="icon-btn" style={{fontSize:14, color:'var(--danger)'}} onClick={() => setConfirmDel(c)} title="Eliminar">✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }

      {/* Modal nueva/editar cuadrilla */}
      {show && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16}} onClick={handleClose}>
          <div className="card" style={{width:'min(520px,96vw)', padding:0, maxHeight:'90vh', display:'flex', flexDirection:'column'}} onClick={e => e.stopPropagation()}>
            <div className="card-head" style={{padding:'14px 18px', flexShrink:0}}>
              <h3 style={{margin:0}}>{editId ? 'Editar' : 'Nueva'} cuadrilla</h3>
              <button className="icon-btn" onClick={handleClose}>×</button>
            </div>
            <div style={{padding:'16px 18px', display:'flex', flexDirection:'column', gap:12, overflowY:'auto'}}>
              <div className="input-group">
                <label>Nombre *</label>
                <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Cuadrilla Eléctrica A" autoFocus/>
              </div>
              <div className="input-group">
                <label>Descripción</label>
                <input className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Equipo de instalaciones eléctricas zona norte"/>
              </div>
              <div className="input-group">
                <label>Especialidad principal</label>
                {especialidades?.length > 0
                  ? <select className="select" value={esp} onChange={e => setEsp(e.target.value)}>
                      <option value="">— Sin especialidad —</option>
                      {especialidades.filter(e => e.estado !== 'inactivo').map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                    </select>
                  : <input className="input" value={esp} onChange={e => setEsp(e.target.value)} placeholder="Ej: Electricidad industrial"/>
                }
              </div>
              <div>
                <div className="label" style={{marginBottom:6}}>Técnicos miembros * ({selTecs.length} seleccionados)</div>
                <div style={{maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:4, border:'1px solid var(--border)', borderRadius:8, padding:6}}>
                  {tecnicos.map(t => (
                    <label key={t.id} style={{display:'flex', gap:10, alignItems:'center', padding:'6px 8px', borderRadius:6, border:`1px solid ${selTecs.includes(t.id) ? 'var(--cyan)' : 'transparent'}`, cursor:'pointer', background: selTecs.includes(t.id) ? 'rgba(0,188,212,0.06)' : 'transparent'}}>
                      <input type="checkbox" className="checkbox" checked={selTecs.includes(t.id)} onChange={() => toggle(t.id)}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:600, fontSize:13}}>{t.nombre}</div>
                        <div style={{fontSize:11, color:'var(--fg-muted)'}}>{[t.cargo, t.especialidad].filter(Boolean).join(' · ')}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {selTecs.length > 0 && (
                <div className="input-group">
                  <label>Líder de cuadrilla <span style={{color:'var(--fg-muted)', fontWeight:400}}>(opcional)</span></label>
                  <select className="select" value={liderId} onChange={e => setLiderId(e.target.value)}>
                    <option value="">— Sin líder asignado —</option>
                    {liderTecs.map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.cargo}</option>)}
                  </select>
                </div>
              )}
              <div className="row" style={{justifyContent:'flex-end', gap:8, paddingTop:4}}>
                <button className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
                <button className="btn btn-primary" data-local-form="true" disabled={!nombre || !selTecs.length || saving} onClick={handleSave}>
                  {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear cuadrilla'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm eliminar */}
      {confirmDel && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1001, display:'flex', alignItems:'center', justifyContent:'center', padding:16}} onClick={() => setConfirmDel(null)}>
          <div className="card" style={{width:'min(360px,96vw)', padding:20}} onClick={e => e.stopPropagation()}>
            <div style={{fontWeight:700, marginBottom:8}}>Eliminar cuadrilla</div>
            <div style={{fontSize:13, color:'var(--fg-muted)', marginBottom:16}}>¿Seguro que deseas eliminar <strong>{confirmDel.nombre}</strong>? Esta acción no se puede deshacer.</div>
            <div className="row" style={{gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => { eliminarCuadrillaCtx(confirmDel.id); setConfirmDel(null); }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OTBandejaCard({ ot, cuentas, dragOtId, setDragOtId, setModalAsig, enCurso = false, diasAsignados = 0 }) {
  const cli = cuentas.find(c => c.id === ot.cuenta_id);
  const pk = prioKey(ot.prioridad);
  const prioColor = otPriorityColor(ot.prioridad);
  const prioLabel = PRIORIDAD_LABEL[pk] || 'Normal';
  const fechaLimite = ot.fecha_limite || ot.fecha_programada;
  const vencida = fechaLimite && new Date(fechaLimite) < new Date();
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('otId', ot.id); setDragOtId(ot.id); }}
      onDragEnd={() => setDragOtId(null)}
      title={enCurso ? 'Arrastra para agregar más días' : 'Arrastra para asignar a un colaborador'}
      style={{
        background: enCurso ? 'color-mix(in srgb, var(--cyan) 5%, var(--surface))' : 'var(--surface)',
        border: enCurso ? '1px solid color-mix(in srgb, var(--cyan) 30%, var(--border))' : '1px solid var(--border)',
        borderTop: `3px solid ${enCurso ? 'var(--cyan)' : prioColor}`,
        borderRadius: 12,
        padding: '10px 14px',
        cursor: 'grab',
        userSelect: 'none',
        width: 240,
        transition: 'box-shadow 0.15s, opacity 0.15s',
        boxShadow: dragOtId === ot.id ? '0 8px 20px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
        opacity: dragOtId === ot.id ? 0.45 : 1,
      }}>
      <div className="row" style={{justifyContent:'space-between', marginBottom:6, alignItems:'center'}}>
        <div className="row" style={{gap:6, alignItems:'center'}}>
          <span style={{fontSize:14, color:'var(--fg-muted)', lineHeight:1}}>⠿</span>
          <div style={{fontWeight:800, color: enCurso ? 'var(--cyan)' : 'var(--cyan)', fontSize:13}}>{ot.numero}</div>
        </div>
        <div className="row" style={{gap:4, alignItems:'center'}}>
          {!enCurso && <span style={{fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:prioColor, color:'#fff'}}>{prioLabel}</span>}
          {enCurso && <span style={{fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:'var(--cyan)', color:'#fff'}}>{diasAsignados}d</span>}
          <button className="btn btn-ghost btn-sm" style={{padding:2}} title="Asignar por rango" onClick={e => { e.stopPropagation(); setModalAsig({ otId: ot.id }); }}>{I.calendar}</button>
        </div>
      </div>
      <div style={{fontWeight:600, fontSize:12, marginBottom:2}}>{cli?.razon_social || 'Cliente desconocido'}</div>
      <div style={{fontSize:11, color:'var(--fg-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom: fechaLimite ? 5 : 0}}>{ot.servicio || ot.descripcion}</div>
      {fechaLimite && (
        <div style={{fontSize:10, fontWeight:600, color: vencida ? 'var(--danger)' : 'var(--fg-muted)', display:'flex', alignItems:'center', gap:4}}>
          <span className="planner-inline-icon">{I.calendar}</span> Límite: {fechaLimite}{vencida ? ' ⚠' : ''}
        </div>
      )}
    </div>
  );
}

function Planner() {
  const {
    searchQuery, personalOperativo, ots, cuentas, navigate,
    plannerAsignaciones, loadPlannerSemana, crearAsignacionesRango,
    agregarTecnicoADia, quitarTecnicoDeDia, actualizarAsignacionCtx, cuadrillas, crearCuadrillaCtx,
    actualizarCuadrillaCtx, eliminarCuadrillaCtx, especialidades,
    partesPendientesSet, renovaciones, onboardings, planesExito, npsEncuestas,
    vacacionesSolicitudes, licencias, turnos,
  } = useApp();

  const [plannerTab, setPlannerTab] = useState('tecnicos');
  const [offsetSemanas, setOffsetSemanas] = useState(0);
  const [dragOtId, setDragOtId] = useState(null);
  const [modalAsig, setModalAsig] = useState(null); // { otId }
  const [popupDia, setPopupDia] = useState(null);   // { otId, fecha }
  const [loading, setLoading] = useState(false);

  const semana = useMemo(() => getSemana(offsetSemanas), [offsetSemanas]);

  useEffect(() => {
    setLoading(true);
    loadPlannerSemana(semana[0].fecha, semana[6].fecha).finally(() => setLoading(false));
  }, [semana[0].fecha, semana[6].fecha]);

  const tecnicos = useMemo(() => personalOperativo.filter(p => !['inactivo', 'baja'].includes(p.estado)), [personalOperativo]);

  // Agrupar asignaciones por técnico y fecha para renderizar celdas
  const asigMap = useMemo(() => {
    const map = {};
    plannerAsignaciones.forEach(a => {
      const key = `${a.tecnico_id}__${a.fecha}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [plannerAsignaciones]);

  // Agrupar asignaciones por OT para ver bloques consistentes
  const otAsigMap = useMemo(() => {
    const map = {};
    plannerAsignaciones.forEach(a => {
      if (!map[a.ot_id]) map[a.ot_id] = new Set();
      map[a.ot_id].add(a.fecha);
    });
    return map;
  }, [plannerAsignaciones]);

  // Ausencias aprobadas (vacaciones + licencias) → set de "personal_id__fecha__Tipo"
  const ausenciasDias = useMemo(() => {
    const set = new Set();
    const addRange = (personalId, fInicio, fFin, tipo) => {
      if (!personalId || !fInicio) return;
      const end = new Date(fFin || fInicio);
      for (let d = new Date(fInicio); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(`${personalId}__${d.toISOString().split('T')[0]}__${tipo}`);
      }
    };
    (vacacionesSolicitudes || []).filter(v => v.estado === 'aprobado').forEach(v =>
      addRange(v.personal_id, v.fecha_inicio, v.fecha_fin, 'Vacaciones'));
    (licencias || []).filter(l => l.estado === 'aprobado').forEach(l =>
      addRange(l.personal_id, l.fecha_inicio, l.fecha_fin, 'Licencia'));
    return set;
  }, [vacacionesSolicitudes, licencias]);

  const getAusenciaTipo = (tecnicoId, fecha) => {
    for (const tipo of ['Vacaciones', 'Licencia']) {
      if (ausenciasDias.has(`${tecnicoId}__${fecha}__${tipo}`)) return tipo;
    }
    return null;
  };

  // Horas asignadas por técnico en la semana visible
  const horasAsignadasMap = useMemo(() => {
    const map = {};
    plannerAsignaciones.forEach(a => {
      if (a.estado === 'cancelado') return;
      if (!map[a.tecnico_id]) map[a.tecnico_id] = 0;
      if (a.hora_inicio_estimada && a.hora_fin_estimada) {
        const [h1, m1] = a.hora_inicio_estimada.slice(0,5).split(':').map(Number);
        const [h2, m2] = a.hora_fin_estimada.slice(0,5).split(':').map(Number);
        const hrs = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
        if (hrs > 0) map[a.tecnico_id] += hrs;
      } else {
        map[a.tecnico_id] += 8;
      }
    });
    return map;
  }, [plannerAsignaciones]);

  const query = searchQuery.toLowerCase();
  const getCuentaNombre = id => cuentas.find(c => c.id === id)?.razon_social || id;

  const ESTADOS_TERMINAL = ['anulada', 'cerrada', 'valorizada', 'facturada'];
  const sortPorPrioridad = (a, b) => {
    const pa = PRIORIDAD_ORDER[prioKey(a.prioridad)] ?? 2;
    const pb = PRIORIDAD_ORDER[prioKey(b.prioridad)] ?? 2;
    if (pa !== pb) return pa - pb;
    const fa = a.fecha_limite || a.fecha_programada || '9999';
    const fb = b.fecha_limite || b.fecha_programada || '9999';
    return fa.localeCompare(fb);
  };
  const tieneAsignacion = (otId) => plannerAsignaciones.some(a => a.ot_id === otId && a.estado !== 'cancelado');

  const sinAsignar = useMemo(() => {
    return ots
      .filter(ot => !ESTADOS_TERMINAL.includes(ot.estado) && !tieneAsignacion(ot.id))
      .sort(sortPorPrioridad);
  }, [ots, plannerAsignaciones]);

  const enEjecucionPlanner = useMemo(() => {
    return ots
      .filter(ot => !ESTADOS_TERMINAL.includes(ot.estado) && tieneAsignacion(ot.id))
      .sort(sortPorPrioridad);
  }, [ots, plannerAsignaciones]);

  const filteredRenovaciones = [...renovaciones]
    .filter(r => (r.dias_restantes ?? 9999) <= 90 && (!query || getCuentaNombre(r.cuenta_id).toLowerCase().includes(query)))
    .sort((a, b) => (a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999));

  const filteredOnboardings = onboardings
    .filter(o => o.estado !== 'completado' && (!query || getCuentaNombre(o.cuenta_id).toLowerCase().includes(query)));

  const filteredNps = npsEncuestas
    .filter(n => n.estado === 'pendiente' && (!query || getCuentaNombre(n.cuenta_id).toLowerCase().includes(query)));

  const filteredPlanes = planesExito
    .filter(p => p.estado === 'activo' && p.alertas?.length > 0 && (!query || getCuentaNombre(p.cuenta_id).toLowerCase().includes(query)));

  const urgentes = filteredRenovaciones.filter(r => (r.dias_restantes ?? 0) <= 30).length + filteredNps.length;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Planner de Recursos v2</h1><div className="page-sub">Programación OT × Rango × Cuadrilla</div></div>
        <div className="row" style={{gap:12}}>
          <div className="row" style={{background:'var(--bg-subtle)', borderRadius:12, padding:'4px 8px', border:'1px solid var(--border)'}}>
            <button className="icon-btn" onClick={() => setOffsetSemanas(s => s - 1)} title="Semana anterior">{I.chevronLeft}</button>
            <div style={{minWidth:180, textAlign:'center', fontWeight:700, fontSize:13}}>
              {new Date(semana[0].fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — {new Date(semana[6].fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <button className="icon-btn" onClick={() => setOffsetSemanas(s => s + 1)} title="Siguiente semana">{I.chevronRight}</button>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setOffsetSemanas(0)}>{I.refresh} Hoy</button>
          <button type="button" className="btn btn-primary" data-local-form="true" onClick={() => navigate('ot')}>{I.plus} Nueva OT</button>
        </div>
      </div>

      <div className="tabs">
        <div className={'tab '+(plannerTab==='tecnicos'?'active':'')} onClick={()=>setPlannerTab('tecnicos')}>Grilla de Técnicos</div>
        <div className={'tab '+(plannerTab==='cuadrillas'?'active':'')} onClick={()=>setPlannerTab('cuadrillas')}>Cuadrillas</div>
        <div className={'tab '+(plannerTab==='cs'?'active':'')} onClick={()=>setPlannerTab('cs')}>
          Agenda CS
          {urgentes > 0 && <span className="sidebar-item-badge" style={{marginLeft:6}}>{urgentes}</span>}
        </div>
      </div>

      {plannerTab === 'tecnicos' && (
        <div style={{display:'flex', flexDirection:'column', gap:20}}>
          <div className="card" style={{padding:0, position:'relative', minHeight:400}}>
            {loading && (
              <div style={{position:'absolute', inset:0, background:'rgba(255,255,255,0.6)', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div className="spinner" />
              </div>
            )}
            <div style={{overflowX:'auto'}}>
              <table className="tbl" style={{minWidth:900, borderCollapse:'separate', borderSpacing:0}}>
                <thead style={{position:'sticky', top:0, zIndex:5}}>
                  <tr>
                    <th style={{width:220, background:'var(--bg-subtle)', position:'sticky', left:0, zIndex:6, borderRight:'2px solid var(--border)'}}>Colaborador</th>
                    {semana.map(d => (
                      <th key={d.fecha} style={{textAlign:'center', background: d.esHoy ? 'rgba(14,165,233,0.05)' : 'var(--bg-subtle)', color: d.esHoy ? 'var(--cyan)' : 'inherit'}}>
                        <div style={{fontSize:11, opacity:0.7, fontWeight:400}}>{d.label.split(' ')[0]}</div>
                        <div style={{fontSize:16, fontWeight:800}}>{d.label.split(' ')[1]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tecnicos.length === 0 && (
                    <tr><td colSpan={8} style={{textAlign:'center', padding:48, color:'var(--fg-muted)'}}>No hay personal operativo activo.</td></tr>
                  )}
                  {tecnicos.map(t => (
                    <tr key={t.id} style={{height:60}}>
                      <td style={{position:'sticky', left:0, background:'var(--surface)', zIndex:4, borderRight:'2px solid var(--border)', padding:'10px 16px'}}>
                        <div style={{fontWeight:700, fontSize:13}}>{t.nombre}</div>
                        <div style={{fontSize:11, color:'var(--fg-muted)'}}>{t.cargo || 'Técnico'}</div>
                        {(() => {
                          const horasDisp = t.horas_semana || 40;
                          const horasAsig = Math.round((horasAsignadasMap[t.id] || 0) * 10) / 10;
                          const pct = horasDisp > 0 ? horasAsig / horasDisp : 0;
                          const col = pct > 1 ? 'var(--danger)' : pct > 0.9 ? 'var(--orange)' : 'var(--fg-muted)';
                          return <div style={{fontSize:10, fontWeight:600, color:col, marginTop:3}}>{horasAsig}h / {horasDisp}h</div>;
                        })()}
                      </td>
                      {semana.map(d => {
                        const key = `${t.id}__${d.fecha}`;
                        const asigs = asigMap[key] || [];
                        const ausenciaTipo = getAusenciaTipo(t.id, d.fecha);
                        return (
                          <td key={d.fecha}
                            style={{
                              padding: ausenciaTipo ? 0 : 4,
                              borderRight:'1px solid var(--border-subtle)',
                              verticalAlign:'top',
                              minWidth: 110,
                              background: ausenciaTipo ? 'rgba(148,163,184,0.18)' : d.esHoy ? 'rgba(14,165,233,0.02)' : 'transparent',
                            }}
                            onDragOver={e => { if (!ausenciaTipo) e.preventDefault(); }}
                            onDrop={async e => {
                              e.preventDefault();
                              if (ausenciaTipo) return;
                              const otId = e.dataTransfer.getData('otId');
                              if (otId) await agregarTecnicoADia({ otId, tecnicoId: t.id, fecha: d.fecha });
                            }}>
                            {ausenciaTipo ? (
                              <div style={{height:'100%', minHeight:56, display:'flex', alignItems:'center', justifyContent:'center'}}>
                                <span style={{fontSize:9, fontWeight:700, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:0.5}}>{ausenciaTipo}</span>
                              </div>
                            ) : (
                              <div style={{display:'flex', flexDirection:'column', gap:3}}>
                                {asigs.map(a => {
                                  const ot = ots.find(o => o.id === a.ot_id) || {};
                                  const cli = cuentas.find(c => c.id === ot.cuenta_id);
                                  const bgColor = otPriorityColor(ot.prioridad);
                                  const horario = (a.hora_inicio_estimada && a.hora_fin_estimada)
                                    ? `${a.hora_inicio_estimada.slice(0,5)}–${a.hora_fin_estimada.slice(0,5)}`
                                    : null;
                                  return (
                                    <div key={a.id}
                                      onClick={() => setPopupDia({ otId: a.ot_id, fecha: d.fecha })}
                                      style={{background:bgColor, color:'white', fontSize:10, padding:'4px 6px', borderRadius:4, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                                      <div style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{ot.numero || 'OT'}</div>
                                      {cli && <div style={{fontWeight:400, fontSize:9, opacity:0.9, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{cli.razon_social}</div>}
                                      {horario && <div style={{fontWeight:400, fontSize:9, opacity:0.85}}>{horario}</div>}
                                      {partesPendientesSet.has(`${t.id}__${d.fecha}`) && <div style={{fontSize:8, opacity:0.9}}>● Parte pend.</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(sinAsignar.length > 0 || enEjecucionPlanner.length > 0) && (
            <div className="card">
              <div className="card-head">
                <h3>Bandeja de OTs</h3>
                <div className="row" style={{gap:8}}>
                  {sinAsignar.length > 0 && <span className="badge badge-orange">{sinAsignar.length} sin asignar</span>}
                  {enEjecucionPlanner.length > 0 && <span className="badge badge-cyan">{enEjecucionPlanner.length} en curso</span>}
                </div>
                <span style={{fontSize:11, color:'var(--fg-muted)', marginLeft:8, display:'inline-flex', alignItems:'center', gap:4}}>Arrastra a un técnico o usa <span className="planner-inline-icon">{I.calendar}</span> para asignar rango</span>
              </div>

              {sinAsignar.length > 0 && (
                <>
                  <div style={{padding:'4px 20px 8px', fontSize:11, fontWeight:700, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:.5}}>Sin asignar</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:10, padding:'0 20px 16px'}}>
                    {sinAsignar.map(ot => <OTBandejaCard key={ot.id} ot={ot} cuentas={cuentas} dragOtId={dragOtId} setDragOtId={setDragOtId} setModalAsig={setModalAsig} />)}
                  </div>
                </>
              )}

              {enEjecucionPlanner.length > 0 && (
                <>
                  <div style={{padding:'4px 20px 8px', fontSize:11, fontWeight:700, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:.5, borderTop: sinAsignar.length > 0 ? '1px solid var(--border-subtle)' : 'none', marginTop: sinAsignar.length > 0 ? 4 : 0}}>En curso — agregar más días</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:10, padding:'0 20px 20px'}}>
                    {enEjecucionPlanner.map(ot => {
                      const diasAsignados = new Set(plannerAsignaciones.filter(a => a.ot_id === ot.id && a.estado !== 'cancelado').map(a => a.fecha)).size;
                      return <OTBandejaCard key={ot.id} ot={ot} cuentas={cuentas} dragOtId={dragOtId} setDragOtId={setDragOtId} setModalAsig={setModalAsig} enCurso diasAsignados={diasAsignados} />;
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {plannerTab === 'cuadrillas' && (
        <TabCuadrillas
          cuadrillas={cuadrillas}
          tecnicos={tecnicos}
          especialidades={especialidades}
          crearCuadrillaCtx={crearCuadrillaCtx}
          actualizarCuadrillaCtx={actualizarCuadrillaCtx}
          eliminarCuadrillaCtx={eliminarCuadrillaCtx}
        />
      )}

      {plannerTab === 'cs' && (
        <div style={{display:'grid', gap:20}}>

          {/* 1. Renovaciones */}
          <div className="card">
            <div className="card-head">
              <h3>Renovaciones próximas <span style={{fontSize:12,fontWeight:400,color:'var(--fg-muted)'}}>— 90 días</span></h3>
              <span className="badge badge-cyan">{filteredRenovaciones.length}</span>
            </div>
            {filteredRenovaciones.length === 0
              ? <div style={{padding:'16px 20px', color:'var(--fg-muted)'}}>Sin contratos por vencer en los próximos 90 días</div>
              : <table className="tbl">
                  <thead><tr><th>Cliente</th><th>Servicio</th><th>Vencimiento</th><th>Días</th><th>Responsable CS</th><th>Estado</th></tr></thead>
                  <tbody>
                    {filteredRenovaciones.map(r => {
                      const d = r.dias_restantes ?? 9999;
                      const badgeClass = d <= 30 ? 'badge-red' : d <= 60 ? 'badge-yellow' : 'badge-green';
                      return (
                        <tr key={r.id}>
                          <td style={{fontWeight:600}}>{getCuentaNombre(r.cuenta_id)}</td>
                          <td style={{fontSize:12, color:'var(--fg-muted)', maxWidth:180}}>{r.servicio}</td>
                          <td>{r.fecha_vencimiento}</td>
                          <td><span className={`badge ${badgeClass}`}>{d}d</span></td>
                          <td>{r.responsable_cs || '—'}</td>
                          <td><span className={'badge '+(r.estado==='renovado'?'badge-green':r.estado==='en_negociacion'?'badge-cyan':r.estado==='en_riesgo'?'badge-red':'badge-gray')}>{r.estado?.replace(/_/g,' ')}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>

          {/* 2. Onboardings en progreso */}
          <div className="card">
            <div className="card-head">
              <h3>Onboardings en progreso</h3>
              <span className="badge badge-purple">{filteredOnboardings.length}</span>
            </div>
            {filteredOnboardings.length === 0
              ? <div style={{padding:'16px 20px', color:'var(--fg-muted)'}}>Sin onboardings en curso</div>
              : <table className="tbl">
                  <thead><tr><th>Cliente</th><th>Inicio</th><th>Hitos</th><th>Avance</th><th>Responsable CS</th></tr></thead>
                  <tbody>
                    {filteredOnboardings.map(o => {
                      const checklist = Array.isArray(o.checklist) ? o.checklist : [];
                      const completados = checklist.filter(c => c.completado).length;
                      const total = checklist.length;
                      const pct = total > 0 ? Math.round(completados / total * 100) : (o.avance_pct ?? 0);
                      return (
                        <tr key={o.id}>
                          <td style={{fontWeight:600}}>{getCuentaNombre(o.cuenta_id)}</td>
                          <td>{o.fecha_inicio}</td>
                          <td style={{whiteSpace:'nowrap', fontWeight:600}}>
                            {total > 0 ? <>{completados} <span style={{color:'var(--fg-muted)', fontWeight:400}}>/ {total}</span></> : '—'}
                          </td>
                          <td style={{minWidth:130}}>
                            <div style={{display:'flex', alignItems:'center', gap:8}}>
                              <div style={{flex:1, background:'var(--bg-subtle)', borderRadius:4, height:6}}>
                                <div style={{width:pct+'%', height:'100%', background:pct>=75?'var(--green)':'var(--cyan)', borderRadius:4}}/>
                              </div>
                              <span style={{fontSize:11, fontWeight:700, flexShrink:0, minWidth:28}}>{pct}%</span>
                            </div>
                          </td>
                          <td>{o.responsable_cs || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>

          {/* 3. Planes con alertas */}
          <div className="card">
            <div className="card-head">
              <h3>Planes con alertas</h3>
              <span className="badge badge-orange">{filteredPlanes.length}</span>
            </div>
            {filteredPlanes.length === 0
              ? <div style={{padding:'16px 20px', color:'var(--fg-muted)'}}>Sin planes con objetivos en riesgo</div>
              : <table className="tbl">
                  <thead><tr><th>Cliente</th><th>Objetivo</th><th>Alertas activas</th><th>Responsable CS</th></tr></thead>
                  <tbody>
                    {filteredPlanes.map(p => (
                      <tr key={p.id}>
                        <td style={{fontWeight:600}}>{getCuentaNombre(p.cuenta_id)}</td>
                        <td style={{fontSize:12, color:'var(--fg-muted)', maxWidth:200}}>{p.objetivo}</td>
                        <td>
                          <div style={{display:'flex', flexDirection:'column', gap:3}}>
                            {(p.alertas || []).map((a, i) => (
                              <span key={i} style={{fontSize:11, padding:'2px 7px', borderRadius:4, background:'rgba(239,68,68,0.08)', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.15)', display:'inline-block'}}>{a}</span>
                            ))}
                          </div>
                        </td>
                        <td>{p.responsable_cs || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>

          {/* 4. NPS pendientes */}
          <div className="card">
            <div className="card-head">
              <h3>NPS pendientes</h3>
              <span className="badge badge-orange">{filteredNps.length}</span>
            </div>
            {filteredNps.length === 0
              ? <div style={{padding:'16px 20px', color:'var(--fg-muted)'}}>Sin encuestas NPS pendientes de respuesta</div>
              : <table className="tbl">
                  <thead><tr><th>Cliente</th><th>Fecha envío</th><th>Responsable CS</th><th>Estado</th></tr></thead>
                  <tbody>
                    {filteredNps.map(n => (
                      <tr key={n.id}>
                        <td style={{fontWeight:600}}>{getCuentaNombre(n.cuenta_id)}</td>
                        <td>{n.fecha_envio || '—'}</td>
                        <td>{n.responsable_cs || '—'}</td>
                        <td><span className="badge badge-orange">Sin respuesta</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>

        </div>
      )}

      {modalAsig && (
        <ModalAsignacionRango
          otId={modalAsig.otId}
          tecnicos={tecnicos}
          cuadrillas={cuadrillas}
          ots={ots}
          plannerAsignaciones={plannerAsignaciones}
          turnos={turnos}
          onConfirm={crearAsignacionesRango}
          onClose={() => setModalAsig(null)}
        />
      )}

      {popupDia && (
        <PopupDetalleDia
          otId={popupDia.otId}
          fecha={popupDia.fecha}
          asignaciones={plannerAsignaciones}
          tecnicos={tecnicos}
          ots={ots}
          partesPendientesSet={partesPendientesSet}
          onQuitar={quitarTecnicoDeDia}
          onActualizar={actualizarAsignacionCtx}
          onAgregarTecnico={agregarTecnicoADia}
          onClose={() => setPopupDia(null)}
          navigate={navigate}
        />
      )}
    </>
  );
}

const TICKET_COLUMNS = [
  { k: 'abierto', title: 'Abiertos', color: '#64748b', icon: I.alert },
  { k: 'en_proceso', title: 'En Proceso', color: '#06b6d4', icon: I.clock },
  { k: 'resuelto', title: 'Resueltos', color: '#10b981', icon: I.check },
];

const TICKET_STATUS_LABELS = {
  abierto: 'Abierto',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

const TICKET_TYPE_LABELS = {
  averia: 'Averia',
  reclamo: 'Reclamo',
  preventivo: 'Preventivo',
  consulta: 'Consulta',
  otro: 'Otro',
};

const TICKET_CHANNEL_LABELS = {
  backoffice: 'Backoffice',
  email: 'Email',
  telefono: 'Telefono',
  campo: 'Campo',
};

const TICKET_PRIORITY_OPTIONS = ['critica', 'alta', 'media', 'baja'];
const TICKET_TYPE_OPTIONS = ['averia', 'reclamo', 'preventivo', 'consulta', 'otro'];
const TICKET_CHANNEL_OPTIONS = ['backoffice', 'email', 'telefono', 'campo'];

function emptyTicketForm() {
  return {
    titulo: '',
    descripcion: '',
    prioridad: 'media',
    tipo: 'consulta',
    canal_entrada: 'backoffice',
    cuenta_id: '',
    responsable_id: '',
  };
}

function ticketToForm(ticket) {
  if (!ticket) return emptyTicketForm();
  return {
    titulo: ticket.titulo || '',
    descripcion: ticket.descripcion || '',
    prioridad: ticket.prioridad || 'media',
    tipo: ticket.tipo || 'consulta',
    canal_entrada: ticket.canal_entrada || 'backoffice',
    cuenta_id: ticket.cuenta_id || '',
    responsable_id: ticket.responsable_id || '',
  };
}

function createTicketDraftId() {
  return globalThis.crypto?.randomUUID?.() || `ticket_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function Tickets() {
  const { addNotificacion, searchQuery, dataMode, empresa, cuentas, usuarios, authUser } = useApp();
  const ticketUploadRef = useRef(null);
  const [view, setView] = useState('kanban');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(emptyTicketForm);
  const [draftTicketId, setDraftTicketId] = useState(createTicketDraftId);
  const [detailTicketId, setDetailTicketId] = useState(null);
  const [detailForm, setDetailForm] = useState(emptyTicketForm);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailEditing, setDetailEditing] = useState(false);

  const useSupabaseTickets = dataMode === 'supabase';

  useEffect(() => {
    let alive = true;
    const empresaId = empresa?.id;

    async function loadTickets() {
      setLoading(true);
      if (!useSupabaseTickets) {
        const mockTickets = (MOCK.tickets || []).filter(t => !empresaId || t.empresa_id === empresaId);
        if (alive) {
          setTickets(mockTickets);
          setLoading(false);
        }
        return;
      }

      try {
        const rows = await ticketsService.cargarTickets(empresaId);
        if (alive) setTickets(rows);
      } catch (error) {
        console.error('Error cargando tickets:', error);
        if (alive) addNotificacion(`No se pudieron cargar tickets: ${error.message}`);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadTickets();
    return () => { alive = false; };
  }, [empresa?.id, useSupabaseTickets]);

  useEffect(() => {
    const current = (tickets || []).find(ticket => ticket.id === detailTicketId);
    setDetailForm(ticketToForm(current));
    setDetailEditing(false);
  }, [detailTicketId, tickets]);

  const cuentaNombre = cuenta => cuenta?.nombre_comercial || cuenta?.razon_social || cuenta?.nombre || cuenta?.id || '';
  const usuarioNombre = usuario => usuario?.nombre || usuario?.email || usuario?.id || '';
  const cuentaById = id => (cuentas || []).find(c => c.id === id);
  const usuarioById = id => (usuarios || []).find(u => u.id === id);
  const slaBadge = s => s === 'vencido' ? 'badge-red' : s === 'riesgo' ? 'badge-orange' : 'badge-green';
  const pBadge = p => p === 'critica' ? 'badge-red' : p === 'alta' ? 'badge-orange' : p === 'media' ? 'badge-yellow' : 'badge-gray';
  const statusBadge = s => s === 'resuelto' || s === 'cerrado' ? 'badge-green' : s === 'en_proceso' ? 'badge-cyan' : 'badge-gray';
  const canalIcon = c => c === 'email' ? I.send : c === 'telefono' ? I.phone : c === 'campo' ? I.mobile : I.clipboard;

  const updateForm = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateDetailForm = (key, value) => {
    setDetailForm(prev => ({ ...prev, [key]: value }));
  };

  const abrirNuevoTicket = () => {
    setForm(emptyTicketForm());
    setDraftTicketId(createTicketDraftId());
    setPanelOpen(true);
  };

  const cerrarNuevoTicket = () => {
    ticketUploadRef.current?.clearPendingFiles?.();
    setPanelOpen(false);
  };

  const abrirDetalleTicket = ticketId => {
    setDetailEditing(false);
    setDetailTicketId(ticketId);
  };

  const crearTicketMock = payload => {
    const nextNumber = tickets.reduce((max, t) => {
      const numeric = Number(String(t.numero || '').replace(/[^0-9]/g, '')) || 0;
      return Math.max(max, numeric);
    }, 0) + 1;
    const creadoEn = new Date();
    const randomId = payload.id || createTicketDraftId();
    return {
      ...payload,
      id: randomId,
      empresa_id: empresa?.id || 'emp_001',
      numero: `TK-${String(nextNumber).padStart(4, '0')}`,
      estado: 'abierto',
      fecha_limite_sla: ticketsService.calcularFechaLimiteSla(payload.prioridad, creadoEn),
      sla_estado: 'ok',
      fecha_resolucion: null,
      creado_por: authUser?.id || null,
      creado_en: creadoEn.toISOString(),
      actualizado_en: creadoEn.toISOString(),
    };
  };

  const guardarTicket = async event => {
    event.preventDefault();
    const titulo = form.titulo.trim();
    if (!titulo) {
      addNotificacion('Ingresa el titulo del ticket.');
      return;
    }

    const cuenta = cuentaById(form.cuenta_id);
    const responsable = usuarioById(form.responsable_id);
    const ticketId = draftTicketId || createTicketDraftId();
    const payload = {
      id: ticketId,
      titulo,
      descripcion: form.descripcion.trim(),
      prioridad: form.prioridad,
      tipo: form.tipo,
      canal_entrada: form.canal_entrada,
      cuenta_id: form.cuenta_id || null,
      cuenta_nombre: cuenta ? cuentaNombre(cuenta) : null,
      responsable_id: form.responsable_id || null,
      responsable_nombre: responsable ? usuarioNombre(responsable) : null,
      creado_por: authUser?.id || null,
    };

    setSaving(true);
    let uploadedAdjuntos = [];
    try {
      uploadedAdjuntos = await (ticketUploadRef.current?.uploadPendingFiles?.() || []);
      const nuevo = useSupabaseTickets
        ? await ticketsService.crearTicket(empresa?.id, payload)
        : crearTicketMock(payload);
      setTickets(prev => [nuevo, ...prev]);
      setPanelOpen(false);
      setDraftTicketId(createTicketDraftId());
      addNotificacion(`${nuevo.numero || 'Ticket'} creado.`);
    } catch (error) {
      if (uploadedAdjuntos.length && useSupabaseTickets) {
        await Promise.allSettled(uploadedAdjuntos.map(adjunto => storageService.eliminarAdjunto(adjunto)));
      }
      console.error('Error creando ticket:', error);
      addNotificacion(`No se pudo crear el ticket: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = (ticketId, estado) => {
    const original = tickets;
    const current = tickets.find(t => t.id === ticketId);
    if (!current || current.estado === estado) return;

    setTickets(prev => prev.map(t => (
      t.id === ticketId
        ? { ...t, estado, moved_at: Date.now(), fecha_resolucion: ['resuelto', 'cerrado'].includes(estado) ? new Date().toISOString() : null }
        : t
    )));
    addNotificacion(`Ticket movido a ${TICKET_STATUS_LABELS[estado] || estado}`);

    if (!useSupabaseTickets) return;

    ticketsService.cambiarEstadoTicket(ticketId, estado)
      .then(updated => {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updated, moved_at: Date.now() } : t));
      })
      .catch(error => {
        console.error('Error actualizando ticket:', error);
        setTickets(original);
        addNotificacion(`No se pudo actualizar el ticket: ${error.message}`);
      });
  };

  const guardarDetalleTicket = async () => {
    const current = tickets.find(ticket => ticket.id === detailTicketId);
    if (!current || current.estado !== 'abierto') return;

    const titulo = detailForm.titulo.trim();
    if (!titulo) {
      addNotificacion('Ingresa el titulo del ticket.');
      return;
    }

    const cuenta = cuentaById(detailForm.cuenta_id);
    const responsable = usuarioById(detailForm.responsable_id);
    const payload = {
      titulo,
      descripcion: detailForm.descripcion.trim(),
      prioridad: detailForm.prioridad,
      tipo: detailForm.tipo,
      canal_entrada: detailForm.canal_entrada,
      estado: current.estado,
      cuenta_id: detailForm.cuenta_id || null,
      cuenta_nombre: cuenta ? cuentaNombre(cuenta) : null,
      responsable_id: detailForm.responsable_id || null,
      responsable_nombre: responsable ? usuarioNombre(responsable) : null,
      creado_por: current.creado_por || null,
    };

    setDetailSaving(true);
    try {
      const updated = useSupabaseTickets
        ? await ticketsService.actualizarTicket(current.id, payload)
        : { ...current, ...payload, actualizado_en: new Date().toISOString() };
      setTickets(prev => prev.map(ticket => (
        ticket.id === current.id
          ? { ...ticket, ...updated, moved_at: ticket.moved_at }
          : ticket
      )));
      addNotificacion(`${updated.numero || current.numero || 'Ticket'} guardado.`);
    } catch (error) {
      console.error('Error guardando ticket:', error);
      addNotificacion(`No se pudo guardar el ticket: ${error.message}`);
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDrop = (event, targetStatus) => {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData('text/plain');
    if (ticketId) cambiarEstado(ticketId, targetStatus);
  };

  const query = String(searchQuery || '').toLowerCase();
  const filteredTickets = (tickets || []).filter(t => {
    const haystack = [
      t.titulo,
      t.descripcion,
      t.cuenta_nombre,
      t.responsable_nombre,
      t.numero,
      t.id,
    ].join(' ').toLowerCase();
    return !query || haystack.includes(query);
  });
  const ticketsActivos = filteredTickets.filter(t => !['resuelto', 'cerrado'].includes(t.estado));
  const criticos = ticketsActivos.filter(t => t.prioridad === 'critica').length;
  const slaAlerta = ticketsActivos.filter(t => t.sla_estado !== 'ok').length;
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const movedDelta = (b.moved_at || 0) - (a.moved_at || 0);
    if (movedDelta) return movedDelta;
    return String(b.creado_en || '').localeCompare(String(a.creado_en || ''));
  });
  const ticketsByStatus = TICKET_COLUMNS.reduce((acc, column) => {
    acc[column.k] = sortedTickets.filter(t => t.estado === column.k);
    return acc;
  }, {});

  const cuentasActivas = (cuentas || []).filter(c => !empresa?.id || !c.empresa_id || c.empresa_id === empresa.id);
  const usuariosActivos = (usuarios || []).filter(u => !empresa?.id || !u.empresa_id || u.empresa_id === empresa.id);
  const cuentaOptions = cuentasActivas.map(cuenta => (
    <option key={cuenta.id} value={cuenta.id}>{cuentaNombre(cuenta)}</option>
  ));
  const usuarioOptions = usuariosActivos.map(usuario => (
    <option key={usuario.id} value={usuario.id}>{usuarioNombre(usuario)}</option>
  ));
  const prioridadOptions = TICKET_PRIORITY_OPTIONS.map(prioridad => (
    <option key={prioridad} value={prioridad}>{prioridad}</option>
  ));
  const tipoOptions = TICKET_TYPE_OPTIONS.map(tipo => (
    <option key={tipo} value={tipo}>{TICKET_TYPE_LABELS[tipo]}</option>
  ));
  const canalOptions = TICKET_CHANNEL_OPTIONS.map(canal => (
    <option key={canal} value={canal}>{TICKET_CHANNEL_LABELS[canal]}</option>
  ));

  const kpiCards = TICKET_COLUMNS.map(column => {
    const columnTickets = ticketsByStatus[column.k] || [];
    return (
      <div key={column.k} className="pipeline-kpi-card hover-raise" style={{'--accent': column.color}}>
        <div className="pipeline-kpi-icon" style={{color: column.color}}>{column.icon}</div>
        <div className="pipeline-kpi-label">{column.title}</div>
        <div className="pipeline-kpi-value">{columnTickets.length}</div>
        <div className="pipeline-kpi-count">Ver detalles</div>
      </div>
    );
  });

  const metricCards = [
    <div key="criticos" className="kpi-card">
      <div className="kpi-label">Criticos activos</div>
      <div className="kpi-value" style={{color: criticos ? 'var(--danger)' : 'inherit'}}>{criticos}</div>
    </div>,
    <div key="sla" className="kpi-card">
      <div className="kpi-label">SLA en alerta</div>
      <div className="kpi-value" style={{color: slaAlerta ? 'var(--orange)' : 'inherit'}}>{slaAlerta}</div>
    </div>,
  ];

  const buildTicketCard = ticket => {
    const actionButtons = TICKET_COLUMNS
      .filter(column => column.k !== ticket.estado)
      .map(column => (
        <button
          key={column.k}
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={event => {
            event.stopPropagation();
            cambiarEstado(ticket.id, column.k);
          }}
        >
          {column.title}
        </button>
      ));
    const slaEstado = ticket.sla_estado || 'ok';
    const tipoLabel = TICKET_TYPE_LABELS[ticket.tipo] || ticket.tipo || 'Ticket';
    const canalLabel = TICKET_CHANNEL_LABELS[ticket.canal_entrada] || ticket.canal_entrada || 'Canal';
    const responsable = ticket.responsable_nombre || 'Sin asignar';
    const responsableInitial = responsable.charAt(0).toUpperCase();
    return (
      <div
        key={ticket.id}
        className="kanban-card-v2"
        draggable
        onClick={() => abrirDetalleTicket(ticket.id)}
        onDragStart={event => event.dataTransfer.setData('text/plain', ticket.id)}
        style={{cursor: 'grab'}}
      >
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
          <span className={'badge ' + pBadge(ticket.prioridad)} style={{fontSize:9}}>
            {String(ticket.prioridad || '').toUpperCase()}
          </span>
          <span className={'badge ' + slaBadge(slaEstado)} style={{fontSize:9}}>
            SLA {String(slaEstado).toUpperCase()}
          </span>
        </div>

        <div style={{fontSize:13, fontWeight:700, color:'var(--navy)', marginBottom:4, lineHeight:1.4}}>
          {ticket.titulo}
        </div>
        <div style={{fontSize:11, color:'var(--cyan)', fontWeight:600, marginBottom:8}}>
          {ticket.cuenta_nombre || 'Sin cliente'}
        </div>

        <div style={{display:'flex', gap:8, marginBottom:12, alignItems:'center'}}>
          <span className="badge badge-gray" style={{fontSize:9}}>{tipoLabel}</span>
          <span title={canalLabel} style={{width:16, height:16, display:'inline-flex', color:'var(--fg-muted)'}}>{canalIcon(ticket.canal_entrada)}</span>
        </div>

        <div className="row" style={{justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:12, marginTop:4}}>
          <div className="row" style={{gap:6}}>
            <div className="avatar" style={{width:20, height:20, fontSize:9, background:'var(--navy)', color:'#fff'}}>{responsableInitial}</div>
            <span style={{fontSize:10, color:'var(--fg-muted)'}}>{responsable}</span>
          </div>
          <div style={{fontSize:10, color:'var(--fg-muted)', fontWeight:600}}>
            {ticket.numero || ticket.id}
          </div>
        </div>

        <div style={{borderTop:'1px solid var(--border-subtle)', paddingTop:10, marginTop:10}}>
          <div className="text-muted" style={{fontSize:10, fontWeight:700, marginBottom:6}}>Mover a</div>
          <div className="row" style={{gap:6, flexWrap:'wrap'}}>
            {actionButtons}
          </div>
        </div>
      </div>
    );
  };

  const ticketCardsByStatus = {};
  TICKET_COLUMNS.forEach(column => {
    ticketCardsByStatus[column.k] = (ticketsByStatus[column.k] || []).map(buildTicketCard);
  });

  const kanbanColumns = TICKET_COLUMNS.map(column => {
    const columnCards = ticketCardsByStatus[column.k] || [];
    const emptyState = (
      <div className="card-empty-state">
        <div style={{opacity:0.3}}>{column.icon}</div>
        <p>Sin tickets {column.title.toLowerCase()}<br/><span style={{fontSize:10}}>Arrastra aqui para asignar.</span></p>
      </div>
    );
    const body = columnCards.length ? columnCards : emptyState;
    return (
      <div
        key={column.k}
        className="kanban-col-v2"
        onDragOver={event => event.preventDefault()}
        onDrop={event => handleDrop(event, column.k)}
        style={{ '--accent': column.color }}
      >
        <div className="kanban-col-head-v2">
          <div className="kanban-col-title-v2">{column.title}</div>
          <div className="kanban-col-count-v2">{columnCards.length}</div>
        </div>
        <div style={{flex:1}}>{body}</div>
        <button type="button" className="kanban-btn-add" onClick={abrirNuevoTicket}>
          {I.plus} Nuevo Ticket
        </button>
      </div>
    );
  });

  const tableRows = sortedTickets.map(ticket => {
    const slaEstado = ticket.sla_estado || 'ok';
    const tipoLabel = TICKET_TYPE_LABELS[ticket.tipo] || ticket.tipo || 'Ticket';
    const estadoLabel = TICKET_STATUS_LABELS[ticket.estado] || ticket.estado;
    return (
      <tr key={ticket.id} className="hover-row" onClick={() => abrirDetalleTicket(ticket.id)} style={{cursor:'pointer'}}>
        <td><div style={{fontWeight:600}}>{ticket.titulo}</div><div className="text-muted" style={{fontSize:11}}>{ticket.numero || ticket.id}</div></td>
        <td>{ticket.cuenta_nombre || 'Sin cliente'}</td>
        <td><span className={'badge ' + pBadge(ticket.prioridad)}>{String(ticket.prioridad || '').toUpperCase()}</span></td>
        <td><span className={'badge ' + slaBadge(slaEstado)}>SLA {String(slaEstado).toUpperCase()}</span></td>
        <td>{ticket.responsable_nombre || 'Sin asignar'}</td>
        <td>{tipoLabel}</td>
        <td><span className={'badge ' + statusBadge(ticket.estado)}>{estadoLabel}</span></td>
      </tr>
    );
  });

  const emptyTableRow = (
    <tr>
      <td colSpan="7" className="text-muted" style={{textAlign:'center', padding:24}}>No hay tickets para mostrar.</td>
    </tr>
  );
  const tableBody = tableRows.length ? tableRows : emptyTableRow;
  const loadingBlock = <div className="card" style={{padding:24, marginTop:24}}>Cargando tickets...</div>;
  const kanbanContent = (
    <div style={{overflowX:'auto', paddingBottom:20, marginTop:24}}>
      <div className="kanban-v2">{kanbanColumns}</div>
    </div>
  );
  const tableContent = (
    <div className="card mt-6">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Cliente</th>
              <th>Prioridad</th>
              <th>SLA</th>
              <th>Asignado</th>
              <th>Tipo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
      </div>
    </div>
  );
  const ticketsView = loading ? loadingBlock : (view === 'kanban' ? kanbanContent : tableContent);
  const selectedTicket = detailTicketId ? tickets.find(ticket => ticket.id === detailTicketId) : null;
  const selectedTicketCanEdit = selectedTicket?.estado === 'abierto';
  const selectedTicketEditable = selectedTicketCanEdit && detailEditing;
  const selectedTicketTitle = selectedTicketEditable ? (detailForm.titulo || selectedTicket?.titulo || '') : (selectedTicket?.titulo || '');
  const selectedPriority = selectedTicketEditable ? detailForm.prioridad : selectedTicket?.prioridad;
  const selectedTipo = selectedTicketEditable ? detailForm.tipo : selectedTicket?.tipo;
  const selectedCanal = selectedTicketEditable ? detailForm.canal_entrada : selectedTicket?.canal_entrada;
  const selectedCuentaNombre = selectedTicketEditable
    ? (cuentaById(detailForm.cuenta_id) ? cuentaNombre(cuentaById(detailForm.cuenta_id)) : 'Sin cliente')
    : (selectedTicket?.cuenta_nombre || 'Sin cliente');
  const selectedResponsableNombre = selectedTicketEditable
    ? (usuarioById(detailForm.responsable_id) ? usuarioNombre(usuarioById(detailForm.responsable_id)) : 'Sin asignar')
    : (selectedTicket?.responsable_nombre || 'Sin asignar');
  const selectedSlaEstado = selectedTicket?.sla_estado || 'ok';
  const selectedTipoLabel = selectedTicket ? (TICKET_TYPE_LABELS[selectedTipo] || selectedTipo || 'Ticket') : '';
  const selectedCanalLabel = selectedTicket ? (TICKET_CHANNEL_LABELS[selectedCanal] || selectedCanal || 'Canal') : '';
  const selectedEstadoLabel = selectedTicket ? (TICKET_STATUS_LABELS[selectedTicket.estado] || selectedTicket.estado) : '';
  const selectedCanalIcon = selectedTicket ? canalIcon(selectedCanal) : null;
  const flowActionButtons = selectedTicket ? TICKET_COLUMNS
    .filter(column => column.k !== selectedTicket.estado)
    .map(column => (
      <button
        key={column.k}
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => cambiarEstado(selectedTicket.id, column.k)}
      >
        {column.title}
      </button>
    )) : [];
  const detailStartEditButton = selectedTicketCanEdit && !detailEditing ? (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailEditing(true)}>
      Editar
    </button>
  ) : null;
  const detailCancelEditButton = selectedTicketEditable ? (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => {
        setDetailForm(ticketToForm(selectedTicket));
        setDetailEditing(false);
      }}
      disabled={detailSaving}
    >
      Cancelar
    </button>
  ) : null;
  const detailEditableFields = selectedTicketEditable ? (
    <div className="grid-2" style={{gap:12}}>
      <div className="input-group" style={{gridColumn:'1/-1'}}>
        <label>Titulo *</label>
        <input className="input" value={detailForm.titulo} onChange={event => updateDetailForm('titulo', event.target.value)} />
      </div>
      <div className="input-group" style={{gridColumn:'1/-1'}}>
        <label>Descripcion</label>
        <textarea className="input" rows="5" value={detailForm.descripcion} onChange={event => updateDetailForm('descripcion', event.target.value)} />
      </div>
      <div className="input-group">
        <label>Prioridad</label>
        <select className="select" value={detailForm.prioridad} onChange={event => updateDetailForm('prioridad', event.target.value)}>{prioridadOptions}</select>
      </div>
      <div className="input-group">
        <label>Tipo</label>
        <select className="select" value={detailForm.tipo} onChange={event => updateDetailForm('tipo', event.target.value)}>{tipoOptions}</select>
      </div>
      <div className="input-group">
        <label>Canal de entrada</label>
        <select className="select" value={detailForm.canal_entrada} onChange={event => updateDetailForm('canal_entrada', event.target.value)}>{canalOptions}</select>
      </div>
      <div className="input-group">
        <label>Cliente</label>
        <select className="select" value={detailForm.cuenta_id} onChange={event => updateDetailForm('cuenta_id', event.target.value)}>
          <option value="">Sin cliente</option>
          {cuentaOptions}
        </select>
      </div>
      <div className="input-group" style={{gridColumn:'1/-1'}}>
        <label>Responsable</label>
        <select className="select" value={detailForm.responsable_id} onChange={event => updateDetailForm('responsable_id', event.target.value)}>
          <option value="">Sin asignar</option>
          {usuarioOptions}
        </select>
      </div>
    </div>
  ) : null;
  const detailReadOnlyFields = selectedTicket && !selectedTicketEditable ? (
    <div style={{fontSize:13, lineHeight:1.6}}>
      <div><strong>Cliente:</strong> {selectedCuentaNombre}</div>
      <div><strong>Responsable:</strong> {selectedResponsableNombre}</div>
      <div><strong>Creado:</strong> {selectedTicket.creado_en ? new Date(selectedTicket.creado_en).toLocaleString() : '-'}</div>
      <div><strong>Vence SLA:</strong> {selectedTicket.fecha_limite_sla ? new Date(selectedTicket.fecha_limite_sla).toLocaleString() : '-'}</div>
      {selectedTicket.descripcion && (
        <div style={{color:'var(--fg-muted)', lineHeight:1.6, marginTop:12}}>
          {selectedTicket.descripcion}
        </div>
      )}
    </div>
  ) : null;
  const detailSaveButton = selectedTicketEditable ? (
    <button type="button" className="btn btn-primary btn-sm" onClick={guardarDetalleTicket} disabled={detailSaving}>
      {detailSaving ? 'Guardando...' : 'Guardar cambios'}
    </button>
  ) : null;
  const detailLockedBadge = selectedTicket && !selectedTicketEditable ? (
    <span className="badge badge-gray">Solo lectura</span>
  ) : null;
  const detailHeaderActions = selectedTicketCanEdit ? (
    <div className="row" style={{gap:8, flexWrap:'wrap', justifyContent:'flex-end'}}>
      {detailStartEditButton}
      {detailCancelEditButton}
      {detailSaveButton}
    </div>
  ) : null;
  const detailFlowPanel = selectedTicket ? (
    <div className="card" style={{padding:16, marginBottom:16}}>
      <div className="card-head" style={{padding:0, borderBottom:'none', marginBottom:10}}>
        <h3>Flujo</h3>
      </div>
      <div className="row" style={{gap:8, flexWrap:'wrap', alignItems:'center'}}>
        <span className={'badge ' + statusBadge(selectedTicket.estado)}>{selectedEstadoLabel}</span>
        <span className="text-muted" style={{fontSize:12}}>Cambiar a</span>
        {flowActionButtons}
      </div>
    </div>
  ) : null;
  const detailPanel = selectedTicket ? (
    <>
      <div className="side-panel-backdrop" onClick={() => setDetailTicketId(null)}/>
      <div className="side-panel ficha-detail-panel ticket-detail-panel" style={{width:'min(620px, 96vw)'}}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">{selectedTicket.numero || 'Ticket'}</div>
            <div className="font-display" style={{fontSize:22, fontWeight:700}}>{selectedTicketTitle}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => setDetailTicketId(null)}>{I.x}</button>
        </div>
        <div className="side-panel-body">
          <div className="row" style={{gap:8, flexWrap:'wrap', marginBottom:14}}>
            <span className={'badge ' + statusBadge(selectedTicket.estado)}>{selectedEstadoLabel}</span>
            <span className={'badge ' + pBadge(selectedPriority)}>{String(selectedPriority || '').toUpperCase()}</span>
            <span className={'badge ' + slaBadge(selectedSlaEstado)}>SLA {String(selectedSlaEstado).toUpperCase()}</span>
            <span className="badge badge-gray">{selectedTipoLabel}</span>
            <span className="badge badge-gray">{selectedCanalIcon} {selectedCanalLabel}</span>
            {detailLockedBadge}
          </div>

          <div className="card" style={{padding:16, marginBottom:16}}>
            <div className="card-head" style={{padding:0, borderBottom:'none', marginBottom:10}}>
              <h3>Detalle</h3>
              {detailHeaderActions}
            </div>
            {detailEditableFields}
            {detailReadOnlyFields}
            {selectedTicketEditable && (
              <div className="text-muted" style={{fontSize:12, lineHeight:1.6, marginTop:12}}>
                <div>Creado: {selectedTicket.creado_en ? new Date(selectedTicket.creado_en).toLocaleString() : '-'}</div>
                <div>Vence SLA: {selectedTicket.fecha_limite_sla ? new Date(selectedTicket.fecha_limite_sla).toLocaleString() : '-'}</div>
              </div>
            )}
          </div>

          {detailFlowPanel}

          <FileUpload
            entidadTipo="tickets"
            entidadId={selectedTicket.id}
            empresaId={selectedTicket.empresa_id || empresa?.id}
            categoria="adjunto"
            multiple
            subidoPor={authUser?.id}
            disabled={!selectedTicketEditable}
          />
        </div>
      </div>
    </>
  ) : null;
  const ticketPanel = panelOpen ? (
    <>
      <div className="side-panel-backdrop" onClick={cerrarNuevoTicket}/>
      <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Soporte</div>
            <div className="font-display" style={{fontSize:22, fontWeight:700}}>Nuevo Ticket</div>
          </div>
          <button type="button" className="icon-btn" onClick={cerrarNuevoTicket}>{I.x}</button>
        </div>
        <form className="side-panel-body" onSubmit={guardarTicket}>
          <div className="input-group">
            <label>Titulo *</label>
            <input className="input" value={form.titulo} onChange={event => updateForm('titulo', event.target.value)} required autoFocus />
          </div>
          <div className="input-group">
            <label>Descripcion</label>
            <textarea className="input" rows="4" value={form.descripcion} onChange={event => updateForm('descripcion', event.target.value)} />
          </div>
          <div className="grid-2" style={{gap:12}}>
            <div className="input-group">
              <label>Prioridad</label>
              <select className="select" value={form.prioridad} onChange={event => updateForm('prioridad', event.target.value)}>{prioridadOptions}</select>
            </div>
            <div className="input-group">
              <label>Tipo</label>
              <select className="select" value={form.tipo} onChange={event => updateForm('tipo', event.target.value)}>{tipoOptions}</select>
            </div>
            <div className="input-group">
              <label>Canal de entrada</label>
              <select className="select" value={form.canal_entrada} onChange={event => updateForm('canal_entrada', event.target.value)}>{canalOptions}</select>
            </div>
            <div className="input-group">
              <label>Cliente</label>
              <select className="select" value={form.cuenta_id} onChange={event => updateForm('cuenta_id', event.target.value)}>
                <option value="">Sin cliente</option>
                {cuentaOptions}
              </select>
            </div>
            <div className="input-group" style={{gridColumn:'1/-1'}}>
              <label>Responsable</label>
              <select className="select" value={form.responsable_id} onChange={event => updateForm('responsable_id', event.target.value)}>
                <option value="">Sin asignar</option>
                {usuarioOptions}
              </select>
            </div>
          </div>
          <FileUpload
            ref={ticketUploadRef}
            entidadTipo="tickets"
            entidadId={draftTicketId}
            empresaId={empresa?.id}
            categoria="adjunto"
            multiple
            deferUpload
            disabled={saving}
            subidoPor={authUser?.id}
          />
          <div className="row mt-6" style={{justifyContent:'flex-end'}}>
            <button type="button" className="btn btn-secondary" onClick={cerrarNuevoTicket}>Cancelar</button>
            <button type="submit" className="btn btn-primary" data-local-form="true" disabled={saving}>{saving ? 'Guardando...' : 'Crear ticket'}</button>
          </div>
        </form>
      </div>
    </>
  ) : null;

  return (
    <>
      <div className="page-header" style={{alignItems:'flex-start', marginBottom:24}}>
        <div>
          <h1 className="page-title" style={{fontSize:24, fontWeight:800}}>Soporte y Tickets</h1>
          <div className="page-sub" style={{marginTop:4}}>
            Gestion de incidentes y atencion al cliente post-venta
          </div>
        </div>
        <div className="row" style={{gap:12}}>
          <div className="segmented-control">
            <button className={`seg-btn ${view==='kanban'?'active':''}`} onClick={() => setView('kanban')}>{I.dashboard} Kanban</button>
            <button className={`seg-btn ${view==='lista'?'active':''}`} onClick={() => setView('lista')}>{I.list} Lista</button>
          </div>
          <button type="button" className="btn btn-secondary">{I.filter} Filtros</button>
          <button type="button" className="btn btn-primary" data-local-form="true" onClick={abrirNuevoTicket}>{I.plus} Nuevo Ticket</button>
        </div>
      </div>

      <div className="pipeline-kpi-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        {kpiCards}
      </div>
      <div className="kpi-grid mt-6" style={{gridTemplateColumns:'repeat(2, minmax(0, 1fr))'}}>
        {metricCards}
      </div>
      {ticketsView}
      {ticketPanel}
      {detailPanel}
    </>
  );
}

function timeToMinutesHHMM(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToLabel(min) {
  const v = Math.max(0, Math.round(min || 0));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

function horasEfectivasTurno(entrada, salida, cruzaMedianoche, refrigerio) {
  let minSalida = timeToMinutesHHMM(salida);
  if (cruzaMedianoche) minSalida += 24 * 60;
  const total = minSalida - timeToMinutesHHMM(entrada) - (Number(refrigerio) || 0);
  return minutesToLabel(total);
}

function calcularResultadoAsistencia(horaEntrada, horaSalida, turno, esFalta, justificada, refrigerioTomadoMinutos = null) {
  if (!turno?.id || !turno?.hora_entrada || !turno?.hora_salida) {
    return { horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0, estado:'sin_turno', label:'Sin turno' };
  }
  if (esFalta || !horaEntrada) {
    return { horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0, estado:justificada ? 'falta_justificada' : 'falta', label:justificada ? 'Falta justif.' : 'Falta' };
  }
  if (!horaSalida || !turno) {
    return { horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0, estado:'incompleto', label:'Incompleto' };
  }
  const entradaMin = timeToMinutesHHMM(horaEntrada);
  let salidaMin = timeToMinutesHHMM(horaSalida);
  if (turno.cruza_medianoche && salidaMin < entradaMin) salidaMin += 24 * 60;
  let turnoSalidaMin = timeToMinutesHHMM(turno.hora_salida);
  if (turno.cruza_medianoche) turnoSalidaMin += 24 * 60;
  const refriMin = refrigerioTomadoMinutos !== null && refrigerioTomadoMinutos !== '' ? Number(refrigerioTomadoMinutos) : (turno.refrigerio_minutos || 0);
  const trabajadasMin = Math.max(0, salidaMin - entradaMin - refriMin);
  const tardanzaMin = Math.max(0, entradaMin - timeToMinutesHHMM(turno.hora_entrada) - (turno.tolerancia_minutos || 0));
  const extraMin = Math.max(0, salidaMin - turnoSalidaMin - 30);
  const estado = tardanzaMin > 0 ? 'tardanza' : extraMin > 0 ? 'horas_extra' : 'completo';
  const label = tardanzaMin > 0 ? `Tardanza ${tardanzaMin}min` : extraMin > 0 ? `Horas extra ${minutesToLabel(extraMin)}` : 'Completo';
  return { horas_trabajadas_min:trabajadasMin, tardanza_min:tardanzaMin, horas_extra_min:extraMin, estado, label };
}

function asistenciaBadge(estado) {
  return estado === 'completo' ? 'badge-green'
    : estado === 'horas_extra' ? 'badge-cyan'
    : estado === 'tardanza' ? 'badge-orange'
    : estado === 'falta_justificada' ? 'badge-red'
    : estado === 'falta' ? 'badge-red'
    : 'badge-gray';
}

function workerTurno(turnos, worker = {}) {
  return (turnos || []).find(t => t.id === worker.turno_id) || {};
}

function calcularIR5ta(remuneracionBrutaMensual) {
  const UIT = 5150;
  const base = (remuneracionBrutaMensual * 12) - (7 * UIT);
  if (base <= 0) return 0;
  if (base <= 5 * UIT) return (base * 0.08) / 12;
  if (base <= 20 * UIT) return ((5 * UIT * 0.08) + ((base - 5 * UIT) * 0.14)) / 12;
  if (base <= 35 * UIT) return ((5 * UIT * 0.08) + (15 * UIT * 0.14) + ((base - 20 * UIT) * 0.17)) / 12;
  if (base <= 45 * UIT) return ((5 * UIT * 0.08) + (15 * UIT * 0.14) + (15 * UIT * 0.17) + ((base - 35 * UIT) * 0.20)) / 12;
  return ((5 * UIT * 0.08) + (15 * UIT * 0.14) + (15 * UIT * 0.17) + (10 * UIT * 0.20) + ((base - 45 * UIT) * 0.30)) / 12;
}

function calcularNominaTrabajador(trabajador, datosNomina, turno, registros, periodo) {
  const diasLaborables = turno.dias_variables ? 22 : 22;
  const horasEfectivas = Number(turno.horas_efectivas) || 8;
  const sueldoBase = Number(datosNomina?.sueldo_base || trabajador.remuneracion || 3000);
  const valorDia = sueldoBase / diasLaborables;
  const valorHora = sueldoBase / (diasLaborables * horasEfectivas);
  const valorMinuto = valorHora / 60;
  const asistencias = registros.filter(r => !r.es_falta).length;
  const faltasInjustificadas = registros.filter(r => r.estado === 'falta').length;
  const faltasJustificadas = registros.filter(r => r.estado === 'falta_justificada').length;
  const tardanzas = registros.filter(r => r.estado === 'tardanza').length;
  const minutosTardanza = registros.reduce((sum, r) => sum + (Number(r.tardanza_min) || 0), 0);
  const horasExtraMin = registros.reduce((sum, r) => sum + (Number(r.horas_extra_min) || 0), 0);
  const descFaltas = faltasInjustificadas * valorDia;
  const descTardanzas = minutosTardanza * valorMinuto;
  const addHorasExtra = horasExtraMin * ((valorHora * 1.25) / 60);
  const asignacionFamiliar = datosNomina?.tiene_hijos ? 102.5 : 0;
  const remuneracionBruta = sueldoBase - descFaltas - descTardanzas + addHorasExtra + asignacionFamiliar;
  const sistema = datosNomina?.sistema_pensionario || 'AFP';
  const descPensiones = remuneracionBruta * (sistema === 'AFP' ? 0.1324 : 0.13);
  const descPrestamo = Number(datosNomina?.cuota_prestamo_mes || 0);
  const descAnticipo = Number(datosNomina?.anticipo_periodo || 0);
  const descJudicial = Number(datosNomina?.descuento_judicial || 0);
  const totalDescuentos = descPensiones + descPrestamo + descAnticipo + descJudicial;
  const retencionIR = calcularIR5ta(remuneracionBruta);
  const neto = remuneracionBruta - totalDescuentos - retencionIR;
  const essalud = remuneracionBruta * 0.09;
  const cts = remuneracionBruta / 12;
  const gratificacion = remuneracionBruta / 6;
  const vacaciones = remuneracionBruta / 12;
  const totalCargas = essalud + cts + gratificacion + vacaciones;
  const costoReal = remuneracionBruta + totalCargas;
  const horasPeriodo = diasLaborables * horasEfectivas;
  return {
    trabajador_id: trabajador.id, trabajador, datosNomina, turno, periodo,
    dias_laborables: diasLaborables, dias_asistidos: asistencias,
    faltas_injustificadas: faltasInjustificadas, faltas_justificadas: faltasJustificadas,
    tardanzas, minutos_tardanza_total: minutosTardanza, horas_extra_total_min: horasExtraMin,
    sueldo_base: sueldoBase, valor_dia: valorDia, valor_hora: valorHora,
    desc_faltas: descFaltas, desc_tardanzas: descTardanzas, add_horas_extra: addHorasExtra,
    asignacion_familiar: asignacionFamiliar, remuneracion_bruta: remuneracionBruta,
    desc_pensiones: descPensiones, sistema_pensionario: sistema,
    desc_prestamo: descPrestamo, desc_anticipo: descAnticipo, desc_judicial: descJudicial,
    total_descuentos: totalDescuentos, retencion_ir: retencionIR, neto,
    essalud, cts_mensualizado: cts, gratificacion_mensualizada: gratificacion,
    vacaciones_mensualizadas: vacaciones, total_cargas: totalCargas,
    costo_real_empresa: costoReal, costo_hora_real: costoReal / horasPeriodo
  };
}

function TurnosHorarios() {
  const { turnos, setTurnos, empresa, addNotificacion, crearTurnoCtx, actualizarTurnoCtx, eliminarTurnoCtx, dataMode } = useApp();
  const [panel, setPanel] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formBase = { nombre:'', hora_entrada:'08:00', hora_salida:'17:00', tolerancia_minutos:10, cruza_medianoche:false, dias_laborables:['lun','mar','mie','jue','vie'], dias_variables:false, refrigerio_minutos:60, descripcion:'', estado:'activo' };
  const [form, setForm] = useState(formBase);
  const horasCalc = horasEfectivasTurno(form.hora_entrada, form.hora_salida, form.cruza_medianoche, form.refrigerio_minutos);
  const diasMap = [['lun','Lun'], ['mar','Mar'], ['mie','Mie'], ['jue','Jue'], ['vie','Vie'], ['sab','Sab'], ['dom','Dom']];
  const toggleDia = (d) => setForm(prev => ({ ...prev, dias_laborables: prev.dias_laborables.includes(d) ? prev.dias_laborables.filter(x => x !== d) : [...prev.dias_laborables, d] }));

  const abrirNuevo = () => { setEditandoId(null); setForm(formBase); setError(''); setPanel(true); };
  const abrirEditar = (t) => {
    setEditandoId(t.id);
    setForm({ nombre:t.nombre||'', hora_entrada:t.hora_entrada||'08:00', hora_salida:t.hora_salida||'17:00', tolerancia_minutos:t.tolerancia_minutos??10, cruza_medianoche:t.cruza_medianoche||false, dias_laborables:t.dias_laborables||['lun','mar','mie','jue','vie'], dias_variables:t.dias_variables||false, refrigerio_minutos:t.refrigerio_minutos??60, descripcion:t.descripcion||'', estado:t.estado||'activo' });
    setError(''); setPanel(true);
  };
  const cerrar = () => { setPanel(false); setEditandoId(null); setForm(formBase); setError(''); };

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.dias_variables && form.dias_laborables.length === 0) return;
    setSaving(true); setError('');
    const totalMin = timeToMinutesHHMM(form.hora_salida) + (form.cruza_medianoche ? 1440 : 0) - timeToMinutesHHMM(form.hora_entrada) - Number(form.refrigerio_minutos || 0);
    const payload = { ...form, tolerancia_minutos:Number(form.tolerancia_minutos)||0, refrigerio_minutos:Number(form.refrigerio_minutos)||0, horas_efectivas:Math.max(0, totalMin/60) };
    try {
      if (editandoId) {
        await actualizarTurnoCtx(editandoId, payload);
        addNotificacion('Turno actualizado.');
      } else {
        const nuevoId = `tur_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2,8)}`}`;
        const codigo = `TUR-${String(turnos.length + 1).padStart(3,'0')}`;
        await crearTurnoCtx({ id:nuevoId, empresa_id:empresa.id, codigo, ...payload });
        addNotificacion(`Turno ${codigo} creado.`);
      }
      cerrar();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el turno.');
    }
    setSaving(false);
  };

  const eliminar = async (t) => {
    if (!window.confirm(`Eliminar turno "${t.nombre}"? Esta acción se reflejará en la base de datos.`)) return;
    try {
      await eliminarTurnoCtx(t.id);
      addNotificacion('Turno eliminado.');
    } catch {
      addNotificacion('No se pudo eliminar el turno. Puede tener colaboradores asignados.');
    }
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Turnos y Horarios</h1><div className="page-sub">Configuracion de jornadas laborales · {turnos.filter(t=>t.estado==='activo').length} activos</div></div>
        <button className="btn btn-primary" data-local-form="true" onClick={abrirNuevo}>{I.plus} Nuevo turno</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Codigo</th><th>Nombre</th><th>Entrada</th><th>Salida</th><th>Horas/dia</th><th>Tolerancia</th><th>Dias</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
            <tbody>{turnos.map(t => (
              <tr key={t.id}>
                <td className="mono" style={{fontSize:11}}>{t.codigo || t.id}</td>
                <td><strong>{t.nombre}</strong>{t.cruza_medianoche && <span className="badge badge-purple" style={{marginLeft:8}}>+1d</span>}</td>
                <td>{t.hora_entrada}</td>
                <td>{t.hora_salida}</td>
                <td>{t.horas_efectivas}h</td>
                <td>{t.tolerancia_minutos} min</td>
                <td>{t.dias_variables ? 'Variable' : t.dias_laborables.join('-')}</td>
                <td><span className={'badge '+(t.estado === 'activo' ? 'badge-green' : 'badge-gray')}>{t.estado}</span></td>
                <td style={{textAlign:'right'}}>
                  <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                    <button className="icon-btn" title="Editar turno" style={{color:'var(--cyan)'}} onClick={()=>abrirEditar(t)}>{I.edit}</button>
                    <button className="icon-btn" title="Eliminar turno" style={{color:'var(--danger)'}} onClick={()=>eliminar(t)}>{I.trash}</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {panel && <>
        <div className="side-panel-backdrop" onClick={cerrar}/>
        <div className="side-panel" style={{width:'min(480px, 96vw)'}}>
          <div className="side-panel-head"><div><div className="eyebrow">{editandoId ? 'Editar turno' : 'Nuevo turno'}</div><div className="font-display" style={{fontSize:22, fontWeight:700}}>{editandoId ? form.nombre : `TUR-${String(turnos.length+1).padStart(3,'0')}`}</div></div><button className="icon-btn" onClick={cerrar}>{I.x}</button></div>
          <form className="side-panel-body" onSubmit={guardar}>
            {error && <div className="alert alert-danger" style={{marginBottom:12}}>{error}</div>}
            <div className="input-group"><label>Nombre *</label><input className="input" required value={form.nombre} onChange={e=>setForm(v=>({...v,nombre:e.target.value}))}/></div>
            <div className="grid-2" style={{gap:12}}>
              <div className="input-group"><label>Hora de entrada *</label><input className="input" type="time" required value={form.hora_entrada} onChange={e=>setForm(v=>({...v,hora_entrada:e.target.value}))}/></div>
              <div className="input-group"><label>Hora de salida *</label><input className="input" type="time" required value={form.hora_salida} onChange={e=>setForm(v=>({...v,hora_salida:e.target.value}))}/></div>
              <div className="input-group"><label>Tolerancia tardanza</label><input className="input" type="number" min="0" value={form.tolerancia_minutos} onChange={e=>setForm(v=>({...v,tolerancia_minutos:e.target.value}))}/></div>
              <div className="input-group"><label>Refrigerio minutos</label><input className="input" type="number" min="0" value={form.refrigerio_minutos} onChange={e=>setForm(v=>({...v,refrigerio_minutos:e.target.value}))}/></div>
            </div>
            <label className="row" style={{gap:8, marginTop:14}}><input type="checkbox" checked={form.cruza_medianoche} onChange={e=>setForm(v=>({...v,cruza_medianoche:e.target.checked}))}/> El turno cruza medianoche</label>
            <label className="row" style={{gap:8, marginTop:8}}><input type="checkbox" checked={form.dias_variables} onChange={e=>setForm(v=>({...v,dias_variables:e.target.checked}))}/> Dias variables</label>
            {!form.dias_variables && <div style={{display:'flex', gap:8, flexWrap:'wrap', margin:'14px 0'}}>
              {diasMap.map(([k,l]) => <button type="button" key={k} className={'btn btn-sm '+(form.dias_laborables.includes(k) ? 'btn-primary' : 'btn-secondary')} data-local-form="true" onClick={()=>toggleDia(k)}>{l}</button>)}
            </div>}
            <div className="card" style={{padding:12, margin:'14px 0'}}><strong>Horas laborables calculadas:</strong> {horasCalc} efectivas</div>
            <div className="input-group"><label>Descripcion / notas</label><textarea className="input" rows="3" value={form.descripcion} onChange={e=>setForm(v=>({...v,descripcion:e.target.value}))}/></div>
            <div className="input-group"><label>Estado</label><select className="select" value={form.estado} onChange={e=>setForm(v=>({...v,estado:e.target.value}))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
            <div className="row mt-6" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-secondary" onClick={cerrar}>Cancelar</button><button className="btn btn-primary" data-local-form="true" type="submit" disabled={saving}>{saving ? 'Guardando...' : (editandoId ? 'Guardar cambios' : 'Crear turno')}</button></div>
          </form>
        </div>
      </>}
    </>
  );
}

function ControlAsistencia() {
  const { turnos, registrosAsistencia, setRegistrosAsistencia, personalOperativo, personalAdmin, empresa, addNotificacion } = useApp();
  const [tab, setTab] = useState('diaria');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [panel, setPanel] = useState(false);
  const [masivo, setMasivo] = useState(false);
  const [kiosk, setKiosk] = useState(false);
  const trabajadores = [
    ...personalOperativo.map(p => ({ ...p, trabajador_tipo:'operativo', area:p.area || 'Operativo', remuneracion:p.remuneracion || p.sueldo_base || 3000 })),
    ...personalAdmin.map(p => ({ ...p, trabajador_tipo:'administrativo', id:p.id, nombre:p.nombre, cargo:p.cargo, area:p.area || 'Administrativo', turno_id:p.turno_id || 'tur_005', remuneracion:p.remuneracion || 3000 }))
  ];
  const [form, setForm] = useState({ trabajador_id:trabajadores[0]?.id || '', fecha, asistio:'si', hora_entrada:'08:00', hora_salida:'17:00', justificada:false, motivo_falta:'', notas:'', latitud:'', longitud:'', refrigerio_tomado_minutos:0, ubicacion_estado:'' });
  useEffect(() => {
    if (!form.trabajador_id && trabajadores[0]?.id) {
      setForm(prev => ({ ...prev, trabajador_id: trabajadores[0].id }));
    }
  }, [form.trabajador_id, trabajadores[0]?.id]);
  const trabajador = trabajadores.find(t => t.id === form.trabajador_id) || trabajadores[0];
  const turno = workerTurno(turnos, trabajador || {});
  const turnoPersistibleId = turnos.some(t => t.id === turno.id) ? turno.id : null;
  const resultado = calcularResultadoAsistencia(form.hora_entrada, form.hora_salida, turno, form.asistio === 'no', form.justificada, form.refrigerio_tomado_minutos);
  const currentMonth = fecha.substring(0, 7);
  const registrosPeriodo = registrosAsistencia.filter(r => r.fecha.startsWith(currentMonth));
  const diaRows = trabajadores.map(t => {
    const reg = registrosAsistencia.find(r => r.trabajador_id === t.id && r.fecha === fecha);
    const trn = workerTurno(turnos, t);
    const calc = reg ? calcularResultadoAsistencia(reg.hora_entrada, reg.hora_salida, trn, reg.es_falta, reg.justificada) : { estado:'falta', label:'Falta', horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0 };
    return { trabajador:t, turno:trn, registro:reg, calc };
  });
  const kpis = {
    total: trabajadores.length,
    completos: registrosPeriodo.filter(r => r.estado === 'completo' || r.estado === 'horas_extra').length,
    tardanzas: registrosPeriodo.filter(r => r.estado === 'tardanza').length,
    faltas: registrosPeriodo.filter(r => r.estado === 'falta' || r.estado === 'falta_justificada').length
  };
  const guardarRegistro = async (e) => {
    e?.preventDefault?.();
    if (!turnoPersistibleId) {
      addNotificacion('El colaborador no tiene un turno real asignado. Crea un turno y asignalo en Personal antes de registrar asistencia.');
      return;
    }
    const nuevo = {
      empresa_id:empresa.id, trabajador_id:form.trabajador_id, fecha:form.fecha,
      trabajador_tipo: trabajador?.trabajador_tipo || 'operativo',
      turno_id:turnoPersistibleId, hora_entrada:form.asistio === 'no' ? null : form.hora_entrada,
      hora_salida:form.asistio === 'no' ? null : form.hora_salida,
      horas_trabajadas_min:resultado.horas_trabajadas_min, tardanza_min:resultado.tardanza_min,
      horas_extra_min:resultado.horas_extra_min, estado:resultado.estado, es_falta:form.asistio === 'no',
      justificada:form.justificada, motivo_falta:form.justificada ? form.motivo_falta : null, notas:form.notas,
      latitud:form.latitud, longitud:form.longitud, refrigerio_tomado_minutos:form.refrigerio_tomado_minutos ? Number(form.refrigerio_tomado_minutos) : 0
    };
    
    const existente = registrosAsistencia.find(r => r.trabajador_id === form.trabajador_id && r.fecha === form.fecha);
    
    try {
      if (existente?.id) {
        const data = await rrhhService.actualizarAsistencia(existente.id, nuevo);
        setRegistrosAsistencia(prev => prev.map(r => r.id === existente.id ? data : r));
      } else {
        const data = await rrhhService.registrarAsistencia(empresa.id, nuevo);
        setRegistrosAsistencia(prev => [data, ...prev.filter(r => !(r.trabajador_id === nuevo.trabajador_id && r.fecha === nuevo.fecha))]);
      }
      addNotificacion('Registro de asistencia guardado en BD.');
    } catch(err) {
      const fb = {...nuevo, id: existente?.id || `asis_${Date.now()}`};
      setRegistrosAsistencia(prev => [fb, ...prev.filter(r => !(r.trabajador_id === nuevo.trabajador_id && r.fecha === nuevo.fecha))]);
      addNotificacion(`Error BD: ${err.message || JSON.stringify(err)}`);
    }
    setPanel(false);
  };

  const obtenerUbicacion = (e) => {
    e?.preventDefault();
    if (!navigator.geolocation) {
      setForm(prev => ({...prev, ubicacion_estado: 'Geolocalización no soportada'}));
      return;
    }
    setForm(prev => ({...prev, ubicacion_estado: 'Obteniendo...'}));
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm(prev => ({...prev, latitud: pos.coords.latitude, longitud: pos.coords.longitude, ubicacion_estado: 'Ubicación capturada'})),
      () => setForm(prev => ({...prev, ubicacion_estado: 'Error al obtener ubicación'}))
    );
  };

  const marcarKiosk = async (tipo) => {
    if (!turnoPersistibleId) {
      addNotificacion('El colaborador no tiene un turno real asignado. Crea un turno y asignalo antes de marcar asistencia.');
      return;
    }
    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    const nuevoRegistro = {
      empresa_id:empresa.id, trabajador_id:form.trabajador_id, trabajador_tipo: trabajador?.trabajador_tipo || 'operativo', fecha:form.fecha, turno_id:turnoPersistibleId,
      es_falta:false, justificada:false, motivo_falta:null, notas:'Marcación móvil', latitud:form.latitud, longitud:form.longitud,
      refrigerio_tomado_minutos: form.refrigerio_tomado_minutos ? Number(form.refrigerio_tomado_minutos) : 0
    };

    let calc = { horas_trabajadas_min:0, tardanza_min:0, horas_extra_min:0, estado:'incompleto', label:'Incompleto' };
    const existente = registrosAsistencia.find(r => r.trabajador_id === form.trabajador_id && r.fecha === form.fecha);

    if (tipo === 'entrada') {
      if (existente?.hora_entrada) {
        addNotificacion('Ya tienes una entrada marcada hoy.'); return;
      }
      nuevoRegistro.hora_entrada = horaActual;
      nuevoRegistro.hora_salida = existente?.hora_salida || null;
      calc = calcularResultadoAsistencia(horaActual, nuevoRegistro.hora_salida, turno, false, false, form.refrigerio_tomado_minutos);
    } else {
      if (!existente?.hora_entrada) {
        addNotificacion('No puedes marcar salida sin haber marcado entrada.'); return;
      }
      nuevoRegistro.hora_entrada = existente.hora_entrada;
      nuevoRegistro.hora_salida = horaActual;
      calc = calcularResultadoAsistencia(existente.hora_entrada, horaActual, turno, false, false, form.refrigerio_tomado_minutos);
    }

    Object.assign(nuevoRegistro, {
      horas_trabajadas_min:calc.horas_trabajadas_min, tardanza_min:calc.tardanza_min,
      horas_extra_min:calc.horas_extra_min, estado:calc.estado
    });

    try {
      if (existente?.id) {
        const data = await rrhhService.actualizarAsistencia(existente.id, nuevoRegistro);
        setRegistrosAsistencia(prev => prev.map(r => r.id === existente.id ? data : r));
      } else {
        const data = await rrhhService.registrarAsistencia(empresa.id, nuevoRegistro);
        setRegistrosAsistencia(prev => [data, ...prev.filter(r => !(r.trabajador_id === nuevoRegistro.trabajador_id && r.fecha === nuevoRegistro.fecha))]);
      }
      addNotificacion(`Marcación de ${tipo} registrada en BD.`);
    } catch(err) {
      const fb = {...nuevoRegistro, id: existente?.id || `asis_${Date.now()}`};
      setRegistrosAsistencia(prev => [fb, ...prev.filter(r => !(r.trabajador_id === nuevoRegistro.trabajador_id && r.fecha === nuevoRegistro.fecha))]);
      addNotificacion(`Error BD: ${err.message || JSON.stringify(err)}`);
    }

    setKiosk(false);
  };

  const abrirEdicion = (row) => {
    const r = row.registro;
    setForm({
      trabajador_id:row.trabajador.id, fecha, asistio:r?.es_falta ? 'no' : 'si',
      hora_entrada:r?.hora_entrada || row.turno.hora_entrada || '08:00',
      hora_salida:r?.hora_salida || row.turno.hora_salida || '17:00',
      justificada:Boolean(r?.justificada), motivo_falta:r?.motivo_falta || '', notas:r?.notas || ''
    });
    setPanel(true);
  };
  const guardarMasivo = () => {
    const nuevos = trabajadores.map(t => {
      const trn = workerTurno(turnos, t);
      const calc = calcularResultadoAsistencia(trn.hora_entrada, trn.hora_salida, trn, false, false);
      return { id:`asis_${Date.now()}_${t.id}`, empresa_id:empresa.id, trabajador_id:t.id, fecha, turno_id:trn.id, hora_entrada:trn.hora_entrada, hora_salida:trn.hora_salida, horas_trabajadas_min:calc.horas_trabajadas_min, tardanza_min:0, horas_extra_min:calc.horas_extra_min, estado:calc.estado, es_falta:false, justificada:false, motivo_falta:null, notas:'Registro masivo' };
    });
    setRegistrosAsistencia(prev => [...nuevos, ...prev.filter(r => r.fecha !== fecha)]);
    addNotificacion('Registro masivo del dia guardado.');
    setMasivo(false);
  };
  const resumenTrabajador = trabajadores.find(t => t.id === form.trabajador_id) || trabajadores[0];
  const resumenRegs = registrosPeriodo.filter(r => r.trabajador_id === resumenTrabajador?.id);
  const resumenTurno = workerTurno(turnos, resumenTrabajador);
  
  const dateObj = new Date(fecha + 'T00:00:00');
  const day = dateObj.getDay() || 7;
  const startOfWeek = new Date(dateObj);
  startOfWeek.setDate(dateObj.getDate() - day + 1);
  const semanalDias = Array.from({length: 7}).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d.toISOString().split('T')[0];
  });
  const mesNombre = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const mesNombreCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
  const endOfWeek = new Date(startOfWeek.getTime() + 6*86400000);
  const semanaTexto = `Semana del ${startOfWeek.getDate()} al ${endOfWeek.getDate()} de ${mesNombreCap}`;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Control de Asistencia</h1><div className="page-sub">Registro manual, tardanzas y horas trabajadas</div></div>
        <div className="row" style={{gap:10}}><button className="btn btn-primary" style={{background:'var(--green)', borderColor:'var(--green)'}} onClick={() => setKiosk(true)}>{I.clock} Reloj Control (Móvil)</button><button className="btn btn-secondary" onClick={() => setMasivo(true)}>Registro masivo</button><button className="btn btn-secondary" data-local-form="true" onClick={() => setPanel(true)}>{I.plus} Manual</button></div>
      </div>
      <div className="kpi-grid"><div className="kpi-card"><div className="kpi-label">Total trabajadores</div><div className="kpi-value">{kpis.total}</div></div><div className="kpi-card"><div className="kpi-label">Dias completos</div><div className="kpi-value">{kpis.completos}</div></div><div className="kpi-card"><div className="kpi-label">Tardanzas</div><div className="kpi-value" style={{color:'var(--orange)'}}>{kpis.tardanzas}</div></div><div className="kpi-card"><div className="kpi-label">Faltas</div><div className="kpi-value" style={{color:'var(--danger)'}}>{kpis.faltas}</div></div></div>
      <div className="tabs">{[['diaria','Vista diaria'],['semanal','Vista semanal'],['mensual','Vista mensual'],['resumen','Resumen por trabajador']].map(([k,l])=><div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}</div>
      {tab === 'diaria' && <div className="card"><div className="card-head"><h3>Asistencia del dia</h3><input className="input" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{width:160}}/></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Trabajador</th><th>Area</th><th>Turno</th><th>H. Entrada</th><th>H. Salida</th><th>Horas trab.</th><th>Estado</th><th>Justif.</th><th>Acciones</th></tr></thead><tbody>{diaRows.map(row=><tr key={row.trabajador.id}><td><strong>{row.trabajador.nombre}</strong></td><td>{row.trabajador.area}</td><td>{row.turno.nombre} ({row.turno.hora_entrada}-{row.turno.hora_salida})</td><td>{row.registro?.hora_entrada || '-'}</td><td>{row.registro?.hora_salida || '-'}</td><td>{minutesToLabel(row.calc.horas_trabajadas_min)}</td><td><span className={'badge '+asistenciaBadge(row.calc.estado)}>{row.calc.label}</span></td><td>{row.registro?.justificada ? 'Si' : '-'}</td><td><button className="btn btn-sm btn-secondary" onClick={()=>abrirEdicion(row)}>Editar</button></td></tr>)}</tbody></table></div></div>}
      {tab === 'semanal' && <div className="card"><div className="card-head"><h3>Vista semanal</h3><span className="text-muted">{semanaTexto}</span></div><div style={{overflowX:'auto'}}><table className="tbl" style={{minWidth:900}}><thead><tr><th>Trabajador</th>{semanalDias.map(d=><th key={d}>{d.slice(5)}</th>)}</tr></thead><tbody>{trabajadores.slice(0,8).map(t=><tr key={t.id}><td><strong>{t.nombre}</strong></td>{semanalDias.map(d=>{ const r=registrosAsistencia.find(x=>x.trabajador_id===t.id&&x.fecha===d); const trn=workerTurno(turnos,t); const calc=r?calcularResultadoAsistencia(r.hora_entrada,r.hora_salida,trn,r.es_falta,r.justificada):null; return <td key={d}>{calc?<span className={'badge '+asistenciaBadge(calc.estado)}>{calc.estado==='completo'?'OK':calc.estado==='tardanza'?'Tard.':calc.estado==='horas_extra'?'Extra':'Falta'}</span>:<span className="text-muted">-</span>}</td>})}</tr>)}</tbody></table></div><div style={{padding:16, fontSize:12}}><span className="badge badge-green">OK</span> <span className="badge badge-orange">Tardanza</span> <span className="badge badge-cyan">Horas extra</span> <span className="badge badge-red">Falta</span></div></div>}
      {tab === 'mensual' && <div className="card"><div className="card-head"><h3>Resumen mensual - {mesNombreCap}</h3></div><div className="table-wrap"><table className="tbl"><thead><tr><th>Trabajador</th><th>Turno</th><th>Dias lab.</th><th>Asistencias</th><th>Tardanzas</th><th>Min. tardanza</th><th>Faltas</th><th>Faltas justif.</th><th>Horas extra</th><th>Horas totales</th></tr></thead><tbody>{trabajadores.slice(0,8).map(t=>{ const regs=registrosPeriodo.filter(r=>r.trabajador_id===t.id); return <tr key={t.id}><td><strong>{t.nombre}</strong></td><td>{workerTurno(turnos,t).nombre}</td><td>22</td><td>{regs.filter(r=>!r.es_falta).length}</td><td>{regs.filter(r=>r.estado==='tardanza').length}</td><td>{regs.reduce((s,r)=>s+(r.tardanza_min||0),0)} min</td><td>{regs.filter(r=>r.estado==='falta').length}</td><td>{regs.filter(r=>r.estado==='falta_justificada').length}</td><td>{minutesToLabel(regs.reduce((s,r)=>s+(r.horas_extra_min||0),0))}</td><td>{minutesToLabel(regs.reduce((s,r)=>s+(r.horas_trabajadas_min||0),0))}</td></tr>})}</tbody></table></div><div style={{padding:16}}><strong>Promedio de asistencia:</strong> 94.7% · <strong>Total tardanzas:</strong> {kpis.tardanzas} · <strong>Total horas extra:</strong> {minutesToLabel(registrosPeriodo.reduce((s,r)=>s+(r.horas_extra_min||0),0))}</div></div>}
      {tab === 'resumen' && <div className="card" style={{padding:20}}><div className="card-head"><h3>Resumen por trabajador</h3><button className="btn btn-secondary btn-sm">{I.download} Exportar Excel</button></div>{!resumenTrabajador ? <div style={{padding:24, textAlign:'center', color:'var(--fg-muted)'}}>Sin trabajadores registrados.</div> : <div className="grid-2" style={{gap:20}}><div><p><strong>Trabajador:</strong> {resumenTrabajador.nombre}</p><p><strong>Turno asignado:</strong> {resumenTurno.nombre} ({resumenTurno.hora_entrada} - {resumenTurno.hora_salida})</p><p><strong>Dias laborables:</strong> 22 dias</p><p><strong>Dias asistidos:</strong> {resumenRegs.filter(r=>!r.es_falta).length}</p><p><strong>Dias con tardanza:</strong> {resumenRegs.filter(r=>r.estado==='tardanza').length}</p><p><strong>Minutos tardanza:</strong> {resumenRegs.reduce((s,r)=>s+(r.tardanza_min||0),0)} minutos</p></div><div><p><strong>Horas esperadas:</strong> 176h</p><p><strong>Horas efectivas:</strong> {minutesToLabel(resumenRegs.reduce((s,r)=>s+(r.horas_trabajadas_min||0),0))}</p><p><strong>Horas extra:</strong> {minutesToLabel(resumenRegs.reduce((s,r)=>s+(r.horas_extra_min||0),0))}</p><p><strong>Impacto nomina:</strong> descuento referencial por faltas y tardanzas.</p><p className="text-muted">Calculo referencial. Validar con el area de RRHH antes de procesar nomina.</p></div></div>}</div>}
      {panel && <><div className="side-panel-backdrop" onClick={()=>setPanel(false)}/><div className="side-panel" style={{width:'min(520px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Registrar asistencia</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{form.fecha}</div></div><button className="icon-btn" onClick={()=>setPanel(false)}>{I.x}</button></div><form className="side-panel-body" onSubmit={guardarRegistro}><div className="input-group"><label>Fecha</label><input className="input" type="date" value={form.fecha} onChange={e=>setForm(v=>({...v,fecha:e.target.value}))}/></div><div className="input-group"><label>Trabajador</label><select className="select" value={form.trabajador_id} onChange={e=>setForm(v=>({...v,trabajador_id:e.target.value}))}>{trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div><div className="card" style={{padding:12, margin:'12px 0'}}>Turno asignado: <strong>{turno.nombre}</strong> · {turno.hora_entrada} - {turno.hora_salida} · Tolerancia {turno.tolerancia_minutos} min</div><div className="input-group"><label>Asistio</label><select className="select" value={form.asistio} onChange={e=>setForm(v=>({...v,asistio:e.target.value}))}><option value="si">Si</option><option value="no">No - falta</option></select></div>{form.asistio==='si' ? <div className="grid-2" style={{gap:12}}><div className="input-group"><label>Hora entrada</label><input className="input" type="time" value={form.hora_entrada} onChange={e=>setForm(v=>({...v,hora_entrada:e.target.value}))}/></div><div className="input-group"><label>Hora salida</label><input className="input" type="time" value={form.hora_salida} onChange={e=>setForm(v=>({...v,hora_salida:e.target.value}))}/></div></div> : <><label className="row" style={{gap:8}}><input type="checkbox" checked={form.justificada} onChange={e=>setForm(v=>({...v,justificada:e.target.checked}))}/> Falta justificada</label>{form.justificada && <div className="input-group"><label>Motivo</label><select className="select" value={form.motivo_falta} onChange={e=>setForm(v=>({...v,motivo_falta:e.target.value}))}><option>Enfermedad con certificado</option><option>Permiso autorizado</option><option>Licencia</option><option>Otro</option></select></div>}</>}<div className="input-group"><label>Minutos de refrigerio tomados</label><input className="input" type="number" min="0" value={form.refrigerio_tomado_minutos} onChange={e=>setForm(v=>({...v,refrigerio_tomado_minutos:e.target.value}))}/></div><div className="input-group"><label>Ubicación (Opcional)</label><button type="button" className="btn btn-secondary" style={{width:'100%'}} onClick={obtenerUbicacion}>{form.ubicacion_estado || 'Capturar lat/lng'}</button></div>{form.latitud && <div className="text-muted" style={{fontSize:12, marginBottom:10}}>Lat: {form.latitud}, Lng: {form.longitud}</div>}<div className="card" style={{padding:12, margin:'14px 0'}}><p><strong>Horas trabajadas:</strong> {minutesToLabel(resultado.horas_trabajadas_min)}</p><p><strong>Tardanza:</strong> {resultado.tardanza_min} min</p><p><strong>Horas extra:</strong> {minutesToLabel(resultado.horas_extra_min)}</p><p><strong>Estado:</strong> <span className={'badge '+asistenciaBadge(resultado.estado)}>{resultado.label}</span></p></div><div className="input-group"><label>Notas adicionales</label><textarea className="input" rows="3" value={form.notas} onChange={e=>setForm(v=>({...v,notas:e.target.value}))}/></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button type="button" className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" type="submit">Guardar registro</button></div></form></div></>}
      {kiosk && <><div className="side-panel-backdrop" onClick={()=>setKiosk(false)}/><div className="side-panel" style={{width:'min(520px,100vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Reloj Control Móvil</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{new Date().toLocaleDateString()}</div></div><button className="icon-btn" onClick={()=>setKiosk(false)}>{I.x}</button></div><div className="side-panel-body" style={{display:'flex', flexDirection:'column', gap:24}}><div className="input-group"><label>Trabajador</label><select className="select" style={{fontSize:16, padding:12}} value={form.trabajador_id} onChange={e=>setForm(v=>({...v,trabajador_id:e.target.value}))}>{trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div><div className="card" style={{padding:20, textAlign:'center', background:'var(--bg-subtle)'}}><button className="btn btn-primary" style={{width:'100%', padding:'24px 20px', fontSize:20, marginBottom:20, justifyContent:'center'}} onClick={() => marcarKiosk('entrada')}>Entrada</button><button className="btn btn-secondary" style={{width:'100%', padding:'24px 20px', fontSize:20, justifyContent:'center'}} onClick={() => marcarKiosk('salida')}>Salida</button></div><div className="input-group"><label>Minutos de refrigerio tomados (especificar al marcar salida)</label><input className="input" type="number" min="0" style={{fontSize:16, padding:12}} value={form.refrigerio_tomado_minutos} onChange={e=>setForm(v=>({...v,refrigerio_tomado_minutos:e.target.value}))}/></div><div className="input-group"><label>Ubicación requerida</label><button className="btn btn-secondary" style={{width:'100%', padding:12, justifyContent:'center'}} onClick={obtenerUbicacion}>{I.mapPin} {form.ubicacion_estado || 'Obtener mi ubicación actual'}</button></div>{form.latitud && <div className="text-muted" style={{fontSize:14, textAlign:'center'}}>Lat: {form.latitud}, Lng: {form.longitud}</div>}</div></div></>}
      {masivo && <><div className="side-panel-backdrop" onClick={()=>setMasivo(false)}/><div className="side-panel" style={{width:'min(760px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Registro masivo</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{fecha}</div></div><button className="icon-btn" onClick={()=>setMasivo(false)}>{I.x}</button></div><div className="side-panel-body"><div className="table-wrap"><table className="tbl"><thead><tr><th>Trabajador</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Falta</th><th>Justif.</th></tr></thead><tbody>{trabajadores.slice(0,8).map(t=>{const trn=workerTurno(turnos,t);return <tr key={t.id}><td><strong>{t.nombre}</strong></td><td>{trn.nombre}</td><td><input className="input" type="time" defaultValue={trn.hora_entrada}/></td><td><input className="input" type="time" defaultValue={trn.hora_salida}/></td><td><input type="checkbox"/></td><td><input type="checkbox"/></td></tr>})}</tbody></table></div><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setMasivo(false)}>Cancelar</button><button className="btn btn-primary" data-local-form="true" onClick={guardarMasivo}>Guardar todos los registros</button></div></div></div></>}
    </>
  );
}

function Nomina() {
  const {
    turnos, registrosAsistencia, personalOperativo, personalAdmin, trabajadoresDatosNomina,
    periodosNomina, setPeriodosNomina, setComprasGastos, role, empresa, addNotificacion,
    comisiones = [], setComisiones,
  } = useApp();
  const canFinanzas = Boolean(role?.permisos?.ver_finanzas || role?.permisos?.todo);
  const [tab, setTab] = useState('resumen');
  const [periodoId, setPeriodoId] = useState('nom_2026_04');
  const [trabajadorSel, setTrabajadorSel] = useState('');
  const [boleta, setBoleta] = useState(null);
  const [cierre, setCierre] = useState(false);
  const periodo = periodosNomina.find(p => p.id === periodoId) || periodosNomina[0];
  const periodoKey = `${periodo?.anio || 2026}-${String(periodo?.mes || 4).padStart(2, '0')}`;
  const comisionesPlanilla = useMemo(() =>
    comisiones.filter(c => c.estado === 'aprobada' && c.modalidad_pago === 'Planilla' && c.periodo === periodoKey)
  , [comisiones, periodoKey]);
  const comisionPorTrabajador = useMemo(() => {
    const map = {};
    comisionesPlanilla.forEach(c => {
      map[c.vendedor_id] = (map[c.vendedor_id] || 0) + Number(c.monto_total || 0);
    });
    return map;
  }, [comisionesPlanilla]);
  const trabajadores = [
    ...personalOperativo.map(p => ({ ...p, area:p.area || 'Operativo', tipo:'operativo', remuneracion:p.remuneracion || trabajadoresDatosNomina[p.id]?.sueldo_base || p.sueldo_base || 3000 })),
    ...personalAdmin.map(p => ({ id:p.id, nombre:p.nombre, cargo:p.cargo, area:p.area || 'Administrativo', turno_id:p.turno_id || 'tur_005', tipo:'admin', remuneracion:p.remuneracion || trabajadoresDatosNomina[p.id]?.sueldo_base || 3000 }))
  ];
  useEffect(() => {
    if (!trabajadorSel && trabajadores[0]?.id) setTrabajadorSel(trabajadores[0].id);
    if (trabajadorSel && trabajadores.length && !trabajadores.some(t => t.id === trabajadorSel)) setTrabajadorSel(trabajadores[0].id);
  }, [trabajadorSel, trabajadores]);
  const calculos = trabajadores.map(t => {
    const turno = workerTurno(turnos, t);
    const datos = trabajadoresDatosNomina[t.id] || {};
    const regs = registrosAsistencia.filter(r => r.trabajador_id === t.id && r.fecha.startsWith(periodoKey));
    return calcularNominaTrabajador(t, datos, turno, regs, periodo);
  });
  const resumen = calculos.reduce((acc, c) => ({
    total_trabajadores: acc.total_trabajadores + 1,
    masa_salarial_bruta: acc.masa_salarial_bruta + c.remuneracion_bruta,
    total_neto: acc.total_neto + c.neto,
    total_cargas_empresa: acc.total_cargas_empresa + c.total_cargas,
    total_descuentos: acc.total_descuentos + c.total_descuentos,
    total_ir: acc.total_ir + c.retencion_ir,
    costo_laboral_total: acc.costo_laboral_total + c.costo_real_empresa
  }), { total_trabajadores:0, masa_salarial_bruta:0, total_neto:0, total_cargas_empresa:0, total_descuentos:0, total_ir:0, costo_laboral_total:0 });
  const detalle = calculos.find(c => c.trabajador_id === trabajadorSel) || calculos[0];
  const estadoClase = periodo?.estado === 'cerrado' ? 'badge-green' : periodo?.estado === 'calculado' ? 'badge-orange' : 'badge-cyan';
  const descargarBoletas = () => addNotificacion(`Generando ${calculos.length} boletas en PDF.`);
  const calcularNomina = () => {
    setPeriodosNomina(prev => prev.map(p => p.id === periodo.id ? {
      ...p, estado:'calculado', fecha_calculo:'2026-04-28',
      total_trabajadores:resumen.total_trabajadores,
      masa_salarial_bruta:resumen.masa_salarial_bruta,
      total_neto:resumen.total_neto,
      total_cargas_empresa:resumen.total_cargas_empresa
    } : p));
    addNotificacion(`Nomina ${periodo.periodo} calculada y lista para revision.`);
  };
  const cerrarPeriodo = () => {
    const fecha = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${new Date(periodo.anio, periodo.mes, 0).getDate()}`;
    const egresoNomina = {
      id:`gasto_nom_${periodo.id}`, empresa_id:empresa.id, tipo:'gasto',
      descripcion:`Planilla ${periodo.periodo}`, categoria:'Gasto de personal',
      monto:resumen.total_neto, fecha, origen:'nomina', periodo_nomina:periodo.periodo, estado:'registrado'
    };
    const egresoCargas = {
      id:`gasto_cargas_${periodo.id}`, empresa_id:empresa.id, tipo:'gasto',
      descripcion:`Cargas sociales ${periodo.periodo}`, categoria:'Cargas laborales empresa',
      monto:resumen.total_cargas_empresa, fecha, origen:'nomina', periodo_nomina:periodo.periodo, estado:'registrado'
    };
    setComprasGastos(prev => [...prev.filter(g => g.id !== egresoNomina.id && g.id !== egresoCargas.id), egresoNomina, egresoCargas]);
    setPeriodosNomina(prev => prev.map(p => p.id === periodo.id ? { ...p, estado:'cerrado', fecha_cierre:'2026-04-30', usuario_cierre:role.nombre, total_trabajadores:resumen.total_trabajadores, masa_salarial_bruta:resumen.masa_salarial_bruta, total_neto:resumen.total_neto, total_cargas_empresa:resumen.total_cargas_empresa } : p));
    if (comisionesPlanilla.length > 0) {
      const ids = new Set(comisionesPlanilla.map(c => c.id));
      setComisiones(prev => prev.map(c => ids.has(c.id) ? { ...c, estado: 'pagada', pagado_en: new Date().toISOString() } : c));
    }
    addNotificacion(`Nomina ${periodo.periodo} cerrada. Egresos registrados y boletas disponibles.`);
    setCierre(false);
  };

  if (!canFinanzas) {
    return (
      <div className="card" style={{padding:24}}>
        <div className="card-head"><h3>Nomina</h3></div>
        <p className="text-muted">Este modulo requiere permiso de finanzas para ver remuneraciones, descuentos y boletas.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nomina</h1>
          <div className="page-sub">Calculo de remuneraciones, boletas y cierre de periodo</div>
        </div>
        <div className="row" style={{gap:10}}>
          <select className="select" value={periodoId} onChange={e=>setPeriodoId(e.target.value)} style={{width:170}}>
            {periodosNomina.map(p => <option key={p.id} value={p.id}>{p.periodo}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={descargarBoletas}>{I.download} Boletas</button>
          <button className="btn btn-primary" data-local-form="true" onClick={calcularNomina}>Calcular nomina</button>
          <button className="btn btn-secondary" disabled={periodo?.estado !== 'calculado'} onClick={() => setCierre(true)}>Cerrar periodo</button>
        </div>
      </div>
      <div className="card" style={{padding:'12px 16px', marginBottom:16, borderLeft:'3px solid var(--orange)'}}>
        <strong>Los calculos son referenciales.</strong> TIDEO no reemplaza la asesoria de un especialista en legislacion laboral. Valida siempre con tu contador antes de procesar pagos.
      </div>
      <div className="row" style={{justifyContent:'space-between', marginBottom:16}}>
        <div className="row" style={{gap:8}}>
          <span>Estado del periodo:</span>
          <span className={'badge '+estadoClase}>{periodo?.estado || 'abierto'}</span>
        </div>
        <div className="text-muted">Periodo: {periodo?.periodo}</div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Total trabajadores</div><div className="kpi-value">{resumen.total_trabajadores}</div></div>
        <div className="kpi-card"><div className="kpi-label">Masa salarial bruta</div><div className="kpi-value" style={{fontSize:22}}>{money(resumen.masa_salarial_bruta)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total neto a pagar</div><div className="kpi-value" style={{fontSize:22,color:'var(--green)'}}>{money(resumen.total_neto)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Cargas empresa</div><div className="kpi-value" style={{fontSize:22}}>{money(resumen.total_cargas_empresa)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Costo laboral total</div><div className="kpi-value" style={{fontSize:22}}>{money(resumen.costo_laboral_total)}</div></div>
      </div>
      <div className="tabs">
        {[
          ['resumen','Resumen del periodo'],
          ['detalle','Detalle por trabajador'],
          ['cargas','Cargas empresa'],
          ['historial','Historial']
        ].map(([k,l]) => <div key={k} className={'tab '+(tab===k?'active':'')} onClick={()=>setTab(k)}>{l}</div>)}
      </div>

      {tab === 'resumen' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Trabajador</th><th>Turno</th><th>Dias asist.</th><th>Faltas</th><th>Tard.</th><th>H. Extra</th><th>Sueldo base</th><th>Comisión</th><th>Bruto</th><th>Descuentos</th><th>IR</th><th>Neto</th><th>Estado</th><th></th></tr></thead>
              <tbody>{calculos.length === 0 && <tr><td colSpan={13} style={{textAlign:'center', color:'var(--fg-muted)', padding:28}}>Sin trabajadores registrados.</td></tr>}{calculos.map(c => (
                <tr key={c.trabajador_id}>
                  <td><strong>{c.trabajador.nombre}</strong><div className="text-muted" style={{fontSize:11}}>{c.trabajador.cargo}</div></td>
                  <td>{c.turno.nombre}</td>
                  <td>{c.dias_asistidos}/{c.dias_laborables}</td>
                  <td>{c.faltas_injustificadas}</td>
                  <td>{c.tardanzas} ({c.minutos_tardanza_total}m)</td>
                  <td>{minutesToLabel(c.horas_extra_total_min)}</td>
                  <td className="num">{money(c.sueldo_base)}</td>
                  <td className="num">{money(comisionPorTrabajador[c.trabajador_id] || 0)}</td>
                  <td className="num">{money(c.remuneracion_bruta)}</td>
                  <td className="num">{money(c.total_descuentos)}</td>
                  <td className="num">{money(c.retencion_ir)}</td>
                  <td className="num"><strong>{money(c.neto)}</strong></td>
                  <td><span className="badge badge-green">OK</span></td>
                  <td><button className="btn btn-sm btn-secondary" onClick={() => setBoleta(c)}>Ver boleta</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{padding:16, borderTop:'1px solid var(--border-subtle)'}}>
            <strong>Total neto a transferir:</strong> {money(resumen.total_neto)} · Descuentos: {money(resumen.total_descuentos)} · IR: {money(resumen.total_ir)}
          </div>
        </div>
      )}

      {tab === 'detalle' && detalle && (
        <div className="card" style={{padding:20}}>
          <div className="card-head">
            <h3>Detalle de nomina</h3>
            <select className="select" value={trabajadorSel} onChange={e=>setTrabajadorSel(e.target.value)} style={{width:260}}>
              {calculos.map(c => <option key={c.trabajador_id} value={c.trabajador_id}>{c.trabajador.nombre}</option>)}
            </select>
          </div>
          <div className="grid-2" style={{gap:24}}>
            <div>
              <p><strong>{detalle.trabajador.nombre}</strong> - {detalle.trabajador.id} - {periodo.periodo}</p>
              <p>Turno: {detalle.turno.nombre} · {detalle.turno.hora_entrada} - {detalle.turno.hora_salida} · {detalle.dias_laborables} dias laborables</p>
              <hr/>
              <p><strong>Asistencia</strong></p>
              <p>Dias asistidos: {detalle.dias_asistidos} de {detalle.dias_laborables}</p>
              <p>Faltas injustificadas: {detalle.faltas_injustificadas}</p>
              <p>Tardanzas: {detalle.tardanzas} veces · {detalle.minutos_tardanza_total} minutos</p>
              <p>Horas extra: {minutesToLabel(detalle.horas_extra_total_min)}</p>
              <hr/>
              <p><strong>Remuneracion bruta</strong></p>
              <p>(+) Sueldo base: {money(detalle.sueldo_base)}</p>
              <p>(-) Faltas: {money(detalle.desc_faltas)}</p>
              <p>(-) Tardanzas: {money(detalle.desc_tardanzas)}</p>
              <p>(+) Horas extra: {money(detalle.add_horas_extra)}</p>
              <p>(+) Asignacion familiar: {money(detalle.asignacion_familiar)}</p>
              <p><strong>Bruto: {money(detalle.remuneracion_bruta)}</strong></p>
            </div>
            <div>
              <p><strong>Descuentos del trabajador</strong></p>
              <p>{detalle.sistema_pensionario} ({detalle.sistema_pensionario === 'AFP' ? '13.24%' : '13%'}): {money(detalle.desc_pensiones)}</p>
              <p>Prestamo interno: {money(detalle.desc_prestamo)}</p>
              <p>Anticipo: {money(detalle.desc_anticipo)}</p>
              <p>Judicial: {money(detalle.desc_judicial)}</p>
              <p>IR 5ta categoria: {money(detalle.retencion_ir)}</p>
              <p><strong>Neto a pagar: {money(detalle.neto)}</strong></p>
              <hr/>
              <p><strong>Cargas empresa</strong></p>
              <p>ESSALUD: {money(detalle.essalud)}</p>
              <p>CTS mensualizada: {money(detalle.cts_mensualizado)}</p>
              <p>Gratificacion mensualizada: {money(detalle.gratificacion_mensualizada)}</p>
              <p>Vacaciones mensualizadas: {money(detalle.vacaciones_mensualizadas)}</p>
              <p><strong>Costo real empresa: {money(detalle.costo_real_empresa)}</strong></p>
              <p>Costo hora real: {money(detalle.costo_hora_real)}</p>
              <button className="btn btn-secondary" onClick={() => addNotificacion('Novedades aplicadas en el prototipo.')}>{I.edit} Editar novedades</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'cargas' && (
        <div className="card" style={{padding:20}}>
          <div className="card-head"><h3>Cargas a cargo de la empresa - {periodo.periodo}</h3></div>
          <div className="grid-2" style={{gap:16}}>
            <div className="card" style={{padding:16}}><strong>ESSALUD (9%)</strong><p className="text-muted">Pagar a SUNAT · Vencimiento 20/05/2026</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.essalud,0))}</div></div>
            <div className="card" style={{padding:16}}><strong>CTS mensualizada</strong><p className="text-muted">Deposito semestral: mayo y noviembre</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.cts_mensualizado,0))}</div></div>
            <div className="card" style={{padding:16}}><strong>Gratificaciones</strong><p className="text-muted">Provision julio y diciembre</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.gratificacion_mensualizada,0))}</div></div>
            <div className="card" style={{padding:16}}><strong>Vacaciones</strong><p className="text-muted">Provision mensual referencial</p><div className="kpi-value" style={{fontSize:22}}>{money(calculos.reduce((s,c)=>s+c.vacaciones_mensualizadas,0))}</div></div>
          </div>
          <div style={{marginTop:20}}><strong>Total cargas empresa:</strong> {money(resumen.total_cargas_empresa)} · <strong>Costo laboral total:</strong> {money(resumen.costo_laboral_total)}</div>
        </div>
      )}

      {tab === 'historial' && (
        <div className="card">
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Periodo</th><th>Trabajadores</th><th>Masa salarial</th><th>Neto pagado</th><th>Cargas empresa</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{periodosNomina.map(p => <tr key={p.id}><td>{p.periodo}</td><td>{p.total_trabajadores}</td><td>{money(p.masa_salarial_bruta || 0)}</td><td>{money(p.total_neto || 0)}</td><td>{money(p.total_cargas_empresa || 0)}</td><td><span className={'badge '+(p.estado==='cerrado'?'badge-green':p.estado==='calculado'?'badge-orange':'badge-cyan')}>{p.estado}</span></td><td><button className="btn btn-sm btn-secondary" onClick={()=>setPeriodoId(p.id)}>Ver</button></td></tr>)}</tbody></table></div>
        </div>
      )}

      {boleta && <><div className="side-panel-backdrop" onClick={()=>setBoleta(null)}/><div className="side-panel" style={{width:'min(620px,96vw)'}}><div className="side-panel-head"><div><div className="eyebrow">Boleta de pago</div><div className="font-display" style={{fontSize:22,fontWeight:700}}>{boleta.trabajador.nombre}</div></div><button className="icon-btn" onClick={()=>setBoleta(null)}>{I.x}</button></div><div className="side-panel-body"><div className="card" style={{padding:20, border:'1px solid var(--border)'}}><h3 style={{textAlign:'center'}}>BOLETA DE PAGO</h3><p style={{textAlign:'center'}}><strong>{empresa.nombre}</strong><br/>RUC: 20100023491</p><hr/><p>Trabajador: <strong>{boleta.trabajador.nombre}</strong> · Cod: {boleta.trabajador.id}</p><p>Cargo: {boleta.trabajador.cargo} · Area: {boleta.trabajador.area}</p><p>Periodo: {periodo.periodo} · Dias laborados: {boleta.dias_asistidos} de {boleta.dias_laborables}</p><hr/><p><strong>Ingresos</strong></p><p>Sueldo basico: {money(boleta.sueldo_base)}</p><p>Asignacion familiar: {money(boleta.asignacion_familiar)}</p><p>Horas extra: {money(boleta.add_horas_extra)}</p>{(comisionPorTrabajador[boleta.trabajador_id] || 0) > 0 && <p>Comision por ventas: {money(comisionPorTrabajador[boleta.trabajador_id])}</p>}<p><strong>Total ingresos: {money(boleta.sueldo_base + boleta.asignacion_familiar + boleta.add_horas_extra + (comisionPorTrabajador[boleta.trabajador_id] || 0))}</strong></p><hr/><p><strong>Descuentos</strong></p><p>Faltas: -{money(boleta.desc_faltas)}</p><p>Tardanzas: -{money(boleta.desc_tardanzas)}</p><p>{boleta.sistema_pensionario} {boleta.datosNomina?.afp_nombre || ''}: -{money(boleta.desc_pensiones)}</p><p>Prestamo interno: -{money(boleta.desc_prestamo)}</p><p><strong>Total descuentos: -{money(boleta.total_descuentos + boleta.desc_faltas + boleta.desc_tardanzas)}</strong></p><hr/><p>Retencion IR 5ta categoria: {money(boleta.retencion_ir)}</p><h3>Neto a pagar: {money(boleta.neto)}</h3><p className="text-muted">Este documento es referencial. Generado por TIDEO ERP.</p></div><button className="btn btn-primary mt-6" data-local-form="true" onClick={()=>addNotificacion('Boleta PDF lista.')}>{I.download} Descargar boleta PDF</button></div></div></>}

      {cierre && <><div className="side-panel-backdrop" onClick={()=>setCierre(false)}/><div className="modal"><div className="modal-head"><h3>Cerrar nomina - {periodo.periodo}</h3><button className="icon-btn" onClick={()=>setCierre(false)}>{I.x}</button></div><div className="modal-body"><p>Al cerrar este periodo se registrara un egreso de planilla por {money(resumen.total_neto)} y otro de cargas sociales por {money(resumen.total_cargas_empresa)} en Compras y Gastos.</p><p>El periodo quedara cerrado y las boletas disponibles para descarga.</p><div className="row mt-6" style={{justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setCierre(false)}>Cancelar</button><button className="btn btn-primary" onClick={cerrarPeriodo}>Confirmar cierre de nomina</button></div></div></div></>}
    </>
  );
}

function RRHH_Operativo() {
  const { turnos, cargos = [], especialidades = [], sedes = [], role, personalOperativo, crearTecnicoCtx, actualizarTecnicoCtx, eliminarTecnicoCtx, empresa, addNotificacion, centrosCosto } = useApp();
  const canFinanzas = Boolean(role?.permisos?.ver_finanzas || role?.permisos?.todo);
  const [tab, setTab] = useState('personal');
  const personal = personalOperativo;
  const [panelAlta, setPanelAlta] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  /*
  const turnosBaseOperativo = [
    { id: 'turno_manana', nombre: 'Ma\u00f1ana', hora_entrada: '08:00', hora_salida: '17:00' },
    { id: 'turno_noche', nombre: 'Noche', hora_entrada: '20:00', hora_salida: '06:00' },
  ];
  const turnosOptions = [
    ...turnosBaseOperativo,
    ...(turnos || []).filter(t => {
      const nombre = String(t.nombre || '').toLowerCase();
      return !['turno_manana', 'turno_noche'].includes(t.id) && !['mañana', 'manana', 'noche'].includes(nombre);
    })
  ];
  const defaultTurnoIdLegacyOperativo = turnosOptions[0]?.id || 'turno_manana';
  */
  const turnosOptions = (turnos || []).filter(t => t.estado !== 'inactivo');
  const defaultTurnoId = turnosOptions[0]?.id || '';
  const cecosActivos = (centrosCosto || []).filter(c => c.estado === 'activo');
  const formAltaBase = { nombre:'', dni:'', telefono:'', email:'', codigo:'', cargo:'', especialidad:'', especialidad2:'', supervisor_id:'', supervisor:'', sede:'', turno_id:defaultTurnoId, centro_costo_id:'', fecha_ingreso:'', tipo_contrato:'Planilla', costo:'', costo_extra:'', acceso_campo:true, perfil_campo:'Tecnico', estado:'disponible', sueldo_base:'', sistema_pensionario:'AFP', afp_nombre:'Integra', tiene_hijos:false, regimen_laboral:'general', cuota_prestamo_mes:'0', descuento_judicial:'0' };
  const [formAlta, setFormAlta] = useState(formAltaBase);
  const [altaError, setAltaError] = useState('');
  const [altaSaving, setAltaSaving] = useState(false);
  const esHonorarios = formAlta.tipo_contrato === 'Recibos por honorarios';

  const cargosOperativosOptions = cargos
    .filter(c => c.estado !== 'inactivo' && c.tipo !== 'Administrativa' && c.tipo !== 'Administrativo')
    .map(c => c.nombre)
    .filter(Boolean);
  const especialidadesOptions = especialidades
    .filter(e => e.estado !== 'inactivo')
    .map(e => e.nombre)
    .filter(Boolean);
  const sedesOptions = sedes
    .filter(s => s.estado !== 'inactivo')
    .map(s => ({ nombre: s.nombre, detalle: s.direccion || s.detalle || s.gps || '' }))
    .filter(s => s.nombre);
  const esSupervisorOperativo = (p = {}) => {
    const cargo = String(p.cargo || '').toLowerCase();
    return p.perfil_campo === 'Supervisor' || cargo.includes('supervis');
  };
  const supervisorOptions = personal
    .filter(p => p.estado !== 'inactivo' && p.id !== editandoId && esSupervisorOperativo(p))
    .map(p => ({ id: p.id, nombre: p.nombre, cargo: p.cargo || 'Supervisor' }));

  const cerrarPanelTecnico = () => {
    setPanelAlta(false);
    setEditandoId(null);
    setFormAlta(formAltaBase);
    setAltaError('');
  };
  const abrirNuevoTecnico = () => {
    if (!turnosOptions.length) {
      addNotificacion('Primero crea un turno real en RRHH > Turnos y Horarios.');
      return;
    }
    setEditandoId(null);
    setFormAlta({ ...formAltaBase, turno_id: defaultTurnoId });
    setPanelAlta(true);
  };
  const abrirEditarTecnico = (p) => {
    setEditandoId(p.id);
    setFormAlta({
      ...formAltaBase,
      nombre: p.nombre || '',
      dni: p.documento || p.dni || '',
      telefono: sanitizePhone(p.telefono || ''),
      email: p.email || '',
      codigo: p.codigo || p.id || '',
      cargo: p.cargo || '',
      especialidad: p.especialidad || '',
      especialidad2: p.especialidad2 || '',
      supervisor_id: p.supervisor_id || personal.find(s => s.nombre === p.supervisor)?.id || '',
      supervisor: p.supervisor || '',
      sede: p.sede || '',
      turno_id: turnosOptions.some(t => t.id === p.turno_id) ? p.turno_id : defaultTurnoId,
      centro_costo_id: p.centro_costo_id || '',
      fecha_ingreso: p.fecha_ingreso || '',
      tipo_contrato: p.tipo_contrato || 'Planilla',
      costo: String(p.costo ?? p.costo_hora_real ?? ''),
      costo_extra: String(p.costo_hora_extra ?? p.costo_extra ?? ''),
      acceso_campo: p.acceso_campo ?? true,
      perfil_campo: p.perfil_campo || 'Tecnico',
      estado: p.estado || 'disponible',
      sueldo_base: String(p.sueldo_base || ''),
      sistema_pensionario: p.sistema_pensionario || 'AFP',
      afp_nombre: p.afp_nombre || (p.sistema_pensionario === 'ONP' ? 'ONP' : 'Integra'),
      tiene_hijos: Boolean(p.tiene_hijos),
      regimen_laboral: p.regimen_laboral || (p.tipo_contrato === 'Recibos por honorarios' ? 'honorarios' : 'general'),
      cuota_prestamo_mes: String(p.cuota_prestamo_mes ?? '0'),
      descuento_judicial: String(p.descuento_judicial ?? '0'),
    });
    setPanelAlta(true);
  };
  const eliminarTecnico = async (p) => {
    if (!window.confirm(`Eliminar a ${p.nombre}? Esta accion se reflejara en la base de datos.`)) return;
    try {
      await eliminarTecnicoCtx(p.id);
      addNotificacion('Tecnico eliminado.');
    } catch (_) {
      addNotificacion('No se pudo eliminar el tecnico. Revisa si tiene asignaciones o permisos pendientes.');
    }
  };

  const guardarTecnico = async (e) => {
    e.preventDefault();
    if (altaSaving) return;
    if (!turnosOptions.some(t => t.id === formAlta.turno_id)) {
      setAltaError('Selecciona un turno real creado en Supabase antes de guardar el tecnico.');
      return;
    }
    if (!formAlta.centro_costo_id) {
      setAltaError('Este campo es obligatorio. Selecciona un CECO antes de continuar.');
      return;
    }
    setAltaSaving(true);
    setAltaError('');
    const idx = personal.length + 1;
    const codigo = formAlta.codigo || `TEC-${String(idx).padStart(3,'0')}`;
    const supervisorSeleccionado = supervisorOptions.find(p => p.id === formAlta.supervisor_id);
    const nuevo = {
      id: `pop_${Date.now()}`,
      codigo,
      documento: formAlta.dni,
      dni: formAlta.dni,
      telefono: formAlta.telefono,
      email: formAlta.email,
      nombre: formAlta.nombre || 'Nuevo técnico',
      cargo: formAlta.cargo || 'Técnico de Campo',
      especialidad: formAlta.especialidad || 'General',
      especialidad2: formAlta.especialidad2 || '',
      supervisor_id: formAlta.supervisor_id || null,
      supervisor: supervisorSeleccionado?.nombre || '',
      sede: formAlta.sede || '',
      costo: Number(formAlta.costo) || 0,
      costo_hora_real: Number(formAlta.costo) || 0,
      costo_hora_extra: Number(formAlta.costo_extra) || 0,
      acceso_campo: formAlta.acceso_campo,
      perfil_campo: formAlta.perfil_campo,
      fecha_ingreso: formAlta.fecha_ingreso || null,
      tipo_contrato: formAlta.tipo_contrato || 'Planilla',
      sueldo_base: esHonorarios ? 0 : Number(formAlta.sueldo_base) || 0,
      sistema_pensionario: esHonorarios ? null : formAlta.sistema_pensionario,
      afp_nombre: esHonorarios ? null : formAlta.afp_nombre,
      tiene_hijos: esHonorarios ? false : formAlta.tiene_hijos,
      regimen_laboral: esHonorarios ? 'honorarios' : formAlta.regimen_laboral,
      cuota_prestamo_mes: esHonorarios ? 0 : Number(formAlta.cuota_prestamo_mes) || 0,
      descuento_judicial: esHonorarios ? 0 : Number(formAlta.descuento_judicial) || 0,
      estado: formAlta.estado || 'disponible',
      turno_id: formAlta.turno_id,
      centro_costo_id: formAlta.centro_costo_id,
      turno: turnosOptions.find(t => t.id === formAlta.turno_id)?.nombre || '',
      docs: { sctr:'pendiente', medico:'pendiente', epp:'pendiente', licencia:'pendiente' }
    };
    try {
      if (editandoId) {
        await actualizarTecnicoCtx(editandoId, { ...nuevo, id: editandoId, empresa_id: empresa?.id });
        addNotificacion('Tecnico actualizado.');
      } else {
        await crearTecnicoCtx({ ...nuevo, empresa_id: empresa?.id });
        addNotificacion('Tecnico creado.');
      }
      cerrarPanelTecnico();
    } catch (err) {
      console.error('Error guardando tecnico operativo:', err);
      setAltaError(`No se pudo guardar el tecnico en Supabase: ${err?.message || 'error desconocido'}`);
    } finally {
      setAltaSaving(false);
    }
  };

  const disponibles = personal.filter(p => p.estado === 'disponible').length;
  const docsAlerta  = personal.filter(p => Object.values(p.docs || {}).some(d => d !== 'vigente' && d !== 'ok')).length;
  const costoTotal  = personal.filter(p => p.estado !== 'vacaciones').reduce((s,p) => s + Number(p.costo ?? p.costo_hora_real ?? 0), 0);

  const docBadge = d => d==='vigente'||d==='ok' ? 'badge-green' : d==='por_vencer'||d==='incompleto' ? 'badge-orange' : 'badge-red';
  const docLabel = d => d==='vigente'?'Vigente':d==='ok'?'OK':d==='por_vencer'?'Por vencer':d==='incompleto'?'Incompleto':'Vencido';
  const estBadge = e => e==='disponible'?'badge-green':e==='ocupado'?'badge-cyan':'badge-gray';

  const dias = ['Lun 28', 'Mar 29', 'Mié 30', 'Jue 1', 'Vie 2'];
  const asignaciones = {
    'Luis Mendoza': [null,'OT-0045','OT-0045',null,null],
    'Carlos Reyes': [null,null,'OT-0046','OT-0046',null],
    'Ana Torres':   ['Supervisión',null,null,'Supervisión',null],
    'Jorge Quispe': ['Vacaciones','Vacaciones','Vacaciones','Vacaciones','Vacaciones'],
    'Pedro Condori':[null,null,null,'OT-0048','OT-0048'],
    'Rosa Huanca':  ['OT-0047','OT-0047',null,null,null],
  };
  const asigColor = a => !a?null:a.startsWith('OT')?'var(--cyan)':a==='Vacaciones'?'var(--fg-subtle)':'var(--purple)';

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">RRHH Operativo</h1><div className="page-sub">{personal.length} técnicos · Semana 28 Abr – 2 May 2026</div></div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4}}>
          <button className="btn btn-primary" data-local-form="true" onClick={abrirNuevoTecnico} disabled={!turnosOptions.length}>{I.plus} Nuevo Colaborador</button>
          {!turnosOptions.length && <span style={{fontSize:11, color:'var(--danger, #e53e3e)'}}>Crea un turno en Turnos y Horarios para habilitar esta opción.</span>}
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Total personal</div><div className="kpi-value">{personal.length}</div><div className="kpi-icon cyan">{I.users}</div></div>
        <div className="kpi-card"><div className="kpi-label">Disponibles hoy</div><div className="kpi-value" style={{color:'var(--green)'}}>{disponibles}</div><div className="kpi-icon green">{I.check}</div></div>
        <div className="kpi-card"><div className="kpi-label">Docs con alerta</div><div className="kpi-value" style={{color:docsAlerta>0?'var(--orange)':'inherit'}}>{docsAlerta}</div><div className={'kpi-icon '+(docsAlerta>0?'orange':'green')}>{I.shield}</div></div>
        <div className="kpi-card"><div className="kpi-label">Costo/hora campo</div><div className="kpi-value" style={{fontSize:20}}>{money(costoTotal)}</div><div className="kpi-icon purple">{I.dollar}</div></div>
      </div>

      <div className="tabs">
        <div className={'tab '+(tab==='personal'?'active':'')} onClick={()=>setTab('personal')}>Personal</div>
        <div className={'tab '+(tab==='disponibilidad'?'active':'')} onClick={()=>setTab('disponibilidad')}>Disponibilidad</div>
        <div className={'tab '+(tab==='documentos'?'active':'')} onClick={()=>setTab('documentos')}>Documentos</div>
      </div>

      {tab === 'personal' && (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Nombre</th><th>Cargo</th><th>Especialidad</th><th>Sede base</th><th>Costo/Hora</th><th>Turno</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {personal.length === 0 && <tr><td colSpan={9} style={{textAlign:'center', color:'var(--fg-muted)', padding:28}}>Sin personal operativo registrado.</td></tr>}
                {personal.map(p => (
                  <tr key={p.id} className="hover-row">
                    <td className="mono text-muted">{p.codigo || p.id}</td>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{width:28,height:28,fontSize:10}}>{p.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
                        <strong>{p.nombre}</strong>
                      </div>
                    </td>
                    <td>{p.cargo}</td>
                    <td className="text-muted">{p.especialidad}</td>
                    <td>{p.sede ? <span className="badge badge-gray" style={{fontSize:11}}>{p.sede}</span> : <span className="text-subtle">—</span>}</td>
                    <td className="num">{money(p.costo ?? p.costo_hora_real ?? 0)}/hr</td>
                    <td><span className="mono" style={{fontSize:12}}>{workerTurno(turnosOptions, p).nombre}</span></td>
                    <td><span className={'badge '+estBadge(p.estado)}>{p.estado.toUpperCase()}</span></td>
                    <td>
                      <div className="row" style={{gap:6}}>
                        <button className="btn btn-ghost btn-sm" title="Editar tecnico" onClick={() => abrirEditarTecnico(p)}>{I.edit}</button>
                        <button className="btn btn-ghost btn-sm" title="Eliminar tecnico" style={{color:'var(--danger)'}} onClick={() => eliminarTecnico(p)}>{I.trash}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'disponibilidad' && (
        <div className="card">
          <div className="card-head"><h3>Asignaciones — Semana 28 Abr – 2 May</h3><span className="text-muted" style={{fontSize:12}}>{personal.filter(p=>p.estado==='disponible').length} disponibles hoy</span></div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl" style={{minWidth:700}}>
              <thead>
                <tr>
                  <th style={{width:180}}>Técnico</th>
                  {dias.map(d=><th key={d} style={{textAlign:'center', minWidth:90}}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {personal.map(p => (
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{p.nombre}</td>
                    {dias.map((d,i) => {
                      const a = asignaciones[p.nombre]?.[i] ?? null;
                      const color = asigColor(a);
                      return (
                        <td key={d} style={{padding:4, textAlign:'center'}}>
                          {a ? (
                            <div style={{background:color, color:'white', fontSize:11, padding:'4px 6px', borderRadius:4, fontWeight:600}}>{a}</div>
                          ) : (
                            <div style={{height:24, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--green)', fontSize:12}}>libre</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:'12px 20px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:20, fontSize:12}}>
            <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:12,height:12,borderRadius:2,background:'var(--cyan)',display:'inline-block'}}/> OT asignada</span>
            <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:12,height:12,borderRadius:2,background:'var(--purple)',display:'inline-block'}}/> Supervisión</span>
            <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:12,height:12,borderRadius:2,background:'var(--fg-subtle)',display:'inline-block'}}/> Vacaciones</span>
            <span style={{display:'flex',gap:6,alignItems:'center', color:'var(--green)'}}><strong>libre</strong> = Disponible para asignar</span>
          </div>
        </div>
      )}

      {tab === 'documentos' && (
        <div className="card">
          <div className="card-head"><h3>Estado documentario — Habilitaciones técnicas</h3>{docsAlerta>0&&<span className="badge badge-orange">{docsAlerta} con alertas</span>}</div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Técnico</th><th style={{textAlign:'center'}}>SCTR</th><th style={{textAlign:'center'}}>Médico</th><th style={{textAlign:'center'}}>EPP</th><th style={{textAlign:'center'}}>Licencia</th><th>Estado global</th></tr></thead>
              <tbody>
                {personal.map(p => {
                  const vals = Object.values(p.docs || {});
                  const global = vals.some(d=>d==='vencido')?'Vencido':vals.some(d=>d==='por_vencer'||d==='incompleto')?'Revisión':'OK';
                  return (
                    <tr key={p.id} className="hover-row">
                      <td style={{fontWeight:600}}>{p.nombre}<div className="text-muted" style={{fontSize:11}}>{p.cargo}</div></td>
                      {Object.values(p.docs || {}).map((d,i) => (
                        <td key={i} style={{textAlign:'center'}}><span className={'badge '+docBadge(d)} style={{fontSize:11}}>{docLabel(d)}</span></td>
                      ))}
                      <td><span className={'badge '+(global==='OK'?'badge-green':global==='Revisión'?'badge-orange':'badge-red')}>{global}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {panelAlta && <>
        <div className="side-panel-backdrop" onClick={cerrarPanelTecnico}/>
        <div className="side-panel" style={{width:'min(560px, 96vw)'}}>
          <div className="side-panel-head">
            <div>
              <div className="eyebrow">{editandoId ? 'Edicion de personal' : 'Alta de personal'}</div>
              <div className="font-display" style={{fontSize:22, fontWeight:700, marginTop:2}}>{editandoId ? 'Editar tecnico operativo' : 'Nuevo tecnico operativo'}</div>
            </div>
            <button className="icon-btn" onClick={cerrarPanelTecnico}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardarTecnico}>
            {altaError && <div className="alert alert-danger" style={{marginBottom:16}}>{altaError}</div>}
            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos personales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Nombre completo *</label><input className="input" required value={formAlta.nombre} onChange={e=>setFormAlta(v=>({...v,nombre:e.target.value}))} placeholder="Nombre completo" autoFocus/></div>
              <div className="input-group"><label>DNI / Documento *</label><input className="input" required value={formAlta.dni} onChange={e=>setFormAlta(v=>({...v,dni:e.target.value}))} placeholder="12345678"/></div>
              <div className="input-group"><label>Teléfono celular</label><input className="input" type="tel" inputMode="numeric" pattern={PHONE_PATTERN} maxLength={9} value={formAlta.telefono} onChange={e=>setFormAlta(v=>({...v,telefono:sanitizePhone(e.target.value)}))} placeholder="9XXXXXXXX"/></div>
              <div className="input-group" style={{gridColumn:'1/-1'}}><label>Email</label><input className="input" type="email" value={formAlta.email} onChange={e=>setFormAlta(v=>({...v,email:e.target.value}))} placeholder="tecnico@empresa.pe"/></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos laborales</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Código de empleado *</label><input className="input" value={formAlta.codigo} onChange={e=>setFormAlta(v=>({...v,codigo:e.target.value}))} placeholder={`TEC-00${personal.length+1}`}/></div>
              <div className="input-group"><label>CECO *</label><select className="select" required value={formAlta.centro_costo_id} onChange={e=>setFormAlta(v=>({...v,centro_costo_id:e.target.value}))}><option value="">{cecosActivos.length ? 'Seleccionar CECO...' : 'No hay Centros de Costo activos. Crea uno en Maestros Base antes de continuar.'}</option>{cecosActivos.map(c=><option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}</option>)}</select></div>
              <div className="input-group"><label>Turno asignado *</label><select className="select" required value={formAlta.turno_id} onChange={e=>setFormAlta(v=>({...v,turno_id:e.target.value}))}><option value="">Seleccionar turno...</option>{turnosOptions.map(t=><option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}</select>{!turnosOptions.length && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Primero crea un turno en RRHH &gt; Turnos y Horarios.</div>}</div>
              <div className="input-group"><label>Cargo</label><select className="select" value={formAlta.cargo} onChange={e=>setFormAlta(v=>({...v,cargo:e.target.value}))}><option value="">Seleccionar cargo...</option>{cargosOperativosOptions.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="input-group"><label>Especialidad principal</label><select className="select" value={formAlta.especialidad} onChange={e=>setFormAlta(v=>({...v,especialidad:e.target.value}))}><option value="">Seleccionar...</option>{especialidadesOptions.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
              <div className="input-group"><label>Especialidad secundaria <span className="text-muted">(opcional)</span></label><select className="select" value={formAlta.especialidad2} onChange={e=>setFormAlta(v=>({...v,especialidad2:e.target.value}))}><option value="">Ninguna</option>{especialidadesOptions.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
              <div className="input-group"><label>Sede base</label><select className="select" value={formAlta.sede} onChange={e=>setFormAlta(v=>({...v,sede:e.target.value}))}><option value="">Sin sede asignada</option>{sedesOptions.map(s=><option key={s.nombre} value={s.nombre}>{s.nombre}{s.detalle ? ` - ${s.detalle}` : ''}</option>)}</select></div>
              <div className="input-group"><label>Supervisor directo</label><select className="select" value={formAlta.supervisor_id} onChange={e=>setFormAlta(v=>({...v,supervisor_id:e.target.value}))}><option value="">Sin supervisor asignado</option>{supervisorOptions.map(p=><option key={p.id} value={p.id}>{p.nombre} - {p.cargo}</option>)}</select>{!supervisorOptions.length && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Crea o edita un colaborador con perfil de campo Supervisor.</div>}</div>
              <div className="input-group"><label>Fecha de ingreso</label><input className="input" type="date" value={formAlta.fecha_ingreso} onChange={e=>setFormAlta(v=>({...v,fecha_ingreso:e.target.value}))}/></div>
              <div className="input-group"><label>Modalidad de contrato</label><select className="select" value={formAlta.tipo_contrato} onChange={e=>setFormAlta(v=>({...v,tipo_contrato:e.target.value, ...(e.target.value === 'Recibos por honorarios' ? {sueldo_base:'', sistema_pensionario:'', afp_nombre:'', tiene_hijos:false, regimen_laboral:'honorarios', cuota_prestamo_mes:'0', descuento_judicial:'0'} : {sistema_pensionario:v.sistema_pensionario || 'AFP', afp_nombre:v.afp_nombre || 'Integra', regimen_laboral:v.regimen_laboral === 'honorarios' ? 'general' : v.regimen_laboral})}))}><option>Planilla</option><option>Recibos por honorarios</option><option>CAS</option><option>Practicante</option><option>Temporal</option></select></div>
              <div className="input-group"><label>Estado inicial</label><select className="select" value={formAlta.estado} onChange={e=>setFormAlta(v=>({...v,estado:e.target.value}))}><option value="disponible">Disponible</option><option value="inactivo">Inactivo</option></select></div>
            </div>

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Costos</div>
            <div className="grid-2" style={{gap:14, marginBottom:20}}>
              <div className="input-group"><label>Costo hora normal (S/)</label><input className="input" type="number" min="0" value={formAlta.costo} onChange={e=>setFormAlta(v=>({...v,costo:e.target.value, costo_extra:String(Math.round(Number(e.target.value)*1.5))}))} placeholder="0"/></div>
              <div className="input-group"><label>Costo hora extra (S/)</label><input className="input" type="number" min="0" value={formAlta.costo_extra} onChange={e=>setFormAlta(v=>({...v,costo_extra:e.target.value}))} placeholder="0"/></div>
            </div>

            {canFinanzas && <>
              <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Datos de nomina</div>
              {esHonorarios && <div className="alert" style={{marginBottom:12}}>Recibos por honorarios no genera beneficios sociales ni aportes de planilla en este formulario.</div>}
              <div className="grid-2" style={{gap:14, marginBottom:20}}>
                <div className="input-group"><label>Sueldo base</label><input className="input" type="number" min="0" disabled={esHonorarios} value={formAlta.sueldo_base} onChange={e=>setFormAlta(v=>({...v,sueldo_base:e.target.value}))} placeholder="3000"/></div>
                <div className="input-group"><label>Sistema pensionario</label><select className="select" disabled={esHonorarios} value={formAlta.sistema_pensionario} onChange={e=>setFormAlta(v=>({...v,sistema_pensionario:e.target.value, afp_nombre:e.target.value === 'ONP' ? 'ONP' : v.afp_nombre}))}><option value="">No aplica</option><option value="AFP">AFP</option><option value="ONP">ONP</option></select></div>
                <div className="input-group"><label>AFP / Entidad</label><select className="select" disabled={esHonorarios} value={formAlta.afp_nombre} onChange={e=>setFormAlta(v=>({...v,afp_nombre:e.target.value}))}><option value="">No aplica</option><option>Integra</option><option>Prima</option><option>Habitat</option><option>Profuturo</option><option>ONP</option></select></div>
                <div className="input-group"><label>Regimen laboral</label><select className="select" disabled={esHonorarios} value={formAlta.regimen_laboral} onChange={e=>setFormAlta(v=>({...v,regimen_laboral:e.target.value}))}><option value="honorarios">Honorarios</option><option value="general">General</option><option value="mype">MYPE</option><option value="cas">CAS</option><option value="otro">Otro</option></select></div>
                <label className="row" style={{gap:8, alignItems:'center', opacity: esHonorarios ? 0.5 : 1}}><input type="checkbox" disabled={esHonorarios} checked={formAlta.tiene_hijos} onChange={e=>setFormAlta(v=>({...v,tiene_hijos:e.target.checked}))}/> Tiene hijos para asignacion familiar</label>
                <div className="input-group"><label>Cuota prestamo mes</label><input className="input" type="number" min="0" disabled={esHonorarios} value={formAlta.cuota_prestamo_mes} onChange={e=>setFormAlta(v=>({...v,cuota_prestamo_mes:e.target.value}))}/></div>
                <div className="input-group"><label>Descuento judicial</label><input className="input" type="number" min="0" disabled={esHonorarios} value={formAlta.descuento_judicial} onChange={e=>setFormAlta(v=>({...v,descuento_judicial:e.target.value}))}/></div>
              </div>
            </>}

            <div style={{fontWeight:600, fontSize:13, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12}}>Acceso a campo móvil</div>
            <div className="grid-2" style={{gap:14, marginBottom:24}}>
              <div className="input-group"><label>Acceso a app de campo</label><select className="select" value={formAlta.acceso_campo?'si':'no'} onChange={e=>setFormAlta(v=>({...v,acceso_campo:e.target.value==='si'}))}><option value="si">Si</option><option value="no">No</option></select></div>
              {formAlta.acceso_campo && <div className="input-group"><label>Perfil de campo</label><select className="select" value={formAlta.perfil_campo} onChange={e=>setFormAlta(v=>({...v,perfil_campo:e.target.value}))}><option>Tecnico</option><option>Supervisor</option><option>Compras</option></select></div>}
              {formAlta.acceso_campo && <div style={{gridColumn:'1/-1', fontSize:12, color:'var(--cyan)', padding:'8px 12px', background:'rgba(6,182,212,0.08)', borderRadius:8}}>Al activar esto, el técnico podrá ver sus OTs asignadas y registrar partes diarios desde su celular.</div>}
            </div>

            <div className="row" style={{justifyContent:'flex-end', gap:10}}>
              <button type="button" className="btn btn-secondary" onClick={cerrarPanelTecnico}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={altaSaving}>{I.save} {altaSaving ? 'Guardando...' : editandoId ? 'Actualizar tecnico' : 'Guardar tecnico'}</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}

export { Cuentas, OT, Partes, Compras, Proveedores, CotizacionesCompras, OrdenesCompra, OrdenesServicio, Recepciones, ControlAsistencia, Nomina, Backlog, Cierre, Remision, SOLPE, Planner, Tickets, RRHH_Operativo };
