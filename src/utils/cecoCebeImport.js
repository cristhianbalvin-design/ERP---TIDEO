export const CECO_TIPOS_IMPORTACION = ['area_funcional', 'proyecto', 'temporal'];
export const CEBE_TIPOS_IMPORTACION = ['linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal'];

export const CARGOS_FINANCIEROS_DBS = [
  'Cliente_Contrato',
  'Interno_Empresa',
  'Garantia_Fabrica',
  'Reclamo_Rework',
  'Capital_Propio',
];

export const MODELOS_NEGOCIO_CEBE = [
  'Alquiler de equipo',
  'Servicios con equipo propio',
  'Mixto (alquiler + mantenimiento)',
  'Fabricacion, reparacion y mantenimiento',
  'Operacion y Mantenimiento (O&M)',
  'Tarifa por hora / componente',
  'Remanufactura / intercambio de componentes',
  'Venta de repuestos',
  'Monitoreo por suscripcion (IoT)',
  'Tercerizacion de personal (staffing)',
];

export const normalizarCodigoImportacion = value => String(value ?? '').trim().toUpperCase();

const normalizarTexto = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const TIPO_MAP = new Map([
  ['area funcional', 'area_funcional'],
  ['area_funcional', 'area_funcional'],
  ['funcional', 'area_funcional'],
  ['proyecto', 'proyecto'],
  ['project', 'proyecto'],
  ['temporal', 'temporal'],
  ['linea de servicio', 'linea_servicio'],
  ['linea_servicio', 'linea_servicio'],
  ['linea', 'linea_servicio'],
  ['servicio', 'linea_servicio'],
  ['cliente', 'cliente'],
  ['producto', 'producto'],
  ['sede', 'sede'],
  ['sucursal', 'sede'],
]);

const normalizarTipo = value => TIPO_MAP.get(normalizarTexto(value))
  || normalizarTexto(value).replace(/\s+/g, '_');

const normalizarEstado = value => normalizarTexto(value) || 'activo';

const catalogoCanonico = (value, catalogo) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const key = normalizarTexto(value);
  return catalogo.find(item => normalizarTexto(item) === key) || null;
};

const indicesPorCodigo = rows => {
  const result = new Map();
  rows.forEach((row, index) => {
    const codigo = normalizarCodigoImportacion(row?.codigo);
    if (!codigo) return;
    const indices = result.get(codigo) || [];
    indices.push(index + 2);
    result.set(codigo, indices);
  });
  return result;
};

const buscarPorCodigoExacto = (items, value) => {
  const codigo = normalizarCodigoImportacion(value);
  if (!codigo) return null;
  return (items || []).find(item => normalizarCodigoImportacion(item?.codigo) === codigo) || null;
};

const resolverSociedad = (sociedades, value) => {
  const referencia = String(value ?? '').trim();
  if (!referencia) return { sociedad: null, ambigua: false };
  const key = normalizarTexto(referencia);
  const coincidencias = (sociedades || []).filter(sociedad =>
    sociedad?.activa !== false && [sociedad?.id, sociedad?.codigo, sociedad?.nombre]
      .some(candidate => normalizarTexto(candidate) === key)
  );
  return {
    sociedad: coincidencias.length === 1 ? coincidencias[0] : null,
    ambigua: coincidencias.length > 1,
  };
};

const resolverEspecialidad = (especialidades, value) => {
  const referencia = String(value ?? '').trim();
  if (!referencia) return { especialidad: null, ambigua: false };

  const porCodigo = (especialidades || []).filter(item =>
    normalizarCodigoImportacion(item?.codigo) === normalizarCodigoImportacion(referencia)
  );
  if (porCodigo.length === 1) return { especialidad: porCodigo[0], ambigua: false };
  if (porCodigo.length > 1) return { especialidad: null, ambigua: true };

  const nombre = normalizarTexto(referencia);
  const porNombre = (especialidades || []).filter(item => normalizarTexto(item?.nombre) === nombre);
  return {
    especialidad: porNombre.length === 1 ? porNombre[0] : null,
    ambigua: porNombre.length > 1,
  };
};

