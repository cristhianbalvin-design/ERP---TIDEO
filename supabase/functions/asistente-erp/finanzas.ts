// Estado de Resultados para Aria: ejecuta el mismo cálculo que la pantalla Finanzas › Estado de Resultados
// (copiado a ./er por scripts/aria/er-compartido.mjs), con el cliente de la persona que pregunta.
import { conCliente } from "./er/entorno.js";
import { ER_SCOPE_MODE, getEstadoResultadosPorScope } from "./er/estadoResultadosService.js";
import { crearRealDePresupuesto } from "./er/presupuestoRealPantalla.js";

type Totales = Record<string, number>;
type Rpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
// deno-lint-ignore no-explicit-any
type Cliente = Rpc & { from: (tabla: string) => any };
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

const dos = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;

export function resumirPresupuesto(presupuesto: any, resumen: any): Record<string, unknown> {
  const porMoneda = (t: Totales | undefined) => Object.fromEntries(Object.entries(t ?? {}).filter(([, v]) => Number(v)).map(([k, v]) => [k, dos(v)]));
  return {
    nombre: presupuesto.nombre, estado: presupuesto.estado,
    presupuestado: porMoneda(resumen.totales.presupuestado), ejecutado: porMoneda(resumen.totales.real), variacion: porMoneda(resumen.totales.variacion),
    partidas: (resumen.porPartida ?? []).map((r: any) => {
      const pres = Number(r.partida?.monto_presupuestado || 0);
      return { categoria: r.partida?.categoria, moneda: r.moneda, presupuestado: dos(pres), ejecutado: dos(r.real), variacion: dos(r.real - pres), ejecucion_pct: pres > 0 ? Math.round(r.real / pres * 100) : null, excedida: r.real > pres };
    }),
    ejecutado_sin_partida: (resumen.sinPartida ?? []).map((r: any) => ({ categoria: r.categoria, moneda: r.moneda, ejecutado: dos(r.real), detalle: r.descripcion })),
  };
}

// Las mismas consultas, en el mismo orden, con que la aplicación carga estos datos (src/context.jsx):
// así el límite de filas por consulta afecta igual a la pantalla y a Aria.
async function filas(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<any[]> {
  const { data, error } = await consulta;
  if (error) throw error;
  return (data as any[] | null) ?? [];
}

export async function presupuestoRealAria(supabase: Cliente, empresaId: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  const periodo = String(args.p_periodo ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { data: null, error: true };
  const sociedadId = typeof args.p_sociedad_id === "string" ? args.p_sociedad_id : null;
  const permiso = await supabase.rpc("asistente_autorizar", { p_empresa_id: empresaId, p_pantalla: "presupuestos", p_sociedad_id: sociedadId, p_tabla_societaria: true });
  if (permiso.error) return { data: null, error: permiso.error };
  const alcance = Array.isArray(permiso.data) ? permiso.data as string[] : null;
  try {
    const de = (tabla: string, columnas = "*") => supabase.from(tabla).select(columnas).eq("empresa_id", empresaId);
    const [empresa, presupuestos, partidas, comprasGastos, cxp, otsCrudas, centrosCosto, centrosBeneficio] = await Promise.all([
      filas(supabase.from("empresas").select("id, multisociedad_habilitado").eq("id", empresaId)),
      filas(de("presupuestos").order("creado_en", { ascending: false })),
      filas(de("presupuesto_partidas").order("orden", { ascending: true })),
      filas(de("compras_gastos").order("fecha", { ascending: false })),
      filas(de("cxp", "*, proveedores(id, razon_social)").order("fecha_vencimiento", { ascending: true })),
      filas(de("ordenes_trabajo").order("created_at", { ascending: false })),
      filas(de("centros_costo", "id, sociedad_id")),
      filas(de("centros_beneficio", "id, sociedad_id")),
    ]);
    const sinMultisociedad = empresa[0]?.multisociedad_habilitado !== true;
    const delPeriodo = presupuestos.filter(p => p.periodo === periodo && (sinMultisociedad || alcance === null || (p.sociedad_id && alcance.includes(p.sociedad_id))));
    if (!delPeriodo.length) return { data: { periodo, presupuestos: [], respuesta: "No hay presupuestos registrados para ese periodo en el alcance de la persona." }, error: null };
    const ids = [...new Set(cxp.map(c => c.id).filter(Boolean))];
    const cxpDistribucionesCeco: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      cxpDistribucionesCeco.push(...await filas(supabase.from("cxp_distribucion_ceco").select("cxp_id, ceco_id, monto, empresa_id").eq("empresa_id", empresaId).in("cxp_id", ids.slice(i, i + 200))));
    }
    // Igual que mapOT de operacionesService: estado "cerrado" es "cerrada" y la fecha de inicio es la programada.
    const ots = otsCrudas.map(ot => ({ ...ot, estado: ot.estado === "cerrado" ? "cerrada" : ot.estado, fecha_inicio: ot.fecha_programada }));
    const calcular = crearRealDePresupuesto as (opciones: Record<string, unknown>) => any;
    const salida = delPeriodo.map(presupuesto => resumirPresupuesto(presupuesto, calcular({
      presupuesto, partidas: partidas.filter(p => p.presupuesto_id === presupuesto.id), cxp, cxpDistribucionesCeco, comprasGastos, ots, centrosCosto, centrosBeneficio, empresaId, periodo, sinMultisociedad,
    })));
    return { data: { periodo, presupuestos: salida, nota: "Mismo cálculo que la pantalla Finanzas › Presupuestos. Ejecutado = compras y gastos, cuentas por pagar de órdenes de compra y costo real de OT cerradas del periodo. No mezcles monedas." }, error: null };
  } catch {
    return { data: null, error: true };
  }
}
