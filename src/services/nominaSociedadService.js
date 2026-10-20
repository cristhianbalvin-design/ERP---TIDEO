const texto = value => String(value || '').trim().toLowerCase();

export function resolverParametrosNominaSociedad({
  empresaCfg = {},
  sociedad = null,
  multisociedadHabilitado = false,
} = {}) {
  const regimenTenant = empresaCfg?.regimen_laboral_empresa || 'general';
  const pctQuincenaTenant = Number(empresaCfg?.pct_quincena_1 ?? 50);
  const usarOverride = Boolean(multisociedadHabilitado && sociedad);

  return {
    ...empresaCfg,
    regimen_laboral_empresa: usarOverride
      ? (sociedad.regimen_laboral ?? regimenTenant)
      : regimenTenant,
    pct_quincena_1: Number(usarOverride
      ? (sociedad.pct_quincena_1 ?? pctQuincenaTenant)
      : pctQuincenaTenant),
  };
}

export function esTipoContratoNomina(tipo = {}) {
  const nombre = texto(tipo.nombre || tipo.label || tipo.codigo);
  const categoria = texto(tipo.categoria);
  const esAdenda = Boolean(tipo.documento_padre_tipo_id) || /adenda/.test(nombre);
  return !esAdenda && (
    /contrato/.test(nombre)
    || categoria === 'contractual'
    || Boolean(tipo.captura_snapshot_laboral)
  );
}

export function esContratoDocumentoNomina(doc = {}, tiposDocumento = []) {
  if (doc.contrato_referencia_id) return false;
  const tipo = tiposDocumento.find(item => item.id === (doc.tipo_documento_id || doc.tipo_doc));
  if (tipo) return esTipoContratoNomina(tipo);
  return /contrato/.test(texto(doc.tipo_doc));
}

export const vigenteDurantePeriodo = (doc, periodo) => {
  const desde = periodo?.fecha_inicio || (periodo?.anio && periodo?.mes
    ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01`
    : null);
  const hasta = periodo?.fecha_fin || (periodo?.anio && periodo?.mes
    ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${String(new Date(Date.UTC(periodo.anio, periodo.mes, 0)).getUTCDate()).padStart(2, '0')}`
    : null);
  const inicioContrato = doc.periodo_fecha_inicio || doc.fecha_emision || null;
  const finContrato = doc.es_indefinido ? null : (doc.periodo_fecha_fin || doc.fecha_vencimiento || null);
  if (hasta && inicioContrato && inicioContrato > hasta) return false;
  if (desde && finContrato && finContrato < desde) return false;
  return true;
};

const fechaInicioContrato = doc => doc.periodo_fecha_inicio || doc.fecha_emision || null;
const fechaFinContrato = doc => doc.es_indefinido ? null : (doc.periodo_fecha_fin || doc.fecha_vencimiento || null);
const creadoContrato = doc => String(doc.creado_en || doc.created_at || '');

export function ultimasVersionesNoRechazadas(documentos) {
  const ultimas = new Map();
  (documentos || []).filter(doc => doc.estado_validacion !== 'rechazado').forEach(doc => {
    const clave = doc.contrato_periodo_id || doc.id;
    const anterior = ultimas.get(clave);
    const version = Number(doc.version || 0);
    const versionAnterior = Number(anterior?.version || 0);
    if (!anterior || version > versionAnterior || (version === versionAnterior && creadoContrato(doc) > creadoContrato(anterior))) {
      ultimas.set(clave, doc);
    }
  });
  const noRechazados = (documentos || []).filter(doc => doc.estado_validacion !== 'rechazado');
  return [...ultimas.values()].filter(doc => {
    if (doc.estado_validacion !== 'aprobado') return false;
    if (!doc.contrato_periodo_id) return doc.activo === true;
    if (doc.activo === true) return true;
    return noRechazados.some(sucesor => esSucesorDe(sucesor, doc));
  });
}