const resolverResponsable = (usuarios, value) => {
  const nombre = String(value ?? '').trim();
  if (!nombre) return { responsable_id: null, responsable_nombre: null, advertencia: null };
  const key = normalizarTexto(nombre);
  const coincidencias = (usuarios || []).filter(usuario =>
    normalizarTexto(usuario?.estado) === 'activo' && normalizarTexto(usuario?.nombre) === key
  );
  if (coincidencias.length === 1) {
    return {
      responsable_id: coincidencias[0].id,
      responsable_nombre: coincidencias[0].nombre,
      advertencia: null,
    };
  }
  return {
    responsable_id: null,
    responsable_nombre: null,
    advertencia: coincidencias.length > 1
      ? 'Más de un usuario activo coincide con el responsable; la fila se importará sin responsable.'
      : 'Responsable no encontrado entre los usuarios activos; la fila se importará sin responsable.',
  };
};

const resolverCuenta = (cuentas, value) => {
  const referencia = String(value ?? '').trim();
  if (!referencia) return { cuenta: null, ambigua: false };
  const key = normalizarTexto(referencia);
  const coincidencias = (cuentas || []).filter(cuenta => {
    if (normalizarTexto(cuenta?.estado) !== 'activo') return false;
    return [cuenta?.ruc, cuenta?.nombre_comercial]
      .some(candidate => normalizarTexto(candidate) === key);
  });
  return { cuenta: coincidencias.length === 1 ? coincidencias[0] : null, ambigua: coincidencias.length > 1 };
};

const normalizarFecha = value => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { valor: null, valida: true };
  }

  let texto;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { valor: null, valida: false };
    texto = [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  } else {
    texto = String(value).trim();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!match) return { valor: null, valida: false };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const fecha = new Date(Date.UTC(year, month - 1, day));
  const valida = fecha.getUTCFullYear() === year
    && fecha.getUTCMonth() === month - 1
    && fecha.getUTCDate() === day;
  return { valor: valida ? texto : null, valida };
};

const validarFechas = (row, errores) => {
  const inicio = normalizarFecha(row?.fecha_inicio);
  const fin = normalizarFecha(row?.fecha_fin);
  if (!inicio.valida) errores.push('Fecha de inicio inválida: usa el formato AAAA-MM-DD.');
  if (!fin.valida) errores.push('Fecha de fin inválida: usa el formato AAAA-MM-DD.');
  if (inicio.valida && fin.valida && inicio.valor && fin.valor && fin.valor < inicio.valor) {
    errores.push('Fecha inválida: fecha_fin no puede ser anterior a fecha_inicio.');
  }
  return { fecha_inicio: inicio.valor, fecha_fin: fin.valor };
};

const validarDuplicado = (row, index, codigosArchivo, codigosExistentes, errores) => {
  const codigo = normalizarCodigoImportacion(row?.codigo);
  if (!codigo) {
    errores.push('Código obligatorio.');
    return codigo;
  }
  const filas = codigosArchivo.get(codigo) || [];
  if (filas.length > 1) {
    errores.push(`Código duplicado en el archivo: "${codigo}" aparece en las filas ${filas.join(', ')}.`);
  }
  if (codigosExistentes.has(codigo)) {
    errores.push(`Código duplicado: "${codigo}" ya existe en este tenant.`);
  }
  return codigo;
};

const validarCamposComunes = (row, tipo, tiposPermitidos, errores) => {
  if (!String(row?.nombre ?? '').trim()) errores.push('Nombre obligatorio.');
  if (!String(row?.tipo ?? '').trim()) errores.push('Tipo obligatorio.');
  else if (!tiposPermitidos.includes(tipo)) {
    errores.push(`Tipo inválido: "${String(row.tipo).trim()}". Valores permitidos: ${tiposPermitidos.join(', ')}.`);
  }
  const estado = normalizarEstado(row?.estado);
  if (!['activo', 'inactivo'].includes(estado)) errores.push('Estado inválido: usa "activo" o "inactivo".');
  return estado;
};

