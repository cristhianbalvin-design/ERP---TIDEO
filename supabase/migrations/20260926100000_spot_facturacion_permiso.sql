-- Bloque 1 / R1: exigir facturacion.crear dentro de la RPC atomica.
--
-- La definicion base se obtiene de pg_get_functiondef en el momento de aplicar
-- la migracion. No se copia una version local: solo se inserta el control
-- inmediatamente despues del control de tenant vigente.

do $$
declare
  v_oid oid;
  v_before text;
  v_after text;
  v_anchor text := E'  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then\n    raise exception ''No tienes acceso al tenant indicado.'';\n  end if;';
  v_insert text := E'  if not public.usuario_puede(v_empresa_id, ''facturacion'', ''crear'') then\n    raise exception ''No tienes permiso para crear facturas en este tenant.'';\n  end if;';
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_before
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'emitir_factura_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_oid is null or v_before is null then
    raise exception 'R1|emitir_factura_cxc_atomico(jsonb) no existe.';
  end if;
  if position('public.usuario_puede(v_empresa_id, ''facturacion'', ''crear'')' in v_before) > 0 then
    raise exception 'R1|la funcion ya contiene el control facturacion.crear; revisar antes de continuar.';
  end if;
  if length(v_before) - length(replace(v_before, v_anchor, '')) <> length(v_anchor) then
    raise exception 'R1|el control de tenant remoto no coincide exactamente con el ancla esperada.';
  end if;

  v_after := replace(v_before, v_anchor, v_anchor || E'\n' || v_insert);
  if replace(v_after, E'\n' || v_insert, '') is distinct from v_before then
    raise exception 'R1|el diff generado no se limita al control facturacion.crear.';
  end if;

  execute v_after;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_oid
      and p.prosecdef
  ) then
    raise exception 'R1|security definer de la funcion no preservado.';
  end if;
  select pg_get_functiondef(v_oid) into v_after;
  if position(v_insert in v_after) = 0 then
    raise exception 'R1|el control facturacion.crear no quedo instalado.';
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');
