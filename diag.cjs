
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: emp } = await supabase.from('empresas').select('id, nombre').ilike('nombre', '%ZAHORY%').limit(1);
  if (!emp || emp.length === 0) return console.log('Empresa no encontrada');
  const empresaId = emp[0].id;
  console.log('Empresa ID:', empresaId);

  const { data: pers } = await supabase.from('personal_operativo').select('id, nombres, apellidos').eq('empresa_id', empresaId).ilike('nombres', '%Carlos%').ilike('apellidos', '%Malpartida%').limit(1);
  if (!pers || pers.length === 0) return console.log('Personal no encontrado');
  const personalId = pers[0].id;
  console.log('Personal ID:', personalId);

  const { data: docs } = await supabase
    .from('personal_documentos')
    .select('*, tipos_documento_empresa(*)')
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId);
  console.log('Documentos:', JSON.stringify(docs, null, 2));
}
run();

