import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=["']?(.*?)["']?$/m);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?(.*?)["']?$/m);
const url = urlMatch ? urlMatch[1].trim() : '';
const key = keyMatch ? keyMatch[1].trim() : '';

async function check() {
  const res = await fetch(`${url}/rest/v1/personal_operativo`, {
    method: 'OPTIONS',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  // OPTIONS returns empty body, headers might have allowed methods.
  // Oh wait, PostgREST OPTIONS request doesn't return JSON schema by default unless requested?
  // Let me just request openapi again. The url for OpenAPI is /rest/v1/?apikey=... but maybe it's protected by RLS?
  const res2 = await fetch(`${url}/rest/v1/`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const text = await res2.text();
  console.log("Response:", text.slice(0,500));
}
check();