function esSucesorDe(sucesor, documento) {
  return sucesor.id !== documento.id
    && Boolean(sucesor.contrato_periodo_id)
    && sucesor.contrato_periodo_id !== documento.contrato_periodo_id
    && !sucesor.contrato_referencia_id
    && sucesor.contrato_periodo_predecesor_id === documento.contrato_periodo_id
    && (!(sucesor.tipo_documento_id || sucesor.tipo_doc) || !(documento.tipo_documento_id || documento.tipo_doc)
      || (sucesor.tipo_documento_id || sucesor.tipo_doc) === (documento.tipo_documento_id || documento.tipo_doc))
    && (!documento.personal_id || !sucesor.personal_id || sucesor.personal_id === documento.personal_id)
    && (!documento.empresa_id || !sucesor.empresa_id || sucesor.empresa_id === documento.empresa_id)
    && (!documento.sociedad_id || !sucesor.sociedad_id || sucesor.sociedad_id === documento.sociedad_id);
}

function suprimidoPorSucesor(documento, documentos, fechaLimite) {
  if (documento?.activo === true || !documento?.contrato_periodo_id || !fechaLimite) return false;
  return (documentos || []).some(sucesor => sucesor.estado_validacion !== 'rechazado'
    && esSucesorDe(sucesor, documento)
    && Boolean(fechaInicioContrato(sucesor))
    && fechaInicioContrato(sucesor) <= fechaLimite);
}

export function seleccionarProximoContrato(documentos = [], fecha) {
  return ultimasVersionesNoRechazadas(documentos)
    .filter(doc => (fechaInicioContrato(doc) || '') > fecha)
    .filter(doc => !suprimidoPorSucesor(doc, documentos, fechaInicioContrato(doc)))
    .sort((a, b) => String(fechaInicioContrato(a) || '').localeCompare(String(fechaInicioContrato(b) || ''))
      || creadoContrato(a).localeCompare(creadoContrato(b)))[0] || null;
}

function diasInterseccionContrato(doc, periodo) {
  const desde = periodo?.fecha_inicio || (periodo?.anio && periodo?.mes ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01` : null);
  const hasta = periodo?.fecha_fin || (periodo?.anio && periodo?.mes
    ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${String(new Date(Date.UTC(periodo.anio, periodo.mes, 0)).getUTCDate()).padStart(2, '0')}`
    : null);
  const inicio = fechaInicioContrato(doc);
  const fin = fechaFinContrato(doc);
  const inicioInterseccion = [desde, inicio].filter(Boolean).sort().at(-1) || null;
  const finInterseccion = [hasta, fin].filter(Boolean).sort()[0] || null;
  if (inicioInterseccion && finInterseccion && inicioInterseccion > finInterseccion) return 0;
  if (!inicioInterseccion || !finInterseccion) return Number.POSITIVE_INFINITY;
  const a = Date.parse(`${inicioInterseccion}T00:00:00Z`);
  const b = Date.parse(`${finInterseccion}T00:00:00Z`);
  return Math.floor((b - a) / 86400000) + 1;
}

export function seleccionarContratoPorFecha(documentos = [], fecha) {
  return ultimasVersionesNoRechazadas(documentos)
    .filter(doc => !suprimidoPorSucesor(doc, documentos, fecha))
    .filter(doc => vigenteDurantePeriodo(doc, { fecha_inicio: fecha, fecha_fin: fecha }))
    .sort((a, b) => String(fechaInicioContrato(b) || '').localeCompare(String(fechaInicioContrato(a) || '')) || creadoContrato(b).localeCompare(creadoContrato(a)))[0] || null;
}

