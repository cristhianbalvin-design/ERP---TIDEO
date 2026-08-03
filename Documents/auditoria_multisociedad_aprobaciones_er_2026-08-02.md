# Auditoría multisociedad — Aprobaciones y Estado de Resultados

Fecha de ejecución: 2026-08-02  
Proyecto Supabase: `atqwyjfidfoepthygfoo`  
Migraciones: 391 y 392

## Resultado ejecutivo

Los Bloques A y B quedaron implementados y aplicados. Ningún tenant real fue activado. La ruta legacy, con `multisociedad_habilitado=false`, conserva las listas sin filtro/badge y ejecuta el mismo `getEstadoResultados` sin scope.

Discrepancias auditadas y autorizadas:

- Cotizaciones y Hoja de Costeo están en `src/pages_extra.jsx`; se modificaron sus listas existentes.
- `facturas.id`, `cxp.id` y `guias_remision.id` son `text`.
- `sociedades.id` es `uuid`, incluido el FK `tipos_cambio_grupo.sociedad_id`.
- El ER real está en `src/services/estadoResultadosService.js`, función `getEstadoResultados`.
- BI Financiero tenía un cálculo local propio; recibió el mismo selector/filtro de scope.

## Auditoría previa

### Compuerta de bloques 1–3

SQL:

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facturas'
      AND column_name='sociedad_id') AS facturas_ok,
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='centros_costo'
      AND column_name='sociedad_id') AS ceco_ok,
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='periodos_nomina'
      AND column_name='sociedad_id') AS nomina_ok;
```

Resultado real:

```json
{"facturas_ok":true,"ceco_ok":true,"nomina_ok":true}
```

### Tipos y ausencia de tablas

Resultado real inmediatamente antes de aplicar:

```json
[
  {"table":"operaciones_intercompania","exists":false},
  {"table":"tipos_cambio_grupo","exists":false},
  {"table":"empresas","column":"id","type":"text"},
  {"table":"sociedades","column":"id","type":"uuid"},
  {"table":"facturas","column":"id","type":"text"},
  {"table":"cxp","column":"id","type":"text"},
  {"table":"guias_remision","column":"id","type":"text"}
]
```

`sociedades.id` se verificó además como `NOT NULL DEFAULT gen_random_uuid()`.

### Arquitectura real de aprobaciones

- Cotizaciones: `CotizacionesInner` / `Cotizaciones`, carga desde `loadCrmFromSupabase`; la lista existente filtra `cotizacionesAlcance`.
- Hoja de Costeo: `HojaCosteo`, carga desde el mismo servicio CRM; la lista existente filtra `hojasCosteoAlcance`.
- Presupuesto: `Presupuestos`, tablas `presupuestos`, `presupuesto_partidas`, `presupuesto_aprobaciones`; cadena secuencial configurable de hasta cuatro aprobadores. La transición de estados no se modificó.

Estado previo de columnas:

| Tabla | sociedad_id previo |
|---|---|
| cotizaciones | uuid nullable, ya existente |
| hojas_costeo | no existía |
| presupuestos | no existía |
| presupuesto_partidas | no existía |
| presupuesto_aprobaciones | no existía |

### Reglas reales del ER preservadas

- Ingresos: solo `tipo_documento IN ('factura','boleta')`; `nota_credito` y `nota_debito` quedan excluidas.
- Compras/gastos: excluye `compras_gastos.es_activo_fijo=true` y estados anulados.
- Mantiene costos de OT, devengos CxP elegibles, planilla, cargas sociales, intereses y caja chica según el servicio existente.
- El scope de sociedad se aplica por encima de esas reglas; comparativo y consolidado invocan el mismo `getEstadoResultados`.
- La eliminación se muestra como `(-) Eliminaciones intercompañía`.

## Implementación

### Bloque A

- `supabase/migrations/391_multisociedad_aprobaciones.sql`
- `src/services/sociedadesService.js`
- `src/components/SociedadFormField.jsx`
- `src/services/crmService.js`
- `src/context.jsx`
- `src/pages_extra.jsx`
- `src/pages_fin.jsx`

La migración agrega columnas nullable, FK tenant/sociedad, índices, herencia de sociedad en hijos de presupuesto y RPC separadas para HC multisociedad. Las RPC legacy permanecen intactas.

### Bloque B

- `supabase/migrations/392_multisociedad_er_consolidado.sql`
- `src/services/estadoResultadosService.js`
- `src/pages_fin.jsx`
- `src/pages_bi_fin.jsx`

`tipo_operacion='reparto_costo_personal'` existe solo en el CHECK; no se creó UI que lo genere.

## Evidencia de despliegue

Ambas migraciones completas pasaron antes de aplicar:

```text
BEGIN + 391 + ROLLBACK: PASS
BEGIN + 392 + ROLLBACK: PASS
```

Aplicación e historial:

```text
391_multisociedad_aprobaciones.sql: APPLIED_OK
392_multisociedad_er_consolidado.sql: APPLIED_OK
391 history repair: applied
392 history repair: applied
migration list: local=remote para 391 y 392
```

Verificación posterior real:

```json
{
  "flags_true":"0",
  "sociedades_total":"0",
  "hc_sociedad_nonnull":"0",
  "presupuestos_sociedad_nonnull":"0",
  "partidas_sociedad_nonnull":"0",
  "aprobaciones_sociedad_nonnull":"0",
  "operaciones_total":"0",
  "tipos_cambio_total":"0",
  "operaciones_rls":"true",
  "tipos_cambio_rls":"true",
  "operaciones_policy":"1",
  "tipos_cambio_policy":"1",
  "operaciones.factura_id.type":"text",
  "operaciones.cxp_id.type":"text",
  "operaciones.guia_remision_id.type":"text",
  "operaciones.sociedad_origen.type":"uuid",
  "operaciones.sociedad_destino.type":"uuid",
  "tipos_cambio.sociedad_id.type":"uuid"
}
```

Conteos de listas reales posteriores:

| Tenant | Cotizaciones | Hojas de Costeo | Presupuestos |
|---|---:|---:|---:|
| emp_2000000000 | 28 | 8 | 1 |
| emp_20601829101 | 3 | 1 | 1 |
| emp_20606120487 | 5 | 3 | 0 |
| emp_20609996464 | 14 | 0 | 0 |

Las listas con flag apagado retornan la misma referencia original en el helper y no renderizan columna/badge de sociedad.

## Línea base ER real antes/después

Tenant: `emp_2000000000`, período: `2026-07`.

| Concepto | PEN | USD |
|---|---:|---:|
| Ingresos | 21,950.00 | 5,150.00 |
| Costo de ventas | 18,380.00 | 1,366.00 |
| Gastos operativos | 23,532.76 | 3,200.00 |
| Gastos financieros | 256.27 | 0.00 |
| Resultado neto | -20,219.03 | 584.00 |

El servicio real produjo exactamente esos importes antes del cambio y después de aplicar 391/392.

Hashes previos de listas conservados en la auditoría:

| Tenant | Cotizaciones | Hoja de Costeo | Presupuesto |
|---|---|---|---|
| emp_2000000000 | e5042f1fb7cb2ea230c4a2aeda87bc6d | 8241b21d89b497e5581a6df6ab24dd46 | a5b187ad7c442dcdb9831d8637ec3ad6 |
| emp_20601829101 | 58f3473315e73a8f5f06485e3cd062d2 | 330c2dda5d537a81d7c73ff769bf5181 | 6aff330136426615cac7289ed73bd4e7 |
| emp_20606120487 | 4bced7e5b81b974d6fb780c493152c8c | de406c6878309159ccf418de65556c95 | — |
| emp_20609996464 | fd0236d812bba2a5dab76100b8ab8580 | — | — |

## Casos de prueba

### ER consolidado, transacción revertida

Dentro de `BEGIN ... ROLLBACK`:

1. Se activó temporalmente el flag de `emp_2000000000`.
2. Se insertaron Sociedad Auditoría A y B.
3. A recibió factura externa 1,000 y factura intercompañía 300.
4. B recibió factura externa 700.
5. Se registró `operaciones_intercompania` por 300, de A hacia B.
6. Se verificó A=1,300, B=700, bruto=2,000, eliminación=300, consolidado=1,700.
7. Se revirtió la transacción.
8. Control posterior: 0 filas de auditoría y flag=false.

Resultado:

```json
{"transactionRollback":"PASS","postRollbackRows":0,"postRollbackFlag":false,"sociedadA":1300,"sociedadB":700,"bruto":2000,"eliminacion":300,"consolidado":1700}
```

### Cola grupo con badges, transacción revertida

En la misma transacción se configuró temporalmente una asignación `grupo` con `sociedades_ids=[A,B]` y dos HC en revisión. La consulta devolvió 2 pendientes y los badges exactos:

```json
{"pendientesGrupo":2,"badges":["Sociedad Auditoría A","Sociedad Auditoría B"]}
```

### Exclusiones en los tres modos

Prueba ejecutable sobre los helpers reales:

- Individual: factura 100 + boleta 50 = ingreso 150.
- Nota de crédito 999: excluida.
- Nota de débito 999: excluida.
- Gasto ordinario 10: incluido.
- Activo fijo 1,000: excluido.
- Dos sociedades: bruto 300; eliminación 20; consolidado 280.

Resultado: `PASS`.

## Checklist final

- [x] Flag false: ER idéntico a la línea base real.
- [x] Notas de crédito/débito y activos fijos siguen excluidos en los tres modos.
- [x] Consolidado resta operaciones intercompañía y muestra línea explícita.
- [x] `sociedades_ids=NULL` conserva lista exacta y sin cambios visibles.
- [x] Cola grupo muestra ambas sociedades con badge correcto.
- [x] RLS y policy tenant activos en ambas tablas nuevas.
- [x] `reparto_costo_personal` reservado en CHECK, sin UI.
- [x] Tipos/nombres/ubicaciones auditados antes de uso.
- [x] Servicios centralizan scope; las páginas no duplican cálculo del ER real.
- [x] Migraciones separadas, probadas con rollback y aplicadas individualmente.

## SQL de verificación independiente

```sql
-- 1) Ningún tenant real activado y ninguna fila legacy reclasificada.
select
  (select count(*) from public.empresas
    where multisociedad_habilitado) as tenants_activos,
  (select count(*) from public.sociedades) as sociedades,
  (select count(*) from public.hojas_costeo
    where sociedad_id is not null) as hc_reclasificadas,
  (select count(*) from public.presupuestos
    where sociedad_id is not null) as presupuestos_reclasificados,
  (select count(*) from public.presupuesto_partidas
    where sociedad_id is not null) as partidas_reclasificadas,
  (select count(*) from public.presupuesto_aprobaciones
    where sociedad_id is not null) as aprobaciones_reclasificadas;

-- Esperado: todos 0.

-- 2) Tablas nuevas vacías en tenants reales.
select
  (select count(*) from public.operaciones_intercompania) as operaciones,
  (select count(*) from public.tipos_cambio_grupo) as tipos_cambio;
-- Esperado: 0, 0.

-- 3) RLS y policies.
select c.relname, c.relrowsecurity,
       count(p.policyname) as policies
from pg_class c
left join pg_policies p
  on p.schemaname='public' and p.tablename=c.relname
where c.oid in (
  'public.operaciones_intercompania'::regclass,
  'public.tipos_cambio_grupo'::regclass
)
group by c.relname,c.relrowsecurity
order by c.relname;
-- Esperado: relrowsecurity=true y policies>=1.

-- 4) Tipos exactos autorizados.
select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and (
  (table_name='operaciones_intercompania' and
   column_name in ('empresa_id','sociedad_origen','sociedad_destino',
                   'factura_id','cxp_id','guia_remision_id'))
  or
  (table_name='tipos_cambio_grupo' and
   column_name in ('empresa_id','sociedad_id'))
)
order by table_name,column_name;

-- 5) Conteos visibles legacy por tenant; deben coincidir con la tabla del reporte.
select empresa_id,
 count(*) filter(where source='cotizaciones') as cotizaciones,
 count(*) filter(where source='hojas_costeo') as hojas_costeo,
 count(*) filter(where source='presupuestos') as presupuestos
from (
 select empresa_id,'cotizaciones' source from public.cotizaciones
 union all select empresa_id,'hojas_costeo' from public.hojas_costeo
 union all select empresa_id,'presupuestos' from public.presupuestos
) q
group by empresa_id
order by empresa_id;

-- 6) Historial.
select version
from supabase_migrations.schema_migrations
where version in ('391','392')
order by version;
-- Esperado: 391 y 392.
```

## Huellas SHA-256 de los archivos auditados

```text
src/services/estadoResultadosService.js
A73DCA796007F54D54AEBE2C1130F58678AAD1E794903C9FAEBA535109992257

src/pages_extra.jsx
DB9EF339CFDFEFF438E814ADBC5CAA76DF7D62E6859B83BDB366B2DEF3FA038B

src/pages_fin.jsx
BDF2E1A48B0F31261C9C1FBC169F96F7D4DD04D1768CF5C1F42E92706B6A9B40

src/pages_bi_fin.jsx
F362100F18152A420F1E40487D1F3D214E177E8EAC7A0CAE299FC3DCBEA812C6

supabase/migrations/391_multisociedad_aprobaciones.sql
461F2CFF6B1FECAA45679063DC0F0DE2A5F4B005211FBCEB8B0432258DAAF6EA

supabase/migrations/392_multisociedad_er_consolidado.sql
84909075760C8DA22BA3E25093BC0F1DB0BBD691C3FA58C0B44406D8FD5ED912
```

# Anexo A — Servicio ER real completo

Ruta: `src/services/estadoResultadosService.js`

```js
import { normalizeCurrency } from '../lib/currency.js';
import { isSupabaseMode } from '../lib/dataMode.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

export const ER_CURRENCIES = ['PEN', 'USD'];

const zeroTotals = () => Object.fromEntries(ER_CURRENCIES.map(m => [m, 0]));
const isInPeriod = (date, period) => String(date || '').slice(0, 7) === period;
const periodBounds = period => {
  const [year, month] = String(period || '').split('-').map(Number);
  const start = new Date(Date.UTC(year || new Date().getFullYear(), (month || 1) - 1, 1));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
  };
};

const emptyBlock = () => ({ total: zeroTotals(), items: [] });
const emptyER = () => ({
  ingresos: emptyBlock(),
  costoVentas: emptyBlock(),
  gastosOp: emptyBlock(),
  gastosFin: emptyBlock(),
  depreciacion: emptyBlock(),
});

const emptyResult = (periodo = '') => ({
  periodo,
  currencies: ER_CURRENCIES,
  er: emptyER(),
  utilidadBruta: zeroTotals(),
  resultadoOp: zeroTotals(),
  ebitda: zeroTotals(),
  ebit: zeroTotals(),
  resultadoNeto: zeroTotals(),
  margenes: {
    utilidadBruta: zeroTotals(),
    resultadoOp: zeroTotals(),
    ebitda: zeroTotals(),
    ebit: zeroTotals(),
    resultadoNeto: zeroTotals(),
  },
  hasMovements: false,
  otherCurrenciesWarning: false,
  sourceCounts: {},
});

const amount = value => Number(value || 0);
// Corrección 2: no colapsar monedas desconocidas a PEN — preservar el código ISO real.
const currencyOf = value => normalizeCurrency(value || 'PEN');

const addToBlock = (block, label, value, currency = 'PEN') => {
  const numeric = amount(value);
  if (!numeric) return;
  const moneda = currencyOf(currency);
  block.total[moneda] = (block.total[moneda] || 0) + numeric;
  let item = block.items.find(i => i.label === label);
  if (!item) {
    item = { label, totals: zeroTotals() };
    block.items.push(item);
  }
  item.totals[moneda] = (item.totals[moneda] || 0) + numeric;
};

const subtractTotals = (left, right) => Object.fromEntries(
  ER_CURRENCIES.map(moneda => [moneda, amount(left?.[moneda]) - amount(right?.[moneda])])
);

const marginTotals = (result, ingresos) => Object.fromEntries(
  ER_CURRENCIES.map(moneda => {
    const base = amount(ingresos?.[moneda]);
    return [moneda, base ? Math.round((amount(result?.[moneda]) / base) * 100) : 0];
  })
);

const finalizeResult = (result, sourceCounts = {}) => {
  const er = result.er;
  result.utilidadBruta = subtractTotals(er.ingresos.total, er.costoVentas.total);
  result.resultadoOp   = subtractTotals(result.utilidadBruta, er.gastosOp.total);

  result.ebitda        = subtractTotals(result.resultadoOp, er.gastosFin.total);
  result.ebit          = subtractTotals(result.ebitda, er.depreciacion.total);
  result.resultadoNeto = result.ebit;
  result.margenes = {
    utilidadBruta: marginTotals(result.utilidadBruta, er.ingresos.total),
    resultadoOp:   marginTotals(result.resultadoOp, er.ingresos.total),
    ebitda:        marginTotals(result.ebitda, er.ingresos.total),
    ebit:          marginTotals(result.ebit, er.ingresos.total),
    resultadoNeto: marginTotals(result.resultadoNeto, er.ingresos.total),
  };
  result.sourceCounts = sourceCounts;
  result.hasMovements = Object.values(sourceCounts).some(v => Number(v || 0) > 0)
    || ['ingresos', 'costoVentas', 'gastosOp', 'gastosFin', 'depreciacion'].some(block =>
      ER_CURRENCIES.some(moneda => amount(er[block].total[moneda]) !== 0)
    );
  // Corrección 2: detectar monedas fuera de ER_CURRENCIES que no pudieron sumarse.
  result.otherCurrenciesWarning = ['ingresos', 'costoVentas', 'gastosOp', 'gastosFin', 'depreciacion'].some(blockKey =>
    Object.keys(er[blockKey].total).some(k => !ER_CURRENCIES.includes(k) && er[blockKey].total[k] > 0)
  );
  return result;
};

const matchesIds = (id, ids) => ids == null || ids.includes(id);
const intersectsIds = (id, ids) => ids == null || ids.includes(id);
const normalizeSociedadIds = ids => Array.isArray(ids) && ids.filter(Boolean).length
  ? [...new Set(ids.filter(Boolean))]
  : null;
const matchesSociedad = (id, ids) => ids == null || ids.includes(id);
const norm = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const sameMoney = (a, b) => Math.abs(amount(a) - amount(b)) < 0.01;
const cxpOrigin = cxp => norm(cxp?.origen || 'manual');
const cxpMotive = cxp => norm(cxp?.motivo_cxp || '');
const cxpDocType = cxp => norm(cxp?.tipo_comprobante || '');
const cxpIsCancelled = cxp => norm(cxp?.estado).includes('anulad');
const cxpIsRhe = cxp => cxpDocType(cxp) === 'rhe'
  || Boolean(cxp?.recibo_honorarios_id)
  || amount(cxp?.monto_bruto) > 0;

export const ER_TIPO_SISTEMA_LABELS = {
  mano_obra: 'Mano de obra',
  materiales: 'Materiales',
  servicios_terceros: 'Servicios terceros',
  logistica: 'Logistica',
  administrativos: 'Administrativos',
  comerciales: 'Comerciales',
  gastos_financieros: 'Gastos financieros',
  planilla: 'Planilla',
  cargas_sociales: 'Cargas sociales',
  intereses_financiamiento: 'Intereses de financiamiento',
  inversiones: 'Inversiones / Activos',
};

