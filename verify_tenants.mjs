import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function run() {
  const ids = [
    'pnm_1782995405104_c711rz',
    'pnm_1782997431253_1hvn16',
    'pnm_1783376306501_h71h9a'
  ];
  
  const { data, error } = await sb
    .from('periodos_nomina')
    .select('id, empresa_id')
    .in('id', ids);
    
  if (error) {
    console.error('Error fetching periods:', error);
    return;
  }
  
  const results = [];
  
  for (const p of data) {
    // Try to get razon_social from empresa_config
    const { data: cfg } = await sb.from('empresa_config').select('razon_social').eq('empresa_id', p.empresa_id).single();
    
    // If not in empresa_config, try to get from empresas table (if accessible)
    let tenantName = cfg ? cfg.razon_social : 'Desconocido';
    if (!cfg) {
      const { data: emp } = await sb.from('empresas').select('*').eq('id', p.empresa_id).single().catch(() => ({data: null}));
      if (emp) tenantName = emp.nombre || emp.razon_social || 'Desconocido';
    }
    
    results.push({
      ID: p.id,
      'Empresa ID': p.empresa_id,
      'Tenant': tenantName
    });
  }
  
  console.table(results);
}
run();