function lineaPeriodosContrato(contrato, documentos) {
  const periodoInicial = contrato?.contrato_periodo_id;
  if (!periodoInicial) return new Set();

  // Un período contractual se representa por el contrato raíz (sin referencia
  // a otro contrato). Las adendas comparten su período, pero no son el nodo
  // que define la cadena de renovaciones.
  const raizPorPeriodo = new Map();
  (documentos || []).forEach(doc => {
    if (!doc?.contrato_periodo_id || doc.contrato_referencia_id) return;
    const actual = raizPorPeriodo.get(doc.contrato_periodo_id);
    if (!actual || String(doc.created_at || doc.creado_en || '') > String(actual.created_at || actual.creado_en || '')) {
      raizPorPeriodo.set(doc.contrato_periodo_id, doc);
    }
  });

  const periodos = new Set();
  let periodoActual = periodoInicial;
  while (periodoActual && !periodos.has(periodoActual)) {
    periodos.add(periodoActual);
    periodoActual = raizPorPeriodo.get(periodoActual)?.contrato_periodo_predecesor_id || null;
  }
  return periodos;
}

function aplicarAdendas(contrato, documentos, periodo) {
  const fechaLimite = periodo?.fecha_fin || null;
  const fechaInicioContrato = contrato?.periodo_fecha_inicio || contrato?.fecha_emision || null;
  const periodoContrato = contrato?.contrato_periodo_id || null;
  const documentosPorId = new Map((documentos || []).map(doc => [doc.id, doc]));
  const periodosLinea = lineaPeriodosContrato(contrato, documentos);
  const contratosLinea = new Set(
    (documentos || [])
      .filter(doc => periodosLinea.has(doc?.contrato_periodo_id) && !doc.contrato_referencia_id)
      .map(doc => doc.id)
  );
  const adendas = documentos
    .filter(doc => doc.sociedad_id === contrato.sociedad_id)
    .filter(doc => doc.estado_validacion === 'aprobado')
    .filter(doc => {
      if (!doc.contrato_referencia_id) return false;
      const contratoReferido = documentosPorId.get(doc.contrato_referencia_id);
      const periodoOrigen = doc.contrato_periodo_id || contratoReferido?.contrato_periodo_id || null;
      const perteneceALinea = doc.contrato_referencia_id === contrato.id
        || contratosLinea.has(doc.contrato_referencia_id)
        || periodosLinea.has(periodoOrigen);
      if (!perteneceALinea) return false;

      const esAdendaDePeriodoAnterior = Boolean(periodoOrigen && periodoContrato && periodoOrigen !== periodoContrato);
      const vigencia = doc.fecha_vigencia_cambio || doc.fecha_emision || null;
      // Una renovación ya posee su propio snapshot. Desde un período anterior
      // solo se heredan adendas con vigencia posterior al inicio de la
      // renovación; las anteriores debieron quedar consolidadas en ese snapshot.
      if (esAdendaDePeriodoAnterior && fechaInicioContrato && vigencia && vigencia < fechaInicioContrato) return false;
      return !fechaLimite || !vigencia || vigencia <= fechaLimite;
    })
    .sort((a, b) => String(a.fecha_vigencia_cambio || a.fecha_emision || a.creado_en || '')
      .localeCompare(String(b.fecha_vigencia_cambio || b.fecha_emision || b.creado_en || '')));

  const condiciones = { ...(contrato.condiciones_laborales || {}) };
  adendas.forEach(adenda => {
    const cambios = adenda.adenda_cambios || {};
    const nuevas = adenda.condiciones_laborales || {};
    if (cambios.cargo) {
      condiciones.cargo = nuevas.cargo;
      condiciones.cargo_id = nuevas.cargo_id;
      condiciones.cargo_nombre = nuevas.cargo_nombre || nuevas.cargo;
    }
    if (cambios.remuneracion) condiciones.remuneracion_base = nuevas.remuneracion_base;
    if (cambios.modalidad) condiciones.modalidad = nuevas.modalidad;
    if (cambios.sede) {
      condiciones.sede = nuevas.sede;
      condiciones.sede_id = nuevas.sede_id;
      condiciones.sede_nombre = nuevas.sede_nombre || nuevas.sede;
    }
    if (cambios.otro) Object.assign(condiciones, nuevas);
  });

  return { ...contrato, condiciones_laborales: condiciones, adendas_aplicadas: adendas };
}

