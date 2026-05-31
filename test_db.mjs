import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const sb = createClient(url, key);

async function check() {
  const {data: v, error: ev} = await sb.from('valorizaciones').select('id, numero').limit(1);
  console.log('VALORIZACIONES:', v, ev);
  const {data: f, error: ef} = await sb.from('facturas').select('id, numero').limit(1);
  console.log('FACTURAS:', f, ef);
  const {data: c, error: ec} = await sb.from('cxc').select('id').limit(1);
  console.log('CXC:', c, ec);
}
check();
