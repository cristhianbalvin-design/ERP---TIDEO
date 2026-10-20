-- Acta de conformidad móvil en el cierre técnico de la OT.
-- Migración aditiva:
--   1. tipo_cobro (puntual / recurrente_mensual) en servicios, os_clientes y ordenes_trabajo.
--   2. Columnas del acta en cierres_tecnicos y vencimiento del enlace de conformidad.
--   3. Tablas hijas cierre_tecnico_firmas y cierre_tecnico_evidencias (solo lectura por RLS).
--   4. Bucket privado actas-conformidad con políticas por empresa, permiso o técnico responsable.
--   5. Bloqueo del acta emitida (cierre, firmas y evidencias inmutables).
--   6. RPC cerrar_ot_con_acta y registrar_pdf_acta.
--   7. Vencimiento del enlace público en get_ot_conformidad_publica y registrar_conformidad_ot
--      (partiendo de la definición remota vigente; solo se agrega el vencimiento y search_path).
-- No modifica cerrar_ot_con_conformidad ni las políticas existentes de cierres_tecnicos.
-- Aplicada en producción el 2026-10-20 en 7 partes (acta_conformidad_01 … _07) con el mismo contenido;
-- no es reejecutable tal cual (las políticas se crean sin drop previo).

-- 1. Tipo de cobro ------------------------------------------------------------
alter table public.servicios add column if not exists tipo_cobro text not null default 'puntual';
alter table public.os_clientes add column if not exists tipo_cobro text;
alter table public.ordenes_trabajo add column if not exists tipo_cobro text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servicios_tipo_cobro_chk') then
    alter table public.servicios add constraint servicios_tipo_cobro_chk
      check (tipo_cobro in ('puntual', 'recurrente_mensual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'os_clientes_tipo_cobro_chk') then
    alter table public.os_clientes add constraint os_clientes_tipo_cobro_chk
      check (tipo_cobro is null or tipo_cobro in ('puntual', 'recurrente_mensual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ordenes_trabajo_tipo_cobro_chk') then
    alter table public.ordenes_trabajo add constraint ordenes_trabajo_tipo_cobro_chk
      check (tipo_cobro is null or tipo_cobro in ('puntual', 'recurrente_mensual'));
  end if;
end $$;

comment on column public.servicios.tipo_cobro is 'Cómo se cobra el servicio: puntual (por OT cerrada) o recurrente_mensual (tarifa fija mensual).';
comment on column public.os_clientes.tipo_cobro is 'Sobrescribe el tipo de cobro del servicio para esta OS; null usa el del servicio.';
comment on column public.ordenes_trabajo.tipo_cobro is 'Tipo de cobro de la OT; null hereda el de la OS. La OT mensual dura el mes y cierra con su acta.';

-- 2. Columnas del acta en cierres_tecnicos -----------------------------------
alter table public.cierres_tecnicos
  add column if not exists modalidad_acta text,
  add column if not exists acta_numero text,
  add column if not exists acta_snapshot jsonb,
  add column if not exists acta_emitida_en timestamptz,
  add column if not exists acta_bloqueada boolean not null default false,
  add column if not exists acta_pdf_path text,
  add column if not exists acta_pdf_sha256 text,
  add column if not exists conformidad_resultado text,
  add column if not exists conformidad_observaciones text,
  add column if not exists correo_cliente text,
  add column if not exists correo_estado text,
  add column if not exists correo_enviado_en timestamptz,
  add column if not exists correo_detalle jsonb,
  add column if not exists token_conformidad_expira_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cierres_tecnicos_modalidad_acta_chk') then
    alter table public.cierres_tecnicos add constraint cierres_tecnicos_modalidad_acta_chk
      check (modalidad_acta is null or modalidad_acta = 'acta_movil');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cierres_tecnicos_conformidad_resultado_chk') then
    alter table public.cierres_tecnicos add constraint cierres_tecnicos_conformidad_resultado_chk
      check (conformidad_resultado is null or conformidad_resultado in ('conforme', 'observaciones', 'pendiente'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cierres_tecnicos_correo_estado_chk') then
    alter table public.cierres_tecnicos add constraint cierres_tecnicos_correo_estado_chk
      check (correo_estado is null or correo_estado in ('pendiente', 'enviado', 'error'));
  end if;
end $$;

create unique index if not exists cierres_tecnicos_acta_numero_uq
  on public.cierres_tecnicos (empresa_id, acta_numero) where acta_numero is not null;
create index if not exists idx_cierres_tecnicos_orden_trabajo
  on public.cierres_tecnicos (orden_trabajo_id);

-- 3. Funciones auxiliares de acceso -----------------------------------------
create or replace function public.usuario_es_tecnico_responsable_ot(p_empresa_id text, p_orden_trabajo_id text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1
    from public.ordenes_trabajo ot
    join public.personal_operativo p
      on p.id = ot.tecnico_responsable_id
     and p.empresa_id = ot.empresa_id
    where ot.id = p_orden_trabajo_id
      and ot.empresa_id = p_empresa_id
      and p.auth_user_id = auth.uid()
  );
$$;
revoke all on function public.usuario_es_tecnico_responsable_ot(text, text) from public, anon;
grant execute on function public.usuario_es_tecnico_responsable_ot(text, text) to authenticated, service_role;

-- 4. Tablas hijas ------------------------------------------------------------
create table if not exists public.cierre_tecnico_firmas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  cierre_id text not null references public.cierres_tecnicos(id) on delete restrict,
  orden_trabajo_id text not null references public.ordenes_trabajo(id),
  rol text not null check (rol in ('tecnico', 'cliente')),
  personal_id text,
  nombre text not null,
  documento text,
  cargo text,
  firma_path text not null,
  firma_sha256 text not null check (firma_sha256 ~ '^[0-9a-f]{64}$'),
  dispositivo jsonb not null default '{}'::jsonb,
  geo jsonb,
  ip text,
  firmado_en timestamptz not null default now(),
  usuario_id uuid,
  created_at timestamptz not null default now(),
  constraint cierre_tecnico_firmas_rol_uq unique (cierre_id, rol),
  constraint cierre_tecnico_firmas_path_uq unique (firma_path)
);
create index if not exists idx_cierre_tecnico_firmas_empresa_ot on public.cierre_tecnico_firmas (empresa_id, orden_trabajo_id);

create table if not exists public.cierre_tecnico_evidencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  cierre_id text not null references public.cierres_tecnicos(id) on delete restrict,
  orden_trabajo_id text not null references public.ordenes_trabajo(id),
  tipo text not null check (tipo in ('antes', 'despues')),
  path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text,
  tamano_bytes integer,
  tomada_en timestamptz,
  geo jsonb,
  orden integer not null default 0,
  usuario_id uuid,
  created_at timestamptz not null default now(),
  constraint cierre_tecnico_evidencias_path_uq unique (path)
);
create index if not exists idx_cierre_tecnico_evidencias_cierre on public.cierre_tecnico_evidencias (cierre_id);
create index if not exists idx_cierre_tecnico_evidencias_empresa_ot on public.cierre_tecnico_evidencias (empresa_id, orden_trabajo_id);

alter table public.cierre_tecnico_firmas enable row level security;
alter table public.cierre_tecnico_evidencias enable row level security;

-- Solo lectura desde el cliente: sin políticas de escritura, RLS niega insert/update/delete.
-- Las filas las inserta cerrar_ot_con_acta (SECURITY DEFINER).
create policy cierre_tecnico_firmas_select on public.cierre_tecnico_firmas
  for select to authenticated
  using (
    public.usuario_tiene_empresa(empresa_id)
    and (public.usuario_puede(empresa_id, 'cierre', 'ver')
         or public.usuario_es_tecnico_responsable_ot(empresa_id, orden_trabajo_id))
  );
create policy cierre_tecnico_evidencias_select on public.cierre_tecnico_evidencias
  for select to authenticated
  using (
    public.usuario_tiene_empresa(empresa_id)
    and (public.usuario_puede(empresa_id, 'cierre', 'ver')
         or public.usuario_es_tecnico_responsable_ot(empresa_id, orden_trabajo_id))
  );

-- 5. Bloqueo de actas emitidas ---------------------------------------------
create or replace function public.trg_proteger_acta_cierre_tecnico()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_permitidas text[] := array[
    'updated_at', 'sociedad_id',
    'acta_pdf_path', 'acta_pdf_sha256',
    'correo_estado', 'correo_enviado_en', 'correo_detalle',
    'conformidad_nombre', 'conformidad_dni', 'conformidad_fecha', 'conformidad_ip'
  ];
begin
  if tg_op = 'DELETE' then
    if old.acta_bloqueada then
      raise exception using errcode = '42501',
        message = 'ACTA_BLOQUEADA: un cierre con acta emitida no se puede eliminar.';
    end if;
    return old;
  end if;

  if not old.acta_bloqueada then
    return new;
  end if;

  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: el acta emitida no se puede modificar.';
  end if;

  if old.acta_pdf_path is not null
     and (new.acta_pdf_path is distinct from old.acta_pdf_path
          or new.acta_pdf_sha256 is distinct from old.acta_pdf_sha256) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: el PDF del acta ya fue registrado.';
  end if;

  if (new.conformidad_nombre, new.conformidad_dni, new.conformidad_fecha, new.conformidad_ip)
     is distinct from (old.conformidad_nombre, old.conformidad_dni, old.conformidad_fecha, old.conformidad_ip)
     and not (old.conformidad_resultado = 'pendiente' and old.conformidad_fecha is null) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: la conformidad del acta ya fue registrada.';
  end if;

  return new;
end;
$$;

create or replace trigger ab_proteger_acta_cierre_tecnico
  before update or delete on public.cierres_tecnicos
  for each row execute function public.trg_proteger_acta_cierre_tecnico();

create or replace function public.trg_acta_registro_inmutable()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception using errcode = '42501',
    message = 'ACTA_REGISTRO_INMUTABLE: las firmas y fotos de un acta emitida no se modifican ni se eliminan.';
end;
$$;

create or replace trigger trg_cierre_tecnico_firmas_inmutable
  before update or delete on public.cierre_tecnico_firmas
  for each row execute function public.trg_acta_registro_inmutable();
create or replace trigger trg_cierre_tecnico_evidencias_inmutable
  before update or delete on public.cierre_tecnico_evidencias
  for each row execute function public.trg_acta_registro_inmutable();

-- 6. Bucket privado ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('actas-conformidad', 'actas-conformidad', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Un archivo queda congelado cuando el acta lo referencia (firma, foto o PDF).
create or replace function public.acta_conformidad_objeto_bloqueado(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (select 1 from public.cierre_tecnico_firmas f where f.firma_path = p_name)
      or exists (select 1 from public.cierre_tecnico_evidencias e where e.path = p_name)
      or exists (select 1 from public.cierres_tecnicos c where c.acta_pdf_path = p_name);
$$;
revoke all on function public.acta_conformidad_objeto_bloqueado(text) from public, anon;
grant execute on function public.acta_conformidad_objeto_bloqueado(text) to authenticated, service_role;

-- Ruta: <empresa_id>/<orden_trabajo_id>/<borrador o cierre>/<archivo>
create policy storage_actas_conformidad_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'actas-conformidad'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and (public.usuario_puede(split_part(name, '/', 1), 'cierre', 'ver')
         or public.usuario_es_tecnico_responsable_ot(split_part(name, '/', 1), split_part(name, '/', 2)))
  );
create policy storage_actas_conformidad_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'actas-conformidad'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and (public.usuario_puede(split_part(name, '/', 1), 'cierre', 'crear')
         or public.usuario_es_tecnico_responsable_ot(split_part(name, '/', 1), split_part(name, '/', 2)))
  );
create policy storage_actas_conformidad_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'actas-conformidad'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and (public.usuario_puede(split_part(name, '/', 1), 'cierre', 'crear')
         or public.usuario_es_tecnico_responsable_ot(split_part(name, '/', 1), split_part(name, '/', 2)))
    and not public.acta_conformidad_objeto_bloqueado(name)
  );

-- 7. RPC cerrar_ot_con_acta -------------------------------------------------
create or replace function public.cerrar_ot_con_acta(
  p_empresa_id text,
  p_orden_trabajo_id text,
  p_datos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $funcion$
declare
  v_uid uuid := auth.uid();
  v_ot public.ordenes_trabajo%rowtype;
  v_tecnico public.personal_operativo%rowtype;
  v_es_tecnico boolean := false;
  v_prefijo text;
  v_resultado text;
  v_observaciones text;
  v_correo text;
  v_descripcion text;
  v_tareas_incompletas jsonb;
  v_evidencias jsonb;
  v_firma_tecnico jsonb;
  v_firma_cliente jsonb;
  v_aprobados integer := 0;
  v_pendientes integer := 0;
  v_tareas_solicitadas text[] := '{}'::text[];
  v_tareas_reales text[] := '{}'::text[];
  v_snapshot_tareas jsonb := '[]'::jsonb;
  v_ev jsonb;
  v_paths text[] := '{}'::text[];
  v_path text;
  v_n_antes integer := 0;
  v_n_despues integer := 0;
  v_headers jsonb;
  v_ip text;
  v_cierre_id text;
  v_numero text;
  v_anio text;
  v_correlativo integer;
  v_ahora timestamptz := now();
  v_fecha_cierre date := (now() at time zone 'America/Lima')::date;
  v_fecha_inicio date;
  v_horas numeric := 0;
  v_token uuid;
  v_tipo_cobro text;
  v_os public.os_clientes%rowtype;
  v_cliente_nombre text;
  v_cliente_ruc text;
  v_emisor jsonb;
  v_tareas_todas jsonb;
  v_snapshot jsonb;
  v_evidencias_meta jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '28000',
      message = 'ACTA_USUARIO_REQUERIDO: se requiere un usuario autenticado.';
  end if;

  if nullif(btrim(p_empresa_id), '') is null or nullif(btrim(p_orden_trabajo_id), '') is null
     or p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception using errcode = '22023',
      message = 'ACTA_DATOS_REQUERIDOS: empresa, OT y datos del acta son obligatorios.';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception using errcode = '42501',
      message = 'ACTA_SIN_EMPRESA: no tienes acceso a la empresa indicada.';
  end if;

  select * into v_ot
  from public.ordenes_trabajo ot
  where ot.id = p_orden_trabajo_id and ot.empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception using errcode = '23503',
      message = 'ACTA_OT_INEXISTENTE: la OT no existe o no pertenece a la empresa indicada.';
  end if;

  v_es_tecnico := public.usuario_es_tecnico_responsable_ot(p_empresa_id, p_orden_trabajo_id);
  if not v_es_tecnico then
    if not public.usuario_puede(p_empresa_id, 'cierre', 'crear') then
      raise exception using errcode = '42501',
        message = 'ACTA_SIN_PERMISO: solo el técnico responsable o quien tenga permiso de cierre puede emitir el acta.';
    end if;
    if not exists (
      select 1 from (select public.usuario_alcance_sociedades(p_empresa_id) as alcance) a
      where a.alcance is null or v_ot.sociedad_id = any(a.alcance)
    ) then
      raise exception using errcode = '42501',
        message = 'ACTA_SIN_ALCANCE_SOCIEDAD: no tienes alcance sobre la sociedad de esta OT.';
    end if;
  end if;

  if v_ot.estado not in ('ejecucion', 'pendiente_cierre') then
    raise exception using errcode = '22023',
      message = 'ACTA_ESTADO_OT_INVALIDO: la OT debe estar en ejecución o pendiente de cierre.';
  end if;

  select * into v_tecnico
  from public.personal_operativo p
  where p.id = v_ot.tecnico_responsable_id and p.empresa_id = p_empresa_id;
  if not found then
    raise exception using errcode = '22023',
      message = 'ACTA_SIN_TECNICO_RESPONSABLE: la OT no tiene un técnico responsable válido.';
  end if;

  -- Partes diarios: misma regla que el cierre técnico actual.
  perform 1 from public.partes_diarios parte
  where parte.empresa_id = p_empresa_id and parte.orden_trabajo_id = p_orden_trabajo_id
  for share;

  select
    count(*) filter (where parte.estado = 'aprobado'),
    count(*) filter (where parte.estado is null or parte.estado not in ('aprobado', 'rechazado')),
    min(parte.fecha) filter (where parte.estado = 'aprobado'),
    coalesce(sum(coalesce(parte.horas_normales, 0) + coalesce(parte.horas_extra, 0)) filter (where parte.estado = 'aprobado'), 0)
    into v_aprobados, v_pendientes, v_fecha_inicio, v_horas
  from public.partes_diarios parte
  where parte.empresa_id = p_empresa_id and parte.orden_trabajo_id = p_orden_trabajo_id;

  if v_aprobados = 0 then
    raise exception using errcode = '22023',
      message = 'ACTA_SIN_PARTES_APROBADOS: la OT requiere al menos un parte diario aprobado.';
  end if;
  if v_pendientes > 0 then
    raise exception using errcode = '22023',
      message = 'ACTA_PARTES_PENDIENTES: la OT tiene partes diarios pendientes de aprobación.';
  end if;

  -- Datos del acta.
  v_resultado := p_datos ->> 'resultado';
  v_observaciones := nullif(btrim(coalesce(p_datos ->> 'observaciones', '')), '');
  v_correo := lower(nullif(btrim(coalesce(p_datos ->> 'correo_cliente', '')), ''));
  v_descripcion := nullif(btrim(coalesce(p_datos ->> 'descripcion_trabajo', '')), '');
  v_tareas_incompletas := coalesce(p_datos -> 'tareas_incompletas', '[]'::jsonb);
  v_evidencias := coalesce(p_datos -> 'evidencias', '[]'::jsonb);
  v_firma_tecnico := p_datos -> 'firma_tecnico';
  v_firma_cliente := p_datos -> 'firma_cliente';
  v_prefijo := p_empresa_id || '/' || p_orden_trabajo_id || '/';

  if v_resultado is null or v_resultado not in ('conforme', 'observaciones', 'pendiente') then
    raise exception using errcode = '22023',
      message = 'ACTA_RESULTADO_INVALIDO: el resultado debe ser conforme, observaciones o pendiente.';
  end if;
  if v_descripcion is null then
    raise exception using errcode = '22023',
      message = 'ACTA_DESCRIPCION_REQUERIDA: describe el trabajo realizado.';
  end if;
  if v_resultado in ('observaciones', 'pendiente') and v_observaciones is null then
    raise exception using errcode = '22023',
      message = 'ACTA_OBSERVACIONES_REQUERIDAS: escribe las observaciones o el motivo.';
  end if;
  if v_correo is null or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023',
      message = 'ACTA_CORREO_INVALIDO: indica un correo válido del cliente.';
  end if;

  -- Fotos: al menos una de antes y una de después, máximo 6.
  if jsonb_typeof(v_evidencias) <> 'array' then
    raise exception using errcode = '22023', message = 'ACTA_FOTOS_INVALIDAS: las fotos deben ser un arreglo.';
  end if;
  for v_ev in select value from jsonb_array_elements(v_evidencias) loop
    v_path := v_ev ->> 'path';
    if jsonb_typeof(v_ev) <> 'object'
       or coalesce(v_ev ->> 'tipo', '') not in ('antes', 'despues')
       or v_path is null or left(v_path, length(v_prefijo)) <> v_prefijo
       or coalesce(v_ev ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023',
        message = 'ACTA_FOTOS_INVALIDAS: cada foto debe tener tipo, ruta de esta OT y huella.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = v_path) then
      raise exception using errcode = '22023',
        message = 'ACTA_FOTO_NO_SUBIDA: una de las fotos no se encuentra en el almacenamiento.';
    end if;
    if v_path = any(v_paths) then
      raise exception using errcode = '22023', message = 'ACTA_FOTOS_INVALIDAS: hay fotos repetidas.';
    end if;
    v_paths := v_paths || v_path;
    if v_ev ->> 'tipo' = 'antes' then v_n_antes := v_n_antes + 1; else v_n_despues := v_n_despues + 1; end if;
  end loop;
  if v_n_antes < 1 or v_n_despues < 1 then
    raise exception using errcode = '22023',
      message = 'ACTA_FOTOS_MINIMAS: se requiere al menos una foto de antes y una de después.';
  end if;
  if v_n_antes + v_n_despues > 6 then
    raise exception using errcode = '22023', message = 'ACTA_FOTOS_MAXIMAS: el acta admite hasta 6 fotos.';
  end if;

  -- Firma del técnico responsable.
  v_path := v_firma_tecnico ->> 'path';
  if v_firma_tecnico is null or jsonb_typeof(v_firma_tecnico) <> 'object'
     or v_path is null or left(v_path, length(v_prefijo)) <> v_prefijo
     or coalesce(v_firma_tecnico ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = v_path) then
    raise exception using errcode = '22023',
      message = 'ACTA_FIRMA_TECNICO_REQUERIDA: falta la firma del técnico responsable.';
  end if;
  if v_path = any(v_paths) then
    raise exception using errcode = '22023', message = 'ACTA_FIRMA_TECNICO_REQUERIDA: la firma no puede reutilizar una foto.';
  end if;
  v_paths := v_paths || v_path;

  -- Firma del cliente (no aplica cuando la conformidad queda pendiente).
  if v_resultado = 'pendiente' then
    v_firma_cliente := null;
  else
    v_path := v_firma_cliente ->> 'path';
    if v_firma_cliente is null or jsonb_typeof(v_firma_cliente) <> 'object'
       or length(btrim(coalesce(v_firma_cliente ->> 'nombre', ''))) < 3
       or coalesce(btrim(v_firma_cliente ->> 'documento'), '') !~ '^[0-9A-Za-z-]{6,15}$'
       or v_path is null or left(v_path, length(v_prefijo)) <> v_prefijo
       or coalesce(v_firma_cliente ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = v_path) then
      raise exception using errcode = '22023',
        message = 'ACTA_FIRMA_CLIENTE_REQUERIDA: faltan el nombre, el documento o la firma del cliente.';
    end if;
    if v_path = any(v_paths) then
      raise exception using errcode = '22023', message = 'ACTA_FIRMA_CLIENTE_REQUERIDA: la firma no puede reutilizar otro archivo.';
    end if;
  end if;

  -- Tareas incompletas: misma verificación de vigencia que el cierre técnico actual.
  if jsonb_typeof(v_tareas_incompletas) <> 'array' or exists (
    select 1 from jsonb_array_elements(v_tareas_incompletas) t
    where jsonb_typeof(t) <> 'object' or nullif(btrim(t ->> 'id'), '') is null
  ) then
    raise exception using errcode = '22023',
      message = 'ACTA_TAREAS_INVALIDAS: cada tarea incompleta debe incluir id.';
  end if;
  select coalesce(array_agg(distinct t ->> 'id' order by t ->> 'id'), '{}'::text[])
    into v_tareas_solicitadas
  from jsonb_array_elements(v_tareas_incompletas) t;
  if cardinality(v_tareas_solicitadas) <> jsonb_array_length(v_tareas_incompletas) then
    raise exception using errcode = '22023', message = 'ACTA_TAREAS_INVALIDAS: hay tareas repetidas.';
  end if;
  select
    coalesce(array_agg(tarea.id order by tarea.id), '{}'::text[]),
    coalesce(jsonb_agg(jsonb_build_object('id', tarea.id, 'titulo', tarea.titulo, 'estado', tarea.estado,
      'avance_pct', tarea.avance_pct, 'horas_reales', tarea.horas_reales) order by tarea.id), '[]'::jsonb)
    into v_tareas_reales, v_snapshot_tareas
  from (
    select id, titulo, estado, avance_pct, horas_reales
    from public.ot_tareas
    where empresa_id = p_empresa_id and ot_id = p_orden_trabajo_id
      and not coalesce(completada, false)
      and coalesce(estado, '') not in ('completada', 'cerrada_sin_completar')
    order by id
    for update
  ) tarea;
  if v_tareas_solicitadas is distinct from v_tareas_reales then
    raise exception using errcode = '40001',
      message = 'ACTA_TAREAS_DESACTUALIZADAS: recarga la OT antes de emitir el acta.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('titulo', t.titulo, 'estado', t.estado,
           'avance_pct', t.avance_pct, 'horas_reales', t.horas_reales,
           'completada', coalesce(t.completada, false) or t.estado = 'completada') order by t.orden, t.id), '[]'::jsonb)
    into v_tareas_todas
  from public.ot_tareas t
  where t.empresa_id = p_empresa_id and t.ot_id = p_orden_trabajo_id;

  -- IP tomada en el servidor.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := left(coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
                        nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
                        'desconocida'), 80);

  -- Número correlativo del acta por empresa y año.
  perform pg_advisory_xact_lock(hashtextextended('acta_conformidad:' || p_empresa_id, 0));
  v_anio := to_char(v_ahora at time zone 'America/Lima', 'YY');
  select coalesce(max(substring(c.acta_numero from '([0-9]+)$')::integer), 0) + 1
    into v_correlativo
  from public.cierres_tecnicos c
  where c.empresa_id = p_empresa_id and c.acta_numero like 'ACT-' || v_anio || '-%';
  v_numero := 'ACT-' || v_anio || '-' || lpad(v_correlativo::text, 4, '0');
  v_cierre_id := 'cier_' || replace(gen_random_uuid()::text, '-', '');

  -- Datos de cabecera del snapshot.
  if v_ot.os_cliente_id is not null then
    select * into v_os from public.os_clientes where id = v_ot.os_cliente_id and empresa_id = p_empresa_id;
  end if;
  v_tipo_cobro := coalesce(v_ot.tipo_cobro, v_os.tipo_cobro, 'puntual');
  select coalesce(nullif(c.razon_social, ''), c.nombre_comercial), c.ruc
    into v_cliente_nombre, v_cliente_ruc
  from public.cuentas c where c.id = coalesce(v_ot.cuenta_id, v_os.cuenta_id);
  select jsonb_build_object(
      'razon_social', coalesce(s.razon_social, ec.razon_social),
      'ruc', coalesce(s.ruc, ec.ruc),
      'direccion', coalesce(s.direccion_fiscal, ec.direccion),
      'logo_path', ec.logo_path,
      'logo_url', coalesce(s.logo_url, ec.logo_url))
    into v_emisor
  from (select 1) uno
  left join public.empresa_config ec on ec.empresa_id = p_empresa_id
  left join public.sociedades s on s.id = v_ot.sociedad_id;

  if v_resultado = 'pendiente' then
    v_token := gen_random_uuid();
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'tipo', e.value ->> 'tipo', 'path', e.value ->> 'path', 'sha256', e.value ->> 'sha256',
      'tomada_en', e.value ->> 'tomada_en', 'geo', e.value -> 'geo') order by e.ordinality), '[]'::jsonb)
    into v_evidencias_meta
  from jsonb_array_elements(v_evidencias) with ordinality e;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'acta_numero', v_numero,
    'emitida_en', v_ahora,
    'ip', v_ip,
    'emisor', v_emisor,
    'ot', jsonb_build_object(
      'id', v_ot.id, 'numero', v_ot.numero, 'servicio', v_ot.servicio, 'descripcion', v_ot.descripcion,
      'direccion_ejecucion', v_ot.direccion_ejecucion, 'os_numero', v_os.numero, 'tipo_cobro', v_tipo_cobro),
    'cliente', jsonb_build_object('nombre', v_cliente_nombre, 'ruc', v_cliente_ruc, 'correo', v_correo),
    'trabajo', jsonb_build_object(
      'descripcion', v_descripcion, 'fecha_inicio', v_fecha_inicio, 'fecha_cierre', v_fecha_cierre,
      'horas', v_horas, 'partes_aprobados', v_aprobados, 'tareas', v_tareas_todas,
      'tareas_cerradas_sin_completar', v_snapshot_tareas),
    'conformidad', jsonb_build_object('resultado', v_resultado, 'observaciones', v_observaciones),
    'firmas', jsonb_build_array(jsonb_build_object(
        'rol', 'tecnico', 'nombre', v_tecnico.nombre, 'documento', v_tecnico.documento, 'cargo', v_tecnico.cargo,
        'path', v_firma_tecnico ->> 'path', 'sha256', v_firma_tecnico ->> 'sha256',
        'dispositivo', coalesce(v_firma_tecnico -> 'dispositivo', '{}'::jsonb), 'geo', v_firma_tecnico -> 'geo'))
      || case when v_firma_cliente is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'rol', 'cliente', 'nombre', btrim(v_firma_cliente ->> 'nombre'), 'documento', btrim(v_firma_cliente ->> 'documento'),
        'cargo', nullif(btrim(coalesce(v_firma_cliente ->> 'cargo', '')), ''),
        'path', v_firma_cliente ->> 'path', 'sha256', v_firma_cliente ->> 'sha256',
        'dispositivo', coalesce(v_firma_cliente -> 'dispositivo', '{}'::jsonb), 'geo', v_firma_cliente -> 'geo')) end,
    'evidencias', v_evidencias_meta
  );

  insert into public.cierres_tecnicos (
    id, empresa_id, orden_trabajo_id, fecha_cierre, resultado, observaciones,
    conformidad_cliente, evidencias, cerrado_por, estado, descripcion_trabajo,
    fecha_inicio_real, horas_total, avance_final, costo_terceros, costo_logistica,
    token_conformidad, token_conformidad_expira_en,
    conformidad_nombre, conformidad_dni, conformidad_fecha, conformidad_ip,
    modalidad_acta, acta_numero, acta_snapshot, acta_emitida_en, acta_bloqueada,
    conformidad_resultado, conformidad_observaciones, correo_cliente, correo_estado
  ) values (
    v_cierre_id, p_empresa_id, p_orden_trabajo_id, v_fecha_cierre, 'conforme', v_observaciones,
    jsonb_build_object('tipo', 'acta_movil', 'resultado', v_resultado), v_evidencias_meta, v_uid, 'cerrado', v_descripcion,
    v_fecha_inicio, v_horas, case when cardinality(v_tareas_reales) = 0 then 100 else coalesce(v_ot.avance_pct, 0)::integer end, 0, 0,
    v_token, case when v_token is not null then v_ahora + interval '7 days' end,
    case when v_firma_cliente is not null then btrim(v_firma_cliente ->> 'nombre') end,
    case when v_firma_cliente is not null then btrim(v_firma_cliente ->> 'documento') end,
    case when v_firma_cliente is not null then v_ahora end,
    case when v_firma_cliente is not null then v_ip end,
    'acta_movil', v_numero, v_snapshot, v_ahora, true,
    v_resultado, v_observaciones, v_correo, 'pendiente'
  );

  insert into public.cierre_tecnico_firmas (
    empresa_id, sociedad_id, cierre_id, orden_trabajo_id, rol, personal_id, nombre, documento, cargo,
    firma_path, firma_sha256, dispositivo, geo, ip, firmado_en, usuario_id
  ) values (
    p_empresa_id, v_ot.sociedad_id, v_cierre_id, p_orden_trabajo_id, 'tecnico', v_tecnico.id,
    v_tecnico.nombre, v_tecnico.documento, v_tecnico.cargo,
    v_firma_tecnico ->> 'path', v_firma_tecnico ->> 'sha256',
    coalesce(v_firma_tecnico -> 'dispositivo', '{}'::jsonb), v_firma_tecnico -> 'geo', v_ip, v_ahora, v_uid
  );
  if v_firma_cliente is not null then
    insert into public.cierre_tecnico_firmas (
      empresa_id, sociedad_id, cierre_id, orden_trabajo_id, rol, nombre, documento, cargo,
      firma_path, firma_sha256, dispositivo, geo, ip, firmado_en, usuario_id
    ) values (
      p_empresa_id, v_ot.sociedad_id, v_cierre_id, p_orden_trabajo_id, 'cliente',
      btrim(v_firma_cliente ->> 'nombre'), btrim(v_firma_cliente ->> 'documento'),
      nullif(btrim(coalesce(v_firma_cliente ->> 'cargo', '')), ''),
      v_firma_cliente ->> 'path', v_firma_cliente ->> 'sha256',
      coalesce(v_firma_cliente -> 'dispositivo', '{}'::jsonb), v_firma_cliente -> 'geo', v_ip, v_ahora, v_uid
    );
  end if;

  insert into public.cierre_tecnico_evidencias (
    empresa_id, sociedad_id, cierre_id, orden_trabajo_id, tipo, path, sha256, mime, tamano_bytes,
    tomada_en, geo, orden, usuario_id
  )
  select p_empresa_id, v_ot.sociedad_id, v_cierre_id, p_orden_trabajo_id,
         e.value ->> 'tipo', e.value ->> 'path', e.value ->> 'sha256',
         (select o.metadata ->> 'mimetype' from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = e.value ->> 'path'),
         (select (o.metadata ->> 'size')::integer from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = e.value ->> 'path'),
         case when coalesce(e.value ->> 'tomada_en', '') ~ '^\d{4}-\d{2}-\d{2}' then (e.value ->> 'tomada_en')::timestamptz end,
         e.value -> 'geo', e.ordinality::integer, v_uid
  from jsonb_array_elements(v_evidencias) with ordinality e;

  if cardinality(v_tareas_reales) > 0 then
    update public.ot_tareas
       set estado = 'cerrada_sin_completar', actualizado_en = now()
     where empresa_id = p_empresa_id and ot_id = p_orden_trabajo_id and id = any(v_tareas_reales);
    insert into public.ot_avance_historial (empresa_id, ot_id, avance_anterior, avance_nuevo, nota, registrado_por, registrado_en)
    values (p_empresa_id, p_orden_trabajo_id, null, null,
            'CIERRE CON TAREAS INCOMPLETAS (acta ' || v_numero || '): ' || v_snapshot_tareas::text, v_uid::text, now());
  end if;

  update public.ordenes_trabajo
     set estado = 'cerrada'
   where id = p_orden_trabajo_id and empresa_id = p_empresa_id;

  return jsonb_build_object(
    'cierre_id', v_cierre_id,
    'acta_numero', v_numero,
    'emitida_en', v_ahora,
    'ip', v_ip,
    'estado_ot', 'cerrada',
    'conformidad_resultado', v_resultado,
    'token_conformidad', v_token,
    'tareas_cerradas_sin_completar', cardinality(v_tareas_reales),
    'snapshot', v_snapshot
  );
