import * as XLSX from 'xlsx';
import * as CFB from 'cfb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// 100 filas cubren cargas habituales sin inflar innecesariamente el archivo.
export const FILAS_PREFORMATEADAS = 100;
export const FORMATO_FECHA = 'dd/mm/yyyy';
export const FORMATO_NUMERO = '#,##0.00';

const cecoColumnas = [
  ['codigo', 'SÍ', 'Texto', 'Código único por sociedad; puede repetirse en otra sociedad.'],
  ['nombre', 'SÍ', 'Texto', 'Nombre del centro de costo.'],
  ['sociedad', 'SÍ en multisociedad', 'Código, nombre o ID de sociedad activa', 'Se resuelve directamente desde esta columna; no se deriva del CEBE padre.'],
  ['tipo', 'SÍ', 'area_funcional, proyecto, temporal', 'Forma o ciclo de vida del CECO.'],
  ['naturaleza_economica', 'No', 'productivo, apoyo, estructural', 'Clasificación económica. Dejar vacío si aún no se ha definido.'],
  ['cebe_padre', 'No', 'Código de CEBE de la misma sociedad', 'Opcional. Si se informa, debe pertenecer a la sociedad indicada en la fila.'],
  ['especialidad', 'No', 'Código o nombre exacto', 'Especialidad asociada.'],
  ['responsable', 'No', 'Nombre exacto de usuario activo', 'Responsable asociado.'],
  ['sede_padre', 'No', 'Código de sede', 'Sede asociada.'],
  ['presupuesto_mensual', 'No', 'Número mayor o igual a 0', 'Presupuesto mensual.'],
  ['fecha_inicio', 'No', 'DD/MM/AAAA, AAAA-MM-DD o fecha nativa de Excel', 'Las fechas con barras se interpretan como día/mes/año.'],
  ['fecha_fin', 'No', 'DD/MM/AAAA, AAAA-MM-DD o fecha nativa de Excel', 'Fin de vigencia. Las fechas con barras se interpretan como día/mes/año.'],
  ['descripcion', 'No', 'Texto', 'Descripción libre.'],
  ['estado', 'No', 'activo, inactivo', 'Si se deja vacío, se importará como activo.'],
];

const cebeColumnas = [
  ['codigo', 'SÍ', 'Texto único', 'Código del CEBE.'],
  ['nombre', 'SÍ', 'Texto', 'Nombre descriptivo del centro de beneficio.'],
  ['tipo', 'SÍ', 'linea_servicio, cliente, proyecto, producto, temporal, estructural', 'Clasificación vigente del CEBE.'],
  ['cargo_financiero_dbs', 'SÍ, excepto estructural', 'Cliente_Contrato, Interno_Empresa, Garantia_Fabrica, Reclamo_Rework, Capital_Propio; vacío para estructural', 'Para estructural debe quedar vacío.'],
  ['modelo_negocio', 'No', 'Catálogo vigente', 'Dato comercial opcional.'],
  ['cliente_asociado', 'No', 'Identificador o nombre exacto de cuenta activa', 'Debe resolver una cuenta activa.'],
  ['responsable', 'No', 'Nombre exacto de usuario activo', 'Si no hay coincidencia única, se importa sin responsable.'],
  ['sociedad', 'SÍ en multisociedad', 'Código o nombre exacto de sociedad activa', 'Sin multisociedad se ignora.'],
  ['meta_ingresos', 'No', 'Número mayor o igual a cero', 'Para estructural debe ser 0.'],
  ['fecha_inicio', 'No', 'DD/MM/AAAA, AAAA-MM-DD o fecha nativa de Excel', 'Las fechas con barras se interpretan como día/mes/año.'],
  ['fecha_fin', 'SÍ para proyecto y temporal', 'DD/MM/AAAA, AAAA-MM-DD o fecha nativa de Excel', 'Obligatorio para proyecto y temporal. Las fechas con barras se interpretan como día/mes/año.'],
  ['descripcion', 'No', 'Texto', 'Descripción libre.'],
  ['estado', 'No', 'activo, inactivo', 'Si se deja vacío, se importará como activo.'],
];

