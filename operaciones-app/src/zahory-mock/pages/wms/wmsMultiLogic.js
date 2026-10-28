// Lógica pura de las pantallas WMS multipropósito (sin React ni Supabase).

export const PROPOSITOS = Object.freeze([
  { id: 'consumo_interno', label: 'Consumo interno', ayuda: 'Repuestos e insumos para tus propias OT y operaciones. No se venden.' },
  { id: 'venta', label: 'Venta', ayuda: 'Mercadería para vender. Solo los pedidos de venta reservan y despachan desde aquí.' },
  { id: 'mixto', label: 'Mixto', ayuda: 'Un solo stock para operaciones y ventas. Ventas no puede tomar lo protegido para operaciones.' },
  { id: 'custodia', label: 'Custodia de terceros', ayuda: 'Mercadería de clientes. No es tuya: no se valoriza ni la toman tus OT o ventas; se cobra almacenaje.' },
]);

export const MODULOS = Object.freeze([
  { id: 'consumo', label: 'Consumo interno (OT)', ayuda: 'Reserva y entrega de repuestos a las órdenes de trabajo.' },
  { id: 'venta', label: 'Venta de mercadería', ayuda: 'Pedidos de venta de Administración: reserva, picking, guía y despacho.' },
  { id: 'custodia', label: 'Custodia de terceros (3PL)', ayuda: 'Posiciones por cliente, ingresos, retiros y liquidación mensual de almacenaje.' },
  { id: 'conteos', label: 'Conteos cíclicos', ayuda: 'Conteos por zona o clase ABC con aprobación de ajustes sobre el umbral.' },
  { id: 'codigos', label: 'Códigos de barras / QR', ayuda: 'Escaneo de ubicación y material en picking y conteos.' },
  { id: 'lotes', label: 'Lotes y vencimientos (FEFO)', ayuda: 'Vencimientos por lote; las salidas toman primero el lote que vence antes.' },
  { id: 'herramientas', label: 'Préstamo de herramientas', ayuda: 'Préstamo a técnicos con fecha de devolución; la herramienta sigue en el almacén.' },
]);

export const MODULOS_PROXIMOS = Object.freeze([]);

export const CANALES = Object.freeze({
  ot: { label: 'OT', pill: 'is-violet', destino: 'Entregar a taller' },
  venta: { label: 'Venta', pill: 'is-cyan', destino: 'Emitir guía y despachar' },
  custodia: { label: 'Custodia', pill: 'is-amber', destino: 'Entregar al cliente' },
});