export const validarFilasImportacionCeco = (rows, catalogos = {}) => {
  const codigosArchivo = indicesPorCodigo(rows);
  const codigosExistentes = new Set((catalogos.centrosCosto || []).map(item => normalizarCodigoImportacion(item.codigo)));
  return (rows || []).map((row, index) => {
    const errores = [];
    const advertencias = [];
    const codigo = validarDuplicado(row, index, codigosArchivo, codigosExistentes, errores);
    const tipo = normalizarTipo(row?.tipo);
    const estado = validarCamposComunes(row, tipo, CECO_TIPOS_IMPORTACION, errores);

    const cebeReferencia = String(row?.cebe_padre ?? '').trim();
    const cebe = buscarPorCodigoExacto(catalogos.centrosBeneficio, cebeReferencia);
    if (catalogos.multisociedadHabilitado && !cebeReferencia) {
      errores.push('CEBE padre obligatorio: se requiere para derivar la sociedad en un tenant con multisociedad.');
    } else if (cebeReferencia && !cebe) {
      errores.push(`CEBE padre inexistente: no se encontró el código "${normalizarCodigoImportacion(row.cebe_padre)}" en este tenant.`);
    }
    if (catalogos.multisociedadHabilitado && cebe && !cebe.sociedad_id) {
      errores.push(`El CEBE padre "${cebe.codigo || cebe.id}" no tiene sociedad asignada; no se puede importar el CECO en un tenant con multisociedad.`);
    }
    const sociedadInformada = resolverSociedad(catalogos.sociedades, row?.sociedad ?? row?.sociedad_id);
    if (catalogos.multisociedadHabilitado && String(row?.sociedad ?? row?.sociedad_id ?? '').trim()) {
      if (!sociedadInformada.sociedad) {
        errores.push(sociedadInformada.ambigua
          ? `Sociedad ambigua: "${String(row?.sociedad ?? row?.sociedad_id).trim()}" coincide con más de una sociedad activa.`
          : `Sociedad inexistente o inactiva: "${String(row?.sociedad ?? row?.sociedad_id).trim()}".`);
      } else if (cebe?.sociedad_id && sociedadInformada.sociedad.id !== cebe.sociedad_id) {
        errores.push('La sociedad informada no coincide con la sociedad del CEBE padre.');
      }
    }
    const sede = buscarPorCodigoExacto(catalogos.sedes, row?.sede_padre);
    if (String(row?.sede_padre ?? '').trim() && !sede) {
      errores.push(`Sede padre inexistente: no se encontró el código "${normalizarCodigoImportacion(row.sede_padre)}" en este tenant.`);
    }
    const especialidadResult = resolverEspecialidad(catalogos.especialidades, row?.especialidad);
    if (String(row?.especialidad ?? '').trim() && !especialidadResult.especialidad) {
      errores.push(especialidadResult.ambigua
        ? `Especialidad ambigua: "${String(row.especialidad).trim()}" coincide con más de una especialidad por nombre.`
        : `Especialidad inexistente: no se encontró el código o nombre exacto "${String(row.especialidad).trim()}" en este tenant.`);
    }

    const presupuesto = String(row?.presupuesto_mensual ?? '').trim();
    if (presupuesto && (!Number.isFinite(Number(presupuesto)) || Number(presupuesto) < 0)) {
      errores.push('Presupuesto mensual inválido: debe ser un número mayor o igual a cero.');
    }

    const responsable = resolverResponsable(catalogos.usuarios, row?.responsable ?? row?.responsable_nombre);
    if (responsable.advertencia) advertencias.push(responsable.advertencia);
    const fechas = validarFechas(row, errores);

    return {
      ...row,
      codigo,
      nombre: String(row?.nombre ?? '').trim(),
      tipo,
      estado,
      cebe_id: cebe?.id || null,
      sociedad_id: catalogos.multisociedadHabilitado ? (cebe?.sociedad_id || null) : null,
      sede_padre: sede?.id || null,
      especialidad: especialidadResult.especialidad?.id || null,
      responsable_id: responsable.responsable_id,
      responsable_nombre: responsable.responsable_nombre,
      fecha_inicio: fechas.fecha_inicio,
      fecha_fin: fechas.fecha_fin,
      presupuesto_mensual: presupuesto === '' ? null : Number(presupuesto),
      _fila: index + 2,
      _errores: errores,
      _advertencias: advertencias,
    };
  });
};

