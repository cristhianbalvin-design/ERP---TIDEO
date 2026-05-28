-- Soporte y Tickets - tabla transaccional multitenant.

create extension if not exists pgcrypto;

create table if not exists public.ticket_numeradores (
  empresa_id text primary key references public.empresas(id) on delete cascade,
  siguiente integer not null default 1,
  actualizado_en timestamptz not null default now()
);

create or replace function public.siguiente_numero_ticket(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.ticket_numeradores (empresa_id, siguiente)
  values (p_empresa_id, 2)
  on conflict (empresa_id) do update
    set siguiente = public.ticket_numeradores.siguiente + 1,
        actualizado_en = now()
  returning siguiente - 1 into v_next;

  return 'TK-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.ticket_fecha_limite_sla(
  p_prioridad text,
  p_base timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(p_base, now()) +
    case lower(coalesce(p_prioridad, 'media'))
      when 'critica' then interval '4 hours'
      when 'alta' then interval '24 hours'
      when 'media' then interval '48 hours'
      when 'baja' then interval '72 hours'
      else interval '48 hours'
    end;
$$;

create or replace function public.ticket_sla_estado(
  p_creado_en timestamptz,
  p_fecha_limite_sla timestamptz,
  p_estado text
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when lower(coalesce(p_estado, 'abierto')) in ('resuelto', 'cerrado') then 'ok'
    when p_fecha_limite_sla is null then 'ok'
    when now() >= p_fecha_limite_sla then 'vencido'
    when now() >= coalesce(p_creado_en, now()) + ((p_fecha_limite_sla - coalesce(p_creado_en, now())) * 0.75) then 'riesgo'
    else 'ok'
  end;
$$;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  numero text not null,
  titulo text not null,
  descripcion text,
  tipo text not null default 'consulta'
    check (tipo in ('averia', 'reclamo', 'preventivo', 'consulta', 'otro')),
  canal_entrada text not null default 'backoffice'
    check (canal_entrada in ('backoffice', 'email', 'telefono', 'campo')),
  estado text not null default 'abierto'
    check (estado in ('abierto', 'en_proceso', 'resuelto', 'cerrado')),
  prioridad text not null default 'media'
    check (prioridad in ('critica', 'alta', 'media', 'baja')),
  cuenta_id text references public.cuentas(id) on delete set null,
  cuenta_nombre text,
  responsable_id text references public.usuarios(id) on delete set null,
  responsable_nombre text,
  fecha_limite_sla timestamptz not null,
  fecha_resolucion timestamptz,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint tickets_empresa_numero_unique unique (empresa_id, numero)
);

create index if not exists idx_tickets_empresa_estado
  on public.tickets(empresa_id, estado, creado_en desc);

create index if not exists idx_tickets_empresa_sla
  on public.tickets(empresa_id, fecha_limite_sla);

create index if not exists idx_tickets_cuenta
  on public.tickets(cuenta_id);

create index if not exists idx_tickets_responsable
  on public.tickets(responsable_id);

create or replace function public.set_ticket_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := coalesce(new.creado_en, now());
    new.creado_por := coalesce(new.creado_por, auth.uid());
    if new.numero is null or btrim(new.numero) = '' then
      new.numero := public.siguiente_numero_ticket(new.empresa_id);
    end if;
    new.fecha_limite_sla := coalesce(
      new.fecha_limite_sla,
      public.ticket_fecha_limite_sla(new.prioridad, new.creado_en)
    );
  end if;

  if new.cuenta_id is not null and (new.cuenta_nombre is null or btrim(new.cuenta_nombre) = '') then
    select coalesce(c.nombre_comercial, c.razon_social, c.id)
      into new.cuenta_nombre
    from public.cuentas c
    where c.id = new.cuenta_id
      and c.empresa_id = new.empresa_id
    limit 1;
  end if;

  if new.responsable_id is not null and (new.responsable_nombre is null or btrim(new.responsable_nombre) = '') then
    select coalesce(u.nombre, u.email, u.id)
      into new.responsable_nombre
    from public.usuarios u
    where u.id = new.responsable_id
      and u.empresa_id = new.empresa_id
    limit 1;
  end if;

  if tg_op = 'UPDATE' then
    if new.estado in ('resuelto', 'cerrado') and old.estado is distinct from new.estado then
      new.fecha_resolucion := coalesce(new.fecha_resolucion, now());
    elsif new.estado in ('abierto', 'en_proceso') and old.estado in ('resuelto', 'cerrado') then
      new.fecha_resolucion := null;
    end if;
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_tickets_defaults on public.tickets;
create trigger trg_tickets_defaults
before insert or update on public.tickets
for each row execute function public.set_ticket_defaults();

create or replace view public.tickets_con_sla
with (security_invoker = true)
as
select
  t.*,
  public.ticket_sla_estado(t.creado_en, t.fecha_limite_sla, t.estado) as sla_estado
from public.tickets t;

alter table public.tickets enable row level security;

drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

create policy tickets_select on public.tickets
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy tickets_insert on public.tickets
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy tickets_update on public.tickets
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tickets_delete on public.tickets
  for delete using (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