const numero = valor => {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const redondear = (valor, decimales = 2) => Math.round(numero(valor) * 10 ** decimales) / 10 ** decimales;

export function formatoCantidad(valor) {
  const n = redondear(valor);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function formatoMoneda(valor, moneda = 'PEN') {
  const simbolo = moneda === 'USD' ? 'US$' : 'S/';
  return `${simbolo} ${redondear(valor).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Despachos
// Normaliza un pedido de la cola: las OT llegan con una fila por reserva/ubicación,
// aquí se agrupan por línea de repuesto para despachar la cantidad total pendiente.
export function normalizarPedido(pedido) {
  if (!pedido) return null;
  if (pedido.canal === 'ot') {
    const porLinea = new Map();
    for (const fila of pedido.lineas || []) {
      const previa = porLinea.get(fila.linea_id);
      if (previa) {
        previa.pendiente = redondear(previa.pendiente + numero(fila.pendiente));
        if (fila.ubicacion && !previa.ubicaciones.includes(fila.ubicacion)) previa.ubicaciones.push(fila.ubicacion);
      } else {
        porLinea.set(fila.linea_id, {
          linea_id: fila.linea_id, material_id: fila.material_id, codigo: fila.codigo, descripcion: fila.descripcion, unidad: fila.unidad,
          pendiente: redondear(fila.pendiente), ubicaciones: fila.ubicacion ? [fila.ubicacion] : [], solicitada: redondear(fila.pendiente),
        });
      }
    }
    const lineas = [...porLinea.values()].map(linea => ({ ...linea, solicitada: linea.pendiente, ubicacion: linea.ubicaciones.join(', ') }));
    return { ...pedido, lineas: ordenarPicking(lineas) };
  }
  const lineas = (pedido.lineas || []).map(linea => ({
    ...linea,
    solicitada: redondear(numero(linea.cantidad) - numero(linea.despachada)),
    pendiente: redondear(linea.reservada),
    faltante: redondear(Math.max(0, numero(linea.cantidad) - numero(linea.despachada) - numero(linea.reservada))),
  }));
  return { ...pedido, lineas: ordenarPicking(lineas) };
}

// Ruta de picking: por código de ubicación (las líneas sin ubicación van al final).
export function ordenarPicking(lineas = []) {
  return [...lineas].sort((a, b) => {
    const ua = a.ubicacion || '￿';
    const ub = b.ubicacion || '￿';
    return ua.localeCompare(ub, 'es', { numeric: true }) || String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es');
  });
}

export function resumenCola(pedidos = []) {
  const r = { total: pedidos.length, ot: 0, venta: 0, custodia: 0, parciales: 0 };
  for (const p of pedidos) {
    if (r[p.canal] !== undefined) r[p.canal] += 1;
    if (p.estado === 'parcial' || (p.lineas || []).some(l => numero(l.faltante) > 0)) r.parciales += 1;
  }
  return r;
}

export function filtrarCola(pedidos = [], { canal = 'todos', texto = '' } = {}) {
  const q = texto.trim().toLowerCase();
  return pedidos.filter(p => (canal === 'todos' || p.canal === canal)
    && (!q || [p.numero, p.destino, ...(p.lineas || []).map(l => `${l.codigo} ${l.descripcion}`)].join(' ').toLowerCase().includes(q)));
}

// Valida las cantidades preparadas contra lo pendiente. Devuelve { lineas, error }.
export function validarPreparado(pedido, preparado = {}) {
  const lineas = [];
  for (const linea of pedido?.lineas || []) {
    const texto = preparado[linea.linea_id];
    if (texto === undefined || texto === '') continue;
    const cantidad = numero(texto);
    if (cantidad < 0 || !Number.isFinite(Number(String(texto).replace(',', '.')))) return { lineas: [], error: `Cantidad no válida para ${linea.codigo || linea.descripcion}.` };
    if (cantidad > numero(linea.pendiente) + 1e-9) return { lineas: [], error: `${linea.codigo || linea.descripcion}: solo hay ${formatoCantidad(linea.pendiente)} listos para despachar.` };
    if (cantidad > 0) lineas.push({ linea_id: linea.linea_id, cantidad: redondear(cantidad) });
  }
  if (!lineas.length) return { lineas: [], error: 'Indica la cantidad preparada de al menos una línea.' };
  return { lineas, error: '' };
}

export function validarGuia(guia = {}) {
  const faltan = [];
  if (!String(guia.llegada_direccion || '').trim()) faltan.push('punto de llegada');
  if (!guia.fecha_inicio_traslado) faltan.push('fecha de traslado');
  if (!(numero(guia.peso_bruto_total) > 0)) faltan.push('peso bruto (kg)');
  if (guia.modalidad === 'remitente' && !String(guia.vehiculo_placa || '').trim()) faltan.push('placa del vehículo');
  if (guia.modalidad === 'remitente' && !String(guia.conductor_dni || '').trim()) faltan.push('DNI del conductor');
  if (guia.modalidad === 'transportista' && !String(guia.transportista_ruc || '').trim()) faltan.push('RUC del transportista');
  return faltan.length ? `Completa: ${faltan.join(', ')}.` : '';
}

// Busca la línea que corresponde a un código escaneado (código de material o ubicación).
export function lineaPorEscaneo(pedido, codigo) {
  const q = String(codigo || '').trim().toLowerCase();
  if (!q) return null;
  return (pedido?.lineas || []).find(l => String(l.codigo || '').toLowerCase() === q)
    || (pedido?.lineas || []).find(l => String(l.ubicacion || '').toLowerCase().split(', ').includes(q)) || null;
}

// ---------------------------------------------------------------------------
// Mínimos y reposición
export function estadoStock(fila) {
  const disp = numero(fila.disponible);
  const minimo = numero(fila.stock_minimo);
  const reorden = numero(fila.punto_reorden) || minimo;
  if (!minimo && !reorden) return { id: 'sin_parametro', label: 'Sin parámetro', pill: 'is-gray', orden: 3 };
  if (disp <= 0) return { id: 'quiebre', label: 'Quiebre', pill: 'is-red', orden: 0 };
  if (disp < minimo) return { id: 'bajo_minimo', label: 'Bajo mínimo', pill: 'is-red', orden: 1 };
  if (disp <= reorden) return { id: 'reordenar', label: 'Reordenar', pill: 'is-amber', orden: 2 };
  return { id: 'ok', label: 'OK', pill: 'is-green', orden: 4 };
}

// Meses de cobertura con el consumo de los últimos 90 días.
export function coberturaMeses(fila) {
  const consumo = numero(fila.consumo_mes);
  if (consumo <= 0) return null;
  return redondear(numero(fila.disponible) / consumo, 1);
}

// Cantidad sugerida: hasta el máximo (o 2× el punto de reorden si no hay máximo), solo si está en o bajo el reorden.
export function cantidadSugerida(fila) {
  const estado = estadoStock(fila).id;
  if (!['quiebre', 'bajo_minimo', 'reordenar'].includes(estado)) return 0;
  const objetivo = numero(fila.stock_maximo) || Math.max(numero(fila.punto_reorden), numero(fila.stock_minimo)) * 2;
  return Math.max(0, Math.ceil(objetivo - numero(fila.disponible)));
}

export function resumenMinimos(filas = []) {
  const r = { quiebre: 0, bajo_minimo: 0, reordenar: 0, ok: 0, sin_parametro: 0, valor_sugerido: 0 };
  for (const f of filas) {
    r[estadoStock(f).id] += 1;
    r.valor_sugerido += cantidadSugerida(f) * numero(f.costo_promedio);
  }
  r.valor_sugerido = redondear(r.valor_sugerido);
  return r;
}

export function validarParametros(p) {
  const v = ['stock_minimo', 'punto_reorden', 'stock_maximo', 'protegido_operaciones'].map(k => numero(p[k]));
  if (v.some(n => n < 0)) return 'Los parámetros no pueden ser negativos.';
  const [minimo, reorden, maximo] = v;
  if (maximo > 0 && (minimo > maximo || reorden > maximo)) return 'El mínimo y el punto de reorden no pueden superar al máximo.';
  if (reorden > 0 && minimo > reorden) return 'El punto de reorden debe ser mayor o igual al mínimo.';
  return '';
}

// Ítems de SOLPE agrupados desde las filas seleccionadas.
export function itemsSolpe(filas = []) {
  return filas.filter(f => cantidadSugerida(f) > 0).map(f => ({
    material_id: f.material_id, codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad || 'und',
    cantidad: cantidadSugerida(f), almacen_id: f.almacen_id, costo_referencial: numero(f.costo_promedio),
  }));
}

// ---------------------------------------------------------------------------
// Conteos
export function resumenConteo(items = []) {
  let contadas = 0; let exactas = 0; let faltante = 0; let sobrante = 0; let valor = 0;
  for (const it of items) {
    if (it.fisico === null || it.fisico === undefined || it.fisico === '') continue;
    contadas += 1;
    const dif = numero(it.fisico) - numero(it.teorico);
    if (Math.abs(dif) < 1e-9) exactas += 1;
    const v = Math.abs(dif) * numero(it.costo);
    if (dif < 0) faltante += v; else sobrante += v;
    valor += v;
  }
  return {
    total: items.length, contadas, pendientes: items.length - contadas,
    exactitud: contadas ? redondear((exactas / contadas) * 100, 1) : null,
    faltante: redondear(faltante), sobrante: redondear(sobrante), valor: redondear(valor),
  };
}

export function requiereAprobacion(items, umbral) {
  return resumenConteo(items).valor > numero(umbral);
}

export const ESTADOS_CONTEO = Object.freeze({
  en_proceso: { label: 'En proceso', pill: 'is-cyan' },
  por_aprobar: { label: 'Por aprobar', pill: 'is-amber' },
  cerrado: { label: 'Cerrado', pill: 'is-green' },
  borrador: { label: 'Borrador', pill: 'is-gray' },
});

// ---------------------------------------------------------------------------
// Custodia
export function previsualizarLiquidacion({ posiciones_dia = 0, movimientos = 0, tarifa_posicion_dia = 0, tarifa_movimiento = 0 }) {
  const almacenaje = redondear(numero(posiciones_dia) * numero(tarifa_posicion_dia));
  const mov = redondear(numero(movimientos) * numero(tarifa_movimiento));
  return { almacenaje, movimientos: mov, total: redondear(almacenaje + mov) };
}

export function rangoMesAnterior(hoy = new Date()) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { desde: iso(inicio), hasta: iso(fin) };
}
