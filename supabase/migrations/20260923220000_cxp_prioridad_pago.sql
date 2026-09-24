-- Prioridad manual de pago para cuentas por pagar.
-- Nullable por diseño: las CxP existentes y las nuevas pueden quedar sin prioridad.

alter table public.cxp
  add column if not exists prioridad_pago text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'cxp_prioridad_pago_check'
       and conrelid = 'public.cxp'::regclass
  ) then
    alter table public.cxp
      add constraint cxp_prioridad_pago_check
      check (prioridad_pago is null or prioridad_pago = any (array['alta'::text, 'media'::text, 'baja'::text]));
  end if;
end;
$$;

create or replace function public.actualizar_prioridad_pago_cxp(
  p_cxp_id text,
  p_prioridad_pago text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.actualizar_prioridad_pago_cxp(text, text) from public, anon;
grant execute on function public.actualizar_prioridad_pago_cxp(text, text) to authenticated;
