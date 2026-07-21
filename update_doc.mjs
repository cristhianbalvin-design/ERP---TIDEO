import fs from 'fs';
import path from 'path';

const DOC_PATH = path.join(process.cwd(), 'Documents', 'Documentomaestro.md');
let content = fs.readFileSync(DOC_PATH, 'utf-8');

// 1. Update Header date
content = content.replace(/Última actualización: \d{2}\/\d{2}\/\d{4}/, `Última actualización: 21/07/2026`);

// 2. Update Section 3.1
content = content.replace(/270 archivos SQL locales, hasta `268_fix_liquidaciones_cxp_id_type.sql`/g, `340 archivos SQL locales, hasta \`338_backfill_asistencia_ciclos_mineros.sql\``);
content = content.replace(/`268_fix_liquidaciones_cxp_id_type.sql`: fix en tipo de id de cuenta por pagar para liquidaciones por cese, tras una serie de migraciones de contratos, periodos de documentos y bloqueos de portal./g, `\`338_backfill_asistencia_ciclos_mineros.sql\`: ajustes de herencia en ciclos mineros e inmutabilidad de asistencia, tras el despliegue del motor de Posiciones, Retro Wall y Vigencia Efectiva.`);
content = content.replace(/Verificar aplicación remota. Nuevas posteriores al corte anterior: 269–277 \(maestro tipos contrato, supervisor huérfano, turnos detalle días, reclutamiento anónimo, turnos HE\)./, `Verificar aplicación remota. Nuevas posteriores al corte anterior (269-338): despliegue profundo del módulo de Posiciones, Unidades Organizacionales, Jerarquía Matricial, Retro Wall de nómina, y reglas estrictas de Vigencia Efectiva Contractual.`);
content = content.replace(/Corrección de supervisor huérfano;.*Self-read de email\./s, `**Arquitectura RRHH:** Migración masiva de la estructura de cargos a un modelo dinámico de Posiciones y Unidades Organizacionales con herencia matricial; **Seguridad y Nómina:** Inmutabilidad de periodos mediante Retro Wall y bloqueos duros de asistencia según Vigencia Efectiva Contractual; **Roster Minero:** Motor avanzado de Snapshots y cierres mineros.`);

// 3. Update Section 3.2 (RRHH)
// Add Posiciones y Organigrama
content = content.replace(/\| Organigrama \| ✔ Implementado \| Vista jerárquica por roles, jefes funcionales y asignaciones. \|/, `| Organigrama | ✔ Implementado | Arquitectura avanzada basada en Posiciones, Unidades Organizacionales, Jerarquía Matricial (líder principal y reporting line), origen de asignación, y sincronización continua (cargo <-> posición). |`);

// Update Control Asistencia with Vigencia Efectiva
content = content.replace(/\| Control de Asistencia \| ✔ Implementado \| Tabs diaria, semanal, mensual, resumen, autorizaciones HE, biométrico y SAR\/geocercas. Tardanzas, horas extra, importación biométrica, GPS móvil y validación de geocerca. \|/, `| Control de Asistencia | ✔ Implementado | Tabs diaria, semanal, mensual, resumen, autorizaciones HE, biométrico, SAR/geocercas. **Vigencia Efectiva:** validación estricta de estado contractual que bloquea registros si el contrato no está en periodo activo. Tardanzas, HE, GPS móvil. |`);

// 4. Update Section 3.7
const gapAContent = `| **Administración / RRHH** | **Posiciones y Unidades Organizacionales** | Alto | Implementación de \`unidades_organizacionales\`, \`posiciones\`, \`matriciales_posicion\`, \`niveles_jerarquicos\`. Arquitectura profunda que reemplaza el organigrama simple. |
| **RRHH / Nómina** | **Retro Wall y Vigencia Efectiva** | Alto | Implementación de inmutabilidad (\`retro_wall\`) para documentos y nómina, y bloqueos estrictos de asistencia basados en vigencia contractual (\`bloqueo_asistencia_vigencia_efectiva.sql\`). |
| **Operaciones** | **Geocercas Polígonos y SAR Notificaciones** | Medio | Mejoras de geolocalización (\`geocerca_poligono\`) y lógicas Búsqueda y Rescate (SAR no llegada). |`;

