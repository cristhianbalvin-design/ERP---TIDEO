-- Prioridad de pago manual en Cuentas por Pagar.
-- Independiente del semaforo de vencimiento (urgencia por fecha): esta es criterio de negocio.
-- No modifica generar_cxp_centralizado (jsonb_populate_record ya admite la columna nueva al crear).
-- La edicion usa una RPC propia para no reconstruir la funcion centralizada.

alter table public.cxp
  add column if not exists prioridad_pago text;

alter table public.cxp
  drop constraint if exists cxp_prioridad_pago_check;

alter table public.cxp
  add constraint cxp_prioridad_pago_check
  check (prioridad_pago is null or prioridad_pago in ('alta', 'media', 'baja'));

create or replace function public.actualizar_prioridad_pago_cxp(
  p_cxp_id text,
  p_prioridad text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prioridad text := lower(nullif(btrim(coalesce(p_prioridad, '')), ''));
  v_cxp public.cxp%rowtype;
  v_alcance uuid[];
begin
  if v_prioridad is not null and v_prioridad not in ('alta', 'media', 'baja') then
    raise exception 'Prioridad de pago invalida: %', v_prioridad;
  end if;

  select * into v_cxp from public.cxp where id = p_cxp_id for update;
  if not found then
    raise exception 'La CxP % no existe', p_cxp_id;
  end if;

  if not public.usuario_tiene_empresa(v_cxp.empresa_id) then
    raise exception 'No tienes acceso al tenant indicado';
  end if;

  if not public.usuario_puede(v_cxp.empresa_id, 'cxp', 'editar') then
    raise exception 'No tienes permiso para editar CxP';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_cxp.empresa_id);
  if v_cxp.sociedad_id is not null
     and v_alcance is not null
     and not (v_cxp.sociedad_id = any(v_alcance)) then
    raise exception 'La sociedad de la CxP esta fuera del alcance del usuario';
  end if;

  update public.cxp
  set prioridad_pago = v_prioridad,
      updated_at = now()
  where id = p_cxp_id;

  select * into v_cxp from public.cxp where id = p_cxp_id;
  return to_jsonb(v_cxp);
end;
$$;

revoke execute on function public.actualizar_prioridad_pago_cxp(text, text) from public, anon;
grant execute on function public.actualizar_prioridad_pago_cxp(text, text) to authenticated;
