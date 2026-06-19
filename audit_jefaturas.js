import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSelfSupervisorsPersonal(tableName) {
  console.log(`\n--- Auditando supervisores en: ${tableName} ---`);
  
  const { data, error } = await supabase
    .from(tableName)
    .select('id, nombre, auth_user_id, supervisor_id, empresa_id');

  if (error) {
    console.error(`Error al consultar ${tableName}:`, error.message);
    return [];
  }

  const selfSupervisors = [];
  const duplicateAuthIds = {};

  for (const p of data) {
    if (p.supervisor_id && p.supervisor_id === p.id) {
      selfSupervisors.push(p);
    }

    if (p.auth_user_id) {
      if (!duplicateAuthIds[p.auth_user_id]) duplicateAuthIds[p.auth_user_id] = [];
      duplicateAuthIds[p.auth_user_id].push({ id: p.id, nombre: p.nombre, tabla: tableName });
    }
  }

  if (selfSupervisors.length > 0) {
    console.log(`[ALERTA] Encontrados ${selfSupervisors.length} auto-asignados por supervisor_id:`);
    selfSupervisors.forEach(p => console.log(`  - ${p.nombre} (ID: ${p.id})`));
  } else {
    console.log("[OK] No se encontraron colaboradores auto-asignados como supervisores.");
  }

  return { data, duplicateAuthIds };
}

async function checkSelfJefes() {
  console.log(`\n--- Auditando jefes_user_id en: usuarios_empresas ---`);
  
  const { data, error } = await supabase
    .from('usuarios_empresas')
    .select('id, user_id, jefe_user_id, empresa_id');

  if (error) {
    console.error(`Error al consultar usuarios_empresas:`, error.message);
    return;
  }

  const selfJefes = [];
  for (const u of data) {
    if (u.jefe_user_id && u.user_id && u.jefe_user_id === u.user_id) {
      selfJefes.push(u);
    }
  }

  if (selfJefes.length > 0) {
    console.log(`[ALERTA] Encontrados ${selfJefes.length} auto-asignados por jefe_user_id:`);
    selfJefes.forEach(u => console.log(`  - ${u.email} (user_id: ${u.user_id})`));
  } else {
    console.log("[OK] No se encontraron usuarios auto-asignados como jefes.");
  }
}

async function main() {
  console.log("Iniciando auditoria de jerarquias...");
  
  const { data: opData, duplicateAuthIds: opDups } = await checkSelfSupervisorsPersonal('personal_operativo');
  const { data: adminData, duplicateAuthIds: adminDups } = await checkSelfSupervisorsPersonal('personal_administrativo');
  await checkSelfJefes();

  // Merge duplicates across tables
  const allDups = { ...opDups };
  for (const [authId, records] of Object.entries(adminDups || {})) {
    if (!allDups[authId]) allDups[authId] = [];
    allDups[authId] = allDups[authId].concat(records);
  }

  console.log("\n--- Auditando colisiones de auth_user_id ---");
  let foundDups = false;
  for (const [authId, records] of Object.entries(allDups)) {
    if (records.length > 1) {
      foundDups = true;
      console.log(`[ALERTA] Múltiples registros comparten el mismo auth_user_id (${authId}):`);
      records.forEach(r => console.log(`  - ${r.nombre} (ID: ${r.id}, Tabla: ${r.tabla})`));
    }
  }

  if (!foundDups) console.log("[OK] No se encontraron colisiones de auth_user_id.");
  
  console.log("\n--- Búsqueda específica: Karyme y Katherine ---");
  const allData = [...(opData || []), ...(adminData || [])].map(r => ({ ...r, tableName: opData?.includes(r) ? 'personal_operativo' : 'personal_administrativo' }));
  const kkRecords = allData.filter(r => r.nombre?.toLowerCase().includes('karyme') || r.nombre?.toLowerCase().includes('katherine'));
  
  if (kkRecords.length > 0) {
    kkRecords.forEach(r => {
      console.log(`Nombre: ${r.nombre} | Tabla: ${r.tableName} | ID: ${r.id} | auth_user_id: ${r.auth_user_id} | supervisor_id: ${r.supervisor_id}`);
    });
  } else {
    console.log("No se encontraron registros de Karyme o Katherine.");
  }

  console.log("\nAuditoria completada.");
}

main().catch(console.error);
