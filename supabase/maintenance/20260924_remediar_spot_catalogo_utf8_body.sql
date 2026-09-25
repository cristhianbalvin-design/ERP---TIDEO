-- Incidente Paso 1: cuerpo comun de remediacion UTF-8 de spot_catalogo.
-- La envoltura controla la transaccion.

drop table public.spot_catalogo;
\ir ../migrations/20260924000000_spot_catalogo_rls_seed.sql

do $$
declare
  v_filas integer;
begin
  select count(*) into v_filas from public.spot_catalogo;
  raise notice 'VALIDACION_FILAS|%', v_filas;
  if v_filas <> 29 then
    raise exception 'spot_catalogo debe contener 29 filas; obtuvo %', v_filas;
  end if;
end;
$$;

do $$
declare
  v_invalidas integer;
begin
  select count(*) into v_invalidas
  from public.spot_catalogo
  where position('?' in coalesce(descripcion, '')) > 0
     or position(chr(65533) in coalesce(descripcion, '')) > 0
     or position('?' in coalesce(fuente_referencia, '')) > 0
     or position(chr(65533) in coalesce(fuente_referencia, '')) > 0;

  raise notice 'VALIDACION_CARACTERES_INVALIDOS|%', v_invalidas;
  if v_invalidas <> 0 then
    raise exception 'spot_catalogo contiene % filas con ? o U+FFFD', v_invalidas;
  end if;
end;
$$;

do $$
declare
  v_desc_anexo_2_delta integer;
  v_desc_anexo_3_delta integer;
  v_fuente_delta integer;
begin
  select octet_length(descripcion) - char_length(descripcion)
    into v_desc_anexo_2_delta
    from public.spot_catalogo
   where codigo = '004';

  select octet_length(descripcion) - char_length(descripcion)
    into v_desc_anexo_3_delta
    from public.spot_catalogo
   where codigo = '012';

  select octet_length(fuente_referencia) - char_length(fuente_referencia)
    into v_fuente_delta
    from public.spot_catalogo
   where codigo = '004';

  raise notice 'VALIDACION_UTF8_DELTAS|descripcion_004=%|descripcion_012=%|fuente_004=%',
    v_desc_anexo_2_delta, v_desc_anexo_3_delta, v_fuente_delta;

  if v_desc_anexo_2_delta <= 0
     or v_desc_anexo_3_delta <= 0
     or v_fuente_delta <= 0 then
    raise exception 'Las filas UTF-8 esperadas no tienen octet_length mayor a char_length';
  end if;
end;
$$;

do $$
declare
  v_auth_select boolean;
  v_auth_insert boolean;
  v_auth_update boolean;
  v_auth_delete boolean;
  v_anon_select boolean;
  v_anon_insert boolean;
  v_anon_update boolean;
  v_anon_delete boolean;
begin
  select has_table_privilege('authenticated', 'public.spot_catalogo', 'SELECT'),
         has_table_privilege('authenticated', 'public.spot_catalogo', 'INSERT'),
         has_table_privilege('authenticated', 'public.spot_catalogo', 'UPDATE'),
         has_table_privilege('authenticated', 'public.spot_catalogo', 'DELETE'),
         has_table_privilege('anon', 'public.spot_catalogo', 'SELECT'),
         has_table_privilege('anon', 'public.spot_catalogo', 'INSERT'),
         has_table_privilege('anon', 'public.spot_catalogo', 'UPDATE'),
         has_table_privilege('anon', 'public.spot_catalogo', 'DELETE')
    into v_auth_select, v_auth_insert, v_auth_update, v_auth_delete,
         v_anon_select, v_anon_insert, v_anon_update, v_anon_delete;

  raise notice 'VALIDACION_PRIVILEGIOS|auth=%/%/%/%|anon=%/%/%/%',
    v_auth_select, v_auth_insert, v_auth_update, v_auth_delete,
    v_anon_select, v_anon_insert, v_anon_update, v_anon_delete;

  if not v_auth_select
     or v_auth_insert or v_auth_update or v_auth_delete
     or v_anon_select or v_anon_insert or v_anon_update or v_anon_delete then
    raise exception 'Privilegios de spot_catalogo no cumplen authenticated solo SELECT y anon ninguno';
  end if;
end;
$$;

do $$
declare
  v_distintas integer;
begin
  with expected (codigo, anexo, porcentaje, monto_minimo, vigencia_desde, vigencia_hasta, fuente_url) as (
    values
      ('004','ANEXO_2',4.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('005','ANEXO_2',4.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('007','ANEXO_2',10.00::numeric,700.00::numeric,date '2017-10-16',null::date,'https://www.sunat.gob.pe/legislacion/superin/2017/246-2017.pdf'),
      ('008','ANEXO_2',4.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('009','ANEXO_2',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('010','ANEXO_2',15.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('011','ANEXO_2',10.00::numeric,700.00::numeric,date '2018-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/082-2018.pdf'),
      ('012','ANEXO_3',12.00::numeric,700.00::numeric,date '2018-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf'),
      ('014','ANEXO_2',4.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('016','ANEXO_2',10.00::numeric,700.00::numeric,date '2018-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/082-2018.pdf'),
      ('017','ANEXO_2',4.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('019','ANEXO_3',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('020','ANEXO_3',12.00::numeric,700.00::numeric,date '2018-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf'),
      ('021','ANEXO_3',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('022','ANEXO_3',12.00::numeric,700.00::numeric,date '2018-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf'),
      ('023','ANEXO_2',4.00::numeric,700.00::numeric,date '2018-06-16',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/152-2018.pdf'),
      ('024','ANEXO_3',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('025','ANEXO_3',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('026','ANEXO_3',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('027','TRANSPORTE_BIENES',4.00::numeric,400.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/detracciones-en-el-transporte-de-bienes-por-via-terrestre'),
      ('030','ANEXO_3',4.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('031','ANEXO_2',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('032','ANEXO_2',10.00::numeric,700.00::numeric,date '2019-08-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2019/130-2019.pdf'),
      ('035','ANEXO_2',1.50::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('036','ANEXO_2',1.50::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('037','ANEXO_3',12.00::numeric,700.00::numeric,date '2018-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2018/071-2018.pdf'),
      ('039','ANEXO_2',10.00::numeric,700.00::numeric,date '2026-09-24',null::date,'https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones'),
      ('041','ANEXO_2',15.00::numeric,700.00::numeric,date '2019-08-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2019/130-2019.pdf'),
      ('044','ANEXO_3',12.00::numeric,700.00::numeric,date '2025-04-01',null::date,'https://www.sunat.gob.pe/legislacion/superin/2025/000086-2025.pdf')
  )
  select count(*) into v_distintas
  from expected e
  full join public.spot_catalogo p using (codigo)
  where row(p.anexo,p.porcentaje,p.monto_minimo,p.vigencia_desde,p.vigencia_hasta,p.fuente_url)
        is distinct from row(e.anexo,e.porcentaje,e.monto_minimo,e.vigencia_desde,e.vigencia_hasta,e.fuente_url);

  raise notice 'VALIDACION_CAMPOS_CALCULO_DISTINTOS|%', v_distintas;
  if v_distintas <> 0 then
    raise exception 'Los campos de calculo no coinciden con la migracion: % filas', v_distintas;
  end if;
end;
$$;