// Se usa al preparar una renovación: la ficha personal no es fuente de
// condiciones en multisociedad. El contrato previo y sus adendas vigentes son
// la única base válida para proponer los valores del nuevo período.
export function resolverContratoConAdendasEnFecha({ contrato, documentos = [], fecha } = {}) {
  if (!contrato) return null;
  return aplicarAdendas(contrato, documentos, {
    fecha_inicio: fecha || null,
    fecha_fin: fecha || null,
  });
}

export function resolverContratosNominaSociedad({
  documentos = [],
  tiposDocumento = [],
  sociedadId,
  periodo,
}) {
  if (!sociedadId) return { contratos: [], ambiguos: [] };
  const candidatos = ultimasVersionesNoRechazadas(documentos
    .filter(doc => doc.sociedad_id === sociedadId)
    .filter(doc => esContratoDocumentoNomina(doc, tiposDocumento)))
    .filter(doc => !suprimidoPorSucesor(doc, documentos, periodo?.fecha_inicio))
    .filter(doc => vigenteDurantePeriodo(doc, periodo));

  const porTrabajador = new Map();
  candidatos.forEach(contrato => {
    const lista = porTrabajador.get(contrato.personal_id) || [];
    lista.push(contrato);
    porTrabajador.set(contrato.personal_id, lista);
  });

  const ambiguos = [];
  const contratos = [];
  porTrabajador.forEach(lista => {
    const ordenados = [...lista].sort((a, b) => diasInterseccionContrato(b, periodo) - diasInterseccionContrato(a, periodo)
      || String(fechaInicioContrato(b) || '').localeCompare(String(fechaInicioContrato(a) || ''))
      || creadoContrato(b).localeCompare(creadoContrato(a)));
    if (ordenados.length > 1) ambiguos.push({ personal_id: ordenados[0].personal_id, contratos: ordenados.map(item => item.id) });
    contratos.push(aplicarAdendas(ordenados[0], documentos, periodo));
  });

  return { contratos, ambiguos };
}

export function resolverPersonalConContratosVigentes({
  personal = [],
  documentos = [],
  tiposDocumento = [],
  sociedadIds = [],
  fecha,
  incluirSinContrato = false,
} = {}) {
  const ids = [...new Set((sociedadIds || []).filter(Boolean))];
  const sociedadesPorPersonal = new Map();
  const ambiguos = [];
  const periodo = { fecha_inicio: fecha, fecha_fin: fecha };

  ids.forEach(sociedadId => {
    const resolucion = resolverContratosNominaSociedad({
      documentos,
      tiposDocumento,
      sociedadId,
      periodo,
    });
    ambiguos.push(...resolucion.ambiguos.map(item => ({ ...item, sociedad_id: sociedadId })));
    resolucion.contratos.forEach(contrato => {
      const actuales = sociedadesPorPersonal.get(contrato.personal_id) || [];
      sociedadesPorPersonal.set(contrato.personal_id, [...actuales, sociedadId]);
    });
  });

  return {
    personal: incluirSinContrato
      ? personal
      : personal.filter(persona => sociedadesPorPersonal.has(persona.id)),
    sociedadesPorPersonal,
    ambiguos,
  };
}

