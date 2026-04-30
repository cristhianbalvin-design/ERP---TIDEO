# Matriz De Dependencias - TIDEO ERP

## Proposito

Esta matriz define el orden tecnico recomendado entre modulos y los datos que cruzan de un dominio a otro. Sirve para evitar duplicidad de fuentes de verdad y para decidir que modulo debe implementarse antes cuando hay dependencias transaccionales.

## Reglas Base

- CRM origina clientes, contactos, oportunidades y condiciones comerciales.
- Comercial origina cotizaciones y OS Cliente.
- Operaciones ejecuta el servicio desde OS Cliente.
- Compras nace desde SOLPE o necesidades internas, no desde Maestros Base.
- Inventario se actualiza por recepciones, consumos, ajustes y transferencias.
- RRHH calcula nomina; Operaciones usa costo hora, no calcula sueldo.
- Finanzas consolida ventas, CxC, CxP, tesoreria, gastos, deuda y ER.
- Customer Success consume senales comerciales, operativas y financieras.
- IA consume datos y registra recomendaciones, no aprueba ni altera estados criticos por si sola.

## Dependencias Por Modulo

| Modulo | Depende de | Alimenta a | Datos clave |
|--------|------------|------------|-------------|
| Empresas / Tenants | Ninguno | Todos | `empresa_id`, plan, estado tenant |
| Usuarios | Empresas, Roles | Auditoria, permisos UI | usuario, empresas asociadas |
| Roles y Permisos | Usuarios, pantallas | Sidebar, RLS, acciones | permisos por pantalla, permisos especiales |
| Maestros Base | Ninguno | Selectores de modulos | cargos, servicios, materiales, almacenes, monedas |
| Leads | Maestros, Usuarios | Cuentas, Contactos, Oportunidades | fuente, responsable, necesidad, RUC opcional |
| Cuentas y Contactos | Leads, Maestros | Cotizaciones, OS Cliente, CxC, CS | cliente, condiciones comerciales, contactos |
| Pipeline | Leads, Cuentas | Cotizaciones, Forecast, CS | oportunidad, etapa, probabilidad |
| Actividades Comerciales | Leads, Cuentas, Oportunidades | BI Comercial, CS | seguimiento, fecha, responsable |
| Cotizaciones | Cuentas, Oportunidades, Servicios | OS Cliente, Ventas proyectadas | version, items, precio, descuento |
| OS Cliente | Cotizaciones, Cuentas | OT, Valorizacion, Facturacion | alcance, saldos, cliente, proyecto |
| Planner y Recursos | Personal, Turnos, OT | Operaciones, Dashboard | agenda, cuadrilla, disponibilidad |
| Backlog | OS Cliente, Operaciones | OT | necesidad pendiente, prioridad |
| Ordenes de Trabajo | OS Cliente, Planner, Personal | Partes, Costos, Valorizacion | OT, tecnico, servicio, SLA |
| Partes Diarios | OT, Personal, Inventario | Costos OT, Cierre Tecnico | horas, avance, materiales, evidencias |
| Cierre Tecnico | OT, Partes | Valorizacion, Facturacion | conformidad, cierre, calidad |
| Costos por OT | Partes, Inventario, Nomina, Compras | BI Financiero, ER | mano de obra, materiales, terceros |
| SOLPE Interna | OT, Areas internas, Maestros | Compras | requerimiento, urgencia, centro costo |
| Proveedores | Maestros, Compras | Cotizaciones compra, OC, OS interna, CxP | homologacion, score, condiciones |
| Cotizaciones Compra | SOLPE, Proveedores | OC, OS Interna | comparativo, ganador, justificacion |
| Ordenes de Compra | Cotizaciones Compra, Proveedores | Recepciones, CxP | bienes, cantidades, precios |
| Ordenes de Servicio Interna | Cotizaciones Compra, Proveedores | Conformidad proveedor, CxP | alcance, entregables, servicio tercero |
| Recepciones | OC, OS Interna | Inventario, CxP, Evaluacion proveedor | recibido, observado, parcial |
| Inventario / Kardex | Recepciones, Partes, Ajustes | OT, Costos, BI Operativo | stock, movimientos, almacen |
| Personal Operativo | RRHH, Turnos, Nomina | Planner, OT, Partes, Costos OT | tecnico, especialidad, costo hora |
| Personal Administrativo | RRHH | Nomina, permisos internos | colaborador, area, contrato |
| Turnos y Horarios | Personal | Asistencia, Planner | entrada, salida, tolerancia |
| Control de Asistencia | Turnos, Personal | Nomina | tardanza, falta, horas extra |
| Nomina | Asistencia, Personal, Prestamos personal | Tesoreria, Gastos, Costos hora | bruto, descuentos, cargas, neto |
| Prestamos al Personal | Personal, Nomina | Nomina | cuota, saldo, descuento automatico |
| Ventas | OS Cliente, Facturacion | ER | venta, cliente, moneda |
| Facturacion | Valorizacion, OS Cliente, Cuenta | CxC, Ventas, ER | factura, impuesto, vencimiento |
| Cuentas por Cobrar | Facturacion, Clientes | Tesoreria, CS, BI Financiero | saldo, vencimiento, cobranza |
| Cuentas por Pagar | Recepciones, Compras, Gastos | Tesoreria, BI Financiero | proveedor, vencimiento, saldo |
| Tesoreria / Match | CxC, CxP, Nomina, Financiamiento | Flujo caja, ER auxiliar | ingresos, egresos, conciliacion |
| Financiamiento y Deuda | Empresas, Bancos, Tesoreria | ER, Tesoreria, Dashboard | capital, interes, amortizacion, moneda |
| Estado de Resultados | Ventas, Costos OT, Gastos, Nomina, Financiamiento | BI Financiero, Gerencia | ingresos, costos, gastos, intereses |
| Presupuesto vs Real | Centros costo, Transacciones financieras | Gerencia, Alertas | presupuesto, real, variacion |
| Onboarding | Cliente ganado, CS | Health Score | tareas, hitos, responsable |
| Planes de Exito | Cuentas, Onboarding | Health Score, Renovaciones | objetivos, adopcion |
| Health Score | CS, Soporte, CxC, NPS | Renovaciones, Alertas | score, riesgo, tendencia |
| Renovaciones | Contratos, Health Score, Finanzas | Pipeline, CS | vencimiento, oportunidad renovacion |
| NPS | Clientes, Servicios | Health Score, Fidelizacion | encuesta, promotor, detractor |
| IA Comercial | CRM, Comercial | IA Logs | recomendacion, resumen, accion |
| IA Operativa | OT, Tickets, Partes | IA Logs | clasificacion, riesgo, resumen |
| IA Financiera | ER, CxC, CxP, Deuda | IA Logs | alerta, explicacion, recomendacion |
| Campo Movil | Auth, Permisos, OT, Compras | Partes, Evidencias, Gastos pendientes | GPS, fotos, origen campo |

