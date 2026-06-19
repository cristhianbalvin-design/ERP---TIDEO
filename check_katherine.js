import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Searching for Katherine Arellano...");
  
  // 1. Get Katherine's user from usuarios_empresas and personal_operativo / personal_admin
  const { data: ue, error: errA } = await supabase
    .from('usuarios_empresas')
    .select('*')
    .ilike('nombre', '%Katherine%');
    
  console.log("=== KATHERINE USUARIOS_EMPRESAS ===");
  console.log(ue);
  
  let user_id = null;
  if (ue && ue.length > 0) user_id = ue[0].user_id;

  // 2. Check her vacation request
  const { data: solicitudes, error: errS } = await supabase
    .from('solicitudes_rrhh')
    .select('*')
    .ilike('personal_nombre', '%Katherine%')
    .order('creado_en', { ascending: false })
    .limit(5);

  console.log("=== RECENT SOLICITUDES ===");
  if (solicitudes) {
    for (const sol of solicitudes) {
      console.log(`ID: ${sol.id}, Tipo: ${sol.tipo}, Estado: ${sol.estado}, Personal: ${sol.personal_nombre} (ID: ${sol.personal_id}), Aprobador ID: ${sol.aprobador_id}, Aprobador Nombre: ${sol.aprobador_nombre}, Fechas: ${sol.fecha_inicio} to ${sol.fecha_fin}`);
    }
  }
  
  // 3. Find who "Karyme Arellano" is to check P5
  const { data: karymeAdmin } = await supabase
    .from('personal_admin')
    .select('id, auth_user_id, nombre')
    .ilike('nombre', '%Karyme%');
    
  const { data: karymeUe } = await supabase
    .from('usuarios_empresas')
    .select('user_id, nombre, jefe_user_id')
    .ilike('nombre', '%Karyme%');
    
  console.log("=== KARYME ARELLANO ===");
  console.log("Admin:", karymeAdmin);
  console.log("UE:", karymeUe);
  
  // 4. check personal_operativo with just 'katherine'
  const { data: userOp, error: errO } = await supabase
    .from('personal_operativo')
    .select('id, nombre, auth_user_id, supervisor_id, jefe_user_id')
    .ilike('nombre', '%Katherine%');
  console.log("=== KATHERINE PERSONAL_OPERATIVO ===");
  console.log(userOp);
}

main().catch(console.error);
