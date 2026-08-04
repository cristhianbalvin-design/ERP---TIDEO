# Auditoría e implementación — Nómina multisociedad

Fecha: 2026-08-02  
Proyecto Supabase: `atqwyjfidfoepthygfoo`

## 1. Auditoría previa (solo lectura)

### Cimientos 384–387

SQL ejecutado:

```sql
SELECT to_regclass('public.sociedades'),
       EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='centros_costo'
           AND column_name='sociedad_id'),
       EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='stock'
           AND column_name='sociedad_id');
```

Resultado real:

```json
{"sociedades_table":"sociedades","centros_costo_sociedad":true,"stock_sociedad":true}
```

### Supuesto corregido: persistencia de Procesar

El blocker descrito estaba desactualizado. Producción ya tenía 9 filas en
`nomina_detalle` y `calcularNomina` ya delegaba en `procesarNominaAhora`, que llama
`nominaService.guardarDetalle(...)`. Código completo auditado de `calcularNomina`:

```jsx
const calcularNomina = () => {
  if (!periodo || procesandoNominaRef.current) return;
  const hoyStr = new Date().toISOString().split('T')[0];
  if (periodo.fecha_corte && hoyStr < periodo.fecha_corte) {
    setAdvertenciaCorte(true);
    return;
  }
  procesarNominaAhora();
};
```

La escritura real estaba implementada por el RPC confirmado en producción:
`guardar_nomina_detalle_periodo(text,text,jsonb)`, migración histórica 333/342.

Prueba previa aislada, con `BEGIN … ROLLBACK`, sobre el período cerrado de julio:

```json
{"rpc_return":6,"before_count":6,"after_count":6,"before_net":15862.01,"after_net":15862.01,"same_values":true}
```

### Conteos reales previos

`nomina_detalle`:

```json
[{"empresa_id":"emp_2000000000","count":9}]
```

`periodos_nomina` por tenant/estado:

```json
[
  {"empresa_id":"emp_2000000000","estado":"cerrado","count":2},
  {"empresa_id":"emp_20513453711","estado":"abierto","count":1},
  {"empresa_id":"emp_20541435833","estado":"abierto","count":1},
  {"empresa_id":"emp_20600026446","estado":"abierto","count":1},
  {"empresa_id":"emp_20601829101","estado":"abierto","count":1},
  {"empresa_id":"emp_20606120487","estado":"abierto","count":2},
  {"empresa_id":"emp_20609996464","estado":"abierto","count":1},
  {"empresa_id":"emp_tideo","estado":"abierto","count":1}
]
```

### Estructura real previa de `periodos_nomina`

```text
1 id text NOT NULL
2 empresa_id text NOT NULL
3 periodo text NOT NULL
4 fecha_inicio date NOT NULL
5 fecha_fin date NOT NULL
6 total_trabajadores integer DEFAULT 0
7 masa_salarial_bruta numeric DEFAULT 0
8 total_neto numeric DEFAULT 0
9 total_cargas_empresa numeric DEFAULT 0
10 moneda text DEFAULT 'PEN'
11 estado text DEFAULT 'abierto'
12 cerrado_por uuid NULL
13 cerrado_at timestamptz NULL
14 created_at timestamptz DEFAULT now()
15 updated_at timestamptz DEFAULT now()
16 anio integer NULL
17 mes integer NULL
18 quincena integer NULL
19 fecha_corte date NULL
20 fecha_pago date NULL
21 cerrado_en timestamptz NULL
22 creado_en timestamptz DEFAULT now()
23 actualizado_en timestamptz DEFAULT now()
```

Índices reales previos:

```text
idx_nomina_empresa: (empresa_id, periodo)
periodos_nomina_empresa_id_periodo_key UNIQUE: (empresa_id, periodo)
periodos_nomina_empresa_periodo_uq UNIQUE: (empresa_id, anio, mes, COALESCE(quincena,0))
periodos_nomina_pkey UNIQUE: (id)
```

Se confirmaron dos reglas únicas, no una. Ambas fueron recreadas conservando sus nombres
y agregando `COALESCE(sociedad_id, UUID cero)`.

### Estructura real previa de `personal_documentos`

