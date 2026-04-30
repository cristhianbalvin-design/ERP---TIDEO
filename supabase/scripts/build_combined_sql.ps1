param(
  [string]$OutputPath = "supabase/generated/tideo_erp_setup.sql"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$repoRoot = $root
$outputFullPath = Join-Path $repoRoot $OutputPath
$outputDir = Split-Path -Parent $outputFullPath

$orderedFiles = @(
  "supabase/schemas/001_platform.sql",
  "supabase/schemas/002_access.sql",
  "supabase/schemas/003_business_core.sql",
  "supabase/schemas/006_purchasing_inventory.sql",
  "supabase/schemas/004_finance.sql",
  "supabase/schemas/005_operations.sql",
  "supabase/schemas/007_hr_cs_ai.sql",
  "supabase/schemas/008_maestros_base.sql",
  "supabase/policies/000_access_rls.sql",
  "supabase/policies/001_tenant_rls.sql",
  "supabase/policies/002_domain_rls.sql",
  "supabase/policies/003_role_permissions.sql",
  "supabase/policies/004_domain_permissions.sql",
  "supabase/migrations/008_auth_frontend_access.sql",
  "supabase/migrations/019_platform_tenant_admin.sql",
  "supabase/migrations/020_hojas_costeo_versionado.sql",
  "supabase/migrations/021_superadmin_tenant_data_access.sql",
  "supabase/migrations/022_superadmin_global_permissions.sql",
  "supabase/migrations/023_rpc_crear_hoja_costeo.sql",
  "supabase/migrations/024_backend_minimos_deploy_beta.sql",
  "supabase/migrations/025_maestro_industrias.sql",
  "supabase/migrations/026_fix_hc_cotizacion_items.sql",
  "supabase/migrations/027_rpc_crear_ot_desde_os.sql",
  "supabase/migrations/028_fix_ot_os_cliente_fkey.sql",
  "supabase/migrations/029_rrhh_planner_campo_operativo.sql",
  "supabase/seeds/001_demo_tenants.sql",
  "supabase/seeds/008_maestros_base_demo.sql",
  "supabase/seeds/002_crm_demo.sql",
  "supabase/seeds/003_ops_demo.sql",
  "supabase/seeds/005_compras_demo.sql",
  "supabase/seeds/004_finances_demo.sql",
  "supabase/seeds/006_rrhh_demo.sql",
  "supabase/seeds/009_rrhh_planner_campo_demo.sql"
)

if (!(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$header = @"
-- TIDEO ERP - Setup combinado Supabase
-- Generado automaticamente por supabase/scripts/build_combined_sql.ps1
-- Ejecutar en un proyecto Supabase limpio o revisar cuidadosamente antes de aplicar.

"@

Set-Content -Path $outputFullPath -Value $header -Encoding UTF8

foreach ($relativePath in $orderedFiles) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (!(Test-Path $fullPath)) {
    throw "No existe el archivo requerido: $relativePath"
  }

  Add-Content -Path $outputFullPath -Value "`n-- ============================================================" -Encoding UTF8
  Add-Content -Path $outputFullPath -Value "-- Fuente: $relativePath" -Encoding UTF8
  Add-Content -Path $outputFullPath -Value "-- ============================================================`n" -Encoding UTF8
  Get-Content -Path $fullPath -Encoding UTF8 | Add-Content -Path $outputFullPath -Encoding UTF8
}

Write-Host "SQL combinado generado en: $OutputPath"
