import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { I } from '../icons.jsx';
import { useApp } from '../context.jsx';
import {
  TIPO_DOCUMENTO_RUC,
  TIPO_DOCUMENTO_DNI,
  TIPO_DOCUMENTO_TAX_ID_EXTRANJERO,
  TAX_ID_EXTRANJERO_MIN_LENGTH,
  TAX_ID_EXTRANJERO_MAX_LENGTH,
  isValidPhone,
  sanitizePhone,
  sanitizeRuc,
  sanitizeDocumentoCliente,
} from '../lib/formValidators.js';

// ============================================================================
// 1. DESCARGA DE PLANTILLA EXCEL (CON HOJA DE INSTRUCCIONES DETALLADA)
// ============================================================================
export function descargarPlantillaCuentas() {
  // Hoja 1: Instrucciones detalladas con especificación explícita de campos obligatorios
  const wsInstruccionesData = [
    ['GUÍA E INSTRUCCIONES PARA LA IMPORTACIÓN MASIVA DE CUENTAS Y CONTACTOS'],
    [''],
    ['1. Complete la información de sus clientes o prospectos en la hoja "Cuentas".'],
    ['2. Los campos marcados como [OBLIGATORIO] no pueden quedar vacíos para procesar la fila.'],
    ['3. Los campos marcados como [CONDICIONAL] dependen del tipo de documento (RUC vs DNI/Persona Natural).'],
    ['4. Los campos [OPCIONALES] enriquecen la ficha comercial y pueden completarse o editarse luego en el sistema.'],
    ['5. Al importar, el sistema verificará automáticamente números de documento duplicados y validará formatos SUNAT.'],
    [''],
    ['CAMPO / COLUMNA', 'OBLIGATORIEDAD', 'TIPO DE DATO', 'REGLAS Y VALORES PERMITIDOS', 'DESCRIPCIÓN Y EJEMPLO'],
    ['tipo_documento', 'OBLIGATORIO', 'Texto', 'RUC, DNI, TAX_ID (por defecto: RUC si se omite)', 'Tipo de identificación fiscal del cliente.'],
    ['nro_documento', 'OBLIGATORIO', 'Numérico / Texto', 'RUC: 11 dígitos que inicien con 1 o 2.\nDNI: 8 dígitos.\nTAX_ID: 3 a 30 caracteres alfanuméricos.', 'Número de RUC, DNI o Tax ID del cliente. Ej: 20601234567'],
    ['razon_social', 'CONDICIONAL', 'Texto', 'OBLIGATORIO para empresas con RUC o TAX_ID.\nOpcional para personas con DNI.', 'Razón Social oficial registrada ante SUNAT o ente tributario. Ej: ACME INDUSTRIAL S.A.C.'],
    ['nombre_comercial', 'CONDICIONAL', 'Texto', 'OBLIGATORIO para DNI (Nombre completo de la persona).\nPara RUC es opcional (si se deja vacío, tomará la Razón Social).', 'Nombre comercial de marca o nombre completo si es persona. Ej: Soluciones Mineras Acme'],
    ['tipo', 'OPCIONAL', 'Texto', 'prospecto, cliente, partner, proveedor_estrategico (defecto: prospecto)', 'Clasificación de la cuenta en el embudo comercial.'],
    ['pais', 'OPCIONAL', 'Texto', 'Perú, Chile, Colombia, México, Ecuador, Bolivia, Argentina, Brasil, Uruguay, Otro (defecto: Perú)', 'País donde opera la empresa o persona.'],
    ['industria', 'OPCIONAL', 'Texto', 'Minería, Industrial, Construcción, Agroindustria, Facilities, Energía, Petróleo & Gas, Logística, Otro', 'Sector o rubro económico de la cuenta.'],
    ['tamano', 'OPCIONAL', 'Texto', 'pequeña, mediana, grande, corporativo', 'Tamaño referencial de la organización.'],
    ['direccion', 'OPCIONAL', 'Texto', 'Texto libre', 'Dirección fiscal o sede principal. Ej: Av. Javier Prado Este 4500, Surco, Lima'],
    ['telefono_empresa', 'OPCIONAL', 'Texto / Numérico', 'Teléfono fijo o celular corporativo', 'Teléfono de la central de la empresa. Ej: 014456789'],
    ['email_corporativo', 'OPCIONAL', 'Email', 'Formato de correo válido (ej: contacto@empresa.pe)', 'Correo institucional principal de la empresa.'],
    ['responsable_comercial', 'OBLIGATORIO / RECOMENDADO', 'Texto', 'Nombre y apellido del ejecutivo asignado.', 'Si coincide con un usuario comercial del sistema, se asigna automáticamente. Si no, se puede seleccionar en la previsualización.'],
    ['nombre_contacto', 'OPCIONAL (Recomendado)', 'Texto', 'Nombre y apellido del contacto', 'Nombre del interlocutor principal. Si se llena, el sistema creará automáticamente su ficha de Contacto Principal.'],
    ['cargo_contacto', 'OPCIONAL', 'Texto', 'Texto libre', 'Cargo del contacto principal. Ej: Gerente de Mantenimiento / Jefe de Compras'],
    ['telefono_contacto', 'OPCIONAL', 'Numérico', '9 dígitos iniciando con 9 (ej: 987654321)', 'Celular directo del contacto principal.'],
    ['email_contacto', 'OPCIONAL', 'Email', 'Formato de correo válido (ej: jvaldez@empresa.pe)', 'Correo electrónico personal o directo del contacto.'],
    ['fuente_origen', 'OPCIONAL', 'Texto', 'Referido, Prospección directa, Evento / Feria, Web, Otro', 'Canal comercial o procedencia del prospecto.'],
    ['notas', 'OPCIONAL', 'Texto', 'Texto libre', 'Notas comerciales iniciales, observaciones o antecedentes.']
  ];

  // Hoja 2: Plantilla lista para rellenar
  const headersPlantilla = [
    'tipo_documento',
    'nro_documento',
    'razon_social',
    'nombre_comercial',
    'tipo',
    'pais',
    'industria',
    'tamano',
    'direccion',
    'telefono_empresa',
    'email_corporativo',
    'responsable_comercial',
    'nombre_contacto',
    'cargo_contacto',
    'telefono_contacto',
    'email_contacto',
    'fuente_origen',
    'notas'
  ];

  const filasEjemplo = [
    [
      'RUC',
      '20601234567',
      'INVERSIONES Y SERVICIOS METALÚRGICOS S.A.C.',
      'Metalúrgica Los Andes',
      'cliente',
      'Perú',
      'Minería',
      'mediana',
      'Av. Los Eucaliptos 142, Arequipa',
      '054234567',
      'contacto@losandesmetal.pe',
      'Carlos Comercial',
      'Roberto Gómez Mendoza',
      'Superintendente de Planta',
      '987123456',
      'rgomez@losandesmetal.pe',
      'Prospección directa',
      'Cliente potencial para servicios de calibración y mecanizado de piezas de desgaste.'
    ],
    [
      'DNI',
      '45892134',
      '',
      'Fernando Torres Rivera',
      'prospecto',
      'Perú',
      'Industrial',
      'pequeña',
      'Calle Libertad 320, Trujillo',
      '',
      '',
      '',
      'Fernando Torres Rivera',
      'Consultor Independiente',
      '998765432',
      'ftorres@gmail.com',
      'Referido',
      'Persona natural con negocio; requiere cotización para ensayos destructivos.'
    ]
  ];

  const wb = XLSX.utils.book_new();

  // Crear hoja de instrucciones
  const wsInstr = XLSX.utils.aoa_to_sheet(wsInstruccionesData);
  wsInstr['!cols'] = [
    { wch: 24 }, // Campo
    { wch: 28 }, // Obligatoriedad
    { wch: 18 }, // Tipo de dato
    { wch: 45 }, // Reglas
    { wch: 65 }  // Descripción y ejemplo
  ];

  // Crear hoja de cuentas
  const wsData = XLSX.utils.aoa_to_sheet([headersPlantilla, ...filasEjemplo]);
  wsData['!cols'] = [
    { wch: 16 }, // tipo_documento
    { wch: 18 }, // nro_documento
    { wch: 45 }, // razon_social
    { wch: 30 }, // nombre_comercial
    { wch: 16 }, // tipo
    { wch: 12 }, // pais
    { wch: 18 }, // industria
    { wch: 14 }, // tamano
    { wch: 35 }, // direccion
    { wch: 18 }, // telefono_empresa
    { wch: 28 }, // email_corporativo
    { wch: 25 }, // responsable_comercial
    { wch: 28 }, // nombre_contacto
    { wch: 28 }, // cargo_contacto
    { wch: 18 }, // telefono_contacto
    { wch: 28 }, // email_contacto
    { wch: 20 }, // fuente_origen
    { wch: 40 }  // notas
  ];

  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');
  XLSX.utils.book_append_sheet(wb, wsData, 'Cuentas');

  XLSX.writeFile(wb, 'plantilla_cuentas.xlsx');
}