```text
1 id text NOT NULL DEFAULT pdoc_...
2 empresa_id text NOT NULL
3 personal_id text NOT NULL
4 personal_tipo text NOT NULL DEFAULT 'operativo'
5 tipo_doc text NOT NULL
6 nombre_archivo text NULL
7 archivo_url text NULL
8 bucket text NOT NULL DEFAULT 'documentos-privados'
9 fecha_emision date NULL
10 fecha_vencimiento date NULL
11 version integer NOT NULL DEFAULT 1
12 activo boolean NOT NULL DEFAULT true
13 estado_validacion text NOT NULL DEFAULT 'pendiente'
14 motivo_rechazo text NULL
15 notas text NULL
16 subido_por text NULL
17 subido_desde text NOT NULL DEFAULT 'backoffice'
18 revisado_por text NULL
19 revisado_en timestamptz NULL
20 creado_en timestamptz NOT NULL DEFAULT now()
21 tipo_documento_id text NULL
22 condiciones_laborales jsonb NOT NULL DEFAULT '{}'
23 contrato_referencia_id text NULL
24 adenda_cambios jsonb NOT NULL DEFAULT '{}'
25 fecha_vigencia_cambio date NULL
26 seccion_documental text NOT NULL DEFAULT 'adicional'
27 estado_firma text NOT NULL DEFAULT 'no_requiere'
28 documento_enviado_a_firma_id text NULL
29 enviado_a_firma_en timestamptz NULL
30 enviado_a_firma_mensaje text NULL
31 contrato_periodo_id text NULL
32 es_correccion boolean NOT NULL DEFAULT false
33 periodo_fecha_inicio date NULL
34 periodo_fecha_fin date NULL
35 periodo_estado text NOT NULL DEFAULT 'vigente'
36 periodo_grupo_id uuid NULL
37 renovable boolean NULL DEFAULT false
38 es_indefinido boolean NOT NULL DEFAULT false
39 retro_override_por text NULL
40 retro_override_en timestamptz NULL
41 retro_override_motivo text NULL
```

Distinción contractual real:

- `tipo_doc` contiene IDs como `tdoc_c8e9...`, no el literal `contrato`.
- `tipo_documento_id` referencia `tipos_documento_empresa.id`.
- El catálogo usa `categoria='Contractual'`, nombre/código y
  `captura_snapshot_laboral`; las adendas reales tienen además
  `contrato_referencia_id`.
- Existían, entre otros: `Contrato Laboral`, `Contrato Primigenio`,
  `Contrato de trabajo` y `Adenda contractual`.
- Estados reales relevantes: `activo=true`, `estado_validacion='aprobado'`,
  `periodo_estado='vigente'`.

El filtro nuevo usa el catálogo, excluye adendas como raíz, resuelve sucesores,
comprueba solapamiento de fechas y aplica solo adendas aprobadas de la misma sociedad.

### Estructura real previa de `nomina_detalle`

```text
1 id uuid; 2 empresa_id text; 3 periodo_id text; 4 trabajador_id text;
5 trabajador_tipo text; 6 regimen_jornada_snap text; 7 regimen_empresa_snap text;
8 dias_laborables integer; 9 dias_laborados integer; 10 dias_computables integer;
11 horas_extra_tramo1_min integer; 12 horas_extra_tramo2_min integer;
13 sueldo_base numeric; 14 remuneracion_bruta numeric; 15 asignacion_familiar numeric;
16 add_horas_extra numeric; 17 bonif_altitud numeric; 18 otros_ingresos numeric;
19 desc_faltas numeric; 20 desc_tardanzas numeric; 21 aporte_afp numeric;
22 comision_afp_flujo numeric; 23 prima_seguro_afp numeric; 24 desc_onp numeric;
25 retencion_ir numeric; 26 desc_prestamo numeric; 27 desc_anticipo numeric;
28 desc_judicial numeric; 29 total_descuentos numeric; 30 neto numeric;
31 essalud numeric; 32 cts_mensualizado numeric; 33 tiene_cts boolean;
34 gratificacion_mensualizada numeric; 35 bonif_extraordinaria numeric;
36 tiene_gratificacion boolean; 37 vacaciones_mensualizadas numeric;
38 total_cargas numeric; 39 costo_real_empresa numeric; 40 es_quincena boolean;
41 quincena integer; 42 pct_quincena_aplicado numeric; 43 creado_en timestamptz;
44 desc_extraordinario numeric; 45 sistema_pensionario text.
```

Índice único confirmado: `nomina_detalle_periodo_trabajador_uq(periodo_id, trabajador_id)`.

### Componentes y PDF reales

- Ficha administrativa, tab Documentos: `RRHHAdmin`, `src/pages_admin.jsx`.
- Ficha operativa, tab Documentos: `RRHH_Operativo`, `src/pages_ops.jsx`.
- La boleta previa no tenía generador PDF: el botón en `src/pages_ops.jsx` solo emitía
  `Boleta PDF lista.`. `src/pages_pdf.jsx` no tenía una boleta.
- Se agregó `BoletaPagoPDF` en el archivo PDF real del proyecto y el botón ahora genera
  y descarga el blob.

La tabla `sociedades` inicialmente solo tenía `id, empresa_id, codigo, nombre,
razon_social, ruc, activa, created_at, updated_at`; por ello la migración 388 agregó
`direccion_fiscal`, `logo_url` y `firma_url` para que la boleta pueda usar identidad
propia de la sociedad y no identidad genérica.

## 2. Línea base manual

Fila real de julio 2026, trabajador `per_1782939507399`, sueldo/bruto S/ 1,000:

```text
AFP:                 1,000 × 10%    = 100.00
Prima AFP:           1,000 × 1.37%  =  13.70
Total descuentos:                    113.70
Neto:              1,000 - 113.70   = 886.30
EsSalud:             1,000 × 9%     =  90.00
Gratificación:       1,000 / 12     =  83.33
Bonif. extraordin.:   83.33 × 9%    =   7.50
CTS:          (1,000 + 83.33) / 12  =  90.28
Vacaciones:          1,000 / 12     =  83.33
Total cargas:                        354.44
Costo empresa:     1,000 + 354.44   = 1,354.44
```

