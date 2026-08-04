import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="(.*?)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="(.*?)"/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data: enums, error: err1 } = await supabase.rpc('execute_sql', { sql: "SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public';" });
  console.log('Enums:', enums, err1);

  const { data: cols, error: err2 } = await supabase.rpc('execute_sql', { sql: "SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.character_maximum_length, c.column_default FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.column_name = 'categoria' AND c.table_name IN ('unidades_organizacionales', 'roles', 'usuarios_asignaciones');" });
  console.log('Columns:', cols, err2);

  const { data: cons, error: err3 } = await supabase.rpc('execute_sql', { sql: "SELECT conname, pg_get_constraintdef(c.oid) as condef, t.relname as table_name FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE t.relname IN ('unidades_organizacionales', 'roles', 'usuarios_asignaciones') AND n.nspname = 'public';" });
  console.log('Constraints:', cons, err3);
}

run();
