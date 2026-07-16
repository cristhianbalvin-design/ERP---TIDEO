import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="?(.*?)"?(?:\r|\n|$)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY="?(.*?)"?(?:\r|\n|$)/)[1].trim();
const sb = createClient(url, key);

async function check() {
  const { data, error } = await sb.from('empresas').select('*');
  if (error) console.error(error);
  console.log('INGETEC Config:', data);
}
check();
