import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=["']?(.*?)["']?$/m);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?(.*?)["']?$/m);
const url = urlMatch ? urlMatch[1].trim() : '';
const key = keyMatch ? keyMatch[1].trim() : '';
const sb = createClient(url, key);

async function check() {
  const {data: o, error: eo} = await sb.from('personal_operativo').select('id, nombre, apellidos').limit(3);
  console.log('Operativo:', o, eo);
  
  const {data: a, error: ea} = await sb.from('personal_admin').select('id, nombre, apellidos').limit(3);
  console.log('Admin:', a, ea);
}
check();
