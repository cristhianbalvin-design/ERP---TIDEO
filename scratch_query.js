import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local manually
const envPath = '.env.local';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    env[match[1].trim()] = val;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Querying comisiones...');
  const { data, error } = await supabase
    .from('comisiones')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching comisiones:', error.message, error.code);
  } else {
    console.log('Successfully fetched comisiones:', data);
  }
}

run();
