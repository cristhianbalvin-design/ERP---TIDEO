import { getSupabaseClient } from "../lib/supabaseClient.js";
import * as XLSX from "xlsx";

async function resultado(promise) {
  const { data, error } = await promise;
  if (error) {
    const comunes = {
      42501: "No tienes permiso para realizar esta operación.",
      23505: "Ya existe un registro con estos datos.",
      23503: "El registro relacionado ya no está disponible.",
    };
    throw new Error(
      comunes[error.code] ||
        error.message ||
        "No se pudo completar la operación.",
    );
  }
  return data;
}

export const campanaAudienciaService = {
  async leerArchivo(archivo) {
    const libro = XLSX.read(await archivo.arrayBuffer(), {
      type: "array",
      ...(archivo.name.toLowerCase().endsWith(".csv")
        ? { codepage: 65001 }
        : {}),
    });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const encabezados =
      XLSX.utils.sheet_to_json(hoja, {
        header: 1,
        defval: "",
        raw: false,
      })[0] || [];
    const mapa = {
      nombre: "nombre",
      nombres: "nombre",
      "nombre completo": "nombre",
      linkedin: "linkedin_url",
      linkedin_url: "linkedin_url",
      perfil: "linkedin_url",
      "perfil de linkedin": "linkedin_url",
      "url linkedin": "linkedin_url",
      correo: "email",
      "correo electronico": "email",
      email: "email",
      telefono: "telefono",
      celular: "telefono",
      whatsapp: "telefono",
      etiqueta: "etiqueta",
      consentimiento: "consentimiento",
    };
    const normalizar = (k) =>
      String(k)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    if (!encabezados.some((k) => mapa[normalizar(k)] === "nombre"))
      throw new Error(
        "No se reconoce la columna nombre. Agrega un encabezado nombre, nombres o nombre completo.",
      );
    const datos = XLSX.utils.sheet_to_json(hoja, { defval: "", raw: false });
    return datos.map((f) =>
      Object.fromEntries(
        Object.entries(f)
          .filter(([k]) => mapa[normalizar(k)])
          .map(([k, v]) => [mapa[normalizar(k)], String(v)]),
      ),
    );
  },
  descargarPlantilla() {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.aoa_to_sheet([
        [
          "nombre",
          "linkedin",
          "correo",
          "telefono",
          "etiqueta",
          "consentimiento",
        ],
      ]),
      "Audiencia",
    );
    XLSX.writeFile(libro, "plantilla-audiencia.xlsx");
  },
  async listar(campanaId) {
    const sb = await getSupabaseClient();
    const todos = [];
    for (let inicio = 0; ; inicio += 1000) {
      const pagina = await resultado(
        sb
          .from("campana_miembros")
          .select("*, contacto:audiencia_contactos(*)")
          .eq("campana_id", campanaId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(inicio, inicio + 999),
      );
      todos.push(...(pagina || []));
      if (!pagina || pagina.length < 1000) return todos;
    }
  },
  async importar(campanaId, filas, simular) {
    const sb = await getSupabaseClient();
    return resultado(
      sb.rpc("importar_audiencia_campana", {
        p_campana_id: campanaId,
        p_filas: filas,
        p_simular: simular,
      }),
    );
  },
  async cambiarEstado(ids, estado) {
    const sb = await getSupabaseClient();
    return resultado(
      sb.rpc("cambiar_estado_miembros", { p_ids: ids, p_estado: estado }),
    );
  },
  async guardar(m, f) {
    const sb = await getSupabaseClient();
    return resultado(
      sb.rpc("guardar_miembro_campana", {
        p_miembro_id: m.id,
        p_estado: f.estado,
        p_canal: f.canal,
        p_ultimo_contacto: f.ultimo_contacto || null,
        p_proximo_seguimiento: f.proximo_seguimiento || null,
        p_nota: f.nota || null,
        p_consentimiento: f.consentimiento,
      }),
    );
  },
  async pasarLead(id, responsable) {
    const sb = await getSupabaseClient();
    return resultado(
      sb.rpc("pasar_miembro_a_lead", {
        p_miembro_id: id,
        p_responsable: responsable || null,
      }),
    );
  },
  async guardarMensaje(id, mensaje) {
    const sb = await getSupabaseClient();
    return resultado(
      sb
        .from("campanas")
        .update({ mensaje_base: mensaje })
        .eq("id", id)
        .select("mensaje_base")
        .single(),
    );
  },
};
