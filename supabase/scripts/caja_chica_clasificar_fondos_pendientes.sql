-- EJECUCIÓN MANUAL POSTERIOR A LA CONFIRMACIÓN DEL CLIENTE.
-- No ejecutar ni reemplazar los marcadores hasta conocer el aportante real.

begin;

-- Verifica que cada aportante confirmado exista en public.usuarios.
-- select id, nombre, email from public.usuarios where id in ('<APORTANTE_1>', '<APORTANTE_2>', '<APORTANTE_3>');

-- update public.caja_chica_fondos
-- set tipo_origen = 'aporte_directo', aportante_id = '<APORTANTE_REAL_1>'
-- where id = 'ccf_0ayasvzhadoo' and tipo_origen is null and cuenta_bancaria_id is null;

-- update public.caja_chica_fondos
-- set tipo_origen = 'aporte_directo', aportante_id = '<APORTANTE_REAL_2>'
-- where id = 'ccf_b4cjz3oltk' and tipo_origen is null and cuenta_bancaria_id is null;

-- update public.caja_chica_fondos
-- set tipo_origen = 'aporte_directo', aportante_id = '<APORTANTE_REAL_3>'
-- where id = 'ccf_fmrynrmzey' and tipo_origen is null and cuenta_bancaria_id is null;

-- Revisar que no queden fondos sin clasificar antes de confirmar.
-- select id, nombre from public.caja_chica_fondos where tipo_origen is null order by id;

rollback;

-- Después de revisar el dry run, repetir los UPDATE confirmados en una nueva
-- transacción con COMMIT. Solo cuando no existan tipo_origen NULL, ejecutar:
-- alter table public.caja_chica_fondos validate constraint caja_chica_fondos_tipo_origen_check;
-- alter table public.caja_chica_fondos validate constraint caja_chica_fondos_origen_coherente_check;
-- alter table public.caja_chica_fondos alter column tipo_origen set not null;