const gapCContent = `| \`269\`–\`338\` | Registradas localmente | Implementación masiva del motor de Posiciones, Unidades Organizacionales, Jerarquía Matricial, Retro Wall de Nómina, Vigencia Efectiva Contractual y ajustes en Roster/Ciclos mineros. |`;

content = content.replace(/\| \*\*Compras\*\* \/ `comprasService.js`, `context.jsx` \| \*\*Seguimiento OC, Tránsitos y GRNI\*\* \| Medio \| Lógica base implementada para soportar seguimiento de Órdenes de Compra en tránsito y valorización GRNI \(Goods Received Not Invoiced\). \|/, `| **Compras** / \`comprasService.js\`, \`context.jsx\` | **Seguimiento OC, Tránsitos y GRNI** | Medio | Lógica base implementada para soportar seguimiento de Órdenes de Compra en tránsito y valorización GRNI (Goods Received Not Invoiced). |\n${gapAContent}`);

content = content.replace(/\| `249`–`268` \| Registradas localmente \| Fix de ID en liquidaciones de cese, sincronización área-contrato, reglas de predecesor\/sucesor, periodos de documentos, consolidación de tipos, bloqueo cese trigger, job de contrato primigenio. \|/, `| \`249\`–\`268\` | Registradas localmente | Fix de ID en liquidaciones de cese, sincronización área-contrato, reglas de predecesor/sucesor, periodos de documentos, consolidación de tipos, bloqueo cese trigger, job de contrato primigenio. |\n${gapCContent}`);

// 5. Update Section 5
const sec5Append = `
### 5.8 Organigrama basado en Posiciones

El organigrama ya no es una simple representación de usuarios y roles, sino una **arquitectura de Posiciones**:
- **Posición**: Es la silla, no la persona. Una posición pertenece a una Unidad Organizacional, requiere un Cargo, y tiene un líder principal (jerarquía lineal).
- **Relaciones Matriciales**: Una posición puede reportar indirectamente a otras posiciones.
- **Sincronización Continua**: Al asignar un usuario a una posición, su "cargo" en RRHH se mantiene sincronizado automáticamente. Las responsabilidades en el sistema recaen en la Posición (ej: aprobador), de modo que si el ocupante cambia, el flujo no se rompe.

### 5.9 Vigencia Efectiva y Retro Wall

Dos conceptos críticos protegen la inmutabilidad de la información operativa:
- **Vigencia Efectiva**: Un trabajador solo "existe" operativamente durante los periodos en que su contrato está activo. El Control de Asistencia incluye bloqueos estrictos: no permite registrar ingresos si la vigencia no lo ampara.
- **Retro Wall**: Funciona como un candado histórico. Los registros de nómina, partes diarios y documentos críticos quedan inmutables en periodos cerrados, protegiendo las declaraciones legales de modificaciones accidentales.
`;

content = content.replace(/## 6\. Estructura del sidebar/, `${sec5Append}\n## 6. Estructura del sidebar`);

// 6. Update Section 7.3
content = content.replace(/Registrar asistencia diaria \(entrada \/ salida \/ tardanza \/ falta\)/, `Registrar asistencia diaria (validación de Vigencia Efectiva bloquea ingresos si el contrato no ampara la fecha)`);
content = content.replace(/Cerrar período:\n      → Egreso planilla en Administración → Gastos/, `Cerrar período (activa el Retro Wall, volviendo la nómina inmutable):\n      → Egreso planilla en Administración → Gastos`);

fs.writeFileSync(DOC_PATH, content, 'utf-8');
console.log('Update successful');
