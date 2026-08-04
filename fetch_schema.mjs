import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read env variables
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="(.*?)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="(.*?)"/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: 'SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=\'empresa_config\';' });
  console.log(data, error);
}

run();
