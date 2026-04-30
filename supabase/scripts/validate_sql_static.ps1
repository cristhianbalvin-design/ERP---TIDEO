$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

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
  "supabase/seeds/001_demo_tenants.sql",
  "supabase/seeds/008_maestros_base_demo.sql",
  "supabase/seeds/002_crm_demo.sql",
  "supabase/seeds/003_ops_demo.sql",
  "supabase/seeds/005_compras_demo.sql",
  "supabase/seeds/004_finances_demo.sql",
  "supabase/seeds/006_rrhh_demo.sql"
)

$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $orderedFiles) {
  $fullPath = Join-Path $root $relativePath
  if (!(Test-Path $fullPath)) {
    $errors.Add("Falta archivo requerido: $relativePath")
    continue
  }

  $content = Get-Content -Path $fullPath -Raw -Encoding UTF8
  if ($content -match [char]0) {
    $errors.Add("Archivo contiene bytes NUL o texto UTF-16 mezclado: $relativePath")
  }
}

function Get-TableDefinitions {
  param([string[]]$SchemaFiles)

  $tables = @()
  foreach ($relativePath in $SchemaFiles) {
    $content = Get-Content -Path (Join-Path $root $relativePath) -Raw -Encoding UTF8
    $matches = [regex]::Matches($content, "create table if not exists public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);", "IgnoreCase")
    foreach ($match in $matches) {
      $tables += [pscustomobject]@{
        Name = $match.Groups[1].Value
        Body = $match.Groups[2].Value
        Source = $relativePath
        HasEmpresaId = $match.Groups[2].Value -match "\bempresa_id\b"
      }
    }
  }
  return $tables
}

$schemaFiles = $orderedFiles | Where-Object { $_ -like "supabase/schemas/*.sql" }
$policyFiles = $orderedFiles | Where-Object { $_ -like "supabase/policies/*.sql" }
$tables = Get-TableDefinitions -SchemaFiles $schemaFiles
$businessTables = $tables | Where-Object { $_.HasEmpresaId }
$policyText = ($policyFiles | ForEach-Object { Get-Content -Path (Join-Path $root $_) -Raw -Encoding UTF8 }) -join "`n"

$definedBefore = New-Object System.Collections.Generic.HashSet[string]
foreach ($relativePath in $schemaFiles) {
  $content = Get-Content -Path (Join-Path $root $relativePath) -Raw -Encoding UTF8
  $matches = [regex]::Matches($content, "create table if not exists public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);", "IgnoreCase")
  foreach ($match in $matches) {
    $tableName = $match.Groups[1].Value
    $body = $match.Groups[2].Value
    $references = [regex]::Matches($body, "references\s+public\.([a-zA-Z0-9_]+)", "IgnoreCase")
    foreach ($reference in $references) {
      $referencedTable = $reference.Groups[1].Value
      if ($referencedTable -ne $tableName -and !$definedBefore.Contains($referencedTable)) {
        $errors.Add("Dependencia creada fuera de orden: public.$tableName referencia public.$referencedTable antes de que exista ($relativePath)")
      }
    }
    [void]$definedBefore.Add($tableName)
  }
}

$functionMatches = [regex]::Matches($policyText, "create or replace function\s+public\.([a-zA-Z0-9_]+)[\s\S]*?\$\$;", "IgnoreCase")
foreach ($match in $functionMatches) {
  $functionSql = $match.Value
  $functionName = $match.Groups[1].Value
  if ($functionSql -match "security\s+definer" -and $functionSql -notmatch "set\s+search_path\s*=\s*public") {
    $errors.Add("Funcion security definer sin set search_path = public: public.$functionName")
  }
}

foreach ($table in $businessTables) {
  if ($policyText -notmatch "alter table public\.$($table.Name) enable row level security") {
    $errors.Add("Tabla con empresa_id sin RLS habilitado: public.$($table.Name) ($($table.Source))")
  }
  if ($policyText -notmatch "on public\.$($table.Name)\b") {
    $errors.Add("Tabla con empresa_id sin policy tenant: public.$($table.Name) ($($table.Source))")
  }
}

$platformTablesWithEmpresa = $tables | Where-Object { $_.Source -eq "supabase/schemas/001_platform.sql" -and $_.HasEmpresaId }
foreach ($table in $platformTablesWithEmpresa) {
  $warnings.Add("Tabla de plataforma con empresa_id, revisar si debe ser transaccional: public.$($table.Name)")
}

$duplicateTables = $tables | Group-Object Name | Where-Object { $_.Count -gt 1 }
foreach ($dup in $duplicateTables) {
  $errors.Add("Tabla definida mas de una vez: public.$($dup.Name)")
}

$schemaTableNames = New-Object System.Collections.Generic.HashSet[string]
foreach ($table in $tables) {
  [void]$schemaTableNames.Add($table.Name)
}

$seedFiles = $orderedFiles | Where-Object { $_ -like "supabase/seeds/*.sql" }
foreach ($relativePath in $seedFiles) {
  $content = Get-Content -Path (Join-Path $root $relativePath) -Raw -Encoding UTF8
  $insertMatches = [regex]::Matches($content, "insert\s+into\s+public\.([a-zA-Z0-9_]+)", "IgnoreCase")
  foreach ($match in $insertMatches) {
    $insertTable = $match.Groups[1].Value
    if (!$schemaTableNames.Contains($insertTable)) {
      $errors.Add("Seed inserta en tabla no definida en setup combinado: public.$insertTable ($relativePath)")
    }
  }
}

$combinedPath = Join-Path $root "supabase/generated/tideo_erp_setup.sql"
if (Test-Path $combinedPath) {
  $combined = Get-Content -Path $combinedPath -Raw -Encoding UTF8
  foreach ($relativePath in $orderedFiles) {
    if ($combined -notmatch [regex]::Escape("-- Fuente: $relativePath")) {
      $warnings.Add("El SQL combinado no contiene marcador de fuente para: $relativePath")
    }
  }
} else {
  $warnings.Add("No existe supabase/generated/tideo_erp_setup.sql. Ejecuta build_combined_sql.ps1.")
}

if ($warnings.Count -gt 0) {
  Write-Host "Advertencias:" -ForegroundColor Yellow
  foreach ($warning in $warnings) {
    Write-Host " - $warning" -ForegroundColor Yellow
  }
}

if ($errors.Count -gt 0) {
  Write-Host "Errores:" -ForegroundColor Red
  foreach ($errorItem in $errors) {
    Write-Host " - $errorItem" -ForegroundColor Red
  }
  exit 1
}

Write-Host "Validacion estatica OK. Tablas revisadas: $($tables.Count). Tablas multitenant: $($businessTables.Count)." -ForegroundColor Green
