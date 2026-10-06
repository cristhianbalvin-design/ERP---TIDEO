# Prueba de concurrencia 592: emitir vs. insertar hallazgo

Esta es una verificación posterior a la aplicación, no parte del dry-run. No se ejecuta
antes de la aprobación ni con `supabase db query --linked`.

No ejecutar con `supabase db query --linked`: ese comando no mantiene dos sesiones abiertas. Usar dos sesiones `psql` contra el mismo proyecto enlazado y un diagnóstico de PRUEBA en borrador. Los valores `DIAG_ID`, `EMPRESA_ID`, `FAMILIA_ID`, `USER_TECNICO` y `LINEA_ID` se obtienen antes, sin datos personales en la salida.

## Sesión 1 — emisión pendiente

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'USER_TECNICO', 'role', 'authenticated')::text, true);
UPDATE public.diagnosticos_tecnicos
SET estado = 'emitido'
WHERE id = 'DIAG_ID' AND empresa_id = 'EMPRESA_ID';
-- Mantener esta transacción abierta; no ejecutar COMMIT todavía.
```

## Sesión 2 — inserción que queda esperando

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'USER_TECNICO', 'role', 'authenticated')::text, true);
SET LOCAL statement_timeout = '30s';
INSERT INTO public.diagnostico_tecnico_hallazgos
  (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte,
   tipo_dano_codigo, causa_probable_codigo, condicion, riesgo,
   accion_recomendada, atribuible_a)
VALUES
  ('EMPRESA_ID', 'DIAG_ID', 'FAMILIA_ID', 'concurrencia',
   'desgaste', 'desgaste_normal', 'conforme', 'monitorear',
   'monitorear', 'desgaste_normal');
-- El INSERT debe esperar el FOR SHARE de la función de bloqueo del diagnóstico.
```

## Cierre y resultado esperado

Volver a la sesión 1 y ejecutar `COMMIT;`. La sesión 2 debe desbloquearse y fallar con la protección de diagnóstico emitido (o con la política de borrador), después ejecutar `ROLLBACK;` en la sesión 2.

La instrucción “sesión 1 confirma la emisión y ambas sesiones terminan en ROLLBACK” es incompatible con PostgreSQL: una emisión confirmada no puede deshacerse con `ROLLBACK` de esa misma transacción. Por tanto, este escenario de serialización deja la emisión persistida. Para una prueba sin persistencia, ejecutar una segunda variante: sesión 1 hace `ROLLBACK` mientras sesión 2 espera; entonces sesión 2 debe continuar y permitir el INSERT, y finalmente hacer `ROLLBACK`. Esa variante prueba ausencia de falso positivo, no el rechazo tras emisión confirmada.

No se ejecutó ninguna de las dos variantes. La variante reversible (sesión 1 con
`ROLLBACK`, sesión 2 permite el INSERT y luego `ROLLBACK`) queda documentada para
la verificación posterior a aplicar; no prueba el rechazo tras una emisión confirmada.