export const ER_TIPO_SISTEMA_OPTIONS = Object.entries(ER_TIPO_SISTEMA_LABELS)
  .map(([value, label]) => ({ value, label }));

const ER_FALLBACK_BY_TIPO = {
  // Fallbacks universales cuando el tenant aun no tiene una categoria configurada para ese tipo.
  mano_obra: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Mano de obra' },
  materiales: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Materiales' },
  servicios_terceros: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Servicios terceros' },
  logistica: { seccion: 'costo_ventas', regla_ot: 'con_ot', nombre: 'Logistica' },
  administrativos: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Administrativos' },
  comerciales: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Comerciales' },
  gastos_financieros: { seccion: 'gastos_financieros', regla_ot: 'siempre', nombre: 'Gastos financieros' },
  planilla: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Planilla' },
  cargas_sociales: { seccion: 'gastos_operativos', regla_ot: 'siempre', nombre: 'Cargas sociales' },
  intereses_financiamiento: { seccion: 'gastos_financieros', regla_ot: 'siempre', nombre: 'Intereses de financiamiento' },
};

const inferTipoSistema = value => {
  const v = norm(value);
  if (!v) return null;
  if (v.includes('mano de obra') || v.includes('mo operativa')) return 'mano_obra';
  if (v.includes('material')) return 'materiales';
  if (v.includes('servicio') && v.includes('tercero')) return 'servicios_terceros';

  if (v.includes('tercero')) return 'servicios_terceros';
  if (v.includes('logistica') || v.includes('transporte')) return 'logistica';
  if (v.includes('administrativ')) return 'administrativos';
  if (v.includes('comercial')) return 'comerciales';
  if (v.includes('gasto') && v.includes('financier')) return 'gastos_financieros';
  if (v.includes('planilla')) return 'planilla';
  if (v.includes('carga') && v.includes('social')) return 'cargas_sociales';
  if (v.includes('essalud') || v.includes('cts')) return 'cargas_sociales';
  if (v.includes('interes') && (v.includes('financ') || v.includes('prestamo'))) return 'intereses_financiamiento';
  return null;
};

const preferConfigByReglaOt = (configs, hasOt) => {
  if (!configs.length) return null;
  if (configs.length === 1) return configs[0];
  const preferredRules = hasOt ? ['con_ot', 'siempre', 'sin_ot'] : ['sin_ot', 'siempre', 'con_ot'];
  return preferredRules.map(rule => configs.find(c => c.regla_ot === rule)).find(Boolean) || configs[0];
};

export const resolverCategoriaPorTipoSistema = (erConfig = [], tipoSistema, { hasOt = false, allowFallback = true } = {}) => {
  if (!tipoSistema) return null;
  const configs = (erConfig || []).filter(c => c.tipo_sistema === tipoSistema && (allowFallback || !c.es_fallback));
  const config = preferConfigByReglaOt(configs, hasOt);
  if (config) return config;
  const fallback = ER_FALLBACK_BY_TIPO[tipoSistema];
  return allowFallback && fallback ? { ...fallback, tipo_sistema: tipoSistema, es_fallback: true } : null;
};

const resolverCategoriaEr = (erConfig = [], label, { hasOt = false } = {}) => {
  const byName = (erConfig || []).find(c => norm(c.nombre) === norm(label));
  if (byName) return byName;
  return resolverCategoriaPorTipoSistema(erConfig, inferTipoSistema(label), { hasOt });
};

const excludedCxpOrigins = new Set(['nomina', 'nc_devolucion', 'recepcion', 'tributos', 'dividendos']);
const excludedCxpMotives = new Set(['devolucion_nc', 'planilla', 'essalud', 'pensiones', 'ir_5ta']);

const cxpDevengoAmount = cxp => {
  if (cxpIsRhe(cxp)) return amount(cxp?.monto_bruto) || amount(cxp?.monto_total);
  return amount(cxp?.monto_total);
};

const cxpDevengoLabel = cxp => {
  if (cxp?.categoria_er) return cxp.categoria_er;
  const origin = cxpOrigin(cxp);
  const motive = cxpMotive(cxp);
  if (cxpIsRhe(cxp) && cxp?.recibo_honorarios_id) return 'Comisiones por honorarios';
  if (cxpIsRhe(cxp)) return 'Servicios terceros';
  if (origin === 'viaticos' || motive === 'viaticos_reembolso') return 'Administrativos';
  if (cxp?.tipo_beneficiario === 'personal') return 'Honorarios y reembolsos';
  return 'Gastos operativos';
};

const cxpCanDevengarEr = cxp => {
  if (!cxp || cxpIsCancelled(cxp)) return false;
  // Corrección 5: excluir si el campo no_devengar_er está activado.
  if (cxp.no_devengar_er) return false;
  // Corrección 5: excluir si hay recepcion_id sin importar el campo origen.
  if (cxp.recepcion_id != null) return false;
  if (excludedCxpOrigins.has(cxpOrigin(cxp))) return false;
  if (excludedCxpMotives.has(cxpMotive(cxp))) return false;
  return cxpDevengoAmount(cxp) > 0;
};

const compraCoversCxp = (cxp, comprasGastos = []) => {
  const cxpId = cxp?.id;
  const gastoId = cxp?.gasto_id;
  // FK exacto primero (migration 168 agrega cxp_id a compras_gastos)
  if (cxpId && comprasGastos.some(g => g.cxp_id === cxpId)) return true;
  const fecha = String(cxp?.fecha_emision || '').slice(0, 10);
  const moneda = currencyOf(cxp?.moneda);
  const monto = cxpDevengoAmount(cxp);
  const cxpText = norm([cxp?.concepto, cxp?.factura_numero, cxp?.nombre_emisor].filter(Boolean).join(' '));

  return comprasGastos.some(g => {
    if (cxpId && g.cxp_id === cxpId) return true;
    if (gastoId && g.id === gastoId) return true;
    const gastoText = norm([g.descripcion, g.subcategoria].filter(Boolean).join(' '));
    const sameFingerprint = String(g.fecha || '').slice(0, 10) === fecha
      && currencyOf(g.moneda) === moneda

      && sameMoney(g.monto, monto);
    if (!sameFingerprint || !cxpText || !gastoText) return false;
    return cxpText.includes(gastoText)
      || gastoText.includes(cxpText)
      || (cxp?.factura_numero && gastoText.includes(norm(cxp.factura_numero)));
  });
};

async function resolveCecoFilter(supabase, empresaId, cecoIds = [], cebeIds = [], sociedadIds = null) {
  const selectedCecos = Array.isArray(cecoIds) ? cecoIds.filter(Boolean) : [];
  const selectedCebes = Array.isArray(cebeIds) ? cebeIds.filter(Boolean) : [];
  if (!selectedCebes.length) return selectedCecos.length ? selectedCecos : null;

  let query = supabase
    .from('centros_costo')
    .select('id, cebe_id, sociedad_id')
    .eq('empresa_id', empresaId)
    .in('cebe_id', selectedCebes);
  if (sociedadIds) query = query.in('sociedad_id', sociedadIds);
  const { data, error } = await query;
  if (error) throw error;

  const cecosFromCebe = (data || []).map(c => c.id);
  if (selectedCecos.length) return selectedCecos.filter(id => cecosFromCebe.includes(id));
  return cecosFromCebe;
}

export function buildEstadoResultados({ base, comprasGastos = [], ots = [], facturas = null, centrosCosto = [], centrosBeneficio = [], sociedadIds = null, empresa, periodo = '2026-04' }) {
  const result = emptyResult(periodo);
  const empresaId = empresa?.id;
  const scopeSociedades = normalizeSociedadIds(sociedadIds);
  const sociedadOt = ot => {
    const ceco = centrosCosto.find(c => c.id === ot?.centro_costo_id);
    const cebe = centrosBeneficio.find(c => c.id === ot?.centro_beneficio_id);
    return ceco?.sociedad_id || cebe?.sociedad_id || null;
  };

  if (Array.isArray(facturas)) {
    facturas
      .filter(f => (!empresaId || !f.empresa_id || f.empresa_id === empresaId)
        && isInPeriod(f.fecha_emision, periodo)
        && f.estado !== 'anulada'
        && ['factura', 'boleta'].includes(f.tipo_documento)
        && matchesSociedad(f.sociedad_id, scopeSociedades))
      .forEach(f => addToBlock(result.er.ingresos, 'Ventas de servicios', f.subtotal, f.moneda || 'PEN'));
  } else {
    (base?.ingresos?.items || []).forEach(item => {
      addToBlock(result.er.ingresos, item.label, item.valor, 'PEN');
    });
    if (!result.er.ingresos.items.length && base?.ingresos?.total) {
      addToBlock(result.er.ingresos, 'Ventas de servicios', base.ingresos.total, 'PEN');
    }
  }

  if (!Array.isArray(facturas)) {
    (base?.costoVentas?.items || []).forEach(item => {
      addToBlock(result.er.costoVentas, item.label, item.valor, 'PEN');
    });
  }

  comprasGastos
    .filter(g =>
      (!empresaId || !g.empresa_id || g.empresa_id === empresaId) &&
      isInPeriod(g.fecha, periodo) &&
      matchesSociedad(g.sociedad_id, scopeSociedades) &&
      !g.es_activo_fijo &&
      inferTipoSistema(g.categoria) !== 'gastos_financieros'
    )
    .forEach(g => addToBlock(result.er.gastosOp, g.categoria || 'Gasto operativo', g.monto, g.moneda || 'PEN'));

  const moReal = ots
    .filter(o => isInPeriod(o.fecha_fin || o.fecha_inicio || o.fecha_programada, periodo)
      && matchesSociedad(o.sociedad_id || sociedadOt(o), scopeSociedades))
    .reduce((s, o) => s + amount(o.costo_real), 0);
  if (moReal > 0) addToBlock(result.er.costoVentas, 'Mano de obra directa', moReal, 'PEN');

  const intereses = comprasGastos.filter(g =>
    (!empresaId || !g.empresa_id || g.empresa_id === empresaId) &&
    isInPeriod(g.fecha, periodo) &&
    matchesSociedad(g.sociedad_id, scopeSociedades) &&

    inferTipoSistema(g.categoria) === 'gastos_financieros'
  );
  intereses.forEach(g => addToBlock(result.er.gastosFin, g.subcategoria || g.descripcion || 'Gastos financieros', g.monto, g.moneda || 'PEN'));

  return finalizeResult(result, {
    ingresos: result.er.ingresos.items.length,
    costos_ot: result.er.costoVentas.items.length,
    compras_gastos: result.er.gastosOp.items.length,
    pagos_financiamiento: result.er.gastosFin.items.length,
  });
}