end;
$funcion$;

revoke all on function public.cerrar_ot_con_acta(text, text, jsonb) from public, anon;
grant execute on function public.cerrar_ot_con_acta(text, text, jsonb) to authenticated, service_role;

-- 8. RPC registrar_pdf_acta --------------------------------------------------
create or replace function public.registrar_pdf_acta(
  p_empresa_id text,
  p_cierre_id text,
  p_path text,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $funcion$
declare
  v_cierre public.cierres_tecnicos%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'ACTA_USUARIO_REQUERIDO: se requiere un usuario autenticado.';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception using errcode = '42501', message = 'ACTA_SIN_EMPRESA: no tienes acceso a la empresa indicada.';
  end if;

  select * into v_cierre from public.cierres_tecnicos
  where id = p_cierre_id and empresa_id = p_empresa_id
  for update;
  if not found or not v_cierre.acta_bloqueada or v_cierre.modalidad_acta is distinct from 'acta_movil' then
    raise exception using errcode = '23503', message = 'ACTA_INEXISTENTE: el acta no existe.';
  end if;
  if not (public.usuario_puede(p_empresa_id, 'cierre', 'crear')
          or public.usuario_es_tecnico_responsable_ot(p_empresa_id, v_cierre.orden_trabajo_id)) then
    raise exception using errcode = '42501', message = 'ACTA_SIN_PERMISO: no puedes registrar el PDF de esta acta.';
  end if;
  if v_cierre.acta_pdf_path is not null then
    if v_cierre.acta_pdf_path = p_path and v_cierre.acta_pdf_sha256 = p_sha256 then
      return jsonb_build_object('ok', true, 'ya_registrado', true);
    end if;
    raise exception using errcode = '42501', message = 'ACTA_BLOQUEADA: el PDF del acta ya fue registrado.';
  end if;
  if p_path is null or left(p_path, length(p_empresa_id || '/' || v_cierre.orden_trabajo_id || '/')) <> p_empresa_id || '/' || v_cierre.orden_trabajo_id || '/'
     or right(lower(p_path), 4) <> '.pdf'
     or coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = p_path) then
    raise exception using errcode = '22023', message = 'ACTA_PDF_INVALIDO: el PDF no está subido o su ruta no corresponde a esta OT.';
  end if;

  update public.cierres_tecnicos
     set acta_pdf_path = p_path, acta_pdf_sha256 = p_sha256, updated_at = now()
   where id = p_cierre_id;

  return jsonb_build_object('ok', true, 'ya_registrado', false);