export function resolverSociedadContratoVigente({
  documentos = [],
  tiposDocumento = [],
  sociedades = [],
  personalId,
  fecha,
} = {}) {
  const candidatos = ultimasVersionesNoRechazadas(documentos
    .filter(doc => doc.personal_id === personalId && doc.sociedad_id)
    .filter(doc => esContratoDocumentoNomina(doc, tiposDocumento)))
    .filter(doc => !suprimidoPorSucesor(doc, documentos, fecha))
    .filter(doc => vigenteDurantePeriodo(doc, { fecha_inicio: fecha, fecha_fin: fecha }));
  const porSociedad = new Map();
  candidatos.forEach(doc => {
    const lista = porSociedad.get(doc.sociedad_id) || [];
    lista.push(doc);
    porSociedad.set(doc.sociedad_id, lista);
  });
  const vigentes = [...porSociedad.values()].map(lista => lista.sort((a, b) =>
    String(fechaInicioContrato(b) || '').localeCompare(String(fechaInicioContrato(a) || ''))
    || creadoContrato(b).localeCompare(creadoContrato(a)))[0]);
  const sociedadIds = [...new Set(vigentes.map(contrato => contrato.sociedad_id).filter(Boolean))];
  const sociedadesPorId = new Map((sociedades || []).map(sociedad => [sociedad.id, sociedad]));
  const nombres = sociedadIds.map(id => {
    const sociedad = sociedadesPorId.get(id);
    return sociedad ? `${sociedad.codigo ? `${sociedad.codigo} - ` : ''}${sociedad.nombre}` : id;
  });
  return {
    sociedadId: sociedadIds.length === 1 ? sociedadIds[0] : null,
    conflicto: sociedadIds.length > 1,
    sociedadIds,
    nombres,
    contratos: vigentes,
  };
}

export function resolverSociedadDocumentoLaboral({
  multisociedadHabilitado = false,
  documentos = [],
  tiposDocumento = [],
  sociedades = [],
  personalId,
  fecha,
} = {}) {
  if (!multisociedadHabilitado) return null;
  if (!fecha) {
    throw new Error('La fecha del documento es obligatoria para resolver la sociedad del contrato vigente.');
  }

  const resolucion = resolverSociedadContratoVigente({
    documentos,
    tiposDocumento,
    sociedades,
    personalId,
    fecha,
  });

  if (resolucion.conflicto) {
    throw new Error(`El trabajador tiene contratos vigentes en sociedades distintas: ${resolucion.nombres.join(', ')}. Resuelve manualmente el conflicto contractual antes de emitir el documento.`);
  }
  if (!resolucion.sociedadId) {
    throw new Error(`El trabajador no tiene contrato vigente en ninguna sociedad para la fecha ${fecha}. Regulariza su contrato antes de emitir el documento.`);
  }

  return resolucion.sociedadId;
}

export function aplicarContratoATrabajador(persona, contrato) {
  const condiciones = contrato?.condiciones_laborales || {};
  const remuneracion = Number(condiciones.remuneracion_base);
  const regimen = condiciones.regimen_jornada || persona.regimen_jornada || 'general';
  return {
    ...persona,
    cargo: condiciones.cargo_nombre || condiciones.cargo || persona.cargo,
    cargo_id: condiciones.cargo_id || persona.cargo_id,
    sede: condiciones.sede_nombre || condiciones.sede || persona.sede,
    sede_id: condiciones.sede_id || persona.sede_id,
    area: condiciones.area_nombre || condiciones.area || persona.area,
    area_id: condiciones.area_id || persona.area_id,
    tipo_contrato: condiciones.tipo_contrato || persona.tipo_contrato,
    modalidad: condiciones.modalidad || persona.modalidad,
    regimen_jornada: regimen,
    ...(Number.isFinite(remuneracion) && remuneracion > 0
      ? { sueldo_base: remuneracion, remuneracion, monto_mensual: remuneracion }
      : {}),
    contrato_nomina: contrato,
    sociedad_id: contrato.sociedad_id,
  };
}

export function datosNominaDesdeContrato(datosNomina = {}, contrato) {
  const condiciones = contrato?.condiciones_laborales || {};
  const remuneracion = Number(condiciones.remuneracion_base);
  return {
    ...datosNomina,
    ...(Number.isFinite(remuneracion) && remuneracion > 0 ? { sueldo_base: remuneracion } : {}),
    ...(condiciones.regimen_jornada ? { regimen_jornada: condiciones.regimen_jornada } : {}),
  };
}
