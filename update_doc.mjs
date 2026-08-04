import fs from 'fs';
import path from 'path';

const docPath = path.join(process.cwd(), 'Documents', 'Documentomaestro.md');
let doc = fs.readFileSync(docPath, 'utf8');

// 1. Update Date
doc = doc.replace(
  /Arquitectura Multitenant SaaS · Última actualización: \d{2}\/\d{2}\/\d{4}/,
  'Arquitectura Multitenant SaaS · Última actualización: 02/08/2026'
);
doc = doc.replace(
  /Estado de desarrollo — \d{2}\/\d{2}\/\d{4}/,
  'Estado de desarrollo — 02/08/2026'
);

// 2. Update Resumen de progreso
doc = doc.replace(
  /\| Módulos implementados \(construidos\) \| ~74 ítems activos de sidebar\/ruta \|/,
  '| Módulos implementados (construidos) | ~75 ítems activos de sidebar/ruta |'
);
doc = doc.replace(
  /\| Migraciones SQL registradas en el repositorio \| 365 archivos SQL locales, hasta `363_postulacion_publica_idempotente\.sql` \|/,
  '| Migraciones SQL registradas en el repositorio | 384 archivos SQL locales, hasta `383_reinicio_jornada_por_trabajadores.sql` |'
);
doc = doc.replace(
  /\| Migración local más reciente \| `363_postulacion_publica_idempotente\.sql`[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*/,
  `| Migración local más reciente | \`383_reinicio_jornada_por_trabajadores.sql\`: reinicio de roster minero con impactos, salud de implementación por tenant.
| Migraciones creadas pendientes de confirmar contra Supabase real | Verificar aplicación remota. Nuevas posteriores al corte anterior (364-383):
- Salud de Implementación: configuración, anotaciones y respuestas multitenant.
- Reinicio de Roster Minero y Jornadas de Trabajadores con previsualización de impactos.
- Refactorización de lógicas de responsabilidades TIDEO/Cliente.`
);

// 3. Update 3.2 Inventario de módulos (Configuración)
doc = doc.replace(
  /\| Parámetros Generales \| ✅ Implementado \| Tabla `afp_parametros` multitenant completa \(prima, flujo, mixta\)\. \|/,
  `| Parámetros Generales | ✅ Implementado | Tabla \`afp_parametros\` multitenant completa (prima, flujo, mixta). |
| Salud de Implementación | ✅ Implementado | Dashboard interactivo de configuración y anotaciones compartidas TIDEO/Cliente. Control RLS estricto para "solo interno". |`
);

// 4. Update 3.7 GAPS
doc = doc.replace(
  /### 3\.7 GAPS de Auditoría \(Resultados de Revisión Continua\)[\s\S]*?## 4\. Arquitectura Multitenant/m,
  `### 3.7 GAPS de Auditoría (Resultados de Revisión Continua)

#### [A] TÉCNICO — Implementado en código pero NO documentado
- **Migraciones 364 a 383**: Se implementó el módulo completo "Salud Implementación" y el "Reinicio de Roster Minero", no reflejados previamente.
- **Nuevas Tablas**: \`tideo_salud_configuracion\`, \`tideo_salud_anotaciones\`, \`tideo_salud_comentarios\`.
- **Servicios/RPCs**: \`get_salud_implementacion_conteos\`, funciones de previsualización de reinicio de roster y jornadas.
- **UI**: \`pages_salud_tenant.jsx\` para la vista de progreso del cliente, integrada en \`shell.jsx\`.

#### [B] TÉCNICO — Documentado pero NO implementado o desactualizado
- **Sección 3.1**: El documento indicaba la migración 363 como la más reciente; el código real ya va por la 383.
- **Inventario (3.2)**: "Salud de Implementación" ahora es un módulo oficial en Configuración.

#### [C] LÓGICA DE NEGOCIO — Regla/validación en código que el documento no refleja
- **Salud de Implementación**: Existen anotaciones "solo interno" para TIDEO, protegidas por RLS. El acceso requiere ser Superadmin o ser explícitamente "Admin Empresa" del tenant respectivo.
- **Reinicio Roster Minero**: Se exige una evaluación de impactos (previsualización de registros a eliminar) antes de reiniciar un roster o la jornada de los trabajadores para evitar pérdida de datos consolidados.

#### [D] LÓGICA DE NEGOCIO — Regla documentada que el código contradice o ignora
- La plataforma solo asume métricas genéricas SaaS en Plataforma, pero el código delega el control cualitativo a la nueva sección de "Salud de Implementación" parametrizada por tabla base de cada módulo.

#### [E] FLUJOS — Flujo real difiere del flujo documentado
- **Onboarding/Implementación**: TIDEO (superadmin) y el Cliente interactúan a través de hilos de comentarios sobre el estado de carga de las tablas maestras y transaccionales, creando un nuevo flujo asíncrono de implementación.
- **Ciclo RRHH (Roster)**: El flujo operativo incluye ahora la etapa explícita de "Reinicio / Recálculo con previsualización" de la jornada en caso de errores de configuración inicial del Roster.

#### [F] FLUJOS — Flujo documentado que el código nunca implementó
- N/A.

## 4. Arquitectura Multitenant`
);

// 5. Update Sidebar (6.)
doc = doc.replace(
  /CONFIGURACIÓN\n  Usuarios/,
  `CONFIGURACIÓN
  Usuarios`
);
doc = doc.replace(
  /  Tarifarios/,
  `  Tarifarios
  Salud Implementacion`
);
// In plataforma superadmin section
doc = doc.replace(
  /  Métricas SaaS/g,
  `  Métricas SaaS`
); 
// Ensure it's not duplicate added

// 6. Update Flujos (7.)
doc = doc.replace(
  /### 7\.5 Flujo de campo \(PWA\)/,
  `### 7.5 Flujo de campo (PWA)`
);
const flujoImp = `
### 7.6 Flujo de Implementación de Tenants

\`\`\`
Creación de Tenant (Superadmin TIDEO)
         ↓
    Configuración Base (Salud Implementación)
    (TIDEO mapea pantallas críticas y tablas maestras asociadas)
         ↓
    Cliente / TIDEO llenan datos en tablas (Usuarios, Cargos, CC, etc.)
         ↓
    Conteo Automático (RPC get_salud_implementacion_conteos)
    (El sistema detecta cuántos registros tiene cada tabla)
         ↓
    Anotaciones e Hilos de Comentarios
    (TIDEO y el Cliente dialogan sobre el estado de cada bloque)
    (TIDEO puede dejar notas "solo_interno" protegidas por RLS)
         ↓
    Paso a Producción (Tenant 100% configurado)
\`\`\`
`;
doc = doc.replace(
  /---\s*\n\s*## 8\. Detalle funcional de módulos/,
  flujoImp + '\n---\n\n## 8. Detalle funcional de módulos'
);

// 7. Update Detalle Funcional (8.)
// 8.1 Plataforma
doc = doc.replace(
  /### 8\.1 Plataforma — Gestión de Empresas \/ Tenants[\s\S]*?---/,
  `### 8.1 Plataforma — Gestión de Empresas / Tenants

Registro operativo de empresa: razón social, nombre comercial, RUC/NIT, país, moneda base, zona horaria y estado. La creación de tenant la realiza **Superadmin TIDEO** desde Plataforma. Se enlaza con el módulo de **Salud de Implementación**, que permite a TIDEO y al admin de la empresa auditar visualmente el progreso de configuración de maestros y transacciones (cuántos registros se han cargado vs esperados), con hilos de comentarios bidireccionales y anotaciones privadas.

---`
);

// Roster Minero
doc = doc.replace(
  /\| Roster Minero \| ✔ Implementado \| Snapshots de roster por período\/ciclo, cálculo de estado minero y cierre de roster. \*\*Gestión avanzada:\*\* Inclusión de tabla `roster_minero_ajustes` para revisiones manuales, snapshots dirigidos y vinculación con sedes como tipo UM\./,
  `| Roster Minero | ✔ Implementado | Snapshots de roster por período/ciclo, cálculo minero y cierre. **Gestión avanzada:** Tabla \`roster_minero_ajustes\` para revisiones, snapshots dirigidos y UM. **Reinicio Controlado:** Lógica de previsualización (\`previsualizar_reinicio_roster_minero\`) para calcular impactos antes de efectuar reinicios de roster o jornadas completas de trabajadores.`
);


fs.writeFileSync(docPath, doc, 'utf8');
console.log('Documento actualizado correctamente.');
