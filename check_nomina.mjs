import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=["']?(.*?)["']?$/m);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?(.*?)["']?$/m);
const url = urlMatch ? urlMatch[1].trim() : '';
const key = keyMatch ? keyMatch[1].trim() : '';
const sb = createClient(url, key);

async function check() {
  const {data: n, error: en} = await sb.from('detalle_nomina').select('*').limit(3);
  console.log('Detalle Nomina:', n, en);
  const {data: pn, error: epn} = await sb.from('periodos_nomina').select('*').limit(3);
  console.log('Periodos:', pn, epn);
  const {data: nd, error: end} = await sb.from('nomina_detalle').select('*').limit(3);
  console.log('Nomina Detalle:', nd, end);
}
check();
