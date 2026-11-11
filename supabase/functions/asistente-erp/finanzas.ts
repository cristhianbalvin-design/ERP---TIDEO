// Estado de Resultados para Aria: ejecuta el mismo cálculo que la pantalla Finanzas › Estado de Resultados
// (copiado a ./er por scripts/aria/er-compartido.mjs), con el cliente de la persona que pregunta.
import { conCliente } from "./er/entorno.js";
import { ER_SCOPE_MODE, getEstadoResultadosPorScope } from "./er/estadoResultadosService.js";

type Totales = Record<string, number>;
type Rpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const BLOQUES: Array<[string, string]> = [["ingresos", "ingresos"], ["costoVentas", "costo_de_ventas"], ["gastosOp", "gastos_operativos"], ["gastosFin", "gastos_financieros"], ["depreciacion", "depreciacion"]];
const MAX_ITEMS = 8;

const redondear = (totales: Totales | undefined): Totales =>
  Object.fromEntries(Object.entries(totales ?? {}).filter(([, v]) => Number(v)).map(([k, v]) => [k, Math.round(Number(v) * 100) / 100]));
const peso = (totales: Totales | undefined) => Object.values(totales ?? {}).reduce((s, v) => s + Math.abs(Number(v) || 0), 0);

export function resumirEstadoResultados(er: any, periodo: string): Record<string, unknown> {
  if (!er?.er) return { periodo, sin_movimientos: true };
  const bloques: Record<string, unknown> = {};
  for (const [clave, nombre] of BLOQUES) {
    const items = [...(er.er[clave]?.items ?? [])].sort((a: any, b: any) => peso(b.totals) - peso(a.totals));
    bloques[nombre] = {
      total: redondear(er.er[clave]?.total),
      conceptos: items.slice(0, MAX_ITEMS).map((i: any) => ({ concepto: i.label, ...redondear(i.totals) })),
      ...(items.length > MAX_ITEMS ? { conceptos_no_listados: items.length - MAX_ITEMS } : {}),
    };
  }
  return {
    periodo,
    sin_movimientos: !er.hasMovements,
    ...bloques,
    utilidad_bruta: redondear(er.utilidadBruta),
    resultado_operativo: redondear(er.resultadoOp),
    ebitda: redondear(er.ebitda),
    resultado_neto: redondear(er.resultadoNeto),
    margenes_pct: { utilidad_bruta: redondear(er.margenes?.utilidadBruta), resultado_operativo: redondear(er.margenes?.resultadoOp), resultado_neto: redondear(er.margenes?.resultadoNeto) },
    ...(er.otherCurrenciesWarning ? { aviso: "Hay importes en otras monedas que no se sumaron." } : {}),
    nota: "Mismo cálculo que la pantalla Finanzas › Estado de Resultados, por moneda y sin convertir. No mezcles monedas.",
  };
}

export async function estadoResultadosAria(supabase: Rpc, empresaId: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  const periodo = String(args.p_periodo ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { data: null, error: true };
  const sociedadId = typeof args.p_sociedad_id === "string" ? args.p_sociedad_id : null;
  const permiso = await supabase.rpc("asistente_autorizar", { p_empresa_id: empresaId, p_pantalla: "resultados", p_sociedad_id: sociedadId, p_tabla_societaria: true });
  if (permiso.error) return { data: null, error: permiso.error };
  const especiales = await supabase.rpc("asistente_permisos_especiales", { p_empresa_id: empresaId });
  if (especiales.error || (especiales.data as Record<string, unknown> | null)?.ver_finanzas !== true) {
    return { data: { respuesta: "sin permiso", detalle: "El rol de la persona no tiene el permiso para ver finanzas." }, error: null };
  }
  try {
    // El módulo es JavaScript compartido con la pantalla; sus parámetros no tienen tipos.
    const calcular = getEstadoResultadosPorScope as (opciones: Record<string, unknown>) => Promise<unknown>;
    const er = await conCliente(supabase, () => calcular({ empresaId, periodo, mode: ER_SCOPE_MODE.SOCIEDAD, sociedadIds: sociedadId ? [sociedadId] : [] }));
    return { data: resumirEstadoResultados(er, periodo), error: null };
  } catch {
    return { data: null, error: true };
  }
}
