# Fase 3 — Diagnóstico Técnico en operaciones-app

## Paso 0 — Auditoría de solo lectura

Fecha: 2026-09-30  
Alcance: `operaciones-app`, con consultas `SELECT` únicamente sobre producción.  
Project ref confirmado: `atqwyjfidfoepthygfoo` (`ERP - TIDEO`, West US/Oregon), mediante `supabase projects list`; las consultas se ejecutaron contra el proyecto enlazado con `supabase db query --linked`. No se ejecutaron migraciones, `INSERT`, `UPDATE`, `DELETE`, `COMMIT` ni cambios de base de datos.

## Resumen ejecutivo

- El shell real está en `operaciones-app/src/OperationalApp.jsx`; el mapa de navegación estático está en `zahory-mock/components/shell.jsx`, y el registro de rutas se divide en tres route maps. La pantalla de Recepción de Activos es el precedente directo.
- La navegación actual no evalúa `usuario_puede(..., 'diagnostico_tecnico', 'ver')`. `sesionOperativa` carga las filas de `permisos_roles`, pero el shell solo filtra por existencia de la ruta. La nueva pantalla necesita un guard explícito de permiso de lectura, además de la protección RLS.
- Las consultas usan un singleton de Supabase y llamadas directas `.from(...).select(...)` o `.rpc(...)` dentro de cada servicio/pantalla. No hay una capa de hooks de datos especializada para diagnósticos.
- Recepciones sí se listan hoy desde Operaciones. Oportunidades no se listan hoy en `operaciones-app`: no hay servicio ni página con `.from('oportunidades')`; las rutas de Producción son páginas mock/operativas y no un selector de oportunidades CRM.
- El rol productivo observado como `Técnico Operativo` normalmente no tiene `pipeline`; sin embargo, la consulta detectó una excepción de plataforma (`emp_2000000000`) con `pipeline` verdadero. No se debe asumir que el nombre `ops_tecnico` basta para autorizar la lectura de padres.
- La tabla `oportunidades` no tiene `sociedad_id`. Una función de referencias puede respetar tenant y alcance de sociedad para mantenimiento mediante la recepción, pero no puede aplicar alcance de sociedad a fabricación sin una relación adicional. La propuesta deja fabricación con alcance tenant-wide y marca esa decisión como pendiente de producto.

## 1. Shell, navegación, rutas y permiso de lectura

### Shell y navegación

`OperationalApp` importa la sesión operativa, calcula `availableZahoryRoutes`, obtiene el menú con `getZahoryNavigation`, lee la ruta desde el hash y renderiza el sidebar. Evidencia literal:

```text
operaciones-app/src/OperationalApp.jsx:3: import { isSupabaseConfigured } from './lib/supabaseClient.js';
operaciones-app/src/OperationalApp.jsx:4: import { useSesionOperativa } from './lib/sesionOperativa.js';
operaciones-app/src/OperationalApp.jsx:7: import { availableZahoryRoutes } from './zahory-mock/ZahoryRoutes.jsx';
operaciones-app/src/OperationalApp.jsx:12:   getZahoryNavigation,
operaciones-app/src/OperationalApp.jsx:49: function readLocation() {
operaciones-app/src/OperationalApp.jsx:60: const zahoryNavigation = getZahoryNavigation(availableZahoryRoutes);
operaciones-app/src/OperationalApp.jsx:75: export function OperationalApp() {
operaciones-app/src/OperationalApp.jsx:76:   const sesionOperativa = useSesionOperativa();
operaciones-app/src/OperationalApp.jsx:133:         <nav className="ops-nav" aria-label="Navegación operativa">
operaciones-app/src/OperationalApp.jsx:138:             {zahoryNavigation.map(zone => (
operaciones-app/src/OperationalApp.jsx:207:             <ZahoryScreenHost route={route} routeParams={routeParams} onNavigate={navigate} />
```

La ruta es hash-based: `readLocation()` separa `#/ruta?query` y `navigate()` escribe `window.location.hash` (`OperationalApp.jsx:49-57, 93-98`). El route map común combina tres conjuntos (`ZahoryRoutes.jsx:11-19`) y resuelve primero líneas de negocio, luego taller/operaciones y luego supply/admin (`ZahoryRoutes.jsx:44-69`).

