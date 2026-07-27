
const fs = require('fs');
let content = fs.readFileSync('Documents/Documentomaestro.md', 'utf8');

// 1. Update dates
content = content.replace(/23\/07\/2026/g, '27/07/2026');

// 2. Update 3.1 Resumen de progreso
content = content.replace(/358 archivos SQL locales, hasta 355_habilitar_ausencias_autorizadas_mineros.sql/g, '365 archivos SQL locales, hasta 363_postulacion_publica_idempotente.sql');
content = content.replace(/355_habilitar_ausencias_autorizadas_mineros.sql: habilitación de permisos con goce, ajustes en ingresos extraordinarios, pensionario y retro wall expandido./g, '363_postulacion_publica_idempotente.sql: flujos de postulación pública, servicios de precios, importadores masivos CXC/CXP y facturación CEBE.');

const migracionesNuevas = Verificar aplicación remota. Nuevas posteriores al corte anterior (356-363):
- Validaciones contractuales estrictas de jornadas.
- Importadores masivos para Cuentas por Cobrar (CxC), Cuentas por Pagar (CxP) y Recibos por Honorarios (RHE).
- Flujos directos entre Facturas y Centros de Beneficio (CEBE).
- Idempotencia en Postulaciones Públicas de RRHH.
- Asignación de servicios de precios a clientes específicos.;

content = content.replace(/Verificar aplicación remota. Nuevas posteriores al corte anterior \(339-355\):.*/g, migracionesNuevas);

// 3. Update 3.7 GAPS de Auditoría
const gapSection = ### 3.7 GAPS de Auditoría (Resultados de Revisión Continua)

#### [A] TÉCNICO — Implementado en código pero NO documentado
- **Migraciones 356 a 363**: Se implementaron importadores masivos, reglas de coberturas contractuales y precios por cliente, que no estaban reflejados en el plan original.
- **Nuevas Tablas**: \ingresos_extraordinarios\, \personal_asignaciones_um\, \oster_minero_ajustes\, \
iveles_jerarquicos\, \servicio_precios_cliente\.
- **Servicios**: \cxcMassiveImportService.js\, \cxpMassiveImportService.js\.

#### [B] TÉCNICO — Documentado pero NO implementado o desactualizado
- **Estados de Módulos**: Módulos que figuraban como 'En progreso' ya están consolidados (ej. Asignaciones Mineras, Jerarquías de Posición).

#### [C] LÓGICA DE NEGOCIO — Regla/validación en código que el documento no refleja
- **Devengos ER**: El código excluye explícitamente registros de devengos si \
o_devengar_er\ es \	rue\ o si \ecepcion_id != null\, lo cual impacta el modelo de costos.
- **Retro Wall Expandido**: Ahora incluye \condiciones_laborales\ y \signaciones_jornada\.
- **Cobertura Contractual**: El código valida que un turno no pueda existir sin un contrato primigenio subyacente (\357_validar_cobertura_contractual_jornada.sql\).

#### [D] LÓGICA DE NEGOCIO — Regla documentada que el código contradice o ignora
- La postulación de candidatos ya no requiere aprobación manual previa en flujo estándar; el código implementa \363_postulacion_publica_idempotente.sql\ para asegurar inserción única sin fricción.

#### [E] FLUJOS — Flujo real difiere del flujo documentado
- **Facturas y CEBE**: Las facturas ahora pueden ligarse directamente a Centros de Beneficio sin pasar obligatoriamente por una Orden de Servicio Cliente (OS), habilitando ingresos no operativos.
- **Importadores Masivos**: Existen vías alternativas a la creación manual de CxC y CxP vía carga masiva, alterando el flujo de 'Origen único' en finanzas.

#### [F] FLUJOS — Flujo documentado que el código nunca implementó
- N/A para esta revisión.
;

// Insert the updated gap analysis section
if (content.includes('### 3.7 GAPS de Auditoría')) {
  content = content.replace(/### 3.7 GAPS de Auditoría[\s\S]*?(?=## 4. Arquitectura)/, gapSection + '\n');
} else {
  content = content.replace(/(?=## 4. Arquitectura)/, gapSection + '\n');
}

// 4. Update section 9.3 Tablas de negocio
const nuevasTablas = 
### \ingresos_extraordinarios\
Gestión de ingresos no recurrentes acoplados a nómina.
- \id\, \empresa_id\, \personal_id\, \concepto\, \monto\, \periodo_aplicacion\, \estado\

### \servicio_precios_cliente\
Listas de precios customizadas por servicio y cliente específico.
- \id\, \empresa_id\, \servicio_id\, \cuenta_id\, \precio\, \moneda\
;

if (!content.includes('\servicio_precios_cliente\')) {
  content = content.replace(/(?=## 10. Reglas transversales)/, nuevasTablas + '\n');
}

fs.writeFileSync('Documents/Documentomaestro.md', content);
console.log('Documentomaestro.md updated successfully.');

