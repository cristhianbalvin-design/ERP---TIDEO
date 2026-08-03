-- TIDEO ERP - Multisociedad en contratos y nomina (esquema base).
-- Los registros existentes permanecen con sociedad_id NULL y conservan el flujo legacy.

alter table public.sociedades
  add column if not exists direccion_fiscal text,
  add column if not exists logo_url text,
  add column if not exists firma_url text;

alter table public.personal_documentos
  add column if not exists sociedad_id uuid default null;

alter table public.periodos_nomina
  add column if not exists sociedad_id uuid default null;

alter table public.nomina_detalle
  add column if not exists sociedad_id uuid default null;

-- La clave compuesta ya fue creada por la migracion 385. Se conserva el guard para
-- que esta migracion pueda validarse y re-ejecutarse de forma independiente.
create unique index if not exists sociedades_empresa_id_id_key
  on public.sociedades(empresa_id, id);

do $$
declare
  v_tabla text;
  v_constraint text;
begin
  foreach v_tabla in array array['personal_documentos', 'periodos_nomina', 'nomina_detalle'] loop
    v_constraint := v_tabla || '_empresa_sociedad_fkey';
    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', v_tabla)::regclass
        and conname = v_constraint
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (empresa_id, sociedad_id) references public.sociedades(empresa_id, id)',
        v_tabla,
        v_constraint
      );
    end if;
  end loop;
end;
$$;

create index if not exists idx_personal_documentos_empresa_sociedad
  on public.personal_documentos(empresa_id, sociedad_id, personal_id);

create index if not exists idx_periodos_nomina_empresa_sociedad
  on public.periodos_nomina(empresa_id, sociedad_id, anio, mes);

create index if not exists idx_nomina_detalle_empresa_sociedad
  on public.nomina_detalle(empresa_id, sociedad_id, periodo_id);

-- Nombre real confirmado en produccion antes de modificarlo. El COALESCE conserva
-- exactamente la unicidad legacy para sociedad_id NULL y permite el mismo periodo
-- nominal en sociedades distintas.
alter table public.periodos_nomina
  drop constraint if exists periodos_nomina_empresa_id_periodo_key;

create unique index if not exists periodos_nomina_empresa_id_periodo_key
  on public.periodos_nomina(
    empresa_id,
    coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid),
    periodo
  );

drop index if exists public.periodos_nomina_empresa_periodo_uq;
create unique index periodos_nomina_empresa_periodo_uq
  on public.periodos_nomina(
    empresa_id,
    coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid),
    anio,
    mes,
    coalesce(quincena, 0)
  );

-- Un contrato/version legacy (sociedad NULL) mantiene la regla anterior; los grupos
-- contractuales de sociedades distintas ya no colisionan entre si.
drop index if exists public.uq_personal_docs_activo_grupo;
create unique index uq_personal_docs_activo_grupo
  on public.personal_documentos(
    empresa_id,
    personal_id,
    tipo_doc,
    coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(periodo_grupo_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where activo = true;

create or replace function public.nomina_detalle_validar_sociedad_periodo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_id text;
  v_sociedad_id uuid;
begin
  select empresa_id, sociedad_id
    into v_empresa_id, v_sociedad_id
  from public.periodos_nomina
  where id = new.periodo_id;

  if not found then
    raise exception 'El periodo de nomina % no existe.', new.periodo_id;
  end if;

  if new.empresa_id is distinct from v_empresa_id
     or new.sociedad_id is distinct from v_sociedad_id then
    raise exception 'La empresa/sociedad del detalle no coincide con su periodo de nomina.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nomina_detalle_validar_sociedad_periodo on public.nomina_detalle;
create trigger trg_nomina_detalle_validar_sociedad_periodo
before insert or update of empresa_id, periodo_id, sociedad_id
on public.nomina_detalle
for each row execute function public.nomina_detalle_validar_sociedad_periodo();

comment on column public.personal_documentos.sociedad_id is
  'Sociedad empleadora del contrato. Las adendas heredan la sociedad del contrato referenciado.';
comment on column public.periodos_nomina.sociedad_id is
  'Sociedad empleadora procesada por este periodo. NULL conserva el flujo sin multisociedad.';
comment on column public.nomina_detalle.sociedad_id is
  'Snapshot de la sociedad del periodo al momento de procesar la nomina.';