El menú declarativo está en `operaciones-app/src/zahory-mock/components/shell.jsx:65-69`, en `SIDEBAR_ZONES`. El grupo existente de taller incluye `recepcion-activos` (`shell.jsx:189-204`), mientras que el grupo de almacén incluye `catalogo`, `solicitudes`, `almacen-reservas`, `almacen-movimientos` y `almacen-alertas` (`shell.jsx:236-258`).

### Precedente para agregar una pantalla

Recepción de Activos sigue este patrón:

```text
operaciones-app/src/zahory-mock/routes/workshopOperationsRoutes.jsx:13: import { RecepcionActivosClientePage } from '../pages/RecepcionActivosClientePage.jsx';
operaciones-app/src/zahory-mock/routes/workshopOperationsRoutes.jsx:28: export const workshopOperationsRouteIds = new Set([
operaciones-app/src/zahory-mock/routes/workshopOperationsRoutes.jsx:29:   'ots', 'crear-ot', 'ot-detalle', 'recepcion-activos', ...
operaciones-app/src/zahory-mock/routes/workshopOperationsRoutes.jsx:37: export function renderWorkshopOperationsRoute(route, context) {
operaciones-app/src/zahory-mock/routes/workshopOperationsRoutes.jsx:43:     case 'recepcion-activos': return <RecepcionActivosClientePage />;
```

Para Diagnóstico Técnico, el patrón de montaje sería: importar `DiagnosticoTecnicoPage`, añadir un id al `workshopOperationsRouteIds`, añadir el `case` en `renderWorkshopOperationsRoute`, y añadir un item a `SIDEBAR_ZONES` dentro de TALLER & OPERACIONES. El archivo `navigation.js:15-27, 49-71` solo comprueba que el id exista en `availableRoutes`; no consulta la base ni permisos.

### Control por `diagnostico_tecnico.ver`

No existe hoy un guard de pantalla para ese permiso en el shell. La evidencia de sesión es:

```text
operaciones-app/src/lib/sesionOperativa.js:233:     const { data: permisosRows, error: permisosError } = await cliente
operaciones-app/src/lib/sesionOperativa.js:234:       .from('permisos_roles')
operaciones-app/src/lib/sesionOperativa.js:235:       .select('*')
operaciones-app/src/lib/sesionOperativa.js:236:       .eq('rol_id', membresia.rol_id);
operaciones-app/src/lib/sesionOperativa.js:278:       permisos: permisosRows || [],
```

La sesión también trae `es_admin_empresa` y `es_superadmin` (`sesionOperativa.js:211-214, 279-280`), pero `OperationalApp.jsx` no evalúa esos campos ni `permisosRows` al pintar el sidebar. Para la nueva pantalla, el acceso de lectura debe comprobarse antes de cargar la página, por ejemplo con el mismo `rpc('usuario_puede', { target_empresa_id, target_pantalla: 'diagnostico_tecnico', target_accion: 'ver' })` usado por Recepción para escritura, y el RLS debe seguir siendo la autoridad final.

La página precedente tampoco comprueba `ver` en frontend: solo consulta `crear` y `editar` (`RecepcionActivosClientePage.jsx:124-141`), y carga la lista por separado (`RecepcionActivosClientePage.jsx:94-120`). Eso debe corregirse conceptualmente en la nueva pantalla, sin modificar aún el código.

## 2. Consultas a Supabase y patrón de formularios

### Cliente y sesión

El cliente es un singleton de `@supabase/supabase-js`:

```text
operaciones-app/src/lib/supabaseClient.js:1: import { createClient } from '@supabase/supabase-js';
operaciones-app/src/lib/supabaseClient.js:3: let client;
operaciones-app/src/lib/supabaseClient.js:9: export function getSupabaseClient() {
operaciones-app/src/lib/supabaseClient.js:14:   client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
operaciones-app/src/lib/supabaseClient.js:15:     auth: { persistSession: true, autoRefreshToken: true },
```

