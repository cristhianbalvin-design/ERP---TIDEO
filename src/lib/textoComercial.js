import { renderTextoDocumental } from './variablesDocumentales.js';

export {
  VARIABLES_COTIZACION as VARIABLES_COMERCIALES,
  valorVariableCotizacion as valorVariableComercial,
  insertarTexto,
} from './variablesDocumentales.js';

export function renderTextoComercial(texto = '', ctx = {}) {
  return renderTextoDocumental(texto, 'cotizacion', ctx);
}
