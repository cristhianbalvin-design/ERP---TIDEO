-- 439 · Contratos de alquiler como raíz de costo para OTs de renta.
-- Propuesta para revisión humana: esta migración no se ejecuta desde este cambio.
--
-- No se modifica public.ordenes_trabajo en esta entrega. Una migración posterior
-- deberá incorporar contrato_alquiler_id a la OT cuando se habilite el flujo
-- operativo que la asocia con esta raíz de costo.

create table public.contratos_alquiler (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete restrict,
  sociedad_id uuid not null references public.sociedades(id) on delete restrict,
  numero text not null,
  cuenta_id text not null references public.cuentas(id) on delete restrict,
  unidad_minera text,
  objeto text,
  fecha_inicio date not null,
  fecha_fin date not null,
  tarifa_monto numeric(14,2) not null check (tarifa_monto >= 0),
  tarifa_periodicidad text not null check (tarifa_periodicidad in ('hora', 'dia', 'mes')),
  minimo_facturable numeric(14,2) check (minimo_facturable is null or minimo_facturable >= 0),
  unidad_minimo_facturable text not null default 'hora'
    check (unidad_minimo_facturable in ('hora', 'dia', 'mes')),
  periodicidad_minimo_facturable text not null default 'mes'
    check (periodicidad_minimo_facturable in ('dia', 'semana', 'mes')),
  meta_dmr numeric(5,2) not null check (meta_dmr between 0 and 100),
  moneda text not null check (char_length(moneda) = 3),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'vigente', 'suspendido', 'vencido', 'cerrado', 'cancelado')),
  centro_costo_id text references public.centros_costo(id) on delete restrict,
  centro_beneficio_id text references public.centros_beneficio(id) on delete restrict,
  representante_cliente text,
  representante_empresa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contratos_alquiler_empresa_numero_key unique (empresa_id, numero),
  constraint contratos_alquiler_vigencia_check check (fecha_fin >= fecha_inicio)
);

-- Un contrato puede cubrir uno o más equipos. No existe aún un maestro real de
-- equipos en el esquema productivo al que se pueda referenciar por FK; por ello
-- equipo_id conserva el identificador operativo y no inventa una FK inexistente.
create table public.contratos_alquiler_equipos (
  id uuid primary key default gen_random_uuid(),
  contrato_alquiler_id text not null references public.contratos_alquiler(id) on delete cascade,
  equipo_id text not null,
  created_at timestamptz not null default now(),
  constraint contratos_alquiler_equipos_contrato_equipo_key
    unique (contrato_alquiler_id, equipo_id)
);

create or replace function public.validar_integridad_contrato_alquiler()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.sociedades s
    where s.id = new.sociedad_id
      and s.empresa_id = new.empresa_id
  ) then
    raise exception 'La sociedad del contrato de alquiler debe pertenecer a la empresa informada.';
  end if;

  if not exists (
    select 1
    from public.cuentas c
    where c.id = new.cuenta_id
      and c.empresa_id = new.empresa_id
  ) then
    raise exception 'La cuenta del contrato de alquiler debe pertenecer a la empresa informada.';
  end if;

  if new.centro_costo_id is not null and not exists (
    select 1
    from public.centros_costo cc
    where cc.id = new.centro_costo_id
      and cc.empresa_id = new.empresa_id
      and cc.sociedad_id = new.sociedad_id
  ) then
    raise exception 'El centro de costo por defecto debe pertenecer a la misma empresa y sociedad.';
  end if;

  if new.centro_beneficio_id is not null and not exists (
    select 1
    from public.centros_beneficio cb
    where cb.id = new.centro_beneficio_id
      and cb.empresa_id = new.empresa_id
      and cb.sociedad_id = new.sociedad_id
  ) then
    raise exception 'El centro de beneficio por defecto debe pertenecer a la misma empresa y sociedad.';
  end if;

  return new;
end;
$$;

create trigger trg_contratos_alquiler_validar_integridad
before insert or update on public.contratos_alquiler
for each row execute function public.validar_integridad_contrato_alquiler();

create trigger trg_contratos_alquiler_updated_at
before update on public.contratos_alquiler
for each row execute function public.trg_contratos_alquiler_updated_at();

create index idx_contratos_alquiler_empresa_sociedad_estado
  on public.contratos_alquiler (empresa_id, sociedad_id, estado);

create index idx_contratos_alquiler_cuenta_vigencia
  on public.contratos_alquiler (empresa_id, cuenta_id, fecha_inicio, fecha_fin);

create index idx_contratos_alquiler_equipos_equipo
  on public.contratos_alquiler_equipos (equipo_id);

alter table public.contratos_alquiler enable row level security;
alter table public.contratos_alquiler_equipos enable row level security;

create policy contratos_alquiler_select
on public.contratos_alquiler
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy contratos_alquiler_insert
on public.contratos_alquiler
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy contratos_alquiler_update
on public.contratos_alquiler
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy contratos_alquiler_delete
on public.contratos_alquiler
for delete
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy contratos_alquiler_equipos_access
on public.contratos_alquiler_equipos
for all
using (
  exists (
    select 1
    from public.contratos_alquiler ca
    where ca.id = contrato_alquiler_id
      and public.usuario_tiene_empresa(ca.empresa_id)
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(ca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or ca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
)
with check (
  exists (
    select 1
    from public.contratos_alquiler ca
    where ca.id = contrato_alquiler_id
      and public.usuario_tiene_empresa(ca.empresa_id)
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(ca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or ca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

grant select, insert, update, delete on public.contratos_alquiler to authenticated;
grant select, insert, update, delete on public.contratos_alquiler_equipos to authenticated;

select pg_notify('pgrst', 'reload schema');