`useSesionOperativa` obtiene la sesión Auth (`sesionOperativa.js:197-202`), obtiene membresías con `rpc('get_mis_membresias')` (`:204-206`), carga empresas/roles (`:211-218`) y carga los permisos del rol (`:233-238`). El hook conserva el estado de sesión y lo comparte a las páginas; no existe un data hook común para diagnósticos.

Los servicios son módulos JavaScript que llaman directamente al cliente. Por ejemplo, `recepcionesActivosClienteService.js:49-60` lista activos con `.from('activos').select(...)`, y `:190-201` lista recepciones con `.from('recepciones_activos_cliente').select(...)`, filtro de empresa y sociedad y ordenamiento.

### Pantalla reciente de Almacén/SOLPE

La ruta de Solicitudes es una mezcla de puente al aplicativo administrativo y pantalla operativa (`supplyAdministrationRoutes.jsx:15-32`). Reservas, movimientos y alertas siguen siendo placeholders/puentes (`supplyAdministrationRoutes.jsx:30-37`); no hay en Operaciones una pantalla WMS completa con tablas relacionales de cabecera y líneas.

El patrón más cercano a cabecera + líneas es SOLPE en `pages2_v2.jsx`:

```text
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1272:   const [formSolpe, setFormSolpe] = useS2({ ..., items:[nuevaLineaSolpe()] });
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1437:   const actualizarLinea = (lineaId, cambios) => setFormSolpe(actual => ({
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1439:     items: actual.items.map(linea => linea.id === lineaId ? { ...linea, ...cambios } : linea),
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1442:   const crearSolicitud = async () => {
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1444:     const items = formSolpe.items.filter(linea => linea.material_id && Number(linea.cantidad) > 0).map(linea => ({ ... }));
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1581: ... items:[...actual.items, nuevaLineaSolpe()] ...
operaciones-app/src/zahory-mock/pages/pages2_v2.jsx:1584: ... formSolpe.items.map(linea => ... inputs ...)
```

Persistencia actual de SOLPE: `solpeService.js:6-29` arma una cabecera con `items: datos.items || []` y la inserta como JSON en `solpe_interna`; el formulario de materiales consulta el catálogo remoto por `.ilike` (componente `SelectorMaterialSolpe`, alrededor de `pages2_v2.jsx:1114-1240`). No es un patrón de tablas hijas físicas equivalente al diagnóstico; para el diagnóstico se requerirá un servicio específico que cargue cabecera, líneas y materiales como recursos separados.

Crear OT tiene el patrón de filas editables por estado local: agrega/elimina operaciones y edita campos de cada fila (`CrearOTPage.jsx:620-625, 658-693`), además de un selector con búsqueda de clientes (`CrearOTPage.jsx:119-212`). Es una referencia de interacción, no una autorización para modificar `CrearOTPage`, que queda fuera de este paso.

## 3. Recepciones, oportunidades y función de referencias

### Recepciones actuales

La página de Recepción carga cuatro fuentes en paralelo: activos de cliente, cuentas/clientes, almacenes y recepciones (`RecepcionActivosClientePage.jsx:94-114`). La lista de recepciones se hace directamente contra `recepciones_activos_cliente` y selecciona, entre otros, `id`, `empresa_id`, `sociedad_id`, `activo_id`, `numero` y `numero_caso` (`recepcionesActivosClienteService.js:190-200`).

La policy remota actual de lectura es:

```text
public | recepciones_activos_cliente | ops_recepciones_activos_cliente_select | SELECT |
(usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'recepcion_activos_cliente'::text, 'ver'::text))
```

La policy no añade explícitamente alcance de sociedad. El servicio filtra por la sociedad activa en el query (`recepcionesActivosClienteService.js:195-196`), pero una futura función de referencias no debe confiar solo en ese filtro de cliente.

### Oportunidades actuales

La búsqueda estática sobre `operaciones-app/src` no encontró un servicio o página que consulte `.from('oportunidades')`, ni una lista de oportunidades para Operaciones. Las rutas de Producción usan páginas propias y datos mock/operativos (`businessLinesRoutes.jsx:9-27, 54-73, 97-115`; `ProduccionPages.jsx:72-75` construye OTs desde `ZAHORY_SAC_DATA`). La única ruta CRM relacionada en el menú principal es un concepto externo; no es un selector de oportunidades disponible para `ops_tecnico`.