## Cadenas Criticas

### Cadena Comercial A Caja

Lead -> Cuenta -> Oportunidad -> Cotizacion -> OS Cliente -> OT -> Parte Diario -> Cierre Tecnico -> Valorizacion -> Factura -> CxC -> Tesoreria -> Estado de Resultados.

Riesgo:
- Si Facturacion se implementa antes de OS Cliente y Valorizacion, se duplican fuentes de venta.

### Cadena Compra A Costo

SOLPE -> Cotizacion Compra -> OC/OS Interna -> Recepcion -> Inventario/CxP -> Consumo en OT -> Costos OT -> Estado de Resultados.

Riesgo:
- Si Inventario no recibe movimientos desde Recepciones y Partes, el Kardex queda decorativo.

### Cadena RRHH A Costos

Turnos -> Asistencia -> Nomina -> Costo hora real -> Parte Diario -> Costo OT.

Riesgo:
- Si OT calcula costo de mano de obra sin Nomina, se mezcla control operativo con remuneracion.

### Cadena Financiamiento A ER

Financiamiento -> Tabla de amortizacion -> Pago cuota -> Interes a gasto financiero -> Capital reduce saldo -> Egreso total en Tesoreria -> ER.

Riesgo:
- Si capital se registra como gasto, el ER queda contablemente incorrecto.

### Cadena Customer Success

Cliente ganado -> Onboarding -> Plan de Exito -> Health Score -> Renovacion -> Pipeline.

Riesgo:
- Si CS no consume CxC y operacion, el Health Score queda subjetivo.

## Orden Minimo Para Evitar Retrabajo

1. Plataforma, Auth, Roles y Tenancy.
2. Helpers y capa de datos.
3. CRM y Comercial.
4. Operaciones.
5. Compras e Inventario.
6. RRHH y Nomina.
7. Finanzas.
8. Customer Success.
9. IA.
10. Campo Movil.
11. QA y Produccion.

## Modulos Piloto Recomendados

### Piloto Tecnico
Financiamiento y Deuda.

Motivo:
- Ya expuso problemas reales de multimoneda, amortizacion, pagos parciales, recalculo financiero e integracion con ER/Tesoreria.

### Piloto De Flujo End-To-End
Lead -> Cuenta -> Cotizacion -> OS Cliente -> OT -> Factura -> CxC -> Cobranza.

Motivo:
- Demuestra valor del ERP de punta a punta para empresas de servicios.

### Piloto Backoffice
SOLPE -> OC -> Recepcion -> Inventario -> CxP -> Tesoreria.

Motivo:
- Prueba compras, stock y obligaciones financieras con trazabilidad.
