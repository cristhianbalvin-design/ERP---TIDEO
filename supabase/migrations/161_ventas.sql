-- TIDEO ERP - Ventas administrativas persistentes.
-- Registro formal de ventas emitidas, aislado por tenant con RLS.

create table if not exists public.ventas (
  id                      text primary key default ('ven_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id              text not null,
  numero                  text not null,
  anio                    integer not null,
  correlativo             integer not null,
  fecha                   date not null default current_date,
  cuenta_id               text,
  cliente_nombre_snapshot text not null,
  concepto                text not null,
  monto_total             numeric(14,2) not null check (monto_total > 0),
  moneda                  text not null default 'PEN',
  estado                  text not null default 'emitida'
    check (estado in ('emitida', 'pendiente', 'cobrada', 'vencida', 'anulada')),
  creado_por              text,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),
  unique (empresa_id, anio, correlativo),
  unique (empresa_id, numero)
);

-- FK constraints: se agregan solo si las tablas referenciadas existen
do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'empresas') then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.ventas'::regclass and conname = 'ventas_empresa_id_fkey'
    ) then
      alter table public.ventas
        add constraint ventas_empresa_id_fkey foreign key (empresa_id) references public.empresas(id);
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cuentas') then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.ventas'::regclass and conname = 'ventas_cuenta_id_fkey'
    ) then
      alter table public.ventas
        add constraint ventas_cuenta_id_fkey foreign key (cuenta_id) references public.cuentas(id) on delete set null;
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'usuarios') then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.ventas'::regclass and conname = 'ventas_creado_por_fkey'
    ) then
      alter table public.ventas
        add constraint ventas_creado_por_fkey foreign key (creado_por) references public.usuarios(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists ventas_empresa_fecha_idx on public.ventas (empresa_id, fecha desc);
create index if not exists ventas_cuenta_id_idx on public.ventas (cuenta_id);
create index if not exists ventas_estado_idx on public.ventas (empresa_id, estado);

create or replace function public.ventas_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer;
  v_next integer;
begin
  if new.fecha is null then
    new.fecha := current_date;
  end if;

  v_year := extract(year from new.fecha)::integer;
  new.anio := coalesce(new.anio, v_year);

  if new.correlativo is null or new.correlativo <= 0 then
    perform pg_advisory_xact_lock(hashtextextended(new.empresa_id || ':' || new.anio::text || ':ventas', 0));

    select coalesce(max(correlativo), 0) + 1
      into v_next
      from public.ventas
     where empresa_id = new.empresa_id
       and anio = new.anio;

    new.correlativo := v_next;
  end if;

  if new.numero is null or btrim(new.numero) = '' then
    new.numero := format('VEN-%s-%s', new.anio, lpad(new.correlativo::text, 4, '0'));
  end if;

  if new.id is null or btrim(new.id) = '' then
    new.id := 'ven_' || substr(gen_random_uuid()::text, 1, 12);
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

create or replace function public.ventas_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := old.id;
  new.empresa_id := old.empresa_id;
  new.numero := old.numero;
  new.anio := old.anio;
  new.correlativo := old.correlativo;
  new.creado_por := old.creado_por;
  new.creado_en := old.creado_en;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_ventas_before_insert on public.ventas;
create trigger trg_ventas_before_insert
before insert on public.ventas
for each row execute function public.ventas_before_insert();

drop trigger if exists trg_ventas_before_update on public.ventas;
create trigger trg_ventas_before_update
before update on public.ventas
for each row execute function public.ventas_before_update();

alter table public.ventas enable row level security;

drop policy if exists ventas_select on public.ventas;
drop policy if exists ventas_insert on public.ventas;
drop policy if exists ventas_update on public.ventas;
drop policy if exists ventas_delete on public.ventas;

create policy ventas_select on public.ventas
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy ventas_insert on public.ventas
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy ventas_update on public.ventas
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