### Evidencia de producción: estructura y RLS

Consulta ejecutada:

```text
supabase db query "select table_name, column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name in ('oportunidades','recepciones_activos_cliente','activos','cuentas','sociedades','usuarios_asignaciones') order by table_name, ordinal_position;" --linked --output table --agent no
```

Salida literal relevante:

```text
│ oportunidades               │ id                       │ text │ text │ NO │ NULL │
│ oportunidades               │ empresa_id               │ text │ text │ NO │ NULL │
│ oportunidades               │ cuenta_id                │ text │ text │ YES │ NULL │
│ oportunidades               │ nombre                   │ text │ text │ NO │ NULL │
│ oportunidades               │ etapa                    │ text │ text │ YES │ 'calificacion'::text │
│ oportunidades               │ estado                   │ text │ text │ YES │ 'abierta'::text │
│ recepciones_activos_cliente │ id                       │ text │ text │ NO │ ('rac_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) │
│ recepciones_activos_cliente │ empresa_id               │ text │ text │ NO │ NULL │
│ recepciones_activos_cliente │ numero                   │ text │ text │ NO │ NULL │
│ recepciones_activos_cliente │ activo_id                │ text │ text │ NO │ NULL │
│ recepciones_activos_cliente │ sociedad_id              │ uuid │ uuid │ YES │ NULL │
│ recepciones_activos_cliente │ numero_caso              │ integer │ int4 │ YES │ NULL │
│ activos                     │ empresa_id               │ text │ text │ NO │ NULL │
│ activos                     │ propietario_tipo         │ text │ text │ NO │ 'propio'::text │
│ cuentas                     │ empresa_id               │ text │ text │ NO │ NULL │
│ cuentas                     │ nombre_comercial         │ text │ text │ NO │ NULL │
│ sociedades                  │ id                       │ uuid │ uuid │ NO │ gen_random_uuid() │
│ sociedades                  │ empresa_id               │ text │ text │ NO │ NULL │
│ usuarios_asignaciones       │ sociedades_ids           │ ARRAY │ _uuid │ YES │ NULL │
```

La salida completa de columnas mostró que `oportunidades` no tiene `numero`, `sociedad_id` ni `activo_id`; tiene `id`, `empresa_id`, `nombre` y `cuenta_id`. En consecuencia, para fabricación el selector debe devolver `o.nombre` como `numero`, el nombre de la cuenta como cliente, y activo/sociedad como nulos. El filtro acordado es `o.estado = 'abierta'`.

Policies remotas observadas:

```text
│ public │ oportunidades               │ crm_oportunidades_select               │ SELECT │ (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'pipeline'::text, 'ver'::text) AND ((responsable_id IS NULL) OR usuario_puede_ver_registro(empresa_id, responsable_id))) │
│ public │ recepciones_activos_cliente │ ops_recepciones_activos_cliente_select │ SELECT │ (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'recepcion_activos_cliente'::text, 'ver'::text)) │
```

La policy de `oportunidades` exige `pipeline.ver`, y la de recepción exige `recepcion_activos_cliente.ver`. Por eso un técnico sin esos permisos no puede leer directamente los padres. La función de servidor propuesta más abajo debe leer como `SECURITY DEFINER` y realizar sus propias validaciones; la página no debe consultar esas tablas directamente.

### Permisos y bypass remoto

Definición remota literal de `usuario_tiene_empresa(text)`:

```sql
CREATE OR REPLACE FUNCTION public.usuario_tiene_empresa(target_empresa_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  or public.usuario_es_superadmin_plataforma();
$function$
```

Definición remota literal de `usuario_puede(text,text,text)`:

```sql
CREATE OR REPLACE FUNCTION public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select public.usuario_es_superadmin_plataforma()
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.es_admin_empresa = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'eliminar' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$function$
```

Conclusión: sí existe bypass para `es_admin_empresa`; además existe bypass para superadmin de plataforma. Un administrador de empresa no necesita una fila explícita en `permisos_roles` para que `usuario_puede` devuelva verdadero. La función propuesta debe conservar primero la validación tenant (`usuario_tiene_empresa`) y luego `diagnostico_tecnico.ver`.