async function loadFacturas(supabase, empresaId, periodo, cebeIds = [], sociedadIds = null) {
  const { start, next } = periodBounds(periodo);
  const selectedCebes = Array.isArray(cebeIds) ? cebeIds.filter(Boolean) : [];
  let query = supabase
    .from('facturas')
    .select('id, numero, subtotal, igv, total, moneda, fecha_emision, estado, tipo_documento, centro_beneficio_id, sociedad_id')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', start)
    .lt('fecha_emision', next)
    .neq('estado', 'anulada')
    .in('tipo_documento', ['factura', 'boleta']);
  if (selectedCebes.length) query = query.in('centro_beneficio_id', selectedCebes);
  if (sociedadIds) query = query.in('sociedad_id', sociedadIds);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadCostosOt(supabase, empresaId, sociedadIds = null) {
  const [costosR, cierresR] = await Promise.all([
    supabase
      .from('costos_ot')
      .select('id, orden_trabajo_id, mano_obra, materiales, servicios_terceros, logistica, otros, total, moneda, calculado_at, ordenes_trabajo(id, numero, servicio, descripcion, fecha_fin, fecha_programada, centro_costo_id, centro_beneficio_id)')
      .eq('empresa_id', empresaId),
    supabase
      .from('cierres_tecnicos')
      .select('orden_trabajo_id, fecha_cierre')
      .eq('empresa_id', empresaId),
  ]);
  if (costosR.error) throw costosR.error;
  if (cierresR.error) throw cierresR.error;

  const cierreByOt = new Map((cierresR.data || []).map(c => [c.orden_trabajo_id, c.fecha_cierre]));
  let rows = (costosR.data || []).map(c => ({
    ...c,
    fecha_er: cierreByOt.get(c.orden_trabajo_id)
      || c.ordenes_trabajo?.fecha_fin
      || c.ordenes_trabajo?.fecha_programada
      || c.calculado_at?.slice?.(0, 10),
  }));
  if (!sociedadIds) return rows;

  const cecoIds = [...new Set(rows.map(c => c.ordenes_trabajo?.centro_costo_id).filter(Boolean))];
  const cebeIds = [...new Set(rows.map(c => c.ordenes_trabajo?.centro_beneficio_id).filter(Boolean))];
  const [cecosR, cebesR] = await Promise.all([
    cecoIds.length
      ? supabase.from('centros_costo').select('id, sociedad_id').eq('empresa_id', empresaId).in('id', cecoIds)
      : Promise.resolve({ data: [], error: null }),
    cebeIds.length
      ? supabase.from('centros_beneficio').select('id, sociedad_id').eq('empresa_id', empresaId).in('id', cebeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cecosR.error) throw cecosR.error;
  if (cebesR.error) throw cebesR.error;
  const sociedadCeco = new Map((cecosR.data || []).map(c => [c.id, c.sociedad_id]));
  const sociedadCebe = new Map((cebesR.data || []).map(c => [c.id, c.sociedad_id]));
  rows = rows.filter(c => sociedadIds.includes(
    sociedadCeco.get(c.ordenes_trabajo?.centro_costo_id)
      || sociedadCebe.get(c.ordenes_trabajo?.centro_beneficio_id)
  ));
  return rows;
}

async function loadComprasGastos(supabase, empresaId, periodo, effectiveCecoIds, sociedadIds = null) {
  if (effectiveCecoIds && effectiveCecoIds.length === 0) return [];
  const { start, next } = periodBounds(periodo);
  let query = supabase
    .from('compras_gastos')

    .select('id, fecha, descripcion, categoria, subcategoria, monto, moneda, centro_costo_id, ot_vinc_id, es_activo_fijo, estado, cxp_id, periodo_nomina_id, origen_registro, sociedad_id')
    .eq('empresa_id', empresaId)
    .gte('fecha', start)
    .lt('fecha', next);
  if (effectiveCecoIds) query = query.in('centro_costo_id', effectiveCecoIds);
  if (sociedadIds) query = query.in('sociedad_id', sociedadIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter(g => !g.es_activo_fijo && g.estado !== 'anulado');
}

async function loadCxPDevengos(supabase, empresaId, periodo, sociedadIds = null) {
  const { start, next } = periodBounds(periodo);
  let query = supabase
    .from('cxp')
    // Corrección 5: se agrega no_devengar_er al SELECT.
    .select('id, tipo_beneficiario, tipo_comprobante, factura_numero, concepto, fecha_emision, monto_total, monto_bruto, retencion_ir, moneda, estado, origen, motivo_cxp, gasto_id, recepcion_id, recibo_honorarios_id, personal_id, nombre_emisor, nc_id, categoria_er, centro_costo_id, ot_vinc_id, no_devengar_er, sociedad_id')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', start)
    .lt('fecha_emision', next);
  if (sociedadIds) query = query.in('sociedad_id', sociedadIds);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadNomina(supabase, empresaId, periodo, effectiveCecoIds, sociedadIds = null) {
  if (effectiveCecoIds && effectiveCecoIds.length === 0) return [];
  const [year, month] = String(periodo || '').split('-').map(Number);
  let periodosQ = supabase
    .from('periodos_nomina')
    .select('id, periodo, anio, mes, estado, sociedad_id')
    .eq('empresa_id', empresaId);
  if (sociedadIds) periodosQ = periodosQ.in('sociedad_id', sociedadIds);
  if (year && month) periodosQ = periodosQ.or(`periodo.eq.${periodo},and(anio.eq.${year},mes.eq.${month})`);
  const periodosR = await periodosQ;
  if (periodosR.error) throw periodosR.error;

  // Corrección 7: solo períodos cerrados para evitar montos preliminares de períodos abiertos.
  const periodoIds = (periodosR.data || [])
    .filter(p => p.estado === 'cerrado')
    .map(p => p.id);
  if (!periodoIds.length) return [];

  let detalleQ = supabase
    .from('detalle_nomina')
    .select('id, periodo_nomina_id, centro_costo_id, neto, essalud, cts, gratificacion, vacaciones, moneda')
    .eq('empresa_id', empresaId)
    .in('periodo_nomina_id', periodoIds);
  if (effectiveCecoIds) detalleQ = detalleQ.in('centro_costo_id', effectiveCecoIds);
  const detalleR = await detalleQ;
  if (detalleR.error) throw detalleR.error;
  return detalleR.data || [];
}

async function loadPagosFinancieros(supabase, empresaId, periodo, sociedadIds = null) {
  const { start, next } = periodBounds(periodo);
  const pagosR = await supabase
    .from('pagos_financiamiento')
    .select('id, fecha_pago, interes, moneda, financiamientos(sociedad_id)')
    .eq('empresa_id', empresaId)
    .gte('fecha_pago', start)
    .lt('fecha_pago', next);
  if (pagosR.error) throw pagosR.error;
  const pagos = sociedadIds
    ? (pagosR.data || []).filter(p => sociedadIds.includes(p.financiamientos?.sociedad_id))
    : (pagosR.data || []);
  if ((pagosR.data || []).length) return pagos;

  const amortR = await supabase
    .from('tabla_amortizacion')
    .select('id, fecha_pago_real, interes, estado, financiamientos(moneda, sociedad_id)')
    .eq('empresa_id', empresaId)
    .gte('fecha_pago_real', start)
    .lt('fecha_pago_real', next)
    .in('estado', ['pagada', 'pagado']);
  if (amortR.error) throw amortR.error;
  return (amortR.data || [])
    .filter(row => !sociedadIds || sociedadIds.includes(row.financiamientos?.sociedad_id))
    .map(row => ({

    id: row.id,
    fecha_pago: row.fecha_pago_real,
    interes: row.interes,
    moneda: row.financiamientos?.moneda || 'PEN',
    }));
}

// Corrección 1: caja_chica nunca era consultada; los egresos sin gasto_id desaparecían del ER.
async function loadCajaChica(supabase, empresaId, periodo, sociedadIds = null) {
  const { start, next } = periodBounds(periodo);
  let query = supabase
    .from('caja_chica')
    .select('id, fecha, monto, moneda, categoria, gasto_id, estado, sociedad_id')
    .eq('empresa_id', empresaId)
    .gte('fecha', start)
    .lt('fecha', next)
    .neq('estado', 'anulado');
  if (sociedadIds) query = query.in('sociedad_id', sociedadIds);
  const { data, error } = await query;
  if (error) throw error;
  // Excluir registros con gasto_id para no duplicar lo que ya recoge loadComprasGastos.
  return (data || []).filter(r => r.gasto_id == null);
}

// Fallback cuando el tenant no tiene filas en er_categorias (tenant nuevo sin configurar).
const CATS_BASE_FALLBACK = [
  { nombre: 'Mano de obra',       tipo_sistema: 'mano_obra',          seccion: 'costo_ventas',       regla_ot: 'con_ot', es_fallback: true  },
  { nombre: 'Materiales',         tipo_sistema: 'materiales',         seccion: 'costo_ventas',       regla_ot: 'con_ot', es_fallback: true  },
  { nombre: 'Servicios terceros', tipo_sistema: 'servicios_terceros', seccion: 'costo_ventas',       regla_ot: 'con_ot', es_fallback: true  },
  { nombre: 'Logística',          seccion: 'costo_ventas',       regla_ot: 'con_ot'  },
  { nombre: 'Administrativos',    tipo_sistema: 'administrativos',    seccion: 'gastos_operativos',  regla_ot: 'siempre', es_fallback: true },
  { nombre: 'Comerciales',        tipo_sistema: 'comerciales',        seccion: 'gastos_operativos',  regla_ot: 'siempre', es_fallback: true },
  { nombre: 'Gastos financieros', tipo_sistema: 'gastos_financieros', seccion: 'gastos_financieros', regla_ot: 'siempre', es_fallback: true },
];

export async function cargarConfiguracionER(empresaId) {
  if (!isSupabaseMode() || !empresaId) return CATS_BASE_FALLBACK;
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('er_categorias')
      .select('nombre, seccion, regla_ot, tipo_sistema')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('orden');
    if (error || !data?.length) return CATS_BASE_FALLBACK;
    return data;
  } catch {
    return CATS_BASE_FALLBACK;
  }
}

export async function getEstadoResultados({ empresaId, periodo, cecoIds = [], cebeIds = [], sociedadIds = null } = {}) {
  if (!isSupabaseMode()) return emptyResult(periodo);
  if (!empresaId) throw new Error('No hay empresa activa.');

  const supabase = await getSupabaseClient();
  const scopeSociedades = normalizeSociedadIds(sociedadIds);
  const effectiveCecoIds = await resolveCecoFilter(supabase, empresaId, cecoIds, cebeIds, scopeSociedades);
  const result = emptyResult(periodo);

  const [facturas, costosOt, comprasGastos, detalleNomina, pagosFinancieros, cxpDevengos, cajaChica, erConfig] = await Promise.all([
    loadFacturas(supabase, empresaId, periodo, cebeIds, scopeSociedades),
    loadCostosOt(supabase, empresaId, scopeSociedades),
    loadComprasGastos(supabase, empresaId, periodo, effectiveCecoIds, scopeSociedades),
    loadNomina(supabase, empresaId, periodo, effectiveCecoIds, scopeSociedades),
    loadPagosFinancieros(supabase, empresaId, periodo, scopeSociedades),
    loadCxPDevengos(supabase, empresaId, periodo, scopeSociedades),
    loadCajaChica(supabase, empresaId, periodo, scopeSociedades),
    cargarConfiguracionER(empresaId),
  ]);

  const sectionToBlock = {
    costo_ventas:      result.er.costoVentas,
    gastos_operativos: result.er.gastosOp,
    gastos_financieros: result.er.gastosFin,
  };
  const labelByTipo = (tipoSistema, fallback, hasOt = true) =>
    resolverCategoriaPorTipoSistema(erConfig, tipoSistema, { hasOt })?.nombre || fallback;


  facturas.forEach(f => {
    addToBlock(result.er.ingresos, 'Ventas de servicios', f.subtotal, f.moneda);
  });

  costosOt
    .filter(c => c.ordenes_trabajo?.estado !== 'anulada')
    .filter(c => isInPeriod(c.fecha_er, periodo))
    .filter(c => !effectiveCecoIds || matchesIds(c.ordenes_trabajo?.centro_costo_id, effectiveCecoIds))
    .filter(c => !cebeIds?.length || intersectsIds(c.ordenes_trabajo?.centro_beneficio_id, cebeIds))
    .forEach(c => {
      addToBlock(result.er.costoVentas, labelByTipo('mano_obra', 'Mano de obra directa'), c.mano_obra, c.moneda);
      addToBlock(result.er.costoVentas, labelByTipo('materiales', 'Materiales consumidos'), c.materiales, c.moneda);
      addToBlock(result.er.costoVentas, labelByTipo('servicios_terceros', 'Servicios terceros'), c.servicios_terceros, c.moneda);
      addToBlock(result.er.costoVentas, labelByTipo('logistica', 'Logistica directa'), c.logistica, c.moneda);
      addToBlock(result.er.costoVentas, 'Otros costos directos', c.otros, c.moneda);
    });

  const comprasGastosParaEr = detalleNomina.length
    ? comprasGastos.filter(g => !g.periodo_nomina_id && norm(g.origen_registro) !== 'nomina')
    : comprasGastos;

  comprasGastosParaEr.forEach(g => {
    const hasOt = g.ot_vinc_id != null;
    const entry = resolverCategoriaEr(erConfig, g.categoria, { hasOt });
    if (entry) {
      const block = sectionToBlock[entry.seccion] || result.er.gastosOp;
      if (entry.regla_ot === 'con_ot') {
        addToBlock(block, entry.nombre, g.monto, g.moneda);
      } else if (entry.regla_ot === 'sin_ot') {
        if (g.ot_vinc_id == null) {
          addToBlock(block, entry.nombre, g.monto, g.moneda);
        }
      } else {
        addToBlock(block, entry.nombre, g.monto, g.moneda);
      }
    } else if (inferTipoSistema(g.categoria) === 'gastos_financieros') {
      // Categoría financiera sin config explícita — comportamiento original preservado.
      addToBlock(result.er.gastosFin, g.subcategoria || g.descripcion || 'Gastos financieros', g.monto, g.moneda);
    } else {
      // Sin coincidencia en categorías del sistema ni personalizadas: clasificar como Otros gastos.
      addToBlock(result.er.gastosOp, 'Otros gastos', g.monto, g.moneda);
    }
  });

  const hasScopedFilters = Boolean(effectiveCecoIds) || Boolean(cebeIds?.length);
  // La deduplicación usa comprasGastos completo (incluye financieros) para evitar doble conteo de CxPs.
  const cxpDevengosEr = cxpDevengos.filter(cxp => {
    if (!cxpCanDevengarEr(cxp)) return false;
    if (compraCoversCxp(cxp, comprasGastos)) return false;
    if (!hasScopedFilters) return true;
    if (!cxp.centro_costo_id) return false;
    if (effectiveCecoIds && !effectiveCecoIds.includes(cxp.centro_costo_id)) return false;
    return true;
  });
  cxpDevengosEr.forEach(cxp => {
    const label = cxpDevengoLabel(cxp);
    // Corrección 6: CxP con label Gastos financieros (via categoria_er) va a gastosFin, no gastosOp.
    const hasOt = cxp.ot_vinc_id != null;
    const entry = resolverCategoriaEr(erConfig, label, { hasOt });
    const block = entry ? (sectionToBlock[entry.seccion] || result.er.gastosOp) : result.er.gastosOp;
    addToBlock(block, entry?.nombre || label, cxpDevengoAmount(cxp), cxp.moneda);
  });

  detalleNomina.forEach(n => {
    addToBlock(result.er.gastosOp, labelByTipo('planilla', 'Planilla neta', false), n.neto, n.moneda);
    addToBlock(
      result.er.gastosOp,
      labelByTipo('cargas_sociales', 'Cargas sociales', false),
      amount(n.essalud) + amount(n.cts) + amount(n.gratificacion) + amount(n.vacaciones),
      n.moneda
    );
  });

  // Corrección 1: egresos de caja_chica sin gasto_id van a Gastos Operativos.
  cajaChica.forEach(r => {
    addToBlock(result.er.gastosOp, r.categoria || 'Caja chica', r.monto, r.moneda);
  });

  pagosFinancieros.forEach(p => {
    addToBlock(result.er.gastosFin, labelByTipo('intereses_financiamiento', 'Intereses de financiamiento', false), p.interes, p.moneda);

  });

  return finalizeResult(result, {
    facturas: facturas.length,
    costos_ot: costosOt.filter(c => isInPeriod(c.fecha_er, periodo) && c.ordenes_trabajo?.estado !== 'anulada').length,
    compras_gastos: comprasGastosParaEr.length,
    cxp_devengos: cxpDevengosEr.length,
    detalle_nomina: detalleNomina.length,
    pagos_financiamiento: pagosFinancieros.length,
    caja_chica: cajaChica.length,
  });
}

export const ER_SCOPE_MODE = Object.freeze({
  SOCIEDAD: 'sociedad',
  COMPARATIVO: 'comparativo',
  CONSOLIDADO: 'consolidado',
});

export function consolidarEstadosResultados(resultados = [], eliminaciones = [], periodo = '') {
  const result = emptyResult(periodo);
  const sourceCounts = {};

  resultados.filter(Boolean).forEach(data => {
    Object.entries(data.sourceCounts || {}).forEach(([key, value]) => {
      sourceCounts[key] = (sourceCounts[key] || 0) + Number(value || 0);
    });
    ['ingresos', 'costoVentas', 'gastosOp', 'gastosFin', 'depreciacion'].forEach(blockKey => {
      (data.er?.[blockKey]?.items || []).forEach(item => {
        Object.entries(item.totals || {}).forEach(([moneda, value]) => {
          addToBlock(result.er[blockKey], item.label, value, moneda);
        });
      });
    });
  });

  eliminaciones.forEach(op => {
    addToBlock(
      result.er.ingresos,
      '(-) Eliminaciones intercompañía',
      -Math.abs(amount(op.monto)),
      op.moneda || 'PEN'
    );
  });
  sourceCounts.eliminaciones_intercompania = eliminaciones.length;

  const final = finalizeResult(result, sourceCounts);
  final.scopeMode = ER_SCOPE_MODE.CONSOLIDADO;
  final.eliminacionesIntercompania = eliminaciones;
  return final;
}

export async function getEstadoResultadosPorScope({
  empresaId,
  periodo,
  mode = ER_SCOPE_MODE.SOCIEDAD,
  sociedadIds = [],
  cecoIds = [],
  cebeIds = [],
} = {}) {
  const scopeSociedades = normalizeSociedadIds(sociedadIds);
  if (!scopeSociedades) {
    return getEstadoResultados({ empresaId, periodo, cecoIds, cebeIds });
  }

  if (mode === ER_SCOPE_MODE.SOCIEDAD) {
    return getEstadoResultados({
      empresaId,
      periodo,
      cecoIds,
      cebeIds,
      sociedadIds: [scopeSociedades[0]],
    });
  }

  const comparativo = await Promise.all(scopeSociedades.map(async sociedadId => ({
    sociedadId,
    data: await getEstadoResultados({
      empresaId,
      periodo,

      cecoIds,
      cebeIds,
      sociedadIds: [sociedadId],
    }),
  })));

  if (mode === ER_SCOPE_MODE.COMPARATIVO) {
    return { periodo, scopeMode: ER_SCOPE_MODE.COMPARATIVO, comparativo };
  }

  const supabase = await getSupabaseClient();
  const { data: eliminaciones, error } = await supabase
    .from('operaciones_intercompania')
    .select('id, empresa_id, sociedad_origen, sociedad_destino, tipo_operacion, monto, moneda, periodo, concepto, factura_id, cxp_id, guia_remision_id')
    .eq('empresa_id', empresaId)
    .eq('periodo', periodo)
    .in('sociedad_origen', scopeSociedades)
    .in('sociedad_destino', scopeSociedades);
  if (error) throw error;

  return consolidarEstadosResultados(
    comparativo.map(item => item.data),
    eliminaciones || [],
    periodo
  );
}

```

# Anexo B — Componente real de Cotizaciones completo

Ruta: `src/pages_extra.jsx`, `CotizacionesInner` y wrapper.

```jsx
function CotizacionesInner() {
  const {
    cotizaciones, oportunidades, cuentas, contactos, usuarios, osClientes, hojasCosteo, activeParams,
    navigate, crearCotizacion, actualizarCotizacion, aprobarCotizacion, aprobarCotizacionInterna, registrarAprobacionManual,
    crearOSCliente, vincularCotizacionOS, subirVersionCotizacion, searchQuery, empresaConfig, diccionarioComercial = [], addNotificacion,
    authUser, roles, perfilSociedad, sociedadesIdsAlcance
  } = useApp();
  const [osModal, setOsModal] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [filtros, setFiltros] = useState({ cliente: '', oportunidad: '', estado: '', fechaDesde: '', fechaHasta: '' });
  const cotizacionesAlcance = useMemo(
    () => filtrarRegistrosPorAlcanceSociedad(cotizaciones, perfilSociedad, sociedadesIdsAlcance),
    [cotizaciones, perfilSociedad, sociedadesIdsAlcance]
  );

  useEffect(() => {
    if (activeParams?.crear_os && activeParams?.detail) {
      const c = cotizacionesAlcance.find(x => x.id === activeParams.detail);
      if (c && c.estado === 'aprobada') setOsModal(c);
    }
  }, [activeParams?.crear_os, activeParams?.detail, cotizacionesAlcance]);

  const getOpp    = id => oportunidades.find(o => o.id === id);
  const getCuenta = id => cuentas.find(c => c.id === id);
  const getCuentaNombre = id => { const c = getCuenta(id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const getContacto = id => contactos?.find(c => c.id === id);

  // ── Nueva cotización ───────────────────────────────────────────────
  if (activeParams?.active_tab === 'nueva' && activeParams?.opp) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    const hcBase = activeParams.hc_id ? (hojasCosteo || []).find(h => h.id === activeParams.hc_id) : null;
    const itemsHC = hcBase ? construirPartidasDesdeHC(hcBase) : [];
    const subtotalHC = itemsHC.reduce((s, p) => s + toCotNumber(p.subtotal ?? (toCotNumber(p.cantidad) * toCotNumber(p.precio_unitario))), 0);
    const igvHC = Math.round(subtotalHC * 18 / 100);
    const cotBaseDeHC = hcBase ? {
      moneda: opp.moneda || hcBase.moneda,
      igv_pct: 18,
      oportunidad_id: opp.id,
      cuenta_id: opp.cuenta_id,
      hoja_costeo_id: hcBase.id,
      subtotal: subtotalHC,
      base_imponible: subtotalHC,
      igv: igvHC,
      total: subtotalHC + igvHC,
      subtotal_impl: subtotalHC,
      igv_impl: igvHC,
      total_impl: subtotalHC + igvHC,
      items: itemsHC,
    } : null;
    return (
      <EditorCotizacion
        opp={opp}
        cuenta={getCuenta(opp.cuenta_id)}
        cotizacionBase={cotBaseDeHC}
        contactos={(contactos || []).filter(c => c.cuenta_id === opp.cuenta_id)}
        empresaConfig={empresaConfig}
        diccionarioComercial={diccionarioComercial}
        onSave={async (data) => { await crearCotizacion(data); navigate('cotizaciones'); }}
        onCancel={() => navigate('pipeline', { panel: opp.id })}
      />
    );
  }

  // ── Editar borrador ────────────────────────────────────────────────
  if (activeParams?.detail && activeParams?.edit) {
    const cot = cotizacionesAlcance.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp = getOpp(cot.oportunidad_id);
    const cuentaId = cot.cuenta_id || opp?.cuenta_id;
    return (
      <EditorCotizacion
        opp={opp}
        cuenta={getCuenta(cuentaId)}
        cotizacionBase={cot}
        contactos={(contactos || []).filter(c => c.cuenta_id === cuentaId)}
        empresaConfig={empresaConfig}
        diccionarioComercial={diccionarioComercial}
        onSave={async (data) => { await actualizarCotizacion(cot.id, data); navigate('cotizaciones', { detail: cot.id }); }}
        onCancel={() => navigate('cotizaciones', { detail: cot.id })}

      />
    );
  }

  // ── Detalle ────────────────────────────────────────────────────────
  if (activeParams?.detail) {
    const cot = cotizacionesAlcance.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp     = getOpp(cot.oportunidad_id);
    const cuenta  = getCuenta(cot.cuenta_id || opp?.cuenta_id);
    const contacto = getContacto(cot.contacto_id || opp?.contacto_id);

    const handleDescargarPDF = async () => {
      setGenerandoPDF(true);
      try {
        let token = cot.token_aceptacion;
        if (!token) {
          token = crypto.randomUUID();
          actualizarCotizacion(cot.id, { token_aceptacion: token, token_activo: true });
        }
        const cfg = empresaConfig || {};
        const [logoDataUrl, firmaDataUrl, QRCode] = await Promise.all([
          pdfAssetSource({ url: cfg.logo_url, path: cfg.logo_path }),
          pdfAssetSource({ url: cfg.firma_url, path: cfg.firma_path }),
          import('qrcode').then(m => m.default),
        ]);
        const aceptarUrl = (import.meta.env.VITE_APP_URL || window.location.origin) + '/#aceptar/' + token;
        const qrDataUrl = await QRCode.toDataURL(aceptarUrl, { width: 200, margin: 1 });
        const { pdf } = await import('@react-pdf/renderer');
        const { CotizacionPDF } = await import('./pages_pdf.jsx');
        const cfgPDF = {
          ...cfg,
          logo_url: logoDataUrl || cfg.logo_url || undefined,
          firma_url: firmaDataUrl || cfg.firma_url || undefined,
        };
        const blob = await pdf(
          <CotizacionPDF cot={cot} cuenta={cuenta} contacto={contacto} opp={opp} cfg={cfgPDF} qrDataUrl={qrDataUrl} />
        ).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cot.numero}-v${cot.version || 1}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('[PDF]', err);
        addNotificacion('Error al generar el PDF: ' + (err?.message || err));
      } finally {
        setGenerandoPDF(false);
      }
    };

    return (
      <>
        <DetalleCotizacion
          cot={cot} opp={opp} cuenta={cuenta} contacto={contacto} usuarios={usuarios}
          empresaConfig={empresaConfig}
          onBack={() => navigate('cotizaciones')}
          onEdit={() => navigate('cotizaciones', { detail: cot.id, edit: true })}
          onRevertirBorrador={() => actualizarCotizacion(cot.id, { estado: 'borrador' })}
          onCrearVersion={async () => { await subirVersionCotizacion(cot.id); }}
          onEnviar={() => actualizarCotizacion(cot.id, { estado: 'enviada', fecha_envio: new Date().toISOString() })}
          onAprobarInterna={() => aprobarCotizacionInterna(cot.id)}
          onSolicitarAprobacion={() => actualizarCotizacion(cot.id, { estado: 'pendiente_aprobacion' })}
          onCancelarSolicitud={() => actualizarCotizacion(cot.id, { estado: 'borrador' })}
          onAprobar={() => { aprobarCotizacion(cot.id); setOsModal(cot); }}
          onAprobacionManual={async (datos) => { await registrarAprobacionManual(cot.id, datos); }}
          onGenerarOS={() => setOsModal(cot)}
          onDescargarPDF={handleDescargarPDF}
          generandoPDF={generandoPDF}
        />
        {osModal && (
          <CrearOSModal
            cot={osModal}
            opp={oportunidades.find(o => o.id === osModal.oportunidad_id)}
            osClientes={osClientes || []}
            cuentas={cuentas}
            onClose={() => setOsModal(null)}

            onCrearNueva={async (datos) => { await crearOSCliente(osModal.id, datos); setOsModal(null); }}
            onVincularExistente={async (osId) => { await vincularCotizacionOS(osModal.id, osId); setOsModal(null); }}
          />
        )}
      </>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────
  const query = searchQuery.toLowerCase();
  const latestPorNumero = Object.values(
    cotizacionesAlcance.reduce((acc, c) => {
      if (!acc[c.numero] || c.version > acc[c.numero].version) acc[c.numero] = c;
      return acc;
    }, {})
  ).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const filtered = latestPorNumero.filter(c => {
    const opp = getOpp(c.oportunidad_id);
    const ownerUserId = c.responsable_id || opp?.responsable_id || null;
    const ownerName = opp?.responsable || null;
    if (!canUserSeeOwner({ viewer: authUser, ownerUserId, ownerName, users: usuarios, roles })) return false;
    const cliente = getCuentaNombre(c.cuenta_id || opp?.cuenta_id);
    if (query && !c.numero.toLowerCase().includes(query) && !cliente.toLowerCase().includes(query) && !(opp?.nombre || '').toLowerCase().includes(query)) return false;
    if (filtros.cliente && !cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
    if (filtros.oportunidad && !(opp?.nombre || '').toLowerCase().includes(filtros.oportunidad.toLowerCase())) return false;
    if (filtros.estado && c.estado !== filtros.estado) return false;
    if (filtros.fechaDesde && (c.fecha || '') < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && (c.fecha || '') > filtros.fechaHasta) return false;
    return true;
  });
  const filtrosActivos = Object.values(filtros).some(v => v !== '');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cotizaciones</h1>
          <div className="page-sub">{latestPorNumero.length} cotizaciones registradas</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 8, marginBottom: 16 }}>
        <input className="input" placeholder="Buscar por cliente…" value={filtros.cliente} onChange={e => setFiltros(f => ({...f, cliente: e.target.value}))} />
        <input className="input" placeholder="Buscar por oportunidad…" value={filtros.oportunidad} onChange={e => setFiltros(f => ({...f, oportunidad: e.target.value}))} />
        <select className="select" value={filtros.estado} onChange={e => setFiltros(f => ({...f, estado: e.target.value}))}>
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="pendiente_aprobacion">Pendiente aprobación</option>
          <option value="aprobada">Aprobada</option>
          <option value="aceptada">Aceptada</option>
          <option value="convertida">Convertida</option>
          <option value="perdida">Perdida</option>
        </select>
        <input type="date" className="input" value={filtros.fechaDesde} onChange={e => setFiltros(f => ({...f, fechaDesde: e.target.value}))} />
        <input type="date" className="input" value={filtros.fechaHasta} onChange={e => setFiltros(f => ({...f, fechaHasta: e.target.value}))} />
        {filtrosActivos && (
          <button className="btn btn-secondary" onClick={() => setFiltros({ cliente: '', oportunidad: '', estado: '', fechaDesde: '', fechaHasta: '' })}>Limpiar</button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th>{perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD && <th>Sociedad</th>}<th>Cliente</th><th>Oportunidad</th><th>Implementación</th><th>Recurrente/mes</th><th>Fecha</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const opp = getOpp(r.oportunidad_id);
                const cliente = getCuentaNombre(r.cuenta_id || opp?.cuenta_id);
                const impl = r.total_impl || r.total || 0;
                const rec  = r.total_rec || 0;
                return (
                  <tr key={r.id} onClick={() => navigate('cotizaciones', { detail: r.id })} className="hover-row" style={{cursor:'pointer'}}>
                    <td className="mono" style={{fontWeight:600}}>
                      {r.numero}
                      {r.version > 1 && <span className="badge badge-gray" style={{marginLeft:6, fontSize:10, verticalAlign:'middle'}}>v{r.version}</span>}
                    </td>

                    {perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD && <td><SociedadBadge sociedadId={r.sociedad_id} /></td>}
                    <td><strong>{cliente}</strong></td>
                    <td className="text-muted">{opp?.nombre || '—'}</td>
                    <td className="num"><strong>{money(impl, currencySymbol(r.moneda))}</strong></td>
                    <td className="num text-muted">{rec > 0 ? money(rec, currencySymbol(r.moneda)) : '—'}</td>
                    <td className="text-muted">{r.fecha}</td>
                    <td><span className={'badge ' + COT_BADGE(r.estado)}>{r.estado?.replace('_', ' ')}</span></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD ? 8 : 7} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                  {query ? `No se encontraron resultados para "${query}"` : 'No hay cotizaciones registradas.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── QR de aceptación ───────────────────────────────────────────────────
function QRBlock({ token }) {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    if (!token) return;
    const url = (import.meta.env.VITE_APP_URL || window.location.origin) + '/#aceptar/' + token;
    import('qrcode').then(m => m.default.toDataURL(url, { width: 140, margin: 1 })).then(setDataUrl);
  }, [token]);
  return (
    <div style={{textAlign:'center'}}>
      {dataUrl
        ? <img src={dataUrl} alt="QR aceptación" style={{width:120, height:120, border:'1px solid var(--border)', borderRadius:8}}/>
        : <div style={{width:120, height:120, background:'var(--bg-subtle)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--fg-muted)'}}>Generando QR…</div>
      }
      <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:6}}>Escanear para aceptar</div>
    </div>
  );
}

// ── Modal aprobación manual ─────────────────────────────────────────────
const CANALES_APROBACION = [
  'Aprobado por email',
  'Aprobado por WhatsApp',
  'Aprobado en reunión',
  'Aprobado con firma física',
  'Otro',
];

const EVIDENCIA_APROBACION_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const EVIDENCIA_APROBACION_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];
const EVIDENCIA_APROBACION_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
].join(',');
const EVIDENCIA_APROBACION_MAX_BYTES = 10 * 1024 * 1024;

const esEvidenciaAprobacionPermitida = (file) => {
  const tipo = String(file?.type || '').toLowerCase();
  const nombre = String(file?.name || '').toLowerCase();
  return EVIDENCIA_APROBACION_MIMES.includes(tipo) ||
    EVIDENCIA_APROBACION_EXTS.some(ext => nombre.endsWith(ext));
};

const esCanalAprobacionReunion = canal =>
  String(canal || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'aprobado en reunion';

function AprobacionManualModal({ onClose, onConfirmar }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [canal, setCanal]     = useState('');
  const [fecha, setFecha]     = useState(hoy);
  const [notas, setNotas]     = useState('');
  const [archivos, setArchivos] = useState([]);

  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  const agregarArchivos = (e) => {
    const seleccionados = Array.from(e.target.files || []);
    const validos = seleccionados.filter(file =>
      esEvidenciaAprobacionPermitida(file) &&
      Number(file.size || 0) <= EVIDENCIA_APROBACION_MAX_BYTES
    );
    const noPermitidos = seleccionados.filter(file => !esEvidenciaAprobacionPermitida(file));
    const muyPesados = seleccionados.filter(file =>
      esEvidenciaAprobacionPermitida(file) &&
      Number(file.size || 0) > EVIDENCIA_APROBACION_MAX_BYTES
    );

    if (validos.length) setArchivos(prev => [...prev, ...validos]);
    if (noPermitidos.length || muyPesados.length) {
      const partes = [];
      if (noPermitidos.length) partes.push('Solo se permiten archivos PDF, JPG, JPEG o PNG.');
      if (muyPesados.length) partes.push('Cada archivo debe pesar como maximo 10 MB.');
      setError(partes.join(' '));
    } else if (validos.length) {
      setError(null);
    }
    e.target.value = '';
  };
  const quitarArchivo = (i) => setArchivos(prev => prev.filter((_, idx) => idx !== i));

  const handleConfirmar = async () => {
    const canalEsReunion = esCanalAprobacionReunion(canal);
    const notasTrim = notas.trim();
    if (!canal) { setError('Selecciona el canal de aprobación.'); return; }
    if (!fecha) { setError('Indica la fecha de aprobación del cliente.'); return; }
    if (canalEsReunion && !notasTrim) { setError('Ingresa notas adicionales para una aprobacion en reunion.'); return; }
    if (!canalEsReunion && !archivos.length) { setError('Adjunta la evidencia de aprobacion del cliente.'); return; }
    if (archivos.some(file => !esEvidenciaAprobacionPermitida(file))) {
      setError('Solo se permiten archivos PDF, JPG, JPEG o PNG.');
      return;
    }
    if (archivos.some(file => Number(file.size || 0) > EVIDENCIA_APROBACION_MAX_BYTES)) {
      setError('Cada archivo debe pesar como maximo 10 MB.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onConfirmar({ canal, fecha_cliente: fecha, notas: notasTrim || null, archivos });
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la aprobacion.');
    } finally {
      setLoading(false);
    }
  };

  const canalEsReunion = esCanalAprobacionReunion(canal);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:540, width:'100%'}} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{fontSize:16}}>Registrar aprobación del cliente</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:16}}>
          <div className="input-group" style={{margin:0}}>
            <label>Canal de aprobación *</label>
            <select className="input" value={canal} onChange={e => { setCanal(e.target.value); setError(null); }}>
              <option value="">Selecciona un canal…</option>
              {CANALES_APROBACION.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="input-group" style={{margin:0}}>
            <label>Fecha de aprobación del cliente *</label>
            <input type="date" className="input" value={fecha} max={hoy}
              onChange={e => { setFecha(e.target.value); setError(null); }} />
          </div>
          <div className="input-group" style={{margin:0}}>
            <label>Notas adicionales{canalEsReunion ? ' *' : ''}</label>
            <textarea className="input" rows={3} value={notas} onChange={e => { setNotas(e.target.value); setError(null); }}
              placeholder="Contexto sobre cómo se dio la aprobación…" />

          </div>
          <div className="input-group" style={{margin:0}}>
            <label>Adjuntar sustento{canalEsReunion ? ' (opcional)' : ' *'}</label>
            <label style={{display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:6, border:'1px dashed var(--border)', cursor:'pointer', fontSize:13, color:'var(--fg-muted)', background:'var(--bg-subtle)'}}>
              {I.file} Seleccionar archivos (PDF, JPG o PNG)
              <input type="file" multiple accept={EVIDENCIA_APROBACION_ACCEPT} onChange={agregarArchivos} style={{display:'none'}} />
            </label>
            {archivos.length > 0 && (
              <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:5}}>
                {archivos.map((f, i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--bg-subtle)', borderRadius:6, fontSize:13}}>
                    <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.name}</span>
                    <span style={{fontSize:11, color:'var(--fg-muted)', flexShrink:0}}>{(f.size/1024).toFixed(0)} KB</span>
                    <button onClick={() => quitarArchivo(i)} style={{background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:0, lineHeight:1, fontSize:16}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <div style={{color:'var(--danger)', fontSize:13, padding:'8px 12px', background:'#fff0f0', borderRadius:6}}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirmar} disabled={loading}>
            {loading ? 'Registrando…' : 'Confirmar aprobación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detalle (lectura) ──────────────────────────────────────────────────
function DetalleCotizacion({ cot, opp, cuenta, contacto, usuarios, empresaConfig, onBack, onEdit, onRevertirBorrador, onCrearVersion, onEnviar, onAprobarInterna, onSolicitarAprobacion, onCancelarSolicitud, onAprobacionManual, onGenerarOS, onDescargarPDF, generandoPDF }) {
  const partidas = cot.items || cot.partidas || [];
  const hayRecurrente = partidas.some(p => !p.incluido && p.tipo === 'recurrente');
  const [seccionesOpen, setSeccionesOpen] = useState({});
  const toggleSeccion = k => setSeccionesOpen(p => ({ ...p, [k]: !p[k] }));
  const [confirmEnviar, setConfirmEnviar] = useState(false);
  const [showAprobModal, setShowAprobModal] = useState(false);
  const sym = currencySymbol(cot.moneda);
  const calcDetalleTotal = p => toCotNumber(p.total) || (toCotNumber(p.cantidad) * toCotNumber(p.precio_unitario));
  const subtotalDetalleImpl = partidas
    .filter(p => !p.incluido && p.tipo !== 'recurrente')
    .reduce((s, p) => s + calcDetalleTotal(p), 0);
  const subtotalDetalleRec = partidas
    .filter(p => !p.incluido && p.tipo === 'recurrente')
    .reduce((s, p) => s + calcDetalleTotal(p), 0);
  const usarTotalesPartidasHC = !!cot.hoja_costeo_id && subtotalDetalleImpl > 0 && (
    toCotNumber(cot.subtotal_impl ?? cot.subtotal) <= 0 || toCotNumber(cot.total_impl ?? cot.total) <= 0
  );
  const usarTotalesRecPartidasHC = !!cot.hoja_costeo_id && subtotalDetalleRec > 0 && (
    toCotNumber(cot.subtotal_rec) <= 0 || toCotNumber(cot.total_rec) <= 0
  );
  const subtotalImplDetalle = usarTotalesPartidasHC ? subtotalDetalleImpl : (cot.subtotal_impl ?? cot.subtotal);
  const igvImplDetalle = usarTotalesPartidasHC ? Math.round(subtotalDetalleImpl * toCotNumber(cot.igv_pct || 18) / 100) : (cot.igv_impl ?? cot.igv);
  const totalImplDetalle = usarTotalesPartidasHC ? subtotalImplDetalle + igvImplDetalle : (cot.total_impl ?? cot.total);
  const subtotalRecDetalle = usarTotalesRecPartidasHC ? subtotalDetalleRec : cot.subtotal_rec;
  const igvRecDetalle = usarTotalesRecPartidasHC ? Math.round(subtotalDetalleRec * toCotNumber(cot.igv_pct || 18) / 100) : cot.igv_rec;
  const totalRecDetalle = usarTotalesRecPartidasHC ? subtotalRecDetalle + igvRecDetalle : cot.total_rec;

  const { authUser, role } = useApp();
  const cfg = empresaConfig || {};
  const textoCtx = { empresa: cfg, cuenta, cliente: cuenta, contacto, cotizacion: cot, oportunidad: opp };
  const renderComercial = texto => renderTextoComercial(texto, textoCtx);

  const puedeAprobarCot     = role?.permisos?.todo || role?.permisos?.aprobar_descuentos || false;
  const aprobadaInterna     = !!cot.aprobada_interna_por;
  const esBorrador          = cot.estado === 'borrador';
  const esPendiente         = cot.estado === 'pendiente_aprobacion';
  const puedeEditar         = esBorrador && (puedeAprobarCot || !aprobadaInterna);
  const puedeEnviar         = esBorrador && (puedeAprobarCot || aprobadaInterna);
  const mostrarAprobarBtn   = puedeAprobarCot && (esBorrador || esPendiente) && !aprobadaInterna;
  const mostrarSolicitarBtn = !puedeAprobarCot && esBorrador && !aprobadaInterna;

  const vendedor = opp?.responsable_id
    ? (usuarios || []).find(u => u.id === opp.responsable_id)
    : null;
  const vendedorNombre = vendedor?.nombre || opp?.responsable || '—';
  // Fallback: si el responsable es el usuario logueado y no está en la lista (ej. asesor sin permiso de listar usuarios)

  const vendedorEmail = vendedor?.email || (opp?.responsable_id === authUser?.id ? authUser?.email : null) || null;

  const validezTexto = () => {
    if (cot.validez_tipo === 'fecha_exacta' && cot.validez_fecha)
      return `Válida únicamente el día de hoy — ${cot.validez_fecha}`;
    if (cot.validez_dias) return `${cot.validez_dias} días`;
    return cot.validez || '—';
  };

  const COND_SECTIONS = [
    ['cond_forma_pago', 'Forma de pago y datos bancarios'],
    ['cond_validez', 'Validez de la oferta'],
    ['cond_penalidad', 'Penalidad por mora'],
    ['cond_inicio_proyecto', 'Inicio del proyecto'],
    ['cond_alcance', 'Alcance y exclusiones'],
    ['cond_integraciones', 'Integraciones externas'],
    ['cond_confidencialidad', 'Confidencialidad'],
  ].filter(([k]) => cot[k] || cfg[k]);

  const historial = cot.historial_versiones || [];

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onBack} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
          <h1 className="page-title row" style={{gap:10, alignItems:'center'}}>
            {cot.numero}
            <span className="badge badge-gray" style={{fontSize:12}}>v{cot.version || 1}</span>
            <span className={'badge ' + COT_BADGE(cot.estado)}>{cot.estado?.replace('_', ' ')}</span>
          </h1>
          <div className="page-sub">
            {opp?.nombre && <>Oportunidad: <strong>{opp.nombre}</strong> · </>}
            Cliente: <strong>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</strong>
            {cuenta?.ruc && <> · RUC: {cuenta.ruc}</>}
          </div>
        </div>
        <div className="row">
          {puedeEditar && <button className="btn btn-secondary" onClick={onEdit}>{I.edit} Editar</button>}
          {mostrarSolicitarBtn && (
            <button className="btn btn-secondary" onClick={onSolicitarAprobacion} style={{color:'var(--orange)', borderColor:'var(--orange)'}}>
              ⏫ Solicitar aprobación
            </button>
          )}
          {esPendiente && !puedeAprobarCot && (
            <button className="btn btn-ghost" onClick={onCancelarSolicitud} style={{color:'var(--fg-muted)'}}>
              ✕ Cancelar solicitud
            </button>
          )}
          {mostrarAprobarBtn && (
            <button className="btn btn-secondary" onClick={onAprobarInterna} style={{color:'var(--cyan)', borderColor:'var(--cyan)'}}>
              ✓ Aprobar para envío
            </button>
          )}
          {esBorrador && (
            <button
              className="btn btn-primary"
              onClick={() => setConfirmEnviar(true)}
              disabled={!puedeEnviar}
              title={!puedeEnviar ? 'Pendiente de aprobación del jefe comercial' : ''}
              style={!puedeEnviar ? {opacity:0.45, cursor:'not-allowed'} : {}}
            >
              {I.send} Enviar a cliente
            </button>
          )}
          {cot.estado === 'enviada' && puedeAprobarCot && <button className="btn btn-ghost" onClick={onRevertirBorrador} style={{color:'var(--text-muted)'}}>↩ Revertir a borrador</button>}
          {cot.estado === 'enviada' && <button className="btn btn-secondary" onClick={() => setShowAprobModal(true)}>{I.check} Aprobar manualmente</button>}
          {cot.estado === 'aprobada' && <button className="btn btn-primary" onClick={onGenerarOS}>{I.clipboard} Generar OS</button>}
          {puedeAprobarCot && <button className="btn btn-secondary" onClick={onCrearVersion}>{I.plus} Nueva versión</button>}
          <button className="btn btn-secondary" onClick={onDescargarPDF} disabled={generandoPDF}>{I.download} {generandoPDF ? 'Generando…' : 'PDF'}</button>
        </div>
      </div>

      {/* Bloque 1 — Encabezado */}
      <div className="card mt-6">
        <div className="card-body">
          {/* Fila 1: datos del documento */}
          <div className="grid-4" style={{marginBottom:16}}>
            <div><div className="eyebrow">Fecha emisión</div><div style={{fontWeight:600, marginTop:4}}>{cot.fecha}</div></div>
            <div><div className="eyebrow">Moneda</div><div style={{fontWeight:600, marginTop:4}}>{cot.moneda}</div></div>

            <div><div className="eyebrow">Validez</div><div style={{fontWeight:600, marginTop:4}}>{validezTexto()}</div></div>
            <div><div className="eyebrow">Attn. (contacto cliente)</div><div style={{fontWeight:600, marginTop:4}}>{contacto?.nombre || '—'}</div></div>
          </div>
          {/* Fila 2: datos internos */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, paddingTop:14, borderTop:'1px solid var(--border)'}}>
            <div>
              <div className="eyebrow">Vendedor responsable</div>
              <div style={{fontWeight:600, marginTop:4}}>{vendedorNombre}</div>
            </div>
            <div>
              <div className="eyebrow">Email vendedor</div>
              <div style={{marginTop:4}}>
                {vendedorEmail
                  ? <a href={`mailto:${vendedorEmail}`} style={{color:'var(--cyan)', textDecoration:'none', fontWeight:600}}>{vendedorEmail}</a>
                  : <span style={{color:'var(--fg-muted)'}}>—</span>}
              </div>
            </div>
            <div>
              <div className="eyebrow">Enviada al cliente</div>
              <div style={{fontWeight:600, marginTop:4}}>
                {cot.fecha_envio ? new Date(cot.fecha_envio).toLocaleString('es-PE') : <span style={{color:'var(--fg-muted)'}}>—</span>}
              </div>
            </div>
          </div>
          {esBorrador && !aprobadaInterna && !puedeAprobarCot && (
            <div style={{marginTop:14, padding:'10px 14px', background:'#fff8e1', borderRadius:8, borderLeft:'3px solid #f59e0b', fontSize:13, color:'#92400e', display:'flex', alignItems:'center', gap:8}}>
              ⏳ <span>Usa <strong>Solicitar aprobación</strong> para que la jefatura comercial revise esta cotización antes de enviarla al cliente.</span>
            </div>
          )}
          {esPendiente && (
            <div style={{marginTop:14, padding:'10px 14px', background:'#fff7ed', borderRadius:8, borderLeft:'3px solid var(--orange)', fontSize:13, color:'#9a3412', display:'flex', alignItems:'center', gap:8}}>
              ⏳ <span><strong>Pendiente de revisión</strong> — la jefatura comercial debe aprobar esta cotización para que puedas enviarla al cliente.{puedeAprobarCot ? ' Usa el botón "Aprobar para envío" de arriba.' : ''}</span>
            </div>
          )}
          {aprobadaInterna && (
            <div style={{marginTop:14, padding:'10px 14px', background:'#f0fdf4', borderRadius:8, borderLeft:'3px solid var(--green)', fontSize:13, color:'#166534', display:'flex', alignItems:'center', gap:8}}>
              ✓ <span>Aprobada para envío por <strong>{cot.aprobada_interna_por}</strong>{cot.aprobada_interna_at ? ` · ${new Date(cot.aprobada_interna_at).toLocaleDateString('es-PE')}` : ''}</span>
            </div>
          )}
          {cot.descripcion_general && (
            <div style={{marginTop:16, padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid var(--cyan)', fontSize:14, lineHeight:'1.6'}}>
              {renderComercial(cot.descripcion_general)}
            </div>
          )}
        </div>
      </div>

      {/* Bloque 2 — Partidas */}
      <div className="card mt-4">
        <div className="card-body">
          <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Partidas</h3>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th style={{width:36}}>N°</th><th>Descripción</th><th>Tipo</th><th style={{width:70}}>Cant.</th><th style={{width:110}}>Det. cant.</th><th style={{width:130}}>P. Unit.</th><th style={{width:120}}>Total</th></tr>
              </thead>
              <tbody>
                {partidas.map((p, i) => (
                  <tr key={p.id || i}>
                    <td className="num text-muted">{p.n || i + 1}</td>
                    <td>
                      <div style={{fontWeight:600}}>{renderComercial(p.descripcion) || 'Sin descripción'}</div>
                      {(Array.isArray(p.detalle_items) ? p.detalle_items : []).length > 0 && (
                        <ul style={{margin:'4px 0 0 16px', padding:0, fontSize:12, color:'var(--fg-muted)', lineHeight:'1.5'}}>
                          {p.detalle_items.map((d, j) => <li key={j}>{renderComercial(d)}</li>)}
                        </ul>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.tipo==='recurrente'?'badge-purple':p.tipo==='bien'?'badge-orange':'badge-cyan'}`}>
                        {p.tipo || 'servicio'}
                      </span>
                    </td>
                    <td className="num">{p.cantidad}</td>
                    <td className="text-muted" style={{fontSize:12}}>{renderComercial(p.detalle_cantidad) || '—'}</td>
                    <td className="num">{p.incluido ? <span className="badge badge-gray">Incluido</span> : money(p.precio_unitario || 0, sym)}</td>
                    <td className="num" style={{fontWeight:600}}>{p.incluido ? '—' : money(p.total || (p.cantidad * p.precio_unitario), sym)}</td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        </div>
      </div>

      {/* Bloque 3 — Totales */}
      <div className="card mt-4">
        <div className="card-body">
          <div className={hayRecurrente ? 'grid-2' : ''} style={{gap:24, maxWidth: hayRecurrente ? '100%' : 380, marginLeft:'auto'}}>
            <div>
              {hayRecurrente && <div className="eyebrow" style={{marginBottom:12}}>Implementación</div>}
              <TotalesBox subtotal={subtotalImplDetalle} igvPct={cot.igv_pct || 18} igv={igvImplDetalle} total={totalImplDetalle} sym={sym} />
            </div>
            {hayRecurrente && (
              <div>
                <div className="eyebrow" style={{marginBottom:12}}>Recurrente mensual</div>
                <TotalesBox subtotal={subtotalRecDetalle} igvPct={cot.igv_pct || 18} igv={igvRecDetalle} total={totalRecDetalle} suffix="/mes" sym={sym} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bloque 4 — Hitos de pago */}
      {cot.hitos_activos && (cot.hitos_pago || []).length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Hitos de pago</h3>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>N°</th><th>Concepto</th><th>%</th><th>Monto</th><th>Condición / vencimiento</th></tr></thead>
                <tbody>
                  {cot.hitos_pago.map((h, i) => (
                    <tr key={h.id || i}>
                      <td className="num text-muted">{i + 1}</td>
                      <td style={{fontWeight:600}}>{renderComercial(h.concepto)}</td>
                      <td className="num">{h.porcentaje}%</td>
                      <td className="num" style={{fontWeight:600}}>{money(h.monto, sym)}</td>
                      <td className="text-muted" style={{fontSize:13}}>{renderComercial(h.condicion) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cot.glosa_factura && (
              <div style={{marginTop:16, padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
                <div className="eyebrow" style={{marginBottom:4}}>Glosa recomendada para facturas</div>
                {renderComercial(cot.glosa_factura)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bloque 5 — Condiciones comerciales */}
      {COND_SECTIONS.length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Condiciones comerciales</h3>
            {COND_SECTIONS.map(([key, label]) => {
              const texto = renderComercial(cot[key] || cfg[key]);
              if (!texto) return null;
              const open = seccionesOpen[key] !== false;
              return (
                <div key={key} style={{marginBottom:10, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden'}}>
                  <button type="button"
                    style={{width:'100%', textAlign:'left', padding:'10px 14px', background:'var(--bg-subtle)', border:'none', cursor:'pointer', fontWeight:600, fontSize:14, display:'flex', justifyContent:'space-between'}}
                    onClick={() => toggleSeccion(key)}>
                    {label}<span style={{color:'var(--fg-muted)', fontSize:12}}>{open ? '▲' : '▼'}</span>
                  </button>
                  {open && <div style={{padding:'10px 14px', fontSize:13, lineHeight:'1.6', whiteSpace:'pre-wrap'}}>{texto}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bloque 6 — Firmas */}
      <div className="card mt-4">

        <div className="card-body">
          <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Página de cierre — Firmas</h3>
          <div className="grid-2" style={{gap:40}}>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cfg.razon_social || 'TIDEO'}</div>
              {cfg.firma_url && <img src={cfg.firma_url} alt="Firma" style={{maxHeight:60, marginBottom:8, display:'block', margin:'0 auto 8px'}} />}
              <div style={{borderTop:'1px solid var(--border-strong)', paddingTop:8, fontWeight:600}}>{cfg.firmante || '(sin configurar)'}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.cargo_firmante}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.email_comercial}</div>
            </div>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente'}</div>
              <div style={{height:60, display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                <div style={{width:'80%', borderBottom:'1px solid var(--border-strong)'}}></div>
              </div>
              <div style={{paddingTop:8, fontWeight:600}}>{contacto?.nombre || '—'}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>Sello y firma</div>
              <div style={{marginTop:8, width:'50%', margin:'8px auto 0', borderBottom:'1px solid var(--border)', paddingBottom:4, fontSize:12, color:'var(--fg-muted)'}}>Fecha</div>
            </div>
          </div>
        </div>
      </div>

      {/* QR de aceptación digital */}
      {cot.token_aceptacion && cot.token_activo !== false && !cot.aceptacion_fecha && (
        <div className="card mt-4">
          <div className="card-body row" style={{gap:24, alignItems:'flex-start', flexWrap:'wrap'}}>
            <div style={{flex:1, minWidth:220}}>
              <h3 style={{marginBottom:6}}>Aceptación digital</h3>
              <div className="text-muted" style={{fontSize:13, lineHeight:1.6}}>
                El cliente puede escanear el código QR para revisar y aceptar la cotización digitalmente desde su dispositivo. No necesita cuenta en el sistema.
              </div>
              <div style={{marginTop:12, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:6, fontSize:12, fontFamily:'monospace', wordBreak:'break-all', color:'var(--fg-muted)'}}>
                {window.location.origin}/#aceptar/{cot.token_aceptacion}
              </div>
            </div>
            <QRBlock token={cot.token_aceptacion} />
          </div>
        </div>
      )}

      {/* Bloque: Aprobación digital (vía QR) */}
      {cot.aceptacion_fecha && (
        <div className="card mt-4" style={{borderLeft:'4px solid var(--green)'}}>
          <div className="card-body">
            <div className="row" style={{alignItems:'center', gap:10, marginBottom:12}}>
              <h3 style={{margin:0, color:'var(--green)'}}>✓ Aprobación registrada</h3>
              <span className="badge badge-green">Aprobación digital</span>
            </div>
            <div className="grid-4" style={{fontSize:13}}>
              <div><div className="eyebrow">Aceptado por</div><div style={{fontWeight:600, marginTop:4}}>{cot.aceptacion_nombre || '—'}</div></div>
              <div><div className="eyebrow">DNI</div><div style={{fontWeight:600, marginTop:4}}>{cot.aceptacion_dni || '—'}</div></div>
              <div><div className="eyebrow">Fecha y hora</div><div style={{fontWeight:600, marginTop:4}}>{new Date(cot.aceptacion_fecha).toLocaleString('es-PE')}</div></div>
              <div><div className="eyebrow">IP registrada</div><div style={{fontWeight:600, marginTop:4, fontSize:11, fontFamily:'monospace'}}>{cot.aceptacion_ip || '—'}</div></div>
            </div>
          </div>
        </div>
      )}

      {/* Bloque: Aprobación manual (registrada por vendedor) */}
      {cot.aprobacion_tipo === 'manual' && (
        <div className="card mt-4" style={{borderLeft:'4px solid var(--green)'}}>
          <div className="card-body">
            <div className="row" style={{alignItems:'center', gap:10, marginBottom:16}}>
              <h3 style={{margin:0, color:'var(--green)'}}>✓ Aprobación registrada</h3>
              <span className="badge badge-cyan">Aprobación manual</span>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, fontSize:13}}>
              <div><div className="eyebrow">Canal</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_canal || '—'}</div></div>
              <div><div className="eyebrow">Fecha aprobación cliente</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_fecha_cliente || '—'}</div></div>
              <div><div className="eyebrow">Registrado por</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_registrada_por || '—'}</div></div>
              <div><div className="eyebrow">Fecha y hora de registro</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_registrada_at ? new Date(cot.aprobacion_registrada_at).toLocaleString('es-PE') : '—'}</div></div>
              {cot.aprobacion_notas && (
                <div style={{gridColumn:'span 2'}}><div className="eyebrow">Notas</div><div style={{marginTop:4}}>{cot.aprobacion_notas}</div></div>
              )}
            </div>
            {(cot.aprobacion_archivos || []).length > 0 && (
              <div style={{marginTop:14}}>
                <div className="eyebrow" style={{marginBottom:8}}>Archivos adjuntos</div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>

                  {(cot.aprobacion_archivos || []).map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                      style={{display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'var(--bg-subtle)', borderRadius:6, fontSize:13, textDecoration:'none', color:'var(--cyan)'}}>
                      {I.download}
                      <span style={{flex:1}}>{a.nombre}</span>
                      <span style={{fontSize:11, color:'var(--fg-muted)'}}>{a.tamanio ? (a.tamanio/1024).toFixed(0)+' KB' : ''}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Aprobar manualmente */}
      {showAprobModal && (
        <AprobacionManualModal
          onClose={() => setShowAprobModal(false)}
          onConfirmar={async (datos) => {
            await onAprobacionManual(datos);
            setShowAprobModal(false);
          }}
        />
      )}

      {/* Historial de versiones */}
      {historial.length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <h3 style={{marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Historial de versiones</h3>
            {historial.map((h, i) => (
              <div key={i} className="row" style={{justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border-subtle)', fontSize:13}}>
                <span className="badge badge-gray">v{h.version}</span>
                <span className="text-muted">{h.fecha}</span>
                <span className="num">{money(h.total, sym)}</span>
                <span className="text-muted mono" style={{fontSize:11}}>{h.cotizacion_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal confirmación envío */}
      {confirmEnviar && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:460}}>
            <div className="modal-head">
              <h2>Enviar cotización</h2>
              <button className="icon-btn" onClick={() => setConfirmEnviar(false)}>{I.x}</button>
            </div>
            <div className="modal-body col" style={{gap:20}}>
              <p style={{margin:0, lineHeight:'1.6'}}>¿Confirmas que esta cotización fue enviada al cliente? A partir de este momento quedará bloqueada para edición.</p>
              <div className="row" style={{gap:8, justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={() => setConfirmEnviar(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => { onEnviar(); setConfirmEnviar(false); }}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Totales helper ──────────────────────────────────────────────────────
function TotalesBox({ subtotal, igvPct, igv, total, suffix = '', sym = 'S/' }) {
  return (
    <div style={{padding:16, background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)'}}>
      <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
        <span className="text-muted">Subtotal s/ IGV</span><span className="num">{money(subtotal || 0, sym)}{suffix}</span>
      </div>
      <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
        <span className="text-muted">IGV ({igvPct}%)</span><span className="num">{money(igv || 0, sym)}{suffix}</span>
      </div>
      <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}>
        <span>Total{suffix === '/mes' ? ' mensual' : ''}</span><span className="num">{money(total || 0, sym)}{suffix}</span>
      </div>
    </div>
  );

}

// ── Editor (crear o editar borrador) ───────────────────────────────────
function EditorCotizacion({ opp, cuenta, cotizacionBase, contactos, empresaConfig, diccionarioComercial = [], onSave, onCancel }) {
  const { centrosBeneficio, monedasActivas, empresa } = useApp();
  const cfg     = empresaConfig || {};
  const isEdit  = !!(cotizacionBase?.id);
  const cebesActivos = (centrosBeneficio || []).filter(c => c.estado === 'activo');
  const contactosCuenta = contactos || [];
  const contactoPrincipalCuenta = contactosCuenta.find(c => c.principal || c.es_principal);
  const contactosOrdenados = [...contactosCuenta].sort((a, b) => {
    const aPrincipal = a.principal || a.es_principal ? 1 : 0;
    const bPrincipal = b.principal || b.es_principal ? 1 : 0;
    if (aPrincipal !== bPrincipal) return bPrincipal - aPrincipal;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''));
  });

  // ── Bloque 1 ────────────────────────────────────────────────────────
  const [numeroCot,   setNumeroCot]   = useState(cotizacionBase?.numero      || '');
  const [moneda,      setMoneda]      = useState(() => normalizeCurrencyCode(cotizacionBase?.moneda || opp?.moneda || 'PEN'));
  const [igvPct,      setIgvPct]      = useState(cotizacionBase?.igv_pct     || 18);
  const [validezTipo, setValidezTipo] = useState(cotizacionBase?.validez_tipo  || 'dias');
  const [validezDias, setValidezDias] = useState(cotizacionBase?.validez_dias  || 30);
  const [validezFecha,setValidezFecha]= useState(cotizacionBase?.validez_fecha || '');
  const [contactoId,  setContactoId]  = useState(cotizacionBase?.contacto_id || contactoPrincipalCuenta?.id || opp?.contacto_id || contactosCuenta[0]?.id || '');
  const [cebeId,      setCebeId]      = useState(cotizacionBase?.centro_beneficio_id || '');
  const [sociedadId,  setSociedadId]  = useState(cotizacionBase?.sociedad_id || '');
  const [descripcion, setDescripcion] = useState(cotizacionBase?.descripcion_general || '');
  const opcionesMoneda = (monedasActivas || [])
    .map(m => ({ ...m, codigo: normalizeCurrencyCode(m.codigo) }))
    .filter((m, idx, arr) => m.codigo && arr.findIndex(x => x.codigo === m.codigo) === idx);
  const monedaNormalizada = normalizeCurrencyCode(moneda);
  const monedaActual = opcionesMoneda.some(m => m.codigo === monedaNormalizada)
    ? monedaNormalizada
    : (opcionesMoneda[0]?.codigo || monedaNormalizada);

  useEffect(() => {
    if (isEdit || contactoId || !contactoPrincipalCuenta?.id) return;
    setContactoId(contactoPrincipalCuenta.id);
  }, [isEdit, contactoId, contactoPrincipalCuenta?.id]);

  // ── Bloque 2: partidas ───────────────────────────────────────────────
  const normalizeTipoPartida = p => ['material', 'servicio', 'bien', 'recurrente'].includes(String(p?.tipo || p?.tipo_partida || '').toLowerCase())
    ? String(p?.tipo || p?.tipo_partida || '').toLowerCase()
    : 'servicio';
  const emptyPartida = () => ({ id: Date.now() + Math.random(), descripcion: '', detalle_items_txt: '', tipo: 'servicio', detalle_cantidad: '', cantidad: 1, precio_unitario: '', incluido: false });

  const [partidas, setPartidas] = useState(() => {
    if (cotizacionBase?.items?.length) {
      return cotizacionBase.items.map(p => ({
        ...p,
        tipo: normalizeTipoPartida(p),
        cantidad: toCotNumber(p.cantidad),
        precio_unitario: toCotNumber(p.precio_unitario),
        detalle_items_txt: Array.isArray(p.detalle_items) ? p.detalle_items.join('\n') : (p.detalle || '')
      }));
    }
    return [{ ...emptyPartida(), descripcion: opp?.servicio_interes || opp?.nombre || '', precio_unitario: Number(opp?.monto_estimado || 0) }];
  });

  const addPartida     = () => setPartidas(p => [...p, emptyPartida()]);
  const removePartida  = id => setPartidas(p => p.filter(x => x.id !== id));
  const updatePartida  = (id, field, value) => setPartidas(p => p.map(x => x.id === id ? { ...x, [field]: value } : x));
  const movePartida    = (idx, dir) => setPartidas(prev => {
    const arr = [...prev]; [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]]; return arr;
  });
  const addFromCatalogo = srv => setPartidas(prev => [...prev, {
    ...emptyPartida(), id: Date.now(),
    descripcion: srv.descripcion,
    detalle_items_txt: (srv.entregables || []).join('\n'),
    precio_unitario: srv.precio || 0,
    incluido: srv.precio_incluido || false,
  }]);

  // ── Bloque 3: cálculos ───────────────────────────────────────────────
  const pImpl = partidas.filter(p => !p.incluido && p.tipo !== 'recurrente');
  const pRec  = partidas.filter(p => !p.incluido && p.tipo === 'recurrente');
  const calcPartidaTotal = p => toCotNumber(p.cantidad) * toCotNumber(p.precio_unitario);
  const subtImpl  = pImpl.reduce((s, p) => s + calcPartidaTotal(p), 0);
  const igvImpl   = Math.round(subtImpl * toCotNumber(igvPct) / 100);

  const totalImpl = subtImpl + igvImpl;
  const subtRec   = pRec.reduce((s, p) => s + calcPartidaTotal(p), 0);
  const igvRec    = Math.round(subtRec * toCotNumber(igvPct) / 100);
  const totalRec  = subtRec + igvRec;

  // ── Bloque 4: hitos ─────────────────────────────────────────────────
  const [hitosActivos, setHitosActivos] = useState(cotizacionBase?.hitos_activos || false);
  const [hitos, setHitos]               = useState(cotizacionBase?.hitos_pago   || []);
  const [glosa, setGlosa]               = useState(cotizacionBase?.glosa_factura ?? cfg.cond_glosa_factura ?? '');
  const sumPct = hitos.reduce((s, h) => s + Number(h.porcentaje || 0), 0);

  const addHito    = () => setHitos(p => [...p, { id: Date.now(), concepto: '', porcentaje: 0, condicion: '' }]);
  const removeHito = id => setHitos(p => p.filter(h => h.id !== id));
  const updateHito = (id, f, v) => setHitos(p => p.map(h => h.id === id ? { ...h, [f]: v } : h));

  // ── Bloque 5: condiciones ────────────────────────────────────────────
  const [conds, setConds] = useState({
    forma_pago:       cotizacionBase?.cond_forma_pago       ?? cfg.cond_forma_pago       ?? '',
    validez:          cotizacionBase?.cond_validez          ?? cfg.cond_validez          ?? '',
    penalidad:        cotizacionBase?.cond_penalidad        ?? cfg.cond_penalidad        ?? '',
    inicio_proyecto:  cotizacionBase?.cond_inicio_proyecto  ?? cfg.cond_inicio_proyecto  ?? '',
    alcance:          cotizacionBase?.cond_alcance          ?? cfg.cond_alcance          ?? '',
    integraciones:    cotizacionBase?.cond_integraciones    ?? cfg.cond_integraciones    ?? '',
    confidencialidad: cotizacionBase?.cond_confidencialidad ?? cfg.cond_confidencialidad ?? '',
  });
  const setCond = (k, v) => setConds(p => ({ ...p, [k]: v }));

  const COND_LABELS = [
    ['forma_pago',       'Forma de pago y datos bancarios'],
    ['validez',          'Validez de la oferta'],
    ['penalidad',        'Penalidad por mora'],
    ['inicio_proyecto',  'Inicio del proyecto'],
    ['alcance',          'Alcance y exclusiones'],
    ['integraciones',    'Integraciones externas'],
    ['confidencialidad', 'Confidencialidad'],
  ];

  // ── Guardar ──────────────────────────────────────────────────────────
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  const handleSave = async () => {
    if (empresa?.multisociedad_habilitado && !sociedadId) {
      alert('Selecciona una sociedad para la cotización.');
      return;
    }
    if (hitosActivos && Math.abs(sumPct - 100) > 0.01) {
      alert(`Los porcentajes de hitos suman ${sumPct.toFixed(1)}%. Deben sumar exactamente 100%.`);
      return;
    }
    setGuardando(true);
    setErrorGuardar('');
    const items = partidas.map((p, i) => ({
      id: p.id, n: i + 1,
      descripcion: p.descripcion,
      detalle_items: (p.detalle_items_txt || '').split('\n').map(s => s.trim()).filter(Boolean),
      tipo: p.tipo,
      detalle_cantidad: p.detalle_cantidad || '',
      cantidad: toCotNumber(p.cantidad),
      precio_unitario: p.incluido ? 0 : toCotNumber(p.precio_unitario),
      total: p.incluido ? 0 : calcPartidaTotal(p),
      incluido: p.incluido || false,
    }));
    try {
      await onSave({
        oportunidad_id: cotizacionBase?.oportunidad_id || opp?.id,
        cuenta_id:      cotizacionBase?.cuenta_id      || opp?.cuenta_id,
        contacto_id:    contactoId || null,
        centro_beneficio_id: cebeId || null,
        sociedad_id: empresa?.multisociedad_habilitado ? sociedadId : null,
        ...(isEdit && numeroCot ? { numero: numeroCot.trim() } : {}),
        moneda: monedaActual, igv_pct: toCotNumber(igvPct),
        validez_tipo: validezTipo,
        validez_dias: Number(validezDias),
        validez_fecha: validezTipo === 'fecha_exacta' ? validezFecha : null,
        descripcion_general: descripcion,
        hoja_costeo_id: cotizacionBase?.hoja_costeo_id || null,
        items,
        subtotal: subtImpl + subtRec, base_imponible: subtImpl,
        igv: igvImpl, total: totalImpl,

        subtotal_impl: subtImpl, igv_impl: igvImpl, total_impl: totalImpl,
        subtotal_rec: subtRec,   igv_rec: igvRec,   total_rec: totalRec,
        hitos_activos: hitosActivos,
        hitos_pago: hitosActivos ? hitos.map(h => ({ ...h, monto: Math.round(totalImpl * Number(h.porcentaje || 0) / 100) })) : [],
        glosa_factura:         glosa || null,
        cond_forma_pago:       conds.forma_pago       || null,
        cond_validez:          conds.validez          || null,
        cond_penalidad:        conds.penalidad        || null,
        cond_inicio_proyecto:  conds.inicio_proyecto  || null,
        cond_alcance:          conds.alcance          || null,
        cond_integraciones:    conds.integraciones    || null,
        cond_confidencialidad: conds.confidencialidad || null,
      });
    } catch (err) {
      setErrorGuardar(err?.message || 'No se pudo guardar la cotización. Verifica tus permisos.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver</button>
          <h1 className="page-title">{isEdit ? `Editar ${cotizacionBase.numero} v${cotizacionBase.version}` : 'Nueva Cotización'}</h1>
          <div className="page-sub">
            {opp && <>Oportunidad: <strong>{opp.nombre}</strong> · </>}
            Cliente: <strong>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</strong>
            {cuenta?.ruc && <> · RUC: {cuenta.ruc}</>}
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8}}>
          <div className="row">
            <button className="btn btn-secondary" onClick={onCancel} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={guardando}>
              {guardando ? 'Guardando…' : <>{I.save} Guardar cotización</>}
            </button>
          </div>
          {errorGuardar && <span style={{fontSize:12, color:'var(--red)', maxWidth:320, textAlign:'right'}}>{errorGuardar}</span>}
        </div>
      </div>

      {/* ── Bloque 1: encabezado ──────────────────────────────────────── */}
      <div className="card mt-6">
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:16}}>Encabezado</div>
          {isEdit && (
            <div className="input-group" style={{marginBottom:16, maxWidth:280}}>
              <label>Número de cotización</label>
              <input className="input mono" value={numeroCot} onChange={e => setNumeroCot(e.target.value)} placeholder="Ej. COT-2026-0502" />
            </div>
          )}
          <div className="grid-3" style={{gap:16, marginBottom:16}}>
            <div className="input-group">
              <label>Moneda</label>
              <select className="select" value={monedaActual} onChange={e => setMoneda(normalizeCurrencyCode(e.target.value))}>
                {opcionesMoneda.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>IGV (%)</label>
              <input type="number" className="input" value={igvPct} min="0" max="30" step="0.1" onChange={e => setIgvPct(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Attn. (contacto)</label>
              <select className="select" value={contactoId} onChange={e => setContactoId(e.target.value)}>
                <option value="">Sin contacto específico</option>
                {contactosOrdenados.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? ` (${c.cargo})` : ''}{(c.principal || c.es_principal) ? ' - Principal' : ''}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>CEBE</label>
              <select className="select" value={cebeId} onChange={e => setCebeId(e.target.value)}>
                <option value="">Sin CEBE asociado</option>
                {cebesActivos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
              </select>
            </div>
            <SociedadFormField value={sociedadId} onChange={setSociedadId} />

          </div>
          <div className="grid-2" style={{gap:16, marginBottom:16}}>
            <div className="input-group">
              <label>Tipo de validez</label>
              <select className="select" value={validezTipo} onChange={e => setValidezTipo(e.target.value)}>
                <option value="dias">Número de días</option>
                <option value="fecha_exacta">Fecha exacta ("válida solo hoy")</option>
              </select>
            </div>
            <div className="input-group">
              {validezTipo === 'dias' ? (
                <>
                  <label>Días de validez</label>
                  <select className="select" value={validezDias} onChange={e => setValidezDias(e.target.value)}>
                    <option value={15}>15 días</option>
                    <option value={30}>30 días</option>
                    <option value={45}>45 días</option>
                    <option value={60}>60 días</option>
                  </select>
                </>
              ) : (
                <>
                  <label>Fecha exacta de validez</label>
                  <input type="date" className="input" value={validezFecha} onChange={e => setValidezFecha(e.target.value)} />
                </>
              )}
            </div>
          </div>
          <div className="input-group">
            <label>Descripción general del servicio</label>
            <SmartTextField
              value={descripcion}
              onChange={setDescripcion}
              diccionario={diccionarioComercial}
              rows={3}
              placeholder="Describe el alcance general en un párrafo. Aparece antes de la tabla de partidas en el PDF."
            />
          </div>
        </div>
      </div>

      {/* ── Bloque 2: partidas ────────────────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
            <h3>Partidas</h3>
            <div className="row" style={{gap:8}}>
              <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
              <select className="select" style={{fontSize:13, padding:'4px 10px', height:32}} defaultValue=""
                onChange={e => { if (!e.target.value) return; const s = MOCK.servicios?.find(x => x.id === e.target.value); if (s) addFromCatalogo(s); e.target.value = ''; }}>
                <option value="">Del catálogo ▾</option>
                {(MOCK.servicios || []).filter(s => s.estado === 'activo').map(s => <option key={s.id} value={s.id}>{s.descripcion}</option>)}
              </select>
            </div>
          </div>

          {partidas.map((p, idx) => (
            <div key={p.id} style={{marginBottom:12, padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)'}}>
              {/* Fila 1: descripción + tipo + acciones */}
              <div className="row" style={{gap:10, marginBottom:10, alignItems:'flex-end'}}>
                <span style={{fontWeight:600, fontSize:11, color:'var(--fg-muted)', minWidth:60, paddingBottom:8}}>Partida {idx + 1}</span>
                <div className="input-group" style={{margin:0, flex:3}}>
                  <label style={{fontSize:11}}>Descripción</label>
                  <SmartTextField
                    value={p.descripcion}
                    onChange={value => updatePartida(p.id, 'descripcion', value)}
                    diccionario={diccionarioComercial}
                    multiline={false}
                    placeholder="Nombre del servicio o bien"
                  />
                </div>
                <div className="input-group" style={{margin:0, flex:1, minWidth:140}}>
                  <label style={{fontSize:11}}>Tipo</label>
                  <select className="select" value={p.tipo} onChange={e => updatePartida(p.id, 'tipo', e.target.value)}>
                    <option value="material">Material</option>
                    <option value="servicio">Servicio</option>
                    <option value="bien">Bien</option>
                    <option value="recurrente">Recurrente (mensual)</option>
                  </select>
                </div>

                <div className="row" style={{gap:4, paddingBottom:2}}>
                  {idx > 0 && <button type="button" className="icon-btn" onClick={() => movePartida(idx, -1)} title="Subir">↑</button>}
                  {idx < partidas.length - 1 && <button type="button" className="icon-btn" onClick={() => movePartida(idx, 1)} title="Bajar">↓</button>}
                  <button type="button" className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button>
                </div>
              </div>
              {/* Fila 2: cantidad + precio + total */}
              <div className="row" style={{gap:10, marginBottom:10, alignItems:'flex-end'}}>
                <div className="input-group" style={{margin:0, width:110}}>
                  <label style={{fontSize:11}}>Cantidad</label>
                  <input type="number" className="input num" min="0" step="0.01" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} />
                </div>
                <div className="input-group" style={{margin:0, flex:1}}>
                  <label style={{fontSize:11}}>Precio unitario</label>
                  {p.incluido
                    ? <div className="row" style={{gap:6, alignItems:'center'}}>
                        <span className="badge badge-gray" style={{flex:1, textAlign:'center', height:36, lineHeight:'36px'}}>Incluido</span>
                        <button type="button" className="icon-btn" style={{fontSize:11}} title="Quitar" onClick={() => updatePartida(p.id, 'incluido', false)}>{I.x}</button>
                      </div>
                    : <div className="row" style={{gap:4, alignItems:'center'}}>
                        <input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} />
                        <button type="button" className="icon-btn" style={{fontSize:11, color:'var(--fg-muted)', flexShrink:0}} title="Marcar como Incluido" onClick={() => updatePartida(p.id, 'incluido', true)}>∅</button>
                      </div>
                  }
                </div>
                <div className="input-group" style={{margin:0, flex:2}}>
                  <label style={{fontSize:11}}>Detalle de cantidad</label>
                  <SmartTextField
                    value={p.detalle_cantidad}
                    onChange={value => updatePartida(p.id, 'detalle_cantidad', value)}
                    diccionario={diccionarioComercial}
                    multiline={false}
                    placeholder="1 proyecto, 2 meses…"
                  />
                </div>
                <div style={{textAlign:'right', minWidth:120, paddingBottom:2}}>
                  <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Total partida</div>
                  <div style={{fontWeight:700, fontSize:16, fontFamily:'Sora', color:'var(--cyan)'}}>
                    {p.incluido ? <span className="text-muted">Incluido</span> : moneyCurrency(calcPartidaTotal(p), monedaActual)}
                  </div>
                </div>
              </div>
              {/* Fila 3: sub-ítems (opcional, compacto) */}
              <div className="input-group" style={{margin:0}}>
                <label style={{fontSize:11}}>Sub-ítems / entregables (una línea = viñeta en PDF)</label>
                <SmartTextField
                  value={p.detalle_items_txt}
                  onChange={value => updatePartida(p.id, 'detalle_items_txt', value)}
                  diccionario={diccionarioComercial}
                  rows={2}
                  placeholder="Entregable 1&#10;Entregable 2"
                  inputStyle={{fontSize:12}}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bloque 3: totales ─────────────────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Resumen de totales</h3>
          <div className={pRec.length > 0 ? 'grid-2' : ''} style={{gap:24, maxWidth: pRec.length > 0 ? '100%' : 380, marginLeft:'auto'}}>
            <div>
              {pRec.length > 0 && <div className="eyebrow" style={{marginBottom:12}}>Implementación</div>}
              <TotalesBox subtotal={subtImpl} igvPct={igvPct} igv={igvImpl} total={totalImpl} sym={currencySymbol(monedaActual)} />
            </div>
            {pRec.length > 0 && (
              <div>
                <div className="eyebrow" style={{marginBottom:12}}>Recurrente mensual</div>
                <TotalesBox subtotal={subtRec} igvPct={igvPct} igv={igvRec} total={totalRec} suffix="/mes" sym={currencySymbol(monedaActual)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bloque 4: hitos de pago ───────────────────────────────────── */}
      <div className="card mt-4">

        <div className="card-body">
          <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom: hitosActivos ? 16 : 0}}>
            <h3>Hitos de pago</h3>
            <label className="row" style={{gap:8, cursor:'pointer', fontWeight:400, fontSize:14}}>
              <input type="checkbox" checked={hitosActivos} onChange={e => setHitosActivos(e.target.checked)} />
              Agregar hitos de pago
            </label>
          </div>
          {hitosActivos && (
            <>
              <div className="table-wrap" style={{marginBottom:12}}>
                <table className="tbl">
                  <thead>
                    <tr><th>N°</th><th>Concepto</th><th style={{width:110}}>% del total</th><th style={{width:140}}>Monto (auto)</th><th>Condición / vencimiento</th><th style={{width:36}}></th></tr>
                  </thead>
                  <tbody>
                    {hitos.map((h, i) => (
                      <tr key={h.id}>
                        <td className="num text-muted">{i + 1}</td>
                        <td>
                          <SmartTextField
                            value={h.concepto}
                            onChange={value => updateHito(h.id, 'concepto', value)}
                            diccionario={diccionarioComercial}
                            multiline={false}
                            placeholder="Ej: Anticipo"
                          />
                        </td>
                        <td><input type="number" className="input num" min="0" max="100" value={h.porcentaje} onChange={e => updateHito(h.id, 'porcentaje', e.target.value)} /></td>
                        <td className="num" style={{fontWeight:600}}>{moneyCurrency(Math.round(totalImpl * Number(h.porcentaje || 0) / 100), monedaActual)}</td>
                        <td>
                          <SmartTextField
                            value={h.condicion}
                            onChange={value => updateHito(h.id, 'condicion', value)}
                            diccionario={diccionarioComercial}
                            multiline={false}
                            placeholder="Al inicio del trabajo"
                          />
                        </td>
                        <td><button className="icon-btn text-danger" onClick={() => removeHito(h.id)}>{I.x}</button></td>
                      </tr>
                    ))}
                    {hitos.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:20, color:'var(--fg-muted)', fontSize:13}}>Sin hitos. Agrega uno.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2"></td>
                      <td className="num" style={{fontWeight:700, color: Math.abs(sumPct - 100) < 0.01 ? 'var(--green)' : 'var(--danger)'}}>
                        {sumPct.toFixed(1)}%
                      </td>
                      <td colSpan="3" style={{fontSize:12, color: Math.abs(sumPct - 100) < 0.01 ? 'var(--green)' : 'var(--danger)'}}>
                        {Math.abs(sumPct - 100) < 0.01 ? '✓ Suma correcta' : `Debe sumar 100% (faltan ${(100 - sumPct).toFixed(1)}%)`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={addHito}>{I.plus} Agregar hito</button>
              <div className="input-group" style={{marginTop:16}}>
                <label>Glosa recomendada para las facturas</label>
                <SmartTextField
                  value={glosa}
                  onChange={setGlosa}
                  diccionario={diccionarioComercial}
                  rows={2}
                  placeholder="Texto que irá en las facturas…"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bloque 5: condiciones comerciales ────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:4}}>Condiciones comerciales</div>
          <div className="text-muted" style={{fontSize:12, marginBottom:16}}>Pre-cargadas desde Parámetros Generales. Edita aquí para esta cotización sin afectar la plantilla general.</div>
          {COND_LABELS.map(([key, label]) => (
            <div className="input-group" key={key}>

              <label style={{fontSize:13}}>{label}</label>
              <SmartTextField
                value={conds[key]}
                onChange={value => setCond(key, value)}
                diccionario={diccionarioComercial}
                rows={3}
                placeholder={label + '…'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bloque 6: preview de firmas ───────────────────────────────── */}
      <div className="card mt-4" style={{marginBottom:40}}>
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:16}}>Página de cierre — Preview</div>
          <div className="grid-2" style={{gap:40}}>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cfg.razon_social || 'TIDEO'}</div>
              {cfg.firma_url && <img src={cfg.firma_url} alt="Firma" style={{maxHeight:60, marginBottom:8, display:'block', margin:'0 auto 8px'}} />}
              <div style={{borderTop:'1px solid var(--border-strong)', paddingTop:8, fontWeight:600}}>{cfg.firmante || '(configurar en Parámetros)'}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.cargo_firmante}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.email_comercial}</div>
            </div>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente'}</div>
              <div style={{height:60, display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                <div style={{width:'80%', borderBottom:'1px solid var(--border-strong)'}}></div>
              </div>
              <div style={{paddingTop:8, fontWeight:600, color:'var(--fg-muted)'}}>
                {(contactos || []).find(c => c.id === contactoId)?.nombre || '(selecciona un contacto arriba)'}
              </div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>Sello y firma</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CONDICIONES_PAGO = ['Contado', '30 días', '45 días', '60 días', '90 días', '120 días', 'Anticipado', 'Contra entrega'];

function CrearOSModal({ cot, opp, osClientes, cuentas, onClose, onCrearNueva, onVincularExistente }) {
  const { usuarios, centrosBeneficio } = useApp();
  const getNombre = id => (cuentas || []).find(c => c.id === id)?.razon_social || id;
  const cuenta = (cuentas || []).find(c => c.id === cot.cuenta_id);
  const osExistentes = (osClientes || []).filter(os =>
    os.cuenta_id === cot.cuenta_id && !['cerrada', 'anulada'].includes(os.estado)
  );
  const today = new Date().toISOString().split('T')[0];
  const cebesActivos = (centrosBeneficio || []).filter(c => c.estado === 'activo');
  const cebeVinculadoCuenta = cebesActivos.find(c => c.tipo === 'cliente' && c.cuenta_id === cot.cuenta_id);
  const cebesOrdenados = [...cebesActivos].sort((a, b) => Number(b.tipo === 'cliente' && b.cuenta_id === cot.cuenta_id) - Number(a.tipo === 'cliente' && a.cuenta_id === cot.cuenta_id));
  const condPagoInicial = cot.condicion_pago || cuenta?.condicion_pago || '30 días';
  const [modo, setModo] = useState(osExistentes.length > 0 ? null : 'nueva');
  const [osSeleccionada, setOsSeleccionada] = useState('');
  const [paso, setPaso] = useState(1);
  const [tieneNumero, setTieneNumero] = useState(null);
  const [form, setForm] = useState({
    numero_doc_cliente: '',
    nombre: opp?.nombre || opp?.servicio_interes || '',
    responsable_comercial_id: opp?.responsable_id || '',
    moneda: cot.moneda || 'PEN',
    fecha_inicio: today,
    fecha_fin: '',
    observaciones: '',
    condicion_pago: condPagoInicial,
    sla: 'estandar',
    centro_beneficio_id: cot.centro_beneficio_id || cebeVinculadoCuenta?.id || '',
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const optStyle = { display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', transition:'background 0.15s' };
  const infoBox = { padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)', fontSize:13 };

  if (modo === null) {
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{maxWidth:480}}>

          <div className="modal-head">
            <h2>Crear OS Cliente</h2>
            <button className="icon-btn" onClick={onClose}>{I.x}</button>
          </div>
          <div className="modal-body col" style={{gap:14}}>
            <div style={infoBox}>
              <div className="eyebrow">Cotización aprobada</div>
              <strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))} · {getNombre(cot.cuenta_id)}
            </div>
            <div style={{fontWeight:500, fontSize:14}}>Se detectaron OS activas para este cliente. ¿Esta cotización corresponde a una OS existente o es una OS nueva?</div>
            <div className="col" style={{gap:8}}>
              {osExistentes.map(os => (
                <label key={os.id} style={{...optStyle, background: osSeleccionada === os.id ? 'var(--cyan-lt)' : 'transparent'}}>
                  <input type="radio" name="os_existente" style={{accentColor:'var(--cyan-dk)'}} checked={osSeleccionada === os.id} onChange={() => setOsSeleccionada(os.id)} />
                  <div>
                    <div style={{fontWeight:600, fontSize:13}}>{os.numero}{os.nombre ? ` — ${os.nombre}` : ''}</div>
                    <div style={{fontSize:12, color:'var(--fg-muted)'}}>{money(os.monto_aprobado, currencySymbol(os.moneda))} · {os.estado}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setModo('nueva')}>Crear nueva OS</button>
            <button className="btn btn-primary" disabled={!osSeleccionada} onClick={() => onVincularExistente(osSeleccionada)}>Agregar a OS existente</button>
          </div>
        </div>
      </div>
    );
  }

  if (paso === 1) {
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{maxWidth:480}}>
          <div className="modal-head">
            <div>
              <div className="eyebrow" style={{marginBottom:2}}>Paso 1 de 2 — Número de OS</div>
              <h2>Crear OS Cliente</h2>
            </div>
            <button className="icon-btn" onClick={onClose}>{I.x}</button>
          </div>
          <div className="modal-body col" style={{gap:16}}>
            <div style={infoBox}><strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))}</div>
            <div style={{fontWeight:500}}>¿El cliente proporcionó un número de OS?</div>
            <div className="col" style={{gap:8}}>
              <label style={{...optStyle, background: tieneNumero === true ? 'var(--cyan-lt)' : 'transparent'}}>
                <input type="radio" name="tiene_num" style={{accentColor:'var(--cyan-dk)'}} checked={tieneNumero === true} onChange={() => setTieneNumero(true)} />
                <span>Sí — el cliente proporcionó su número de OS</span>
              </label>
              <label style={{...optStyle, background: tieneNumero === false ? 'var(--cyan-lt)' : 'transparent'}}>
                <input type="radio" name="tiene_num" style={{accentColor:'var(--cyan-dk)'}} checked={tieneNumero === false} onChange={() => setTieneNumero(false)} />
                <span>No / Aún no — generar número interno automático</span>
              </label>
            </div>
            {tieneNumero === true && (
              <div className="input-group">
                <label>Número OS del cliente</label>
                <input className="input" value={form.numero_doc_cliente} onChange={e => upd('numero_doc_cliente', e.target.value)} placeholder="Ej. OS-2026-001" autoFocus />
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary"
              disabled={tieneNumero === null || (tieneNumero === true && !form.numero_doc_cliente.trim())}
              onClick={() => setPaso(2)}>
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:560}}>
        <div className="modal-head">
          <div>

            <div className="eyebrow" style={{marginBottom:2}}>Paso 2 de 2 — Datos de la OS</div>
            <h2>Crear OS Cliente</h2>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <form className="modal-body col" style={{gap:14}} onSubmit={e => { e.preventDefault(); onCrearNueva(form); }}>
          <div style={infoBox}>
            <strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))}
            {tieneNumero && form.numero_doc_cliente && <> · OS cliente: <strong>{form.numero_doc_cliente}</strong></>}
          </div>
          <div className="input-group">
            <label>Nombre de la OS <span style={{color:'var(--danger)'}}>*</span></label>
            <input className="input" value={form.nombre} onChange={e => upd('nombre', e.target.value)} required />
          </div>
          <div className="input-group">
            <label>CEBE <span style={{color:'var(--danger)'}}>*</span></label>
            <select className="select" value={form.centro_beneficio_id} onChange={e => upd('centro_beneficio_id', e.target.value)} required>
              <option value="">Seleccionar CEBE...</option>
              {cebesOrdenados.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Moneda</label>
              <input className="input" value={form.moneda} readOnly style={{opacity:0.65, cursor:'not-allowed'}} />
            </div>
            <div className="input-group">
              <label>Responsable comercial</label>
              <select className="select" value={form.responsable_comercial_id} onChange={e => upd('responsable_comercial_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha inicio servicio <span style={{color:'var(--danger)'}}>*</span></label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={e => upd('fecha_inicio', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Fecha estimada de cierre</label>
              <input className="input" type="date" value={form.fecha_fin} onChange={e => upd('fecha_fin', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Condición de pago</label>
              <select className="select" value={form.condicion_pago} onChange={e => upd('condicion_pago', e.target.value)}>
                {CONDICIONES_PAGO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>SLA</label>
              <select className="select" value={form.sla} onChange={e => upd('sla', e.target.value)}>
                <option value="estandar">Estándar</option>
                <option value="estricto">Estricto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <label>Observaciones</label>
            <textarea className="input" rows="2" value={form.observaciones} onChange={e => upd('observaciones', e.target.value)} placeholder="Notas internas..." />
          </div>
          <div className="modal-foot mt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPaso(1)}>← Volver</button>
            <button type="submit" className="btn btn-primary">{I.check} Crear OS Cliente</button>
          </div>
        </form>
      </div>
    </div>
  );
}

class CotizacionesErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div className="p-8">

        <h3 className="text-danger">Error en Cotizaciones</h3>
        <pre style={{fontSize:12}}>{this.state.error?.stack || this.state.error?.message}</pre>
      </div>
    );
    return this.props.children;
  }
}

function Cotizaciones() {
  return <CotizacionesErrorBoundary><CotizacionesInner /></CotizacionesErrorBoundary>;
}

```

# Anexo C — Lista real de Hoja de Costeo completa

Ruta: `src/pages_extra.jsx`, `HojaCosteo`.

```jsx
function HojaCosteo() {
  const { hojasCosteo, oportunidades, cuentas, activeParams, navigate, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo, searchQuery, perfilSociedad, sociedadesIdsAlcance } = useApp();

  const getOpp = id => oportunidades.find(o => o.id === id);
  const getCuentaNombre = id => { const c = cuentas.find(x => x.id === id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const estadoHC = e => e || 'borrador';
  const labelEstadoHC = e => String(estadoHC(e)).replace('_', ' ');
  const badgeHC = e => estadoHC(e) === 'aprobada' ? 'badge-green' : estadoHC(e) === 'en_revision' ? 'badge-orange' : 'badge-gray';

  const hojasCosteoAlcance = useMemo(
    () => filtrarRegistrosPorAlcanceSociedad(hojasCosteo, perfilSociedad, sociedadesIdsAlcance),
    [hojasCosteo, perfilSociedad, sociedadesIdsAlcance]
  );
  const query = searchQuery.toLowerCase();
  const filteredHC = hojasCosteoAlcance.filter(hc => {
    const opp = getOpp(hc.oportunidad_id);
    const cliente = getCuentaNombre(hc.cuenta_id);
    return !query ||
      hc.numero.toLowerCase().includes(query) ||
      cliente.toLowerCase().includes(query) ||
      (opp?.nombre || '').toLowerCase().includes(query);
  });

  if (activeParams?.detail) {
    const hc = hojasCosteoAlcance.find(h => h.id === activeParams.detail);
    if (!hc) return <div className="p-4">Hoja de Costeo no encontrada</div>;
    return <DetalleHC hc={hc} getOpp={getOpp} getCuentaNombre={getCuentaNombre} badgeHC={badgeHC} actualizarHojaCosteo={actualizarHojaCosteo} aprobarHojaCosteo={aprobarHojaCosteo} navigate={navigate} />;
  }

  if (activeParams?.nueva) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    return (
      <EditorHC
        opp={opp}
        getCuentaNombre={getCuentaNombre}
        onSave={async datos => { const id = await crearHojaCosteo(datos); navigate('hoja_costeo', { detail: id }); }}
        onCancel={() => navigate('pipeline', { panel: opp.id })}
      />
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hojas de Costeo</h1>
          <div className="page-sub">{hojasCosteoAlcance.length} documentos · documento interno previo a cotización</div>
        </div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th>{perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD && <th>Sociedad</th>}<th>Oportunidad</th><th>Cliente</th><th>Costo Total</th><th>Precio Sugerido</th><th>Margen obj.</th><th>Responsable</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filteredHC.map(hc => {
                const opp = getOpp(hc.oportunidad_id);
                return (
                  <tr key={hc.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => navigate('hoja_costeo', { detail: hc.id })}>
                    <td className="mono" style={{fontWeight:600}}>{hc.numero}</td>
                    {perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD && <td><SociedadBadge sociedadId={hc.sociedad_id} /></td>}
                    <td>{opp?.nombre || '—'}</td>
                    <td><strong>{getCuentaNombre(hc.cuenta_id)}</strong></td>
                    <td className="num">{moneyCurrency(hc.costo_total, opp?.moneda || hc.moneda)}</td>
                    <td className="num" style={{fontWeight:600}}>{moneyCurrency(hc.precio_sugerido_total, opp?.moneda || hc.moneda)}</td>
                    <td className="num">{hc.margen_objetivo_pct}%</td>
                    <td className="text-muted">{hc.responsable_costeo || '—'}</td>
                    <td><span className={'badge ' + badgeHC(hc.estado)}>{labelEstadoHC(hc.estado)}</span></td>
                  </tr>
                );
              })}
              {filteredHC.length === 0 && <tr><td colSpan={perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD ? 9 : 8} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'Sin resultados para la búsqueda' : 'No hay hojas de costeo. Créalas desde el Pipeline.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

}


```

# Anexo D — Componente real de Presupuestos completo

Ruta: `src/pages_fin.jsx`, `Presupuestos`.

```jsx
function Presupuestos() {
  const {
    presupuestos, presupuestoPartidas, presupuestoAprobaciones,
    crearPresupuesto, enviarPresupuestoAAprobacion, procesarAprobacionPresupuesto,
    comprasGastos, ots, usuarios, empresa, authUser,
    centrosCosto, centrosBeneficio, perfilSociedad, sociedadesIdsAlcance,
    sociedadActiva, sociedadesDisponibles,
  } = useApp();

  const now = new Date();
  const [periodo, setPeriodo]       = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [tab, setTab]               = useState('control');
  const [preSelId, setPreSelId]     = useState(null);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [panelDetalle, setPanelDetalle] = useState(null);
  const [panelEnviar, setPanelEnviar]   = useState(false);
  const [formPre, setFormPre]       = useState({ nombre:'', periodo, centro_costo_id:'', cebe_id:'', sociedad_id: sociedadActiva?.id || '' });
  const [formParts, setFormParts]   = useState([{ categoria:'Materiales', descripcion:'', monto_presupuestado:'' }]);
  const [aprobadores, setAprobadores] = useState([null]);
  const [comentarioApr, setComentarioApr] = useState('');
  const [saving, setSaving]         = useState(false);

  const empresaId = empresa?.id;

  const periodoOpts = Array.from({length:12}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    return { v:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, l:`${MESES_C_PRE[d.getMonth()]} ${d.getFullYear()}` };
  });

  const [yy, mm] = periodo.split('-');
  const periodoLabel = `${MESES_PRE[parseInt(mm)-1]} ${yy}`;

  const presupuestosAlcance = useMemo(
    () => filtrarRegistrosPorAlcanceSociedad(presupuestos || [], perfilSociedad, sociedadesIdsAlcance),
    [presupuestos, perfilSociedad, sociedadesIdsAlcance]
  );
  const presDePeriodo = presupuestosAlcance.filter(p => p.empresa_id === empresaId && p.periodo === periodo);
  const presActivo = preSelId
    ? presupuestosAlcance.find(p => p.id === preSelId) || presDePeriodo[0] || null
    : presDePeriodo[0] || null;
  const sociedadNombre = sociedadId => (sociedadesDisponibles || []).find(s => s.id === sociedadId)?.nombre || 'Sin sociedad';

  const partidas = useMemo(() =>
    presActivo ? (presupuestoPartidas||[]).filter(p => p.presupuesto_id === presActivo.id).sort((a,b)=>a.orden-b.orden) : [],
    [presActivo, presupuestoPartidas]);

  const cadena = useMemo(() =>
    presActivo ? (presupuestoAprobaciones||[]).filter(a => a.presupuesto_id === presActivo.id).sort((a,b)=>a.orden-b.orden) : [],
    [presActivo, presupuestoAprobaciones]);

  const esPeriodoMensual = periodo.length === 7;
  const sociedadDeOt = o => {
    const ceco = (centrosCosto || []).find(c => c.id === o.centro_costo_id);
    const cebe = (centrosBeneficio || []).find(c => c.id === o.centro_beneficio_id);
    return ceco?.sociedad_id || cebe?.sociedad_id || null;
  };
  const perteneceASociedadActiva = row => {
    if (perfilSociedad === PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD || !presActivo?.sociedad_id) return true;
    return (row.sociedad_id || sociedadDeOt(row)) === presActivo.sociedad_id;
  };

  const calcReal = (categoria) => {
    if (categoria === 'Mano de obra') {
      return (ots||[]).filter(o => {
        if (o.empresa_id !== empresaId || !perteneceASociedadActiva(o)) return false;
        const p = esPeriodoMensual ? (o.fecha_cierre||o.fecha_inicio||'').slice(0,7) : (o.fecha_cierre||o.fecha_inicio||'').slice(0,4);
        return p === periodo && ['cerrada','facturada'].includes(o.estado);
      }).reduce((s,o) => s + Number(o.costo_real||0), 0);
    }
    return (comprasGastos||[]).filter(g => {
      if (g.empresa_id !== empresaId || !perteneceASociedadActiva(g)) return false;
      const p = esPeriodoMensual ? (g.fecha||'').slice(0,7) : (g.fecha||'').slice(0,4);
      return p === periodo && g.categoria === categoria;
    }).reduce((s,g) => s + Number(g.monto||0), 0);
  };

  const getDesglose = (categoria) => {
    if (categoria === 'Mano de obra') {
      return (ots||[]).filter(o => {
        if (o.empresa_id !== empresaId || !perteneceASociedadActiva(o)) return false;
        const p = esPeriodoMensual ? (o.fecha_cierre||o.fecha_inicio||'').slice(0,7) : (o.fecha_cierre||o.fecha_inicio||'').slice(0,4);

        return p === periodo && ['cerrada','facturada'].includes(o.estado);
      }).map(o => ({ fecha:o.fecha_cierre||o.fecha_inicio||'', descripcion:o.numero?`OT ${o.numero}`:o.nombre||'OT', proveedor:o.tecnico_lider||'—', monto:Number(o.costo_real||0), documento:o.numero||'—' }));
    }
    return (comprasGastos||[]).filter(g => {
      if (g.empresa_id !== empresaId || !perteneceASociedadActiva(g)) return false;
      const p = esPeriodoMensual ? (g.fecha||'').slice(0,7) : (g.fecha||'').slice(0,4);
      return p === periodo && g.categoria === categoria;
    }).map(g => ({ fecha:g.fecha||'', descripcion:g.descripcion||'—', proveedor:g.proveedor||'—', monto:Number(g.monto||0), documento:g.numero_documento||g.factura||'—' }));
  };

  const S = n => n == null ? '—' : 'S/ ' + Number(n).toLocaleString('es-PE', {minimumFractionDigits:0, maximumFractionDigits:0});

  const totPres = partidas.reduce((s,p) => s + Number(p.monto_presupuestado||0), 0);
  const totReal = partidas.reduce((s,p) => s + calcReal(p.categoria), 0);
  const varNeta = totReal - totPres;
  const execPct = totPres > 0 ? Math.round(totReal/totPres*100) : 0;
  const alertas = partidas.filter(p => calcReal(p.categoria) > Number(p.monto_presupuestado||0));

  const siguienteApr = cadena.find(a => a.estado === 'pendiente');
  const puedoAprobar = siguienteApr && siguienteApr.aprobador_id === authUser?.id;

  const usuariosEmpresa = (usuarios||[]).filter(u => u.empresa_id === empresaId || !u.empresa_id);

  const guardarNuevo = async () => {
    if (!formPre.nombre.trim() || !formPre.periodo.trim() || formParts.length === 0) return;
    setSaving(true);
    try {
      const pre = await crearPresupuesto(formPre, formParts);
      setPreSelId(pre.id);
      setPanelNuevo(false);
    } finally { setSaving(false); }
  };

  const handleEnviar = async () => {
    const aprs = aprobadores.filter(Boolean);
    if (!aprs.length || !presActivo) return;
    setSaving(true);
    try {
      await enviarPresupuestoAAprobacion(presActivo.id, aprs);
      setPanelEnviar(false);
      setAprobadores([null]);
    } finally { setSaving(false); }
  };

  const handleProcesar = async (aprId, accion) => {
    if (!presActivo) return;
    await procesarAprobacionPresupuesto(presActivo.id, aprId, accion, comentarioApr);
    setComentarioApr('');
  };


  return (
    <>
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Presupuesto vs Real</h1>
          <div className="page-sub">Control presupuestal mensual · {periodoLabel}</div>
        </div>
        <div className="row" style={{gap:8, flexWrap:'wrap'}}>
          <select className="select" style={{width:150}} value={periodo} onChange={e => { setPeriodo(e.target.value); setPreSelId(null); }}>
            {periodoOpts.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          {presDePeriodo.length > 0 && (
            <select className="select" style={{width:200}} value={presActivo?.id||''} onChange={e => setPreSelId(e.target.value||null)}>
              {presDePeriodo.map(p => <option key={p.id} value={p.id}>{p.nombre}{perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD ? ` — ${sociedadNombre(p.sociedad_id)}` : ''}</option>)}
            </select>
          )}
          {presActivo?.estado === 'borrador' && (
            <button className="btn btn-secondary" data-local-form="true" onClick={() => setPanelEnviar(true)}>Enviar a aprobación</button>
          )}
          <button className="btn btn-primary" data-local-form="true" onClick={() => { setFormPre({nombre:'',periodo,centro_costo_id:'',cebe_id:'',sociedad_id:sociedadActiva?.id||''}); setFormParts([{categoria:'Materiales',descripcion:'',monto_presupuestado:''}]); setPanelNuevo(true); }}>
            {I.plus} Nuevo presupuesto
          </button>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Presupuesto total</div><div className="kpi-value" style={{fontSize:20}}>{S(totPres)}</div><div className="kpi-icon cyan">{I.trend}</div></div>

        <div className="kpi-card"><div className="kpi-label">Ejecutado</div><div className="kpi-value" style={{fontSize:20, color:varNeta>0?'var(--danger)':'var(--green)'}}>{S(totReal)}</div><div className={'kpi-icon '+(varNeta>0?'red':'green')}>{I.dollar}</div></div>
        <div className="kpi-card"><div className="kpi-label">Variación neta</div><div className="kpi-value" style={{fontSize:20, color:varNeta>0?'var(--danger)':'var(--green)'}}>{varNeta>0?'+':''}{S(varNeta)}</div><div className={'kpi-icon '+(varNeta>0?'orange':'green')}>{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ejecución global</div><div className="kpi-value" style={{fontSize:20, color:execPct>100?'var(--danger)':execPct>80?'var(--orange)':'inherit'}}>{execPct}%</div><div className="kpi-icon purple">{I.trend}</div></div>
      </div>

      {/* ── Sin presupuesto ───────────────────────────────────────────── */}
      {!presActivo && (
        <div className="card" style={{padding:'48px 24px', textAlign:'center', color:'var(--fg-muted)'}}>
          No hay presupuesto para {periodoLabel}. Usa "+ Nuevo presupuesto" para crear uno.
        </div>
      )}

      {presActivo && (
        <>
          {/* ── Alerta excedidos ──────────────────────────────────────── */}
          {alertas.length > 0 && (
            <div style={{padding:'12px 16px', background:'rgba(220,38,38,0.08)', border:'1px solid var(--danger)', borderRadius:10, marginBottom:16}} className="row">
              <span style={{display:'flex',alignItems:'center',flexShrink:0,width:18,height:18,color:'var(--danger)'}}>{I.alert}</span>
              <div><strong>{alertas.length} partida{alertas.length>1?'s':''} excedida{alertas.length>1?'s':''} del presupuesto</strong>: {alertas.map(a=>a.categoria).join(', ')}</div>
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <div className="tabs">
            <div className={'tab '+(tab==='control'?'active':'')} onClick={()=>setTab('control')}>Control de Gastos</div>
            <div className={'tab '+(tab==='aprobacion'?'active':'')} onClick={()=>setTab('aprobacion')}>Flujo de Aprobación</div>
          </div>

          {/* ── Control de Gastos ─────────────────────────────────────── */}
          {tab === 'control' && (
            <div className="card">
              <div className="card-head">
                <h3>Partidas presupuestales — {periodoLabel}</h3>
                <div className="row" style={{gap:8}}>
                  <SociedadBadge sociedadId={presActivo.sociedad_id} />
                  <span className={`badge ${BADGE_E[presActivo.estado]?.cls||''}`}>{BADGE_E[presActivo.estado]?.label||presActivo.estado}</span>
                  <span className="text-muted" style={{fontSize:12}}>{partidas.length} partidas</span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Partida</th><th>Descripción</th><th className="num">Presupuesto</th><th className="num">Real</th><th className="num">Variación</th><th style={{width:160}}>Ejecución</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {partidas.length === 0 && (
                      <tr><td colSpan={7} style={{textAlign:'center',color:'var(--fg-muted)',padding:24}}>Sin partidas registradas.</td></tr>
                    )}
                    {partidas.map((p, i) => {
                      const real = calcReal(p.categoria);
                      const pres = Number(p.monto_presupuestado||0);
                      const varAbs = real - pres;
                      const ep = pres > 0 ? Math.round(real/pres*100) : 0;
                      const over = real > pres;
                      const limit = ep > 80 && !over;
                      const barColor = over ? 'var(--danger)' : limit ? 'var(--orange)' : 'var(--green)';
                      return (
                        <tr key={p.id} style={{cursor:'pointer'}} onClick={() => setPanelDetalle(p)}>
                          <td style={{fontWeight:600}}>{p.categoria}</td>
                          <td style={{color:'var(--fg-muted)',fontSize:12}}>{p.descripcion||'—'}</td>
                          <td className="num text-muted">{S(pres)}</td>
                          <td className="num"><strong style={{color:over?'var(--danger)':'inherit'}}>{S(real)}</strong></td>
                          <td className="num"><span style={{color:varAbs>0?'var(--danger)':'var(--green)',fontWeight:600}}>{varAbs>0?'+':''}{S(varAbs)}</span></td>
                          <td>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div style={{flex:1,height:7,background:'var(--bg-subtle)',borderRadius:4}}>
                                <div style={{width:Math.min(ep,100)+'%',height:'100%',background:barColor,borderRadius:4}}/>
                              </div>
                              <span style={{fontSize:12,fontWeight:700,minWidth:36,color:barColor}}>{ep}%</span>
                            </div>
                          </td>
                          <td><span className={'badge '+(over?'badge-red':limit?'badge-orange':'badge-green')}>{over?'Excedido':limit?'En límite':'OK'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {partidas.length > 0 && (
                <div style={{padding:'14px 20px',borderTop:'1px solid var(--border-subtle)',display:'flex',gap:32,justifyContent:'flex-end',fontSize:13}}>

                  <span className="text-muted">Total presupuesto: <strong style={{color:'var(--fg)'}}>{S(totPres)}</strong></span>
                  <span className="text-muted">Total ejecutado: <strong style={{color:varNeta>0?'var(--danger)':'var(--green)'}}>{S(totReal)}</strong></span>
                  <span className="text-muted">Variación: <strong style={{color:varNeta>0?'var(--danger)':'var(--green)'}}>{varNeta>0?'+':''}{S(varNeta)}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* ── Flujo de Aprobación ───────────────────────────────────── */}
          {tab === 'aprobacion' && (
            <div className="card">
              <div className="card-head">
                <h3>Cadena de aprobación</h3>
                {cadena.length > 0 && (
                  <span className="badge badge-cyan">{cadena.filter(a=>a.estado==='aprobado').length} de {cadena.length} aprobados</span>
                )}
              </div>
              {cadena.length === 0 ? (
                <div style={{padding:'32px 24px',textAlign:'center',color:'var(--fg-muted)'}}>
                  Sin cadena configurada.
                  {presActivo.estado === 'borrador' && (
                    <div style={{marginTop:12}}><button className="btn btn-secondary" onClick={()=>setPanelEnviar(true)}>Enviar a aprobación</button></div>
                  )}
                </div>
              ) : (
                <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:0}}>
                  {cadena.map((a, i) => {
                    const aprobado = a.estado === 'aprobado';
                    const rechazado = a.estado === 'rechazado';
                    const esActual = siguienteApr?.id === a.id;
                    return (
                      <div key={a.id} style={{display:'flex',gap:20,position:'relative'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                          <div style={{width:36,height:36,borderRadius:'50%',background:aprobado?'var(--green)':rechazado?'var(--danger)':esActual?'var(--accent)':'var(--bg-subtle)',border:'2px solid '+(aprobado?'var(--green)':rechazado?'var(--danger)':esActual?'var(--accent)':'var(--border)'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,color:aprobado||rechazado||esActual?'#fff':'var(--fg-muted)'}}>
                            {aprobado?'✓':rechazado?'✗':a.orden}
                          </div>
                          {i < cadena.length-1 && <div style={{width:2,flex:1,minHeight:32,background:aprobado?'var(--green)':'var(--border)',margin:'4px 0'}}/>}
                        </div>
                        <div style={{paddingBottom:28,flex:1}}>
                          <div style={{fontWeight:600,fontSize:14}}>{a.nombre_aprobador}</div>
                          <div style={{fontSize:12,color:'var(--fg-muted)',marginTop:2}}>
                            {aprobado ? `Aprobado ${a.fecha_accion?new Date(a.fecha_accion).toLocaleDateString('es-PE'):''}` : rechazado ? `Rechazado ${a.fecha_accion?new Date(a.fecha_accion).toLocaleDateString('es-PE'):''}` : esActual ? 'Pendiente — turno actual' : 'Pendiente'}
                          </div>
                          {a.comentario && <div style={{fontSize:12,marginTop:6,padding:'8px 12px',background:'var(--bg-subtle)',borderRadius:6,color:'var(--fg-subtle)',borderLeft:'3px solid '+(aprobado?'var(--green)':'var(--border)')}}>{a.comentario}</div>}
                          {puedoAprobar && esActual && (
                            <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
                              <input className="input" style={{flex:1,minWidth:160,fontSize:12}} placeholder="Comentario (opcional)" value={comentarioApr} onChange={e=>setComentarioApr(e.target.value)}/>
                              <button className="btn btn-primary" style={{fontSize:12}} onClick={()=>handleProcesar(a.id,'aprobar')}>Aprobar</button>
                              <button className="btn btn-danger" style={{fontSize:12}} onClick={()=>handleProcesar(a.id,'rechazar')}>Rechazar</button>
                            </div>
                          )}
                        </div>
                        <div style={{paddingTop:8}}>
                          <span className={'badge '+(aprobado?'badge-green':rechazado?'badge-red':esActual?'badge-orange':'badge-cyan')}>{aprobado?'Aprobado':rechazado?'Rechazado':esActual?'En revisión':'Pendiente'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Panel: Nuevo presupuesto ──────────────────────────────────── */}
      {panelNuevo && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelNuevo(false)}/>
          <div className="side-panel" style={{width:'min(520px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Nuevo presupuesto</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{formPre.periodo||'—'}</div>
              </div>
              <button className="icon-btn" onClick={()=>setPanelNuevo(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:12}}>
                <div className="input-group" style={{gridColumn:'1/-1'}}>

                  <label>Nombre del presupuesto <span style={{color:'var(--danger)'}}>*</span></label>
                  <input className="input" value={formPre.nombre} onChange={e=>setFormPre(p=>({...p,nombre:e.target.value}))} placeholder="Ej. Presupuesto Operativo Mayo 2026" autoFocus/>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Período <span style={{color:'var(--fg-muted)',fontWeight:400}}>(YYYY-MM mensual · YYYY anual)</span></label>
                  <input className="input" value={formPre.periodo} onChange={e=>setFormPre(p=>({...p,periodo:e.target.value}))} placeholder="2026-05"/>
                </div>
                <SociedadFormField
                  value={formPre.sociedad_id || ''}
                  onChange={sociedad_id => setFormPre(p => ({ ...p, sociedad_id, centro_costo_id:'', cebe_id:'' }))}
                  style={{gridColumn:'1/-1'}}
                />
                <div className="input-group">
                  <label>CECO <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
                  <select className="select" value={formPre.centro_costo_id} onChange={e=>setFormPre(p=>({...p,centro_costo_id:e.target.value}))}>
                    <option value="">— Todos —</option>
                    {(centrosCosto||[]).filter(c=>c.empresa_id===empresaId && (!formPre.sociedad_id || c.sociedad_id===formPre.sociedad_id)).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>CEBE <span style={{color:'var(--fg-muted)',fontWeight:400}}>(opcional)</span></label>
                  <select className="select" value={formPre.cebe_id} onChange={e=>setFormPre(p=>({...p,cebe_id:e.target.value}))}>
                    <option value="">— Todos —</option>
                    {(centrosBeneficio||[]).filter(c=>c.empresa_id===empresaId && (!formPre.sociedad_id || c.sociedad_id===formPre.sociedad_id)).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{marginTop:20,marginBottom:8,fontWeight:600,fontSize:13}}>Partidas presupuestales</div>
              <div className="card" style={{padding:0,overflow:'hidden',marginBottom:12}}>
                <table className="tbl" style={{fontSize:13}}>
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th className="num">Monto S/</th>
                      <th style={{width:32}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formParts.map((fp,i) => (
                      <tr key={i}>
                        <td style={{padding:'6px 8px'}}>
                          <select className="select" value={fp.categoria} onChange={e=>setFormParts(prev=>prev.map((x,j)=>j===i?{...x,categoria:e.target.value}:x))}>
                            {CATS_PRE.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <input className="input" value={fp.descripcion} placeholder="Descripción" onChange={e=>setFormParts(prev=>prev.map((x,j)=>j===i?{...x,descripcion:e.target.value}:x))}/>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <input className="input num" type="number" min="0" step="0.01" value={fp.monto_presupuestado} placeholder="0.00" onChange={e=>setFormParts(prev=>prev.map((x,j)=>j===i?{...x,monto_presupuestado:e.target.value}:x))}/>
                        </td>
                        <td style={{textAlign:'center',padding:'6px 4px'}}>
                          <button className="icon-btn" style={{width:24,height:24}} onClick={()=>setFormParts(prev=>prev.filter((_,j)=>j!==i))}>{I.x}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-secondary" style={{width:'100%',marginBottom:20}} onClick={()=>setFormParts(prev=>[...prev,{categoria:'Materiales',descripcion:'',monto_presupuestado:''}])}>
                {I.plus} Agregar partida
              </button>

              <div className="row mt-6" style={{justifyContent:'flex-end',gap:10}}>
                <button className="btn btn-secondary" onClick={()=>setPanelNuevo(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={saving||!formPre.nombre.trim()||formParts.length===0||(empresa?.multisociedad_habilitado&&!formPre.sociedad_id)} onClick={guardarNuevo}>
                  {saving ? 'Guardando…' : `${I.check} Guardar presupuesto`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Detalle de partida ─────────────────────────────────── */}
      {panelDetalle && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelDetalle(null)}/>

          <div className="side-panel" style={{width:'min(600px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Detalle de partida</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{panelDetalle.categoria}</div>
                {panelDetalle.descripcion && <div style={{fontSize:13,color:'var(--fg-muted)',marginTop:2}}>{panelDetalle.descripcion}</div>}
              </div>
              <button className="icon-btn" onClick={()=>setPanelDetalle(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:12,marginBottom:20}}>
                <div className="card" style={{padding:'12px 16px'}}>
                  <div className="eyebrow" style={{marginBottom:6}}>Presupuestado</div>
                  <div style={{fontSize:22,fontWeight:700}}>{S(panelDetalle.monto_presupuestado)}</div>
                </div>
                <div className="card" style={{padding:'12px 16px'}}>
                  <div className="eyebrow" style={{marginBottom:6}}>Real ejecutado</div>
                  {(()=>{ const r=calcReal(panelDetalle.categoria); return <div style={{fontSize:22,fontWeight:700,color:r>Number(panelDetalle.monto_presupuestado)?'var(--danger)':'var(--green)'}}>{S(r)}</div>; })()}
                </div>
              </div>

              <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Registros que componen el Real</div>
              {(()=>{
                const items = getDesglose(panelDetalle.categoria);
                if (!items.length) return (
                  <div className="card" style={{padding:'24px',textAlign:'center',color:'var(--fg-muted)',fontSize:13}}>
                    Sin registros de {panelDetalle.categoria} para este período.
                  </div>
                );
                return (
                  <div className="card" style={{padding:0,overflow:'hidden'}}>
                    <table className="tbl">
                      <thead><tr><th>Fecha</th><th>Descripción</th><th>Proveedor/Técnico</th><th className="num">Monto</th><th>Documento</th></tr></thead>
                      <tbody>
                        {items.map((g,i) => (
                          <tr key={i}>
                            <td className="text-muted" style={{whiteSpace:'nowrap'}}>{g.fecha}</td>
                            <td>{g.descripcion}</td>
                            <td className="text-muted">{g.proveedor}</td>
                            <td className="num"><strong>{S(g.monto)}</strong></td>
                            <td className="text-muted">{g.documento}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Panel: Enviar a aprobación ────────────────────────────────── */}
      {panelEnviar && (
        <>
          <div className="side-panel-backdrop" onClick={()=>setPanelEnviar(false)}/>
          <div className="side-panel" style={{width:'min(440px,96vw)'}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Enviar a aprobación</div>
                <div className="font-display" style={{fontSize:18,fontWeight:700}}>{presActivo?.nombre}</div>
              </div>
              <button className="icon-btn" onClick={()=>setPanelEnviar(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="card" style={{padding:'12px 14px',marginBottom:16,fontSize:13,color:'var(--fg-muted)'}}>
                La cadena es secuencial: cada aprobador solo puede actuar después del anterior. Puedes configurar hasta 4 firmantes.
              </div>
              {aprobadores.map((apr,i) => (
                <div key={i} className="input-group" style={{marginBottom:10}}>
                  <label>Aprobador {i+1}</label>
                  <div className="row" style={{gap:8}}>
                    <select className="select" style={{flex:1}} value={apr?.id||''} onChange={e=>{ const u=usuariosEmpresa.find(u=>u.id===e.target.value); setAprobadores(prev=>prev.map((a,j)=>j===i?(u||null):a)); }}>
                      <option value="">— Seleccionar usuario —</option>
                      {usuariosEmpresa.map(u=><option key={u.id} value={u.id}>{u.nombre||u.email}</option>)}
                    </select>
                    {aprobadores.length>1 && (
                      <button className="icon-btn" onClick={()=>setAprobadores(prev=>prev.filter((_,j)=>j!==i))}>{I.x}</button>
                    )}

                  </div>
                </div>
              ))}
              {aprobadores.length < 4 && (
                <button className="btn btn-secondary" style={{marginBottom:20}} onClick={()=>setAprobadores(prev=>[...prev,null])}>
                  {I.plus} Agregar aprobador
                </button>
              )}
              <div className="row mt-6" style={{justifyContent:'flex-end',gap:10}}>
                <button className="btn btn-secondary" onClick={()=>setPanelEnviar(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={saving||aprobadores.filter(Boolean).length===0} onClick={handleEnviar}>
                  {saving ? 'Enviando…' : 'Enviar a aprobación'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export { CxC, Tesoreria, Resultados, Facturacion, Ventas, CajaChica, PrestamosPersonal, CxP, ActivosFijos, Presupuestos };

```