// ============================================================================
// 2. MODAL DE PREVISUALIZACIÓN E IMPORTACIÓN DE CUENTAS
// ============================================================================
export function ImportarCuentasModal({
  dataRows = [],
  cuentasActuales = [],
  comercialesAsignables = [],
  usuarios = [],
  onClose,
  onImported
}) {
  const { crearCuenta, addNotificacion, empresa } = useApp();
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // TODOS, LISTO, ERROR, OMITIDO

  // Mapear y normalizar las filas recibidas del Excel
  useEffect(() => {
    const normalizeKey = (k = '') => k.toString().trim().toLowerCase().replace(/[\s_\-.]/g, '');
    const normalizeStr = (s = '') => s ? s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';

    const TIPOS_VALIDOS = {
      prospecto: 'prospecto',
      cliente: 'cliente',
      partner: 'partner',
      proveedor_estrategico: 'proveedor_estrategico',
      'proveedor estrategico': 'proveedor_estrategico'
    };

    const INDUSTRIAS_VALIDAS = [
      'Minería', 'Industrial', 'Construcción', 'Agroindustria',
      'Facilities', 'Energía', 'Petróleo & Gas', 'Logística', 'Otro'
    ];

    const TAMANOS_VALIDOS = ['pequeña', 'mediana', 'grande', 'corporativo'];

    const dbDocumentos = new Set(
      cuentasActuales
        .map(c => (c.ruc || '').toString().trim())
        .filter(Boolean)
    );

    const fileDocumentos = new Set();

    const parsed = dataRows.map((row, index) => {
      // Normalizar claves del objeto por si el usuario alteró mayúsculas o espacios en los encabezados
      const dict = {};
      Object.entries(row).forEach(([key, val]) => {
        dict[normalizeKey(key)] = val !== undefined && val !== null ? String(val).trim() : '';
      });

      const rawTipoDoc = (dict['tipodocumento'] || dict['tipodoc'] || '').toUpperCase();
      let tipoDocumento = TIPO_DOCUMENTO_RUC;
      if (rawTipoDoc.includes('DNI')) tipoDocumento = TIPO_DOCUMENTO_DNI;
      else if (rawTipoDoc.includes('TAX') || rawTipoDoc.includes('EXTRANJERO') || rawTipoDoc.includes('NIT')) {
        tipoDocumento = TIPO_DOCUMENTO_TAX_ID_EXTRANJERO;
      }

      const rawDoc = dict['nrodocumento'] || dict['documento'] || dict['ruc'] || dict['dni'] || dict['taxid'] || '';
      const nroDocumento = sanitizeDocumentoCliente(rawDoc, tipoDocumento);

      // Si el usuario no puso tipo de doc pero el número tiene 8 dígitos, inferir DNI
      if (!rawTipoDoc && /^\d{8}$/.test(rawDoc)) {
        tipoDocumento = TIPO_DOCUMENTO_DNI;
      }

      const razonSocial = dict['razonsocial'] || dict['empresa'] || dict['razon'] || '';
      const nombreComercial = dict['nombrecomercial'] || dict['nombre'] || dict['marca'] || '';

      const rawTipo = normalizeStr(dict['tipo'] || dict['tipocuenta'] || '');
      const tipo = TIPOS_VALIDOS[rawTipo] || 'prospecto';

      const pais = dict['pais'] || 'Perú';
      const industriaRaw = dict['industria'] || dict['rubro'] || '';
      const matchedIndustria = INDUSTRIAS_VALIDAS.find(i => normalizeStr(i) === normalizeStr(industriaRaw)) || (industriaRaw ? 'Otro' : 'Por definir');

      const tamanoRaw = normalizeStr(dict['tamano'] || dict['segmento'] || '');
      const tamano = TAMANOS_VALIDOS.find(t => normalizeStr(t) === tamanoRaw) || 'Por definir';

      const direccion = dict['direccion'] || 'Por definir';
      const telefonoEmpresa = dict['telefonoempresa'] || dict['telefonocentral'] || '';
      const emailCorporativo = dict['emailcorporativo'] || dict['correocorporativo'] || '';

      const responsableTexto = dict['responsablecomercial'] || dict['responsable'] || dict['ejecutivo'] || '';

      // Match automático con usuarios o comerciales asignables
      const matchResponsable = (comercialesAsignables.length ? comercialesAsignables : usuarios).find(u =>
        normalizeStr(u.nombre) === normalizeStr(responsableTexto) ||
        normalizeStr(u.email) === normalizeStr(responsableTexto)
      );

      const nombreContacto = dict['nombrecontacto'] || dict['contacto'] || '';
      const cargoContacto = dict['cargocontacto'] || dict['cargo'] || '';
      const telefonoContacto = sanitizePhone(dict['telefonocontacto'] || dict['telefono'] || dict['celular'] || '');
      const emailContacto = dict['emailcontacto'] || dict['email'] || dict['correo'] || '';
      const fuenteOrigen = dict['fuenteorigen'] || dict['fuente'] || '';
      const notas = dict['notas'] || dict['comentarios'] || '';

      const item = {
        id: `imp_cta_${index}`,
        index: index + 1,
        tipo_documento: tipoDocumento,
        nro_documento: nroDocumento,
        razon_social: razonSocial,
        nombre_comercial: nombreComercial,
        tipo,
        pais,
        industria: matchedIndustria,
        tamano,
        direccion,
        telefono_empresa: telefonoEmpresa,
        email_corporativo: emailCorporativo,
        responsable_texto: responsableTexto,
        responsable_comercial: matchResponsable ? matchResponsable.nombre : (responsableTexto || 'Sin asignar'),
        responsable_id: matchResponsable ? matchResponsable.id : null,
        nombre_contacto: nombreContacto,
        cargo_contacto: cargoContacto,
        telefono_contacto: telefonoContacto,
        email_contacto: emailContacto,
        fuente_origen: fuenteOrigen,
        notas,
        selected: false,
        status: 'LISTO', // LISTO, ERROR, OMITIDO_DB, OMITIDO_EXCEL
        errorMsg: ''
      };

      // Validaciones de obligatoriedad y formato
      if (!item.nro_documento) {
        item.status = 'ERROR';
        item.errorMsg = 'N° de documento obligatorio';
      } else if (item.tipo_documento === TIPO_DOCUMENTO_RUC && !/^[12]\d{10}$/.test(item.nro_documento)) {
        item.status = 'ERROR';
        item.errorMsg = 'RUC inválido (debe tener 11 dígitos e iniciar con 1 o 2)';
      } else if (item.tipo_documento === TIPO_DOCUMENTO_DNI && !/^\d{8}$/.test(item.nro_documento)) {
        item.status = 'ERROR';
        item.errorMsg = 'DNI inválido (debe tener exactamente 8 dígitos)';
      } else if (item.tipo_documento === TIPO_DOCUMENTO_TAX_ID_EXTRANJERO && (item.nro_documento.length < TAX_ID_EXTRANJERO_MIN_LENGTH || item.nro_documento.length > TAX_ID_EXTRANJERO_MAX_LENGTH)) {
        item.status = 'ERROR';
        item.errorMsg = `Tax ID debe tener entre ${TAX_ID_EXTRANJERO_MIN_LENGTH} y ${TAX_ID_EXTRANJERO_MAX_LENGTH} caracteres`;
      } else if (item.tipo_documento !== TIPO_DOCUMENTO_DNI && !item.razon_social && !item.nombre_comercial) {
        item.status = 'ERROR';
        item.errorMsg = 'Razón social obligatoria para este tipo de documento';
      } else if (item.tipo_documento === TIPO_DOCUMENTO_DNI && !item.nombre_comercial && !item.razon_social) {
        item.status = 'ERROR';
        item.errorMsg = 'Nombre completo obligatorio para persona natural';
      } else if (item.telefono_contacto && !isValidPhone(item.telefono_contacto)) {
        item.status = 'ERROR';
        item.errorMsg = 'Teléfono del contacto debe tener 9 dígitos y empezar con 9';
      } else if (dbDocumentos.has(item.nro_documento)) {
        item.status = 'OMITIDO_DB';
        item.errorMsg = `Documento ${item.nro_documento} ya registrado en el sistema`;
      } else if (fileDocumentos.has(item.nro_documento)) {
        item.status = 'OMITIDO_EXCEL';
        item.errorMsg = `Documento ${item.nro_documento} duplicado en este archivo`;
      } else {
        fileDocumentos.add(item.nro_documento);
        item.selected = true;
        if (responsableTexto && !matchResponsable) {
          item.errorMsg = `Responsable "${responsableTexto}" no encontrado. Se puede asignar manualmente.`;
        }
      }

      return item;
    });

    setItems(parsed);
  }, [dataRows, cuentasActuales, comercialesAsignables, usuarios]);

  // Actualizar campo editable en la tabla
  const updateItemField = (id, field, value) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };

      // Re-validar si cambia documento o razon social
      if (field === 'nro_documento' || field === 'tipo_documento' || field === 'razon_social' || field === 'nombre_comercial') {
        const esRuc = updated.tipo_documento === TIPO_DOCUMENTO_RUC;
        const esDni = updated.tipo_documento === TIPO_DOCUMENTO_DNI;
        if (!updated.nro_documento) {
          updated.status = 'ERROR';
          updated.errorMsg = 'N° de documento obligatorio';
        } else if (esRuc && !/^[12]\d{10}$/.test(updated.nro_documento)) {
          updated.status = 'ERROR';
          updated.errorMsg = 'RUC inválido (11 dígitos, inicia con 1 o 2)';
        } else if (esDni && !/^\d{8}$/.test(updated.nro_documento)) {
          updated.status = 'ERROR';
          updated.errorMsg = 'DNI inválido (8 dígitos)';
        } else if (!esDni && !updated.razon_social && !updated.nombre_comercial) {
          updated.status = 'ERROR';
          updated.errorMsg = 'Razón social obligatoria';
        } else if (esDni && !updated.nombre_comercial && !updated.razon_social) {
          updated.status = 'ERROR';
          updated.errorMsg = 'Nombre completo obligatorio';
        } else {
          updated.status = 'LISTO';
          updated.errorMsg = '';
          updated.selected = true;
        }
      }

      if (field === 'responsable_comercial') {
        const user = (comercialesAsignables.length ? comercialesAsignables : usuarios).find(u => u.nombre === value);
        updated.responsable_id = user ? user.id : null;
      }

      return updated;
    }));
  };

  const toggleSelect = (id) => {
    setItems(prev => prev.map(t => t.id === id && t.status === 'LISTO' ? { ...t, selected: !t.selected } : t));
  };

  const toggleSelectAll = (checked) => {
    setItems(prev => prev.map(t => t.status === 'LISTO' ? { ...t, selected: checked } : t));
  };

  // Ejecutar importación
  const handleImportar = async () => {
    const toImport = items.filter(t => t.selected && t.status === 'LISTO');
    if (!toImport.length) return;

    setSaving(true);
    let exitosos = 0;

    try {
      for (let i = 0; i < toImport.length; i++) {
        const it = toImport[i];
        const timestamp = (Date.now() + i).toString(36);
        const esPersonaNatural = it.tipo_documento === TIPO_DOCUMENTO_DNI;

        const nuevaCuenta = {
          id: `cta_${timestamp}`,
          empresa_id: empresa?.id,
          ruc: it.nro_documento || null,
          tipo_documento: it.tipo_documento || TIPO_DOCUMENTO_RUC,
          razon_social: esPersonaNatural ? null : (it.razon_social || it.nombre_comercial || 'Nueva cuenta'),
          nombre_comercial: it.nombre_comercial || it.razon_social || 'Nueva cuenta',
          tipo: it.tipo || 'prospecto',
          pais: it.pais || 'Perú',
          industria: it.industria || 'Por definir',
          tamano: it.tamano || 'Por definir',
          estado: 'activo',
          responsable_comercial: it.responsable_comercial || 'Sin asignar',
          responsable_id: it.responsable_id || null,
          responsable_cs: null,
          condicion_pago: 'Por definir',
          limite_credito: 0,
          riesgo_financiero: 'bajo',
          health_score: null,
          riesgo_churn: null,
          fecha_ultima_compra: null,
          margen_acumulado: null,
          saldo_cxc: 0,
          direccion: it.direccion || 'Por definir',
          telefono_empresa: it.telefono_empresa || null,
          email_corporativo: it.email_corporativo || null,
          telefono: it.telefono_contacto || null,
          email: it.email_contacto || null,
          fuente_origen: it.fuente_origen || null,
          notas: it.notas || null,
          nombre_contacto: it.nombre_contacto || null,
          cargo_contacto: it.cargo_contacto || null
        };

        await crearCuenta(nuevaCuenta);
        exitosos++;
      }

      addNotificacion?.(`${exitosos} cuentas importadas exitosamente.`);
      onImported?.();
    } catch (err) {
      addNotificacion?.(`Error al importar cuentas: ${err?.message || 'Inesperado'}`);
    } finally {
      setSaving(false);
    }
  };

  // Contadores
  const totalFilas = items.length;
  const listos = items.filter(t => t.status === 'LISTO').length;
  const seleccionados = items.filter(t => t.selected).length;
  const omitidos = items.filter(t => t.status.startsWith('OMITIDO')).length;
  const errores = items.filter(t => t.status === 'ERROR').length;

  const itemsFiltrados = useMemo(() => {
    if (filtroEstado === 'LISTO') return items.filter(t => t.status === 'LISTO');
    if (filtroEstado === 'ERROR') return items.filter(t => t.status === 'ERROR');
    if (filtroEstado === 'OMITIDO') return items.filter(t => t.status.startsWith('OMITIDO'));
    return items;
  }, [items, filtroEstado]);

  const listaComerciales = comercialesAsignables.length ? comercialesAsignables : usuarios;

  return (
    <div className="modal-backdrop" style={{ zIndex: 1200 }}>
      <div className="modal" style={{ maxWidth: 1300, width: '96vw' }}>
        {/* Cabecera del modal */}
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--cyan)', fontWeight: 600 }}>Importación masiva · CRM</div>
            <h2 style={{ fontSize: 20, margin: 0 }}>Previsualizar Plantilla de Cuentas y Contactos</h2>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Se detectaron <strong>{totalFilas}</strong> filas en el archivo. Revise los datos y corrija si fuera necesario antes de confirmar.
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={saving}>{I.x}</button>
        </div>

        {/* Barra de métricas y filtros */}
        <div style={{ padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className={`badge ${filtroEstado === 'TODOS' ? 'badge-cyan' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}
              onClick={() => setFiltroEstado('TODOS')}
            >
              Total: {totalFilas}
            </span>
            <span
              className={`badge ${filtroEstado === 'LISTO' ? 'badge-green' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}
              onClick={() => setFiltroEstado('LISTO')}
            >
              ✅ Listos para importar: {listos}
            </span>
            <span
              className={`badge ${filtroEstado === 'OMITIDO' ? 'badge-orange' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}
              onClick={() => setFiltroEstado('OMITIDO')}
            >
              ⏭ Duplicados / Omitidos: {omitidos}
            </span>
            <span
              className={`badge ${filtroEstado === 'ERROR' ? 'badge-red' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}
              onClick={() => setFiltroEstado('ERROR')}
            >
              ❌ Con error: {errores}
            </span>
          </div>

          <div style={{ fontSize: 13 }}>
            <strong>{seleccionados}</strong> de {listos} cuentas seleccionadas para crear.
          </div>
        </div>

        {/* Tabla de previsualización */}
        <div className="modal-body" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)' }}>
                <tr>
                  <th style={{ width: 38, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={listos > 0 && seleccionados === listos}
                      onChange={e => toggleSelectAll(e.target.checked)}
                      disabled={listos === 0}
                    />
                  </th>
                  <th style={{ width: 45, textAlign: 'center' }}>Est.</th>
                  <th style={{ width: 85 }}>Tipo Doc</th>
                  <th style={{ minWidth: 125 }}>N° Documento *</th>
                  <th style={{ minWidth: 200 }}>Razón Social *</th>
                  <th style={{ minWidth: 170 }}>Nombre Comercial</th>
                  <th style={{ minWidth: 120 }}>Industria</th>
                  <th style={{ minWidth: 160 }}>Responsable Comercial</th>
                  <th style={{ minWidth: 160 }}>Contacto Principal</th>
                  <th style={{ minWidth: 110 }}>Teléfono</th>
                  <th style={{ minWidth: 200 }}>Observación / Validación</th>
                </tr>
              </thead>
              <tbody>
                {itemsFiltrados.map(item => {
                  const isListo = item.status === 'LISTO';
                  const isError = item.status === 'ERROR';
                  const isOmitido = item.status.startsWith('OMITIDO');

                  return (
                    <tr
                      key={item.id}
                      style={{
                        opacity: isListo ? 1 : 0.7,
                        background: isError ? 'rgba(239,68,68,0.08)' : isOmitido ? 'rgba(251,191,36,0.06)' : 'transparent'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleSelect(item.id)}
                          disabled={!isListo}
                        />
                      </td>

                      {/* Icono de estado */}
                      <td style={{ textAlign: 'center', fontSize: 15 }}>
                        {isListo ? '✅' : isError ? '❌' : '⏭'}
                      </td>

                      {/* Tipo de Documento */}
                      <td>
                        <select
                          className="select"
                          style={{ height: 28, fontSize: 12, padding: '2px 6px' }}
                          value={item.tipo_documento}
                          onChange={e => updateItemField(item.id, 'tipo_documento', e.target.value)}
                        >
                          <option value={TIPO_DOCUMENTO_RUC}>RUC</option>
                          <option value={TIPO_DOCUMENTO_DNI}>DNI</option>
                          <option value={TIPO_DOCUMENTO_TAX_ID_EXTRANJERO}>Tax ID</option>
                        </select>
                      </td>

                      {/* N° Documento */}
                      <td>
                        <input
                          className="input"
                          style={{ height: 28, fontSize: 12, padding: '2px 8px', width: '100%' }}
                          value={item.nro_documento}
                          onChange={e => updateItemField(item.id, 'nro_documento', e.target.value)}
                          placeholder="Doc. tributario"
                        />
                      </td>

                      {/* Razón Social */}
                      <td>
                        <input
                          className="input"
                          style={{ height: 28, fontSize: 12, padding: '2px 8px', width: '100%' }}
                          value={item.razon_social}
                          onChange={e => updateItemField(item.id, 'razon_social', e.target.value)}
                          placeholder={item.tipo_documento === TIPO_DOCUMENTO_DNI ? 'Opcional si DNI' : 'Razón social legal *'}
                        />
                      </td>

                      {/* Nombre Comercial */}
                      <td>
                        <input
                          className="input"
                          style={{ height: 28, fontSize: 12, padding: '2px 8px', width: '100%' }}
                          value={item.nombre_comercial}
                          onChange={e => updateItemField(item.id, 'nombre_comercial', e.target.value)}
                          placeholder={item.tipo_documento === TIPO_DOCUMENTO_DNI ? 'Nombre completo *' : 'Nombre de marca'}
                        />
                      </td>

                      {/* Industria */}
                      <td>
                        <select
                          className="select"
                          style={{ height: 28, fontSize: 12, padding: '2px 6px', width: '100%' }}
                          value={item.industria}
                          onChange={e => updateItemField(item.id, 'industria', e.target.value)}
                        >
                          <option value="Por definir">Por definir</option>
                          {['Minería', 'Industrial', 'Construcción', 'Agroindustria', 'Facilities', 'Energía', 'Petróleo & Gas', 'Logística', 'Otro'].map(i => (
                            <option key={i} value={i}>{i}</option>
                          ))}
                        </select>
                      </td>

                      {/* Responsable Comercial */}
                      <td>
                        <select
                          className="select"
                          style={{ height: 28, fontSize: 12, padding: '2px 6px', width: '100%' }}
                          value={item.responsable_comercial}
                          onChange={e => updateItemField(item.id, 'responsable_comercial', e.target.value)}
                        >
                          <option value="Sin asignar">Sin asignar</option>
                          {listaComerciales.map(u => (
                            <option key={u.id} value={u.nombre}>{u.nombre}</option>
                          ))}
                        </select>
                      </td>

                      {/* Nombre Contacto */}
                      <td>
                        <input
                          className="input"
                          style={{ height: 28, fontSize: 12, padding: '2px 8px', width: '100%' }}
                          value={item.nombre_contacto}
                          onChange={e => updateItemField(item.id, 'nombre_contacto', e.target.value)}
                          placeholder="Contacto principal"
                        />
                      </td>

                      {/* Teléfono */}
                      <td>
                        <input
                          className="input"
                          style={{ height: 28, fontSize: 12, padding: '2px 8px', width: '100%' }}
                          value={item.telefono_contacto}
                          onChange={e => updateItemField(item.id, 'telefono_contacto', sanitizePhone(e.target.value))}
                          placeholder="9XXXXXXXX"
                          maxLength={9}
                        />
                      </td>

                      {/* Mensaje de validación */}
                      <td style={{ fontSize: 12, color: isError ? 'var(--danger)' : isOmitido ? 'var(--orange)' : 'var(--fg-muted)' }}>
                        {item.errorMsg || 'Listo para importar'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pie del modal con acciones */}
        <div className="modal-foot" style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            * Los campos con (*) son obligatorios según el tipo de documento. Puedes editarlos en la tabla antes de importar.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImportar}
              disabled={saving || seleccionados === 0}
            >
              {saving ? 'Importando cuentas...' : `Importar ${seleccionados} cuenta${seleccionados === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
