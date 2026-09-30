-- Prioridad de pago manual en Cuentas por Pagar.
-- Independiente del semaforo de vencimiento (urgencia por fecha): esta es criterio de negocio.
--
-- ESTA MIGRACION YA ESTABA APLICADA EN PRODUCCION cuando se versiono (verificado el 2026-09-30:
-- columna, CHECK y funcion existentes). Se reconstruye desde pg_get_functiondef de la version
-- remota vigente para que el repo refleje la base. Es idempotente: no cambia nada si ya existe.
-- No modifica generar_cxp_centralizado (jsonb_populate_record ya admite la columna al crear).

alter table public.cxp
  add column if not exists prioridad_pago text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cxp'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%prioridad_pago%'
  ) then
    alter table public.cxp
      add constraint cxp_prioridad_pago_check
      check (prioridad_pago is null or prioridad_pago in ('alta', 'media', 'baja'));
  end if;
end
$$;

create or replace function public.actualizar_prioridad_pago_cxp(p_cxp_id text, p_prioridad_pago text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cxp public.cxp%rowtype;
  v_prioridad text := nullif(lower(btrim(coalesce(p_prioridad_pago, ''))), '');
  v_alcance uuid[];
begin
  select * into v_cxp
    from public.cxp
   where id = p_cxp_id
     and public.usuario_tiene_empresa(empresa_id)
   for update;

  if not found then
    raise exception 'La CxP no existe o no pertenece al tenant activo';
  end if;

  if not public.usuario_puede(v_cxp.empresa_id, 'cxp', 'editar') then
    raise exception 'No tienes permiso para editar la prioridad de CxP';
  end if;

  if v_prioridad is not null
     and v_prioridad not in ('alta', 'media', 'baja') then
    raise exception 'Prioridad de pago inválida: usa alta, media o baja';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_cxp.empresa_id);
  if v_cxp.sociedad_id is not null
     and v_alcance is not null
     and not (v_cxp.sociedad_id = any(v_alcance)) then
    raise exception 'La CxP esta fuera del alcance societario del usuario';
  end if;

  update public.cxp
     set prioridad_pago = v_prioridad,
         updated_at = now()
   where id = v_cxp.id;

  select * into v_cxp
    from public.cxp
   where id = v_cxp.id;

  return to_jsonb(v_cxp);
end;
$function$;

revoke execute on function public.actualizar_prioridad_pago_cxp(text, text) from public, anon;
grant execute on function public.actualizar_prioridad_pago_cxp(text, text) to authenticated;