Consulta literal de roles `ops_tecnico` y flags relevantes:

```text
│ DIFESMAQ              │ emp_20601829101 │ rol_emp_20601829101_ops_tecnico │ Técnico Operativo  │ 42 │ true  │ true  │ true  │ false │ true │ true │ true │ false │ true │ true │ true │ false │ false │ false │ false │ false │ false │ false │ false │ false │
│ INGETEC               │ emp_20606120487 │ rol_emp_20606120487_ops_tecnico │ Técnico Operativo  │ 13 │ true  │ true  │ true  │ false │ true │ true │ true │ false │ true │ true │ true │ false │ false │ false │ false │ false │ false │ false │ false │ false │
│ MIC                   │ emp_20600026446 │ rol_emp_20600026446_ops_tecnico │ Técnico Operativo  │ 1  │ true  │ true  │ true  │ false │ true │ true │ true │ false │ true │ true │ true │ false │ false │ false │ false │ false │ false │ false │ false │ false │
│ PRUEBA                │ emp_2000000000  │ rol_emp_2000000000_ops_tecnico  │ Técnico Operativo  │ 6  │ true  │ true  │ true  │ true  │ true │ true │ true │ true  │ true │ true │ true │ true  │ true  │ true  │ true  │ true  │ false │ false │ false │ false │
│ TIDEO TECH & STRATEGY │ emp_20609996464 │ rol_emp_20609996464_ops_tecnico │ Técnico Operativo  │ 0  │ true  │ true  │ true  │ false │ true │ true │ true │ false │ true │ true │ true │ false │ false │ false │ false │ false │ false │ false │ false │ false │
│ WHYNCO                │ emp_20513453711 │ rol_emp_20513453711_ops_tecnico │ Técnico Operativo  │ 16 │ true  │ true  │ true  │ false │ true │ true │ true │ false │ true │ true │ true │ false │ false │ false │ false │ false │ false │ false │ false │ false │
│ ZAHORY                │ emp_20541435833 │ rol_emp_20541435833_ops_tecnico │ PERSONAL OPERATIVO │ 25 │ true  │ false │ false │ false │ true │ false │ false │ false │ true │ true │ true │ false │ false │ false │ false │ false │ false │ false │ false │ false │
```

Columnas del resultado, en orden: `empresa`, `empresa_id`, `rol_id`, `nombre del rol`, `usuarios_activos`, luego cuatro flags de `diagnostico_tecnico`, cuatro de `ot`, cuatro de `partes`, cuatro de `pipeline` y cuatro de `recepcion_activos_cliente`. La consulta corregida usa `count(distinct ue.user_id)`; no mezcla usuarios con la multiplicación de filas de `permisos_roles`. El usuario `03cb9bb6-cd70-4463-81a0-a97b3bb7efae` pertenece a WHYNCO y al rol `Técnico Operativo`; `3752e906-ded9-4f6a-8845-286fe5215356` pertenece a ZAHORY y al rol `PERSONAL OPERATIVO`.

El rol de PRUEBA es una excepción real con `pipeline` verdadero. WHYNCO no tiene `pipeline` ni `recepcion_activos_cliente` verdaderos en su rol `ops_tecnico`; ZAHORY no debe identificarse como WHYNCO.

## 4. Funcion aplicada: listar_referencias_diagnostico

La implementacion vigente esta en [584_listar_referencias_diagnostico.sql](supabase/migrations/584_listar_referencias_diagnostico.sql), aplicada en produccion y verificada con el runner enlazado. Esta seccion no mantiene una copia alternativa del SQL: el archivo de migracion es la fuente unica.

La funcion es SECURITY DEFINER con search_path fijo, valida tenant y permiso diagnostico_tecnico.ver, filtra sociedad en mantenimiento, devuelve el nombre de la oportunidad como numero en fabricacion y no expone datos monetarios. La salida remota verificada es TABLE(id text, numero text, cliente text, activo text, sociedad_id uuid).

