// Opciones para elegir con botones en el panel. Salen de los datos de la herramienta (no del texto de la IA),
// así los botones siempre corresponden a valores válidos. Al tocar uno, el panel envía su "valor" como pregunta.
export type OpcionRespuesta = { etiqueta: string; detalle?: string; valor: string };
export type OpcionesRespuesta = { campo: string; titulo: string; items: OpcionRespuesta[] };
const montoTexto = (moneda: unknown, valor: unknown) => {
  const n = Number(valor);
  if (!Number.isFinite(n)) return undefined;
  return `${String(moneda).toUpperCase() === "USD" ? "US$" : "S/"} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export function opcionesDeEgreso(datos: Record<string, unknown> | null): OpcionesRespuesta | null {
  if (!datos || datos.estado !== "faltan_datos" || !Array.isArray(datos.faltan)) return null;
  const falta = String(datos.faltan[0] ?? "");
  const texto = (v: unknown) => String(v ?? "").trim();
  const recortar = (items: OpcionRespuesta[]) => items.filter(item => item.etiqueta).slice(0, 20);
  if (falta === "fondo" && Array.isArray(datos.fondos) && datos.fondos.length) {
    return { campo: "fondo", titulo: "Elige el fondo", items: recortar(datos.fondos.map((f: Record<string, unknown>) => ({
      etiqueta: texto(f.nombre), detalle: [texto(f.responsable), montoTexto(f.moneda, f.saldo)].filter(Boolean).join(" · ") || undefined, valor: `Del fondo ${texto(f.nombre)}`,
    }))) };
  }
  if (falta === "categoria" && datos.opciones && typeof datos.opciones === "object") {
    const o = datos.opciones as Record<string, unknown>;
    const tipos = Array.isArray(o.tipos_parecidos) ? o.tipos_parecidos.map((t: Record<string, unknown>) => ({ etiqueta: texto(t.tipo), detalle: texto(t.categoria) || undefined, valor: `Tipo de gasto: ${texto(t.tipo)}` })) : [];
    const categorias = Array.isArray(o.categorias) ? o.categorias.map((c: unknown) => ({ etiqueta: texto(c), valor: `Categoría: ${texto(c)}` })) : [];
    // Primero todas las categorías (son pocas y siempre válidas); después, como ayuda, hasta 6 tipos de gasto parecidos.
    return { campo: "categoria", titulo: tipos.length ? "Elige la categoría o un tipo de gasto" : "Elige la categoría del Estado de Resultados", items: recortar([...categorias, ...tipos.slice(0, 6)]) };
  }
  if (falta === "ceco" && Array.isArray(datos.cecos) && datos.cecos.length) {
    return { campo: "ceco", titulo: "Elige el centro de costo", items: recortar(datos.cecos.map((c: Record<string, unknown>) => ({
      etiqueta: [texto(c.codigo), texto(c.nombre)].filter(Boolean).join(" · "), valor: `CECO: ${texto(c.codigo) || texto(c.nombre)}`,
    }))) };
  }
  return null;
}
