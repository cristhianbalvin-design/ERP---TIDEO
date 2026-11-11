// Memoria de conversación de Aria (migración 681): textos y utilidades puras, sin Deno, para probarlas con Node.

export type MensajeGuardado = { rol: string; contenido: string };
export type TareaResumen = { falta_titulo?: boolean; resumen_previo?: string | null; hasta?: number; por_resumir?: MensajeGuardado[]; recientes?: MensajeGuardado[] };

// Mensaje de sistema con el resumen de lo conversado antes de los últimos 20 mensajes.
export function sistemaResumen(resumen: unknown): string | null {
  const texto = typeof resumen === "string" ? resumen.trim() : "";
  if (!texto) return null;
  return `Resumen de lo conversado antes en esta conversación (las cifras pueden haber cambiado: vuelve a consultarlas con las herramientas antes de darlas): ${texto.slice(0, 3000)}`;
}

const SISTEMA_ARCHIVISTA = "Archivas conversaciones de Aria, el asistente del ERP OPERA. Devuelve solo un JSON con dos claves: " +
  "\"titulo\" (máximo 6 palabras en español que nombren el tema, sin comillas ni punto final, p. ej. Egreso de guantes para taller) y " +
  "\"resumen\" (máximo 120 palabras de toda la conversación hasta ahora: temas consultados, decisiones, pendientes como un borrador sin confirmar, y datos que dio la persona; " +
  "integra el resumen previo con los mensajes nuevos; las cifras solo como referencia de lo que se vio). No agregues nada fuera del JSON.";

// Mensajes para pedir al modelo el título y el resumen. Si solo falta el título, basta con los mensajes recientes.
export function promptResumen(tarea: TareaResumen): Array<Record<string, unknown>> {
  const linea = (m: MensajeGuardado) => `${m.rol === "user" ? "Persona" : "Aria"}: ${String(m.contenido ?? "").slice(0, 1500)}`;
  const partes: string[] = [];
  if (tarea.resumen_previo) partes.push(`Resumen previo:\n${tarea.resumen_previo}`);
  if (tarea.por_resumir?.length) partes.push(`Mensajes a incorporar al resumen:\n${tarea.por_resumir.map(linea).join("\n")}`);
  if (tarea.recientes?.length) partes.push(`Mensajes más recientes:\n${tarea.recientes.map(linea).join("\n")}`);
  return [{ role: "system", content: SISTEMA_ARCHIVISTA }, { role: "user", content: partes.join("\n\n") || "Sin mensajes." }];
}

// Lee {"titulo","resumen"} de la respuesta del modelo, tolerando bloques de código alrededor.
export function leerResumen(texto: unknown): { titulo: string; resumen: string } | null {
  const crudo = String(texto ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const inicio = crudo.indexOf("{"); const fin = crudo.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const datos = JSON.parse(crudo.slice(inicio, fin + 1));
    const titulo = typeof datos?.titulo === "string" ? datos.titulo.replace(/["“”.]+$/g, "").trim().slice(0, 80) : "";
    const resumen = typeof datos?.resumen === "string" ? datos.resumen.trim().slice(0, 3000) : "";
    return titulo || resumen ? { titulo, resumen } : null;
  } catch { return null; }
}

// Lo que se guarda junto a la respuesta para poder redibujarla igual al retomar la conversación.
export function extraDelTurno(herramientas: string[], opciones: unknown, borrador: unknown): Record<string, unknown> {
  return { herramientas: [...new Set(herramientas)], ...(opciones ? { opciones } : {}), ...(borrador ? { borrador } : {}) };
}