La decision de materiales es opcion A: el tecnico no tiene lectura directa de materiales; el conteo observado fue 0 y no se amplio la policy vigente. El selector de materiales queda fuera de esta funcion y requiere una decision de acceso separada.

## 5. Componentes reutilizables

### Disponibles

- Selector con búsqueda de clientes: `ClienteSearchSelect` es local en `CrearOTPage.jsx:119-212`; filtra por nombre, razón social, RUC, contacto o id (`:137-141`) y muestra opciones (`:183-207`).
- Selector con búsqueda de materiales: `SelectorMaterialSolpe` en `pages2_v2.jsx` usa búsqueda local/remota con `.ilike`, selección y creación condicionada por permiso. Es local al archivo y no está exportado como componente común.
- Filas editables repetibles: SOLPE mantiene `items` en estado y actualiza una línea por id (`pages2_v2.jsx:1437-1440`); el formulario agrega filas (`:1581`) y renderiza inputs por línea (`:1584`). Crear OT usa el mismo enfoque para estimaciones (`CrearOTPage.jsx:658-693`).
- Badges de estado: `Badge`, `OFBadge` y `OTBadge` están definidos en `ProduccionPages.jsx:88-100`; Recepción tiene además su propio `badgeClass` y `ESTADO_LABELS` (`RecepcionActivosClientePage.jsx:21-67`) y lo usa en la tabla (`:408-418`).
- Layout: `CardGrid`, `SectionTitle`, `Input` y `Select` existen como helpers locales en `ProduccionPages.jsx:126-159`, pero tampoco son un kit compartido entre todas las páginas.

### Lo que habría que crear o extraer

1. Selector genérico de referencia con búsqueda y estados loading/error, con variantes para recepción y oportunidad.
2. Selector de catálogo para `familia_trabajo`, actividad y tarea, usando las RPC buscar-o-crear y sin exponer costos.
3. Componente de líneas editables del diagnóstico para cargo, horas-hombre, activo propio, horas máquina y materiales anidados.
4. Editor de materiales por línea, con cantidad/unidad y eliminación.
5. Badge de estado compartido para `borrador`/`emitido` y controles de emisión/reapertura según permisos.
6. Helper de permisos de pantalla que distinga `ver`, `crear`, `editar` y `aprobar`; la navegación no debe basarse en roles fijos.

## 6. Plan posterior (máximo 6 pasos)

1. **Ruta y acceso** — tocar `shell.jsx`, `navigation.js`, `workshopOperationsRoutes.jsx` y posiblemente `OperationalApp.jsx` para registrar la ruta y bloquearla cuando `diagnostico_tecnico.ver` sea falso. Riesgo: el route map actual es mock/estático y no es un control de autorización.
2. **Capa de datos** — crear `operaciones-app/src/services/diagnosticoTecnicoService.js` para listar cabecera, líneas y materiales y llamar la función de referencias. Riesgo: no consultar padres directamente con un usuario técnico; RLS y función deben coincidir.
3. **Cabecera** — crear la página y formulario de tipo, referencia, estado y datos libres. Riesgo: fabricación no tiene sociedad en oportunidades; mantenimiento sí debe respetar la sociedad de la recepción.
4. **Líneas y materiales** — crear componentes de filas editables y materiales anidados; usar selectores de catálogo y activo propio. Riesgo: mezclar catálogos o mostrar campos de costo/precio que Operaciones no debe ver.
5. **Estados y permisos** — implementar guardar, emitir y reabrir conforme a `crear`, `editar` y `aprobar`, con errores de RPC/RLS. Riesgo: confundir `aprobar` con permiso para emitir; el contrato vigente indica emitir con `editar` y reabrir con `aprobar`.
6. **Pruebas de aceptación** — validar tenant, sociedad, referencias, buscar-o-crear, edición de líneas y ausencia de dinero en UI; probar con `ops_tecnico`, administrador y usuario sin `ver`. Riesgo: probar solo con el rol de plataforma, que tiene permisos más amplios que los técnicos reales.

## Corrección Fase 3A — selector de referencias

### Migración y esquema verificado