end;
$funcion$;

revoke all on function public.registrar_pdf_acta(text, text, text, text) from public, anon;
grant execute on function public.registrar_pdf_acta(text, text, text, text) to authenticated, service_role;

-- 9. Vencimiento del enlace público de conformidad --------------------------
-- Parte de la definición remota vigente (migración 119); se agrega el vencimiento
-- (los tokens antiguos sin fecha siguen válidos) y search_path fijo.
create or replace function public.get_ot_conformidad_publica(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_cierre cierres_tecnicos;
  v_ot     ordenes_trabajo;
begin
  select * into v_cierre from cierres_tecnicos where token_conformidad = p_token;
  if not found then
    return jsonb_build_object('status', 'token_invalido');
  end if;
  if v_cierre.conformidad_fecha is not null then
    return jsonb_build_object(
      'status', 'ya_firmada',
      'nombre', v_cierre.conformidad_nombre,
      'fecha',  v_cierre.conformidad_fecha
    );
  end if;
  if v_cierre.token_conformidad_expira_en is not null and v_cierre.token_conformidad_expira_en <= now() then
    return jsonb_build_object('status', 'token_invalido');
  end if;
  select * into v_ot from ordenes_trabajo where id = v_cierre.orden_trabajo_id;
  return jsonb_build_object(
    'status', 'ok',
    'ot', jsonb_build_object(
      'numero',      v_ot.numero,
      'servicio',    v_ot.servicio,
      'descripcion', v_ot.descripcion,
      'fecha_cierre', v_cierre.fecha_cierre,
      'descripcion_trabajo', v_cierre.descripcion_trabajo
    )
  );
end;
$function$;

create or replace function public.registrar_conformidad_ot(p_token uuid, p_nombre text, p_dni text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  update cierres_tecnicos set
    conformidad_nombre = p_nombre,
    conformidad_dni    = p_dni,
    conformidad_fecha  = now(),
    conformidad_ip     = p_ip
  where token_conformidad = p_token
    and conformidad_fecha is null
    and (token_conformidad_expira_en is null or token_conformidad_expira_en > now());

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ya_firmada_o_invalida');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- 10. Comprobación ------------------------------------------------------------
do $$
declare
  v_faltan text[] := '{}';
begin
  if to_regclass('public.cierre_tecnico_firmas') is null then v_faltan := v_faltan || 'cierre_tecnico_firmas'; end if;
  if to_regclass('public.cierre_tecnico_evidencias') is null then v_faltan := v_faltan || 'cierre_tecnico_evidencias'; end if;
  if to_regprocedure('public.cerrar_ot_con_acta(text,text,jsonb)') is null then v_faltan := v_faltan || 'cerrar_ot_con_acta'; end if;
  if to_regprocedure('public.registrar_pdf_acta(text,text,text,text)') is null then v_faltan := v_faltan || 'registrar_pdf_acta'; end if;
  if not exists (select 1 from storage.buckets where id = 'actas-conformidad' and public = false) then v_faltan := v_faltan || 'bucket privado'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'storage_actas_conformidad_%') <> 3 then v_faltan := v_faltan || 'políticas storage'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'ab_proteger_acta_cierre_tecnico') then v_faltan := v_faltan || 'trigger bloqueo'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cierres_tecnicos' and column_name = 'acta_bloqueada') then v_faltan := v_faltan || 'columnas acta'; end if;
  if exists (select 1 from public.cierres_tecnicos where acta_bloqueada) then v_faltan := v_faltan || 'cierres previos marcados como bloqueados'; end if;
  if cardinality(v_faltan) > 0 then
    raise exception 'MIGRACION_ACTA_INCOMPLETA: %', array_to_string(v_faltan, ', ');
  end if;
end $$;
