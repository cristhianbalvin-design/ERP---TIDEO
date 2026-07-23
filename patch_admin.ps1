$ErrorActionPreference = 'Stop'

$lines = Get-Content -Path "src\pages_admin.jsx" -Raw
# Wait, let's just use string replacement in PowerShell.

# 1. Add import
$lines = $lines -replace [regex]::Escape("import { DocumentoPreviewModal } from './components/DocumentoPreviewModal.jsx';"), "import { ColumnFilter } from './components/ColumnFilter.jsx';`r`nimport { DocumentoPreviewModal } from './components/DocumentoPreviewModal.jsx';"

# 2. Add state
$stateInjection = @"
  const [docPreviewReqAdmin, setDocPreviewReqAdmin] = useState(null);
  const [docPreviewPersonaAdmin, setDocPreviewPersonaAdmin] = useState(null);

  const COLUMNAS_DEFAULT_ADMIN = [
    { key: 'codigo', label: 'Código' },
    { key: 'colaborador', label: 'Colaborador' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'unidad', label: 'Unidad organizacional' },
    { key: 'sede', label: 'Sede' },
    { key: 'turno', label: 'Turno' },
    { key: 'jornada', label: 'Jornada' },
    { key: 'contrato', label: 'Contrato' },
    { key: 'modalidad', label: 'Modalidad' },
    { key: 'vacaciones', label: 'Vacaciones disp.' },
    { key: 'estado', label: 'Estado' },
    { key: 'acciones', label: 'Acciones' },
  ];
  const [visibleColsAdmin, setVisibleColsAdmin] = useState(() => {
    try {
      const stored = localStorage.getItem('erp_rrhh_admin_cols');
      return stored ? JSON.parse(stored) : COLUMNAS_DEFAULT_ADMIN.map(c => c.key);
    } catch(e) { return COLUMNAS_DEFAULT_ADMIN.map(c => c.key); }
  });
  
  useEffect(() => {
    localStorage.setItem('erp_rrhh_admin_cols', JSON.stringify(visibleColsAdmin));
  }, [visibleColsAdmin]);
"@

$lines = $lines -replace [regex]::Escape("  const [docPreviewReqAdmin, setDocPreviewReqAdmin] = useState(null);`r`n  const [docPreviewPersonaAdmin, setDocPreviewPersonaAdmin] = useState(null);"), $stateInjection
if ($lines -notmatch "COLUMNAS_DEFAULT_ADMIN") {
    $lines = $lines -replace [regex]::Escape("  const [docPreviewReqAdmin, setDocPreviewReqAdmin] = useState(null);`n  const [docPreviewPersonaAdmin, setDocPreviewPersonaAdmin] = useState(null);"), $stateInjection
}

# 3. Add ColumnFilter component
$filterInjection = @"
              <option value="honorarios">Honorarios</option>
            </select>
            <ColumnFilter columns={COLUMNAS_DEFAULT_ADMIN} visibleCols={visibleColsAdmin} onChange={setVisibleColsAdmin} />
          </div>
"@
$lines = $lines -replace [regex]::Escape("              <option value=`"honorarios`">Honorarios</option>`r`n            </select>`r`n          </div>"), $filterInjection
if ($lines -notmatch "visibleColsAdmin} onChange") {
    $lines = $lines -replace [regex]::Escape("              <option value=`"honorarios`">Honorarios</option>`n            </select>`n          </div>"), $filterInjection
}


# 4. Replace TH
$thOriginal1 = "            <table className=`"tbl`">`r`n              <thead><tr><th>Código</th><th>Colaborador</th><th>Cargo</th><th>Unidad organizacional</th><th>Sede</th><th>Turno</th><th>Jornada</th><th>Contrato</th><th>Modalidad</th><th>Vacaciones disp.</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>"
$thOriginal2 = "            <table className=`"tbl`">`n              <thead><tr><th>Código</th><th>Colaborador</th><th>Cargo</th><th>Unidad organizacional</th><th>Sede</th><th>Turno</th><th>Jornada</th><th>Contrato</th><th>Modalidad</th><th>Vacaciones disp.</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>"

$thNew = @"
            <table className="tbl">
              <thead><tr>
                {visibleColsAdmin.includes('codigo') && <th>Código</th>}
                {visibleColsAdmin.includes('colaborador') && <th>Colaborador</th>}
                {visibleColsAdmin.includes('cargo') && <th>Cargo</th>}
                {visibleColsAdmin.includes('unidad') && <th>Unidad organizacional</th>}
                {visibleColsAdmin.includes('sede') && <th>Sede</th>}
                {visibleColsAdmin.includes('turno') && <th>Turno</th>}
                {visibleColsAdmin.includes('jornada') && <th>Jornada</th>}
                {visibleColsAdmin.includes('contrato') && <th>Contrato</th>}
                {visibleColsAdmin.includes('modalidad') && <th>Modalidad</th>}
                {visibleColsAdmin.includes('vacaciones') && <th>Vacaciones disp.</th>}
                {visibleColsAdmin.includes('estado') && <th>Estado</th>}
                {visibleColsAdmin.includes('acciones') && <th style={{textAlign:'right'}}>Acciones</th>}
              </tr></thead>
"@

$lines = $lines -replace [regex]::Escape($thOriginal1), $thNew
$lines = $lines -replace [regex]::Escape($thOriginal2), $thNew


# 5. Replace TD block
# I will use array indexing to ensure I replace the exact lines without worrying about encoding or string escaping.
[IO.File]::WriteAllText("src\pages_admin.jsx", $lines, [System.Text.Encoding]::UTF8)
