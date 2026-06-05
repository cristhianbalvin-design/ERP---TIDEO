const HOY = () => new Date().toISOString().split('T')[0];

export async function getTipoCambioPorFecha(fechaMovimiento, supabase) {
  const fecha = fechaMovimiento || HOY();

  if (supabase) {
    try {
      const { data } = await supabase
        .from('tipo_cambio_historico')
        .select('*')
        .eq('fecha', fecha)
        .eq('moneda_base', 'PEN')
        .maybeSingle();
      if (data) return { ...data, desactualizado: false };
    } catch (_) {}
  }

  if (fecha === HOY()) return getTipoCambioHoy(supabase);

  if (supabase) {
    try {
      const { data } = await supabase
        .from('tipo_cambio_historico')
        .select('*')
        .eq('moneda_base', 'PEN')
        .lte('fecha', fecha)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return { ...data, desactualizado: true };
    } catch (_) {}
  }

  return getTipoCambioHoy(supabase);
}

export async function getTipoCambioHoy(supabase) {
  const fecha = HOY();

  // 1. Buscar en caché Supabase
  if (supabase) {
    try {
      const { data } = await supabase
        .from('tipo_cambio_historico')
        .select('*')
        .eq('fecha', fecha)
        .eq('moneda_base', 'PEN')
        .maybeSingle();
      if (data) return { ...data, desactualizado: false };
    } catch (_) {}
  }

  // 2. Llamar a la API y persistir
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/PEN');
    const json = await res.json();
    if (json.result === 'success') {
      const row = {
        fecha,
        moneda_base: 'PEN',
        usd: json.rates?.USD ?? null,
        eur: json.rates?.EUR ?? null,
        fuente: 'open.er-api.com',
      };
      if (supabase) {
        const { error: upsertError } = await supabase
          .from('tipo_cambio_historico')
          .upsert(row, { onConflict: 'fecha,moneda_base' });
        if (upsertError) console.warn('[TC] upsert error:', upsertError.message, upsertError);
      }
      return { ...row, desactualizado: false };
    }
  } catch (_) {}

  // 3. Fallback: TC más reciente disponible
  if (supabase) {
    try {
      const { data } = await supabase
        .from('tipo_cambio_historico')
        .select('*')
        .eq('moneda_base', 'PEN')
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return { ...data, desactualizado: true };
    } catch (_) {}
  }

  return null;
}

// tc = objeto con tasas relativas a PEN base (PEN = 1)
// tc.usd = cuántos USD por 1 PEN  (ej: 0.2924)
// tc.eur = cuántos EUR por 1 PEN  (ej: 0.2701)
export function convertirMonto(monto, origen, destino, tc) {
  if (!tc || origen === destino) return Number(monto) || 0;
  const m = Number(monto) || 0;
  if (origen === 'PEN' && destino === 'USD') return tc.usd ? Math.round(m * tc.usd * 100) / 100 : m;
  if (origen === 'USD' && destino === 'PEN') return tc.usd ? Math.round(m / tc.usd * 100) / 100 : m;
  if (origen === 'PEN' && destino === 'EUR') return tc.eur ? Math.round(m * tc.eur * 100) / 100 : m;
  if (origen === 'EUR' && destino === 'PEN') return tc.eur ? Math.round(m / tc.eur * 100) / 100 : m;
  return Math.round(m * 100) / 100;
}