export const validarFilasImportacionCebe = (rows, catalogos = {}) => {
  const codigosArchivo = indicesPorCodigo(rows);
  const codigosExistentes = new Set((catalogos.centrosBeneficio || []).map(item => normalizarCodigoImportacion(item.codigo)));
  return (rows || []).map((row, index) => {
    const errores = [];
    const advertencias = [];
    const codigo = validarDuplicado(row, index, codigosArchivo, codigosExistentes, errores);
    const tipo = normalizarTipo(row?.tipo);
    const estado = validarCamposComunes(row, tipo, CEBE_TIPOS_IMPORTACION, errores);

    const sociedadReferencia = row?.sociedad ?? row?.sociedad_id;
    const sociedadResult = resolverSociedad(catalogos.sociedades, sociedadReferencia);
    if (catalogos.multisociedadHabilitado) {
      if (!String(sociedadReferencia ?? '').trim()) {
        errores.push('Sociedad obligatoria: se requiere para importar un CEBE en un tenant con multisociedad.');
      } else if (!sociedadResult.sociedad) {
        errores.push(sociedadResult.ambigua
          ? `Sociedad ambigua: "${String(sociedadReferencia).trim()}" coincide con más de una sociedad activa.`
          : `Sociedad inexistente o inactiva: "${String(sociedadReferencia).trim()}".`);
      }
    }

    const cargoRaw = String(row?.cargo_financiero_dbs ?? '').trim();
    const cargo = catalogoCanonico(cargoRaw, CARGOS_FINANCIEROS_DBS);
    if (!cargoRaw) {
      errores.push('Cargo financiero DBS obligatorio.');
    } else if (!cargo) {
      errores.push(`Cargo financiero DBS inválido: "${cargoRaw}". Valores permitidos: ${CARGOS_FINANCIEROS_DBS.join(', ')}.`);
    }
    const modeloRaw = String(row?.modelo_negocio ?? '').trim();
    const modelo = catalogoCanonico(modeloRaw, MODELOS_NEGOCIO_CEBE);
    if (modeloRaw && !modelo) {
      errores.push(`Modelo de negocio inválido: "${modeloRaw}".`);
    }

    const clienteRaw = row?.cliente_asociado ?? row?.cuenta_id ?? '';
    const cuentaResult = resolverCuenta(catalogos.cuentas, clienteRaw);
    if (String(clienteRaw).trim() && !cuentaResult.cuenta) {
      errores.push(cuentaResult.ambigua
        ? `Cliente asociado ambiguo: "${String(clienteRaw).trim()}" coincide con más de una cuenta activa.`
        : `Cliente asociado inexistente: no se encontró "${String(clienteRaw).trim()}" en este tenant.`);
    }

    const metaIngresos = String(row?.meta_ingresos ?? '').trim();
    if (metaIngresos && (!Number.isFinite(Number(metaIngresos)) || Number(metaIngresos) < 0)) {
      errores.push('Meta de ingresos inválida: debe ser un número mayor o igual a cero.');
    }

    const responsable = resolverResponsable(catalogos.usuarios, row?.responsable ?? row?.responsable_nombre);
    if (responsable.advertencia) advertencias.push(responsable.advertencia);
    const fechas = validarFechas(row, errores);

    return {
      ...row,
      codigo,
      nombre: String(row?.nombre ?? '').trim(),
      tipo,
      estado,
      cargo_financiero_dbs: cargo,
      modelo_negocio: modelo,
      cuenta_id: cuentaResult.cuenta?.id || null,
      sociedad_id: catalogos.multisociedadHabilitado ? (sociedadResult.sociedad?.id || null) : null,
      responsable_id: responsable.responsable_id,
      responsable_nombre: responsable.responsable_nombre,
      fecha_inicio: fechas.fecha_inicio,
      fecha_fin: fechas.fecha_fin,
      meta_ingresos: metaIngresos === '' ? null : Number(metaIngresos),
      _fila: index + 2,
      _errores: errores,
      _advertencias: advertencias,
    };
  });
};
