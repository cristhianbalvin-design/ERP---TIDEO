import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.substring(1, val.length - 1);
    }
    envVars[match[1].trim()] = val;
  }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseKey = envVars['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("No Supabase URL or Key found in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: empresaData, error: empresaError } = await supabase
    .from('empresas')
    .select('id')
    .limit(1);
  
  if (empresaError || !empresaData || empresaData.length === 0) {
    console.error("Error fetching empresa:", empresaError);
    process.exit(1);
  }
  
  const empresaId = empresaData[0].id;

  const { data, error } = await supabase
    .from('personal_documentos')
    .select(`
      id,
      personal_id,
      tipo_doc,
      nombre_archivo,
      archivo_url,
      version,
      activo,
      estado_validacion,
      fecha_emision,
      fecha_vencimiento,
      periodo_grupo_id,
      creado_en
    `)
    .eq('empresa_id', empresaId)
    .ilike('tipo_doc', '%contrato%')
    .order('creado_en', { ascending: true });

  if (error) {
    console.error("Error running query:", error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
