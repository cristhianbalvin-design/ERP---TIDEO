-- Confiabilidad · el backlog creado desde una muestra SOS queda enlazado en la muestra (conf_sos_muestras.backlog_id).
-- Antes solo el backlog guardaba fuente_id; la muestra quedaba con backlog_id nulo.

create or replace function public.conf_backlog_vincular_sos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.fuente = 'sos' and new.fuente_id is not null then
    update public.conf_sos_muestras m
       set backlog_id = new.id, updated_at = now()
     where m.id::text = new.fuente_id
       and m.empresa_id = new.empresa_id
       and m.backlog_id is null;
  end if;
  return new;
end $$;

revoke all on function public.conf_backlog_vincular_sos() from public, anon, authenticated;

create trigger conf_backlog_vincular_sos
  after insert on public.backlog
  for each row execute function public.conf_backlog_vincular_sos();

-- Muestras existentes con su backlog ya creado (mismo tenant, solo las que no tienen vínculo).
update public.conf_sos_muestras m
   set backlog_id = b.id, updated_at = now()
  from public.backlog b
 where b.fuente = 'sos'
   and b.fuente_id = m.id::text
   and b.empresa_id = m.empresa_id
   and m.backlog_id is null;

do $$
declare v_pend int;
begin
  if not exists (select 1 from pg_trigger where tgname = 'conf_backlog_vincular_sos' and tgrelid = 'public.backlog'::regclass) then
    raise exception 'No se creó el trigger conf_backlog_vincular_sos';
  end if;
  select count(*) into v_pend
    from public.conf_sos_muestras m
    join public.backlog b on b.fuente = 'sos' and b.fuente_id = m.id::text and b.empresa_id = m.empresa_id
   where m.backlog_id is null;
  if v_pend > 0 then
    raise exception 'Quedan % muestras SOS sin vínculo a su backlog', v_pend;
  end if;
end $$;