Coincide con el snapshot real. Huellas de línea base posteriores a las pruebas
revertidas y anteriores a cualquier activación de multisociedad:

```text
pnm_1782969337025_6b6yru | filas 6 | bruto 18208.07 | descuentos 2346.06 |
neto 15862.01 | cargas 6490.75 | costo 24698.82 |
huella 3bb0d78da7a4bfe60e8ad18a591722e8

pnm_1783002282328_5ld47c | filas 3 | bruto 12795.83 | descuentos 1729.55 |
neto 11066.29 | cargas 4536.51 | costo 17332.35 |
huella 4dee8edb6c668e6bd87e94905a16e567
```

## 3. Prueba multisociedad revertida

Ejecutada dos veces: una durante el dry-run de las migraciones y otra contra el esquema
388–390 ya aplicado. En ambas:

1. `BEGIN`.
2. Activación temporal del flag solo dentro de la transacción.
3. Creación de Sociedad A y Sociedad B.
4. Creación de dos períodos Agosto 2099, mismo tenant/mes, uno por sociedad.
5. Creación de dos contratos para `per_1782939507399`: S/ 1,000 en A y S/ 2,000 en B.
6. Aprobación de ambos; quedaron 2 contratos activos.
7. Procesamiento mediante `guardar_nomina_detalle_periodo_sociedad`.
8. Verificación de dos filas separadas.
9. `ROLLBACK`.

Resultado real post-aplicación:

```json
{
  "active_contracts": 2,
  "payroll": [
    {"periodo_id":"audit_periodo_a","sociedad_id":"...00a1","sueldo_base":1000,"neto":886.30},
    {"periodo_id":"audit_periodo_b","sociedad_id":"...00b2","sueldo_base":2000,"neto":1772.60}
  ]
}
```

Nada de esos datos de prueba persistió.

## 4. Verificación posterior a producción

Migraciones registradas: 384, 385, 386, 387, 388, 389 y 390 alineadas local/remoto.

```json
{
  "nomina_detalle_rows": 9,
  "julio_rows": 6,
  "julio_net": 15862.01,
  "society_nonnull": 0,
  "personal_operativo_sociedad_column": false,
  "personal_administrativo_sociedad_column": false,
  "todos_los_tenants_multisociedad_habilitado": false
}
```

Repetición del RPC legacy post-aplicación, con rollback:

```json
{"rpc_return":6,"before_rows":6,"after_rows":6,"before_net":15862.01,"after_net":15862.01,"same_values":true}
```

## 5. SQL de verificación independiente

```sql
-- A. Columnas y flags: ninguna ficha personal debe tener sociedad_id.
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and column_name='sociedad_id'
  and table_name in (
    'personal_documentos','periodos_nomina','nomina_detalle',
    'personal_operativo','personal_administrativo'
  )
order by table_name;

select id as empresa_id, multisociedad_habilitado
from public.empresas
order by id;

-- B. Índices societarios de períodos con los nombres auditados.
select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='periodos_nomina'
order by indexname;

-- C. Línea base inmutable de los períodos existentes.
select periodo_id,
       count(*) filas,
       sum(remuneracion_bruta) bruto,
       sum(total_descuentos) descuentos,
       sum(neto) neto,
       sum(total_cargas) cargas,
       sum(costo_real_empresa) costo,
       md5(string_agg(concat_ws('|', trabajador_id, sueldo_base,
         remuneracion_bruta, total_descuentos, neto, total_cargas,
         costo_real_empresa), ';' order by trabajador_id)) huella
from public.nomina_detalle
group by periodo_id
order by periodo_id;

-- Debe devolver cero: no se migró ni activó sociedad en datos reales.
select count(*) as filas_reales_con_sociedad
from public.nomina_detalle
where sociedad_id is not null;
```

## 6. Checklist final

- PASA — `personal_operativo` y `personal_administrativo` siguen sin `sociedad_id`.
- PASA — Procesar persiste filas; verificado por RPC en transacción revertida.
- PASA — ambos índices únicos reales de períodos consideran sociedad y preservan NULL legacy.
- PASA — misma persona, dos contratos, dos sociedades, dos períodos y dos importes distintos.
- PASA — flujo sin multisociedad conserva conteos, netos y valores fila por fila.
- PASA — no se modificaron fórmulas AFP/ONP/IR/CTS/gratificación/minería/Q1/Q2.
- PASA — no se modificó `personal_asignaciones_jornada` ni su trigger.
- PASA — la boleta PDF usa razón social, RUC, dirección, logo y firma de la sociedad;
  sin sociedad conserva el emisor legacy.
- PASA — nombres de columnas, índices, constraints, funciones y componentes fueron auditados.
- PASA — migraciones probadas con rollback, reentrada doble y aplicación secuencial.
