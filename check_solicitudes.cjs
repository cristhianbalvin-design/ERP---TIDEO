require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  // Get active solicitudes
  console.log("--- Solicitudes Activas ---");
  const { data, error } = await supabase
    .from('solicitudes_rrhh')
    .select('tipo, estado, fecha_inicio, fecha_fin, personal_nombre')
    .eq('estado', 'activa');
    
  if (error) console.error(error);
  else {
    const counts = {};
    data.forEach(d => {
      counts[d.tipo] = (counts[d.tipo] || 0) + 1;
    });
    console.log("Conteo por tipo:", counts);
    console.log("Total activas:", data.length);
    if(data.length > 0) console.log("Ejemplo:", data[0]);
  }
}

run();
