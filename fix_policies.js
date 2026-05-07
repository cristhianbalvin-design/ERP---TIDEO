import fs from 'fs';
import path from 'path';

const files = [
  '041_fix_roles_rls_hardening.sql',
  '042_fix_usuarios_rls_hardening.sql',
  '043_empresas_delete_policy.sql',
  '044_eliminar_tenant_rpc.sql',
  '045_roles_predefinidos_tenants.sql',
  '046_roles_predefinidos_emp_tideo.sql',
  '047_rrhh_personal_crud.sql',
  '048_maestros_base_crud_fix.sql'
];

for (const file of files) {
  const filepath = path.join('supabase', 'migrations', file);
  if (!fs.existsSync(filepath)) continue;
  
  let content = fs.readFileSync(filepath, 'utf8');
  
  // Replace only if it doesn't already have drop policy right before it
  content = content.replace(/(?<!drop policy if exists [a-zA-Z0-9_]+ on [\w\.]+;\s*?)create policy ([a-zA-Z0-9_]+) on ([\w\.]+)/gi, 'drop policy if exists $1 on $2;\ncreate policy $1 on $2');
  
  fs.writeFileSync(filepath, content, 'utf8');
}
console.log('Fixed policies with drop policy if exists.');