El siguiente número consecutivo de `origin/main` fue `583`; por eso la migración propuesta es `supabase/migrations/584_listar_referencias_diagnostico.sql`. La reversión queda en `supabase/reversiones/585_revert_listar_referencias_diagnostico.sql` y el dry run en `supabase/tests/584_listar_referencias_diagnostico_dry_run.sql`. La migración contiene únicamente `CREATE OR REPLACE FUNCTION`, `REVOKE` y `GRANT`; no contiene `BEGIN`, `COMMIT` ni `ROLLBACK`. El script de pruebas sí contiene `BEGIN` y termina en `ROLLBACK`.

Columnas reales confirmadas por `information_schema`:

```text
│ activos │ codigo                 │ text │ NO │
│ activos │ nombre                 │ text │ NO │
│ activos │ marca                  │ text │ YES │
│ activos │ modelo                 │ text │ YES │
│ activos │ placa_serie            │ text │ YES │
│ activos │ cliente_propietario_id │ text │ YES │
│ cuentas │ nombre_comercial       │ text │ NO │
│ cuentas │ razon_social           │ text │ YES │
```

La función usa esas columnas y hace los joins por `empresa_id`. Para fabricación el filtro es `o.estado = 'abierta'` y la columna `numero` devuelve `o.nombre`. Los conteos remotos de oportunidades por estado/etapa fueron:

```text
│ emp_2000000000  │ 14 │ abierta │ calificacion │
│ emp_2000000000  │  1 │ ganada  │ calificacion │
│ emp_2000000000  │ 24 │ ganada  │ ganada       │
│ emp_20513453711 │  1 │ abierta │ calificacion │
│ emp_20513453711 │  1 │ ganada  │ ganada       │
│ emp_20513453711 │  3 │ perdida │ perdida      │
│ emp_20541435833 │  5 │ abierta │ calificacion │
│ emp_20541435833 │  1 │ abierta │ propuesta    │
│ emp_20541435833 │ 10 │ ganada  │ ganada       │
│ emp_20601829101 │  2 │ ganada  │ ganada       │
│ emp_20606120487 │  1 │ abierta │ negociacion  │
│ emp_20606120487 │  3 │ ganada  │ ganada       │
│ emp_20606120487 │  1 │ perdida │ perdida      │
│ emp_20609996464 │  5 │ abierta │ calificacion │
│ emp_20609996464 │  3 │ abierta │ negociacion  │
│ emp_20609996464 │  3 │ abierta │ propuesta    │
│ emp_20609996464 │  3 │ ganada  │ ganada       │
```

El registro abierto real de WHYNCO fue `opp_347840`, con `numero = REPARACION DE UNIDAD HIDRAULICA — AMB INGENIERIA Y PROYECTOS` y cliente `A.M.B INGENIERIA Y PROYECTOS S.A.C.`.

### Catálogos visibles por el técnico real de WHYNCO

Usuario probado: `03cb9bb6-cd70-4463-81a0-a97b3bb7efae`, empresa WHYNCO, rol `rol_emp_20513453711_ops_tecnico`, `Técnico Operativo`. Conteos directos bajo JWT autenticado:

```text
tipos_servicio_interno=73
familia_trabajo=6
cargos_empresa=28
materiales=0
activos propios=55
```

El cero de materiales es real y está explicado por la policy remota. La decisión de producto para esta fase es opción A: materiales=0 para el técnico; no se amplía la policy ni se exponen precios.

```text
public | materiales | log_materiales_select | SELECT |
(usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'inventario'::text, 'ver'::text))
```

El rol WHYNCO no tiene una fila `inventario.ver` verdadera en la consulta de permisos del dry run. No se amplió esa policy. Ajuste recomendado, sin aplicar: exponer un RPC `SECURITY DEFINER` separado que valide `usuario_tiene_empresa` + `diagnostico_tecnico.ver` y devuelva solo `id`, `codigo`, `descripcion` y `unidad` de materiales; no conviene conceder lectura directa porque la tabla contiene `precio_unitario` y otros campos monetarios.

### Dry run real y resultado calculado

El contenido de la migración y del dry run se ejecutó dentro de una transacción contra el proyecto enlazado; el camino de ejecución llegó al final y no dejó la función aplicada. La salida calculada, capturada mediante una ejecución de inspección que fuerza rollback automático, fue:

