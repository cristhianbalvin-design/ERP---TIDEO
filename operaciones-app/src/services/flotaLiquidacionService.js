import { getSupabaseClient } from "../lib/supabaseClient.js";
import { nuevoId } from "./actaConformidadService.js";

export const BUCKET_LIQUIDACION_FLOTA = "flota-rental";
const db = () => getSupabaseClient();
const datos = ({ data, error }) => {
  if (error) throw new Error(error.message || "Ocurrió un error inesperado.");
  return data;
};
const rpc = async (nombre, args) => datos(await db().rpc(nombre, args));
export async function permisosLiquidacionFlota(empresaId) {
  const acciones = ["ver", "crear", "editar", "aprobar", "anular"];
  const { data, error } = await db().rpc("flota_permisos_pantalla", {
    p_empresa_id: empresaId,
    p_pantalla: "liquidacion_flota",
  });
  if (error) throw new Error(error.message || "No se pudieron cargar los permisos.");
  if (data == null) throw new Error("No se recibieron los permisos de Liquidación & DMR.");
  return Object.fromEntries(acciones.map((accion) => [accion, data[accion] === true]));
}
export async function cargarContratosLiquidacion(empresaId) {
  const filas =
    datos(
      await db()
        .from("contratos_alquiler")
        .select(
          [
            "id,empresa_id,sociedad_id,numero,cuenta_id,fecha_inicio,fecha_fin,meta_dmr,minimo_facturable,",
            "unidad_minimo_facturable,periodicidad_minimo_facturable,moneda,estado",
          ].join(""),
        )
        .eq("empresa_id", empresaId)
        .order("numero")
        .limit(1000),
    ) || [];
  const cuentas = filas.length
    ? datos(
        await db()
          .from("cuentas")
          .select("id,nombre_comercial,razon_social")
          .eq("empresa_id", empresaId)
          .in("id", [...new Set(filas.map((x) => x.cuenta_id).filter(Boolean))]),
      ) || []
    : [];
  const nombres = new Map(cuentas.map((x) => [x.id, x.nombre_comercial || x.razon_social || ""]));
  return filas.map((x) => ({ ...x, cliente: nombres.get(x.cuenta_id) || "" }));
}
export async function cargarEquiposLiquidacion(contratos) {
  if (!contratos.length) return [];
  const ids = contratos.map((x) => x.id);
  const rows =
    datos(
      await db()
        .from("contratos_alquiler_equipos")
        .select(
          "id,contrato_alquiler_id,equipo_id,tarifa_hora_override,activo:activos(id,codigo,nombre,horometro_actual,estado)",
        )
        .in("contrato_alquiler_id", ids)
        .limit(2000),
    ) || [];
  return rows.map((x) => ({ ...x, contrato: contratos.find((c) => c.id === x.contrato_alquiler_id) }));
}
export async function cargarPartesLiquidacion(empresaId, desde, hasta) {
  return (
    datos(
      await db()
        .from("flota_partes_equipo")
        .select("*")
        .eq("empresa_id", empresaId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .limit(10000),
    ) || []
  );
}
export async function cargarLiquidacionesFlota(empresaId) {
  const filas =
    datos(
      await db()
        .from("flota_liquidaciones")
        .select(
          [
            "*,contrato:contratos_alquiler(id,numero,cuenta_id,fecha_inicio,fecha_fin,meta_dmr,minimo_facturable,",
            "unidad_minimo_facturable,periodicidad_minimo_facturable,moneda)",
          ].join(""),
        )
        .eq("empresa_id", empresaId)
        .order("periodo", { ascending: false })
        .limit(1000),
    ) || [];
  const ids = filas.map((x) => x.contrato?.cuenta_id).filter(Boolean);
  const cuentas = ids.length
    ? datos(
        await db()
          .from("cuentas")
          .select("id,nombre_comercial,razon_social")
          .eq("empresa_id", empresaId)
          .in("id", [...new Set(ids)]),
      ) || []
    : [];
  const nombres = new Map(cuentas.map((x) => [x.id, x.nombre_comercial || x.razon_social || ""]));
  return filas.map((x) => ({ ...x, contrato: { ...x.contrato, cliente: nombres.get(x.contrato?.cuenta_id) || "" } }));
}
export async function cargarLineasLiquidacion(id) {
  return (
    datos(
      await db()
        .from("flota_liquidacion_lineas")
        .select("*,activo:activos(id,codigo,nombre),contrato_equipo:contratos_alquiler_equipos(id,equipo_id)")
        .eq("liquidacion_id", id)
        .order("activo_id"),
    ) || []
  );
}
export async function cargarPartesPeriodo(contratoId, desde, hasta) {
  return (
    datos(
      await db()
        .from("flota_partes_equipo")
        .select("*,activo:activos(codigo,nombre)")
        .eq("contrato_alquiler_id", contratoId)
        .eq("estado", "registrado")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha"),
    ) || []
  );
}
export async function cargarUltimoParteLiquidacion(contratoEquipoId, excluirId) {
  let query = db()
    .from("flota_partes_equipo")
    .select("id,horas_programadas,fecha")
    .eq("contrato_equipo_id", contratoEquipoId)
    .eq("estado", "registrado")
    .order("fecha", { ascending: false })
    .limit(1);
  if (excluirId) query = query.neq("id", excluirId);
  return datos(await query)?.[0] || null;
}
export async function cargarPartesVecinos(activoId, fecha, excluirId) {
  const base = () => {
    let q = db()
      .from("flota_partes_equipo")
      .select("id,fecha,horometro_inicio,horometro_fin,sin_operacion")
      .eq("activo_id", activoId)
      .eq("estado", "registrado")
      .eq("sin_operacion", false);
    if (excluirId) q = q.neq("id", excluirId);
    return q;
  };
  const [anterior, siguiente] = await Promise.all([
    base().lt("fecha", fecha).order("fecha", { ascending: false }).limit(1),
    base().gt("fecha", fecha).order("fecha", { ascending: true }).limit(1),
  ]);
  return { anterior: datos(anterior)?.[0] || null, siguiente: datos(siguiente)?.[0] || null };
}
export async function cargarEventosLiquidacion(empresaId, entidad, id) {
  return (
    datos(
      await db()
        .from("flota_eventos")
        .select("id,accion,detalle,created_at")
        .eq("empresa_id", empresaId)
        .eq("entidad", entidad)
        .eq("entidad_id", String(id))
        .order("created_at", { ascending: false })
        .limit(100),
    ) || []
  );
}
export async function guardarParteLiquidacion(empresaId, parte) {
  return rpc("flota_guardar_parte", { p_empresa_id: empresaId, p_parte: parte });
}
export async function anularParteLiquidacion(id, motivo) {
  return rpc("flota_anular_parte", { p_parte_id: id, p_motivo: motivo });
}
export async function crearLiquidacionFlota(empresaId, contratoId, periodo) {
  return rpc("flota_crear_liquidacion", {
    p_empresa_id: empresaId,
    p_contrato_id: contratoId,
    p_periodo: `${periodo}-01`,
  });
}
export async function recalcularLiquidacionFlota(id) {
  return rpc("flota_recalcular_liquidacion", { p_id: id });
}
export async function enviarLiquidacionFlota(id) {
  return rpc("flota_enviar_liquidacion", { p_id: id });
}
export async function devolverLiquidacionFlota(id, motivo) {
  return rpc("flota_devolver_liquidacion", { p_id: id, p_motivo: motivo });
}
export async function aprobarLiquidacionFlota(id) {
  return rpc("flota_aprobar_liquidacion", { p_id: id });
}
export async function anularLiquidacionFlota(id, motivo) {
  return rpc("flota_anular_liquidacion", { p_id: id, p_motivo: motivo });
}
export async function subirFotoParte(empresaId, archivo) {
  if (!archivo) return null;
  if (!/^image\/(jpeg|png|webp)$/i.test(archivo.type || "")) throw new Error("Adjunta una foto JPEG, PNG o WEBP.");
  if (archivo.size > 10 * 1024 * 1024) throw new Error("La foto supera los 10 MB.");
  const ext = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  const path = `${empresaId}/partes/${nuevoId()}.${ext}`;
  const { error } = await db()
    .storage.from(BUCKET_LIQUIDACION_FLOTA)
    .upload(path, archivo, { upsert: false, contentType: archivo.type });
  if (error) throw new Error(error.message || "No se pudo subir la foto.");
  return path;
}
