-- Impide registrar recepciones sobre OCs que todavía no pueden entrar al
-- ciclo físico de recepción. La validación ocurre antes del INSERT para
-- evitar recepciones huérfanas si el cliente invoca el servicio directamente.

create or replace function public.validar_estado_oc_para_recepcion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.orden_compra_id is null then
    return new;
  end if;

  select lower(coalesce(oc.estado, ''))
    into v_estado
    from public.ordenes_compra oc
   where oc.id = new.orden_compra_id
     and oc.empresa_id = new.empresa_id;

  if not found then
    raise exception 'La orden de compra % no pertenece a la empresa de la recepción', new.orden_compra_id;
  end if;

  if v_estado not in ('emitida', 'confirmada', 'en_transito', 'recibida_parcial') then
    raise exception 'No se puede recepcionar una OC en estado "%"; emítela primero y verifica que no esté cerrada o anulada', v_estado;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_estado_oc_para_recepcion on public.recepciones;
create trigger trg_validar_estado_oc_para_recepcion
before insert or update of orden_compra_id
on public.recepciones
for each row execute function public.validar_estado_oc_para_recepcion();

revoke all on function public.validar_estado_oc_para_recepcion() from public, anon;
grant execute on function public.validar_estado_oc_para_recepcion() to authenticated, service_role;