```text
DRY_RESULTS:[
{"case_name":"a_tecnico_whynco_mantenimiento","ok":true,"expected":"filas > 0; la función filtra empresa_id=emp_20513453711","actual":"filas=2","sqlerrm":null,"statement":"select * from public.listar_referencias_diagnostico('emp_20513453711','mantenimiento',null)"},
{"case_name":"b_sociedad_restringida_3752","ok":true,"expected":"0 filas fuera de c13395ae-55ba-49b3-89c4-c1c1c96223fe y 0 con sociedad NULL","actual":"filas=0 fuera_sociedad=0 sociedad_null=0","sqlerrm":null,"statement":"select * from listar_referencias_diagnostico('emp_20541435833','mantenimiento',null) con alcance c13395ae-55ba-49b3-89c4-c1c1c96223fe"},
{"case_name":"c_otro_tenant","ok":true,"expected":"0 filas","actual":"filas=0","sqlerrm":null,"statement":"select * from listar_referencias_diagnostico('emp_20513453711','mantenimiento',null) con usuario ZAHORY"},
{"case_name":"catalogos_whynco","ok":false,"expected":"tipos>0, familias>0, cargos>0, materiales>0, activos_propios>0","actual":"tipos=73 familias=6 cargos=28 materiales=0 activos_propios=55","sqlerrm":null,"statement":"select count(*) from tipos_servicio_interno, familia_trabajo, cargos_empresa, materiales y activos propios"},
{"case_name":"d_sin_diagnostico_ver","ok":true,"expected":"0 filas","actual":"filas=0","sqlerrm":null,"statement":"select * from listar_referencias_diagnostico('emp_20513453711','mantenimiento',null) con usuario WHYNCO sin diagnostico.ver"},
{"case_name":"e_fabricacion_abiertas_nombre","ok":true,"expected":"filas > 0; numero no vacío, distinto de id, activo/sociedad NULL","actual":"filas=1 filas_invalidas=0","sqlerrm":null,"statement":"select id,numero,cliente,activo,sociedad_id from listar_referencias_diagnostico('emp_20513453711','fabricacion',null)"},
{"case_name":"f_anon","ok":true,"expected":"permission denied for function listar_referencias_diagnostico","actual":"sqlstate=42501","sqlerrm":"permission denied for function listar_referencias_diagnostico","statement":"select * from public.listar_referencias_diagnostico('emp_20513453711','mantenimiento',null) como anon"},
{"case_name":"g_tipo_invalido","ok":true,"expected":"SQLSTATE 22023 y mensaje Tipo de referencia no válido","actual":"sqlstate=22023","sqlerrm":"Tipo de referencia no válido: otro","statement":"select * from public.listar_referencias_diagnostico('emp_20513453711','otro',null)"},
{"case_name":"h_sin_datos_monetarios","ok":true,"expected":"0 claves monetarias en la fila devuelta","actual":"filas=3 claves_monetarias=0","sqlerrm":null,"statement":"jsonb_object_keys(to_jsonb(f)) sobre las filas de ambos tipos"}
]
```

El caso de sociedad restringida dio cero porque la única recepción real de ZAHORY está en `b7379adf-a7bd-4883-ac32-f60271ed7b3b`, mientras el usuario `3752e906` tiene alcance restringido a `c13395ae-55ba-49b3-89c4-c1c1c96223fe`. No existe en producción una recepción de prueba dentro de su sociedad para un control positivo; no se insertó ninguna.

La conexión TCP directa de `psql` al pooler y al host directo agotó timeout en este entorno. Por ello no se debe etiquetar como “salida cruda de psql” la salida del canal enlazado: el archivo `supabase/tests/584_listar_referencias_diagnostico_psql_output.txt` registra esa limitación y la evidencia real obtenida por el canal alternativo. El script entregado sí es psql-compatible y contiene las directivas `BEGIN`, `\ir`, `SAVEPOINT`, `SQLERRM` y `ROLLBACK`.

## STOP GATE

Esta auditoría no implementa la pantalla, rutas, función SQL, permisos ni cambios de base de datos. El informe queda detenido a la espera de autorización para el siguiente paso.