export const PLANTILLAS_CECO_CEBE = [
  {
    archivo: 'plantilla_cecos.xlsx',
    hojaDatos: 'CECOs',
    titulo: 'Plantilla de carga masiva - CECOs',
    instruccionesAdicionales: ['Orden de carga: importar primero los CEBEs y después los CECOs.'],
    columnas: cecoColumnas,
    columnasFecha: ['fecha_inicio', 'fecha_fin'],
    columnasNumericas: ['presupuesto_mensual'],
  },
  {
    archivo: 'plantilla_cebes.xlsx',
    hojaDatos: 'CEBEs',
    titulo: 'Plantilla de carga masiva - CEBEs',
    instruccionesAdicionales: [],
    columnas: cebeColumnas,
    columnasFecha: ['fecha_inicio', 'fecha_fin'],
    columnasNumericas: ['meta_ingresos'],
  },
];

const cellAddress = (columnIndex, rowIndex) => XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });

const crearHojaDatos = ({ columnas, columnasFecha, columnasNumericas }) => {
  const encabezados = columnas.map(([nombre]) => nombre);
  const ws = XLSX.utils.aoa_to_sheet([encabezados]);
  const fechas = new Set(columnasFecha);
  const numericas = new Set(columnasNumericas);

  for (let rowIndex = 1; rowIndex <= FILAS_PREFORMATEADAS; rowIndex += 1) {
    encabezados.forEach((encabezado, columnIndex) => {
      if (fechas.has(encabezado)) {
        // Se convierte a una celda Excel realmente vacía luego de serializar,
        // conservando su formato para la primera escritura del usuario.
        ws[cellAddress(columnIndex, rowIndex)] = { t: 's', v: '', z: FORMATO_FECHA };
      } else if (numericas.has(encabezado)) {
        ws[cellAddress(columnIndex, rowIndex)] = { t: 's', v: '', z: FORMATO_NUMERO };
      }
    });
  }

  ws['!ref'] = `A1:${XLSX.utils.encode_col(encabezados.length - 1)}${FILAS_PREFORMATEADAS + 1}`;
  ws['!cols'] = encabezados.map(encabezado => ({ wch: Math.max(16, encabezado.length + 2) }));
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(encabezados.length - 1)}1` };
  return ws;
};

const crearHojaInstrucciones = ({ titulo, instruccionesAdicionales, columnas }) => {
  const filas = [[titulo], ...instruccionesAdicionales.map(texto => [texto]), [], ['Columna', 'Requerido', 'Valores permitidos', 'Descripción'], ...columnas];
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 25 }, { wch: 24 }, { wch: 90 }, { wch: 86 }];
  return ws;
};

export const generarPlantillasCecoCebe = (directorioSalida = resolve('public', 'plantillas')) => {
  mkdirSync(directorioSalida, { recursive: true });
  return PLANTILLAS_CECO_CEBE.map(definicion => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, crearHojaInstrucciones(definicion), 'Instrucciones');
    XLSX.utils.book_append_sheet(wb, crearHojaDatos(definicion), definicion.hojaDatos);
    const ruta = resolve(directorioSalida, definicion.archivo);
    const archivo = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
    const zip = CFB.read(archivo, { type: 'buffer' });
    const hojaDatos = CFB.find(zip, 'Root Entry/xl/worksheets/sheet2.xml');
    hojaDatos.content = Buffer.from(hojaDatos.content.toString().replace(
      /<c r="([A-Z]+\d+)" s="(\d+)" t="str"><v><\/v><\/c>/g,
      '<c r="$1" s="$2"/>',
    ));
    writeFileSync(ruta, CFB.write(zip, { type: 'buffer', fileType: 'zip' }));
    return ruta;
  });
};

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  for (const ruta of generarPlantillasCecoCebe()) console.log(ruta);
}
