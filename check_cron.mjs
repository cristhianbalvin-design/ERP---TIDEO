import { createClient } from '@supabase/supabase-js';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';
const sb = createClient(url, key);

async function check() {
  console.log("Checking pg_cron jobs if possible via RPC or table...");
  const { data, error } = await sb.from('cron.job').select('*');
  console.log("cron.job result:", data, error);
}

check();
