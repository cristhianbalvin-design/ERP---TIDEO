-- TIDEO ERP - Posiciones organizacionales (Fase 1 del modelo Unidad -> Posicion -> Persona)
-- Una posicion es una instancia de un cargo dentro de una unidad organizacional.
-- Puede tener 0, 1 o varios ocupantes activos (posiciones_usuarios), y reporta
-- jerarquicamente a otra posicion (no a una persona) via reporta_a_posicion_id.

create table if not exists public.posiciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  cargo_id text references public.cargos_empresa(id) on delete set null,
  unidad_organizacional_id text not null references public.unidades_organizacionales(id) on delete restrict,
  reporta_a_posicion_id uuid references public.posiciones(id) on delete set null,
  estado text not null default 'vacante' check (estado in ('vacante', 'parcial', 'cubierta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posiciones_no_self_reporta check (reporta_a_posicion_id is null or reporta_a_posicion_id <> id)
);

create index if not exists idx_posiciones_empresa on public.posiciones(empresa_id, estado);
create index if not exists idx_posiciones_unidad on public.posiciones(empresa_id, unidad_organizacional_id);
create index if not exists idx_posiciones_reporta on public.posiciones(empresa_id, reporta_a_posicion_id);
create index if not exists idx_posiciones_cargo on public.posiciones(empresa_id, cargo_id);

comment on table public.posiciones is
  'Posiciones organizacionales: instancia de un cargo dentro de una unidad organizacional, con jerarquia propia via reporta_a_posicion_id.';
comment on column public.posiciones.estado is
  'Derivado automaticamente por trg_posiciones_usuarios_estado segun ocupantes activos en posiciones_usuarios: vacante (0), cubierta (1), parcial (2+).';
comment on column public.posiciones.cargo_id is
  'Puede quedar null: el backfill automatico de la fase 1c no siempre tiene senal confiable para resolverlo (ver reporte de backfill).';

-- Prevencion de ciclos en la jerarquia de posiciones
create or replace function public.validar_ciclo_posicion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actual uuid;
begin
  if new.reporta_a_posicion_id is null then
    return new;
  end if;

  v_actual := new.reporta_a_posicion_id;

  while v_actual is not null loop
    if v_actual = new.id then
      raise exception 'La posicion % generaria un ciclo en la jerarquia', new.id;
    end if;

    select reporta_a_posicion_id into v_actual
    from public.posiciones
    where id = v_actual;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_posiciones_ciclo on public.posiciones;
create trigger trg_posiciones_ciclo
before insert or update of reporta_a_posicion_id
on public.posiciones
for each row execute function public.validar_ciclo_posicion();

alter table public.posiciones enable row level security;

drop policy if exists mst_posiciones_select on public.posiciones;
create policy mst_posiciones_select on public.posiciones
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'ver')
  );

drop policy if exists mst_posiciones_insert on public.posiciones;
create policy mst_posiciones_insert on public.posiciones
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'crear')
  );

drop policy if exists mst_posiciones_update on public.posiciones;
create policy mst_posiciones_update on public.posiciones
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_posiciones_delete on public.posiciones;
create policy mst_posiciones_delete on public.posiciones
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

-- ─── Tabla puente posiciones_usuarios: historial de ocupacion ────────────────

create table if not exists public.posiciones_usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  posicion_id uuid not null references public.posiciones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posiciones_usuarios_fechas_check check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create unique index if not exists ux_posiciones_usuarios_activa
  on public.posiciones_usuarios (posicion_id, user_id)
  where fecha_fin is null;

create index if not exists idx_posiciones_usuarios_posicion
  on public.posiciones_usuarios(empresa_id, posicion_id, fecha_fin);

create index if not exists idx_posiciones_usuarios_user
  on public.posiciones_usuarios(empresa_id, user_id, fecha_fin);

comment on table public.posiciones_usuarios is
  'Historial de ocupacion de posiciones: quien ocupo que posicion y cuando. Una posicion puede tener 0, 1 o varios ocupantes activos (fecha_fin nula).';

-- Trigger de normalizacion: valida que la posicion pertenezca al mismo tenant (mismo patron que
-- normalizar_usuario_asignacion en 070_usuarios_asignaciones_funcionales.sql)
create or replace function public.normalizar_posicion_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_id text;
begin
  select empresa_id into v_empresa_id
  from public.posiciones
  where id = new.posicion_id;

  if not found then
    raise exception 'Posicion % no existe', new.posicion_id;
  end if;

  if v_empresa_id <> new.empresa_id then
    raise exception 'La posicion % no pertenece al tenant %', new.posicion_id, new.empresa_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_posiciones_usuarios_normalizar on public.posiciones_usuarios;
create trigger trg_posiciones_usuarios_normalizar
before insert or update of posicion_id, empresa_id, fecha_fin
on public.posiciones_usuarios
for each row execute function public.normalizar_posicion_usuario();

-- Recalculo automatico de posiciones.estado segun ocupantes activos
create or replace function public.recalcular_estado_posicion(p_posicion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activos int;
begin
  select count(*) into v_activos
  from public.posiciones_usuarios
  where posicion_id = p_posicion_id
    and fecha_fin is null;

  update public.posiciones
  set estado = case
      when v_activos = 0 then 'vacante'
      when v_activos = 1 then 'cubierta'
      else 'parcial'
    end,
    updated_at = now()
  where id = p_posicion_id;
end;
$$;

create or replace function public.trg_fn_posiciones_usuarios_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_estado_posicion(old.posicion_id);
    return null;
  end if;

  perform public.recalcular_estado_posicion(new.posicion_id);

  if tg_op = 'UPDATE' and old.posicion_id is distinct from new.posicion_id then
    perform public.recalcular_estado_posicion(old.posicion_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_posiciones_usuarios_estado on public.posiciones_usuarios;
create trigger trg_posiciones_usuarios_estado
after insert or delete or update of posicion_id, fecha_fin
on public.posiciones_usuarios
for each row execute function public.trg_fn_posiciones_usuarios_estado();

alter table public.posiciones_usuarios enable row level security;

-- Select abierto al tenant (igual que usuarios_asignaciones); escritura solo para admin de
-- empresa, dado que esto es historial de ocupacion de cargos, no un maestro editable por
-- cualquier rol con permiso 'maestros'.
drop policy if exists posiciones_usuarios_select on public.posiciones_usuarios;
create policy posiciones_usuarios_select on public.posiciones_usuarios
for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists posiciones_usuarios_insert on public.posiciones_usuarios;
create policy posiciones_usuarios_insert on public.posiciones_usuarios
for insert with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists posiciones_usuarios_update on public.posiciones_usuarios;
create policy posiciones_usuarios_update on public.posiciones_usuarios
for update using (public.usuario_es_admin_empresa(empresa_id))
with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists posiciones_usuarios_delete on public.posiciones_usuarios;
create policy posiciones_usuarios_delete on public.posiciones_usuarios
for delete using (public.usuario_es_admin_empresa(empresa_id));

-- ─── Responsable de unidad organizacional, ahora que posiciones existe ───────

alter table public.unidades_organizacionales
  add column if not exists responsable_posicion_id uuid references public.posiciones(id) on delete set null;

comment on column public.unidades_organizacionales.responsable_posicion_id is
  'Posicion responsable de esta unidad organizacional. Se resuelve en el backfill (fase 1c) a partir de responsable_legado cuando sea posible.';

select pg_notify('pgrst', 'reload schema');
