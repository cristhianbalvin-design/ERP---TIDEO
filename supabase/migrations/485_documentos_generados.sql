-- 485 · Documentos generados por el motor documental de Capa 2.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

create table public.documentos_generados (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete restrict,
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  tipo_documento_id uuid not null
    references public.tipos_documento_electronico(id) on delete restrict,
  condiciones_generales_version_id uuid
    references public.biblioteca_condiciones_generales(id) on delete restrict,
  entidad_tipo text not null,
  entidad_id text not null,
  contexto_json jsonb not null,
  contenido_resuelto_json jsonb not null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'emitido', 'anulado')),
  pdf_url text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index documentos_generados_empresa_sociedad_idx
  on public.documentos_generados (empresa_id, sociedad_id);

create index documentos_generados_entidad_idx
  on public.documentos_generados (entidad_tipo, entidad_id);

create index documentos_generados_tipo_documento_idx
  on public.documentos_generados (tipo_documento_id);

-- B3: la sociedad se entrega explícitamente al generar; no se deriva de la ficha.
create trigger zz_validar_sociedad_obligatoria
before insert or update on public.documentos_generados
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

-- Mantiene la misma autorización que editar la ficha de la entidad de origen.
-- No es SECURITY DEFINER: usuario_puede(...) debe evaluar al usuario de la sesión.
create or replace function public.usuario_puede_documento_generado(
  p_empresa_id text,
  p_entidad_tipo text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_entidad_tipo = 'personal_administrativo' then
      coalesce(public.usuario_puede(p_empresa_id, 'rrhh_admin', 'editar'), false)
    when p_entidad_tipo = 'personal_operativo' then
      coalesce(public.usuario_puede(p_empresa_id, 'rrhh_operativo', 'editar'), false)
      or coalesce(public.usuario_puede(p_empresa_id, 'personal_operativo', 'editar'), false)
    else false
  end;
$$;

revoke all on function public.usuario_puede_documento_generado(text, text) from public;
grant execute on function public.usuario_puede_documento_generado(text, text) to authenticated;

alter table public.documentos_generados enable row level security;

create policy documentos_generados_select
on public.documentos_generados
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede_documento_generado(empresa_id, entidad_tipo)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy documentos_generados_insert
on public.documentos_generados
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede_documento_generado(empresa_id, entidad_tipo)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy documentos_generados_update
on public.documentos_generados
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede_documento_generado(empresa_id, entidad_tipo)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede_documento_generado(empresa_id, entidad_tipo)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

grant select, insert, update on public.documentos_generados to authenticated;

-- No se concede DELETE ni se define política DELETE: la preservación es por estado.
select pg_notify('pgrst', 'reload schema');
