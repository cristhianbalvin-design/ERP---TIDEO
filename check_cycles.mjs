import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="?(.*?)"?(?:\r|\n|$)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY="?(.*?)"?(?:\r|\n|$)/)[1].trim();
const sb = createClient(url, key);

async function audit() {
  const { data, error } = await sb.from('personal_operativo').select('id');
  if (error) throw error;
  console.log('Total rows in DB:', data.length);
  
  const byPerson = {};
  for (const row of data) {
    if (!byPerson[row.personal_id]) byPerson[row.personal_id] = [];
    byPerson[row.personal_id].push(row);
  }
  
  let invalidResets = 0, workersWithInvalidReset = new Set();
  let validChanges = 0, workersWithValidChange = new Set();
  
  for (const [personalId, rows] of Object.entries(byPerson)) {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i-1], curr = rows[i];
      if (!prev.dias_ciclo_trabajo || !curr.dias_ciclo_trabajo) continue;
      
      const sameCycle = prev.dias_ciclo_trabajo === curr.dias_ciclo_trabajo && prev.dias_ciclo_descanso === curr.dias_ciclo_descanso;
      if (sameCycle) {
        const cycleLen = curr.dias_ciclo_trabajo + curr.dias_ciclo_descanso;
        const diffDays = Math.round((new Date(curr.fecha_inicio_ciclo + 'T00:00:00') - new Date(prev.fecha_inicio_ciclo + 'T00:00:00')) / 86400000);
        if (diffDays % cycleLen !== 0) { 
          invalidResets++; 
          workersWithInvalidReset.add(personalId); 
        }
      } else {
        validChanges++; 
        workersWithValidChange.add(personalId);
      }
    }
  }
  
  console.log('Workers with invalid reset: ' + workersWithInvalidReset.size);
  console.log('Total invalid resets: ' + invalidResets);
  console.log('Workers with legitimate regimen changes: ' + workersWithValidChange.size);
  console.log('Total legitimate changes: ' + validChanges);
}
audit();
