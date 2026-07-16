import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  const { data, error } = await sb.from('notificaciones_sistema')
    .select('empresa_id, created_at, texto')
    .ilike('texto', '%generados autom%');

  if (error) {
    console.error('Error fetching notifications:', error);
    return;
  }

  const grouped = {};
  for (const n of data) {
    const dateStr = n.created_at.split('T')[0];
    const key = `${n.empresa_id} | ${dateStr}`;
    if (!grouped[key]) grouped[key] = 0;
    grouped[key]++;
  }

  console.log('--- CONTEO DE NOTIFICACIONES FANTASMA ---');
  for (const [key, count] of Object.entries(grouped)) {
    console.log(`${key}: ${count} notificaciones`);
  }
  if (data.length === 0) console.log("0 notificaciones fantasma encontradas.");
}
run();
