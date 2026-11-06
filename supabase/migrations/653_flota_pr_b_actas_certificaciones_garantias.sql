-- PR B · Flota & Alquileres: actas de despacho/retorno, movimientos de equipo, certificaciones y garantías.
-- Solo cambios aditivos: tablas nuevas, funciones nuevas, bucket privado nuevo y permisos de pantallas nuevas.
-- Todas las escrituras de negocio pasan por RPC (security definer); las tablas solo exponen lectura vía RLS.
-- Decisiones del usuario (2026-10-28):
--   1. "En contrato" = equipo con despacho confirmado y sin retorno; el contrato vigente se muestra aparte.
--   2. La disponibilidad cambia al confirmar el acta (atómico), con firma del responsable como requisito.
--   3. Obligatoriedad por certificación del equipo, con catálogo de tipos por empresa (obligatoria por defecto y categorías).
--   4. Bloquea el despacho una certificación obligatoria faltante o vencida; el adjunto obligatorio se define por tipo.
--   5. Garantías: cartas fianza, pólizas y garantías de fábrica/componente/overhaul/extendida, con reclamos.
--   6. Permisos propios por pantalla (actas_despachos, certificaciones_activo, garantias_flota).

-- =====================================================================
-- 1. Catálogos por empresa
-- =====================================================================
create table if not exists public.flota_certificacion_tipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  obligatoria boolean not null default false,
  aplica_categorias text[],
  requiere_adjunto boolean not null default false,
  dias_alerta integer not null default 30 check (dias_alerta between 0 and 365),
  activo boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists flota_certificacion_tipos_nombre_key
  on public.flota_certificacion_tipos (empresa_id, lower(btrim(nombre)));

create table if not exists public.flota_garantia_tipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  nombre text not null check (btrim(nombre) <> ''),
  categoria text not null check (categoria in ('fabrica','componente','overhaul','extendida','carta_fianza','poliza','otro')),
  descripcion text,
  requiere_monto boolean not null default false,
  dias_alerta integer not null default 60 check (dias_alerta between 0 and 365),
  activo boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists flota_garantia_tipos_nombre_key
  on public.flota_garantia_tipos (empresa_id, lower(btrim(nombre)));

create table if not exists public.flota_checklist_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  tipo_acta text not null check (tipo_acta in ('despacho','retorno','ambos')),
  texto text not null check (btrim(texto) <> ''),
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists flota_checklist_items_texto_key
  on public.flota_checklist_items (empresa_id, tipo_acta, lower(btrim(texto)));

-- =====================================================================
-- 2. Certificaciones del activo (versionadas por renovación)
-- =====================================================================
create table if not exists public.activo_certificaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  activo_id text not null references public.activos(id) on delete restrict,
  tipo_id uuid not null references public.flota_certificacion_tipos(id) on delete restrict,
  numero text,
  emisor text,
  fecha_emision date,
  fecha_vencimiento date,
  obligatoria boolean not null default false,
  storage_path text,
  notas text,
  estado text not null default 'activa' check (estado in ('activa','reemplazada','anulada')),
  reemplaza_id uuid references public.activo_certificaciones(id) on delete restrict,
  anulado_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activo_certificaciones_fechas_chk check (fecha_vencimiento is null or fecha_emision is null or fecha_vencimiento >= fecha_emision)
);
create unique index if not exists activo_certificaciones_activa_key
  on public.activo_certificaciones (activo_id, tipo_id) where estado = 'activa';
create index if not exists activo_certificaciones_empresa_idx
  on public.activo_certificaciones (empresa_id, activo_id);

-- =====================================================================
-- 3. Garantías y reclamos
-- =====================================================================
create table if not exists public.garantias_flota (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  tipo_id uuid not null references public.flota_garantia_tipos(id) on delete restrict,
  activo_id text references public.activos(id) on delete restrict,
  contrato_alquiler_id text references public.contratos_alquiler(id) on delete restrict,
  componente text,
  numero text,
  emisor text,
  beneficiario text,
  monto numeric check (monto is null or monto >= 0),
  moneda text check (moneda is null or char_length(moneda) = 3),
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'vigente' check (estado in ('vigente','liberada','ejecutada','reemplazada','anulada')),
  responsable text,
  storage_path text,
  notas text,
  motivo_estado text,
  reemplaza_id uuid references public.garantias_flota(id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garantias_flota_fechas_chk check (fecha_fin >= fecha_inicio),
  constraint garantias_flota_objeto_chk check (activo_id is not null or contrato_alquiler_id is not null)
);
create index if not exists garantias_flota_empresa_idx on public.garantias_flota (empresa_id, estado, fecha_fin);

create table if not exists public.garantia_reclamos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  garantia_id uuid not null references public.garantias_flota(id) on delete restrict,
  codigo text not null,
  fecha date not null default current_date,
  descripcion text not null check (btrim(descripcion) <> ''),
  responsable text,
  monto_reclamado numeric check (monto_reclamado is null or monto_reclamado >= 0),
  estado text not null default 'abierto' check (estado in ('abierto','en_analisis','aprobado','rechazado','cerrado')),
  resolucion text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garantia_reclamos_codigo_key unique (empresa_id, codigo)
);
create index if not exists garantia_reclamos_garantia_idx on public.garantia_reclamos (garantia_id);

-- =====================================================================
-- 4. Actas de despacho/retorno, evidencias, firmas y movimientos
-- =====================================================================
create table if not exists public.actas_rental (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  sociedad_id uuid not null references public.sociedades(id) on delete restrict,
  numero text not null,
  tipo text not null check (tipo in ('despacho','retorno')),
  contrato_alquiler_id text not null references public.contratos_alquiler(id) on delete restrict,
  contrato_equipo_id uuid not null references public.contratos_alquiler_equipos(id) on delete restrict,
  activo_id text not null references public.activos(id) on delete restrict,
  fecha_movimiento timestamptz not null default now(),
  horometro numeric check (horometro is null or horometro >= 0),
  ubicacion_destino text,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  observaciones text,
  guia_remision_id text references public.guias_remision(id) on delete restrict,
  guia_no_requerida_motivo text,
  estado text not null default 'borrador' check (estado in ('borrador','confirmada','anulada')),
  requisitos_snapshot jsonb,
  confirmada_at timestamptz,
  confirmada_por uuid,
  anulada_at timestamptz,
  anulada_por uuid,
  anulado_motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint actas_rental_numero_key unique (empresa_id, numero)
);
create index if not exists actas_rental_empresa_idx on public.actas_rental (empresa_id, estado, fecha_movimiento desc);
create index if not exists actas_rental_activo_idx on public.actas_rental (activo_id);

create table if not exists public.acta_rental_evidencias (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.actas_rental(id) on delete cascade,
  empresa_id text not null,
  tipo text not null check (tipo in ('foto','documento')),
  storage_path text not null,
  descripcion text,
  sha256 text,
  geo jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint acta_rental_evidencias_path_key unique (acta_id, storage_path)
);

create table if not exists public.acta_rental_firmas (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.actas_rental(id) on delete cascade,
  empresa_id text not null,
  rol text not null check (rol in ('responsable_empresa','cliente','transportista','supervisor')),
  nombre text not null check (btrim(nombre) <> ''),
  documento text,
  storage_path text not null,
  sha256 text,
  geo jsonb,
  firmado_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint acta_rental_firmas_rol_key unique (acta_id, rol)
);

create table if not exists public.movimientos_equipo_rental (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  sociedad_id uuid not null references public.sociedades(id) on delete restrict,
  activo_id text not null references public.activos(id) on delete restrict,
  contrato_alquiler_id text not null references public.contratos_alquiler(id) on delete restrict,
  contrato_equipo_id uuid not null references public.contratos_alquiler_equipos(id) on delete restrict,
  acta_id uuid not null references public.actas_rental(id) on delete restrict,
  tipo text not null check (tipo in ('salida','retorno')),
  fecha timestamptz not null,
  horometro numeric,
  salida_id uuid references public.movimientos_equipo_rental(id) on delete restrict,
  abierto boolean not null default false,
  anulado boolean not null default false,
  created_at timestamptz not null default now(),
  constraint movimientos_equipo_rental_acta_key unique (acta_id),
  constraint movimientos_equipo_rental_abierto_chk check (not abierto or tipo = 'salida')
);
-- Un equipo no puede tener dos salidas abiertas: evita dos despachos simultáneos.
create unique index if not exists movimientos_equipo_rental_salida_abierta_key
  on public.movimientos_equipo_rental (activo_id) where tipo = 'salida' and abierto and not anulado;
create index if not exists movimientos_equipo_rental_empresa_idx on public.movimientos_equipo_rental (empresa_id, activo_id, fecha desc);

-- =====================================================================
-- 5. Trazabilidad
-- =====================================================================
create table if not exists public.flota_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  entidad text not null,
  entidad_id text not null,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  usuario uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists flota_eventos_entidad_idx on public.flota_eventos (empresa_id, entidad, entidad_id, created_at desc);

-- =====================================================================
-- 6. RLS: solo lectura; las escrituras van por RPC
-- =====================================================================
alter table public.flota_certificacion_tipos enable row level security;
alter table public.flota_garantia_tipos enable row level security;
alter table public.flota_checklist_items enable row level security;
alter table public.activo_certificaciones enable row level security;
alter table public.garantias_flota enable row level security;
alter table public.garantia_reclamos enable row level security;
alter table public.actas_rental enable row level security;
alter table public.acta_rental_evidencias enable row level security;
alter table public.acta_rental_firmas enable row level security;
alter table public.movimientos_equipo_rental enable row level security;
alter table public.flota_eventos enable row level security;

drop policy if exists flota_certificacion_tipos_select on public.flota_certificacion_tipos;
create policy flota_certificacion_tipos_select on public.flota_certificacion_tipos for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'certificaciones_activo', 'ver') or public.usuario_puede(empresa_id, 'actas_despachos', 'ver')));

drop policy if exists activo_certificaciones_select on public.activo_certificaciones;
create policy activo_certificaciones_select on public.activo_certificaciones for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'certificaciones_activo', 'ver') or public.usuario_puede(empresa_id, 'actas_despachos', 'ver')));

drop policy if exists flota_garantia_tipos_select on public.flota_garantia_tipos;
create policy flota_garantia_tipos_select on public.flota_garantia_tipos for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'garantias_flota', 'ver'));

drop policy if exists garantias_flota_select on public.garantias_flota;
create policy garantias_flota_select on public.garantias_flota for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'garantias_flota', 'ver')
         and (sociedad_id is null or public.flota_sociedad_en_alcance(empresa_id, sociedad_id)));

drop policy if exists garantia_reclamos_select on public.garantia_reclamos;
create policy garantia_reclamos_select on public.garantia_reclamos for select to authenticated
  using (exists (select 1 from public.garantias_flota g where g.id = garantia_reclamos.garantia_id
                 and public.usuario_tiene_empresa(g.empresa_id) and public.usuario_puede(g.empresa_id, 'garantias_flota', 'ver')
                 and (g.sociedad_id is null or public.flota_sociedad_en_alcance(g.empresa_id, g.sociedad_id))));

drop policy if exists flota_checklist_items_select on public.flota_checklist_items;
create policy flota_checklist_items_select on public.flota_checklist_items for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actas_despachos', 'ver'));

drop policy if exists actas_rental_select on public.actas_rental;
create policy actas_rental_select on public.actas_rental for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actas_despachos', 'ver')
         and public.flota_sociedad_en_alcance(empresa_id, sociedad_id));

drop policy if exists acta_rental_evidencias_select on public.acta_rental_evidencias;
create policy acta_rental_evidencias_select on public.acta_rental_evidencias for select to authenticated
  using (exists (select 1 from public.actas_rental a where a.id = acta_rental_evidencias.acta_id
                 and public.usuario_tiene_empresa(a.empresa_id) and public.usuario_puede(a.empresa_id, 'actas_despachos', 'ver')
                 and public.flota_sociedad_en_alcance(a.empresa_id, a.sociedad_id)));

drop policy if exists acta_rental_firmas_select on public.acta_rental_firmas;
create policy acta_rental_firmas_select on public.acta_rental_firmas for select to authenticated
  using (exists (select 1 from public.actas_rental a where a.id = acta_rental_firmas.acta_id
                 and public.usuario_tiene_empresa(a.empresa_id) and public.usuario_puede(a.empresa_id, 'actas_despachos', 'ver')
                 and public.flota_sociedad_en_alcance(a.empresa_id, a.sociedad_id)));

drop policy if exists movimientos_equipo_rental_select on public.movimientos_equipo_rental;
create policy movimientos_equipo_rental_select on public.movimientos_equipo_rental for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id)
         and (public.usuario_puede(empresa_id, 'actas_despachos', 'ver') or public.usuario_puede(empresa_id, 'flota_panel', 'ver'))
         and public.flota_sociedad_en_alcance(empresa_id, sociedad_id));

drop policy if exists flota_eventos_select on public.flota_eventos;
create policy flota_eventos_select on public.flota_eventos for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id)
         and (public.usuario_puede(empresa_id, 'actas_despachos', 'ver')
              or public.usuario_puede(empresa_id, 'certificaciones_activo', 'ver')
              or public.usuario_puede(empresa_id, 'garantias_flota', 'ver')));

comment on table public.actas_rental is 'Actas de despacho y retorno de equipos propios en contratos de alquiler. Se escriben solo por flota_guardar_acta / flota_anular_acta.';
comment on table public.movimientos_equipo_rental is 'Fuente de verdad de la disponibilidad Rental: una salida abierta = equipo entregado al cliente.';
comment on table public.activo_certificaciones is 'Certificaciones por equipo; una sola activa por tipo; la renovación reemplaza a la anterior.';
comment on table public.garantias_flota is 'Garantías de equipos y contratos (fábrica, componente, overhaul, extendida, carta fianza, póliza).';

-- =====================================================================
-- 7. Funciones internas (sin grant a usuarios)
-- =====================================================================
create or replace function public.flota__evento(p_empresa_id text, p_entidad text, p_entidad_id text, p_accion text, p_detalle jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  insert into public.flota_eventos (empresa_id, entidad, entidad_id, accion, detalle, usuario)
  values (p_empresa_id, p_entidad, p_entidad_id, p_accion, coalesce(p_detalle, '{}'::jsonb), auth.uid());
$$;

create or replace function public.flota__exigir(p_empresa_id text, p_pantalla text, p_accion text, p_mensaje text)
returns void
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if p_empresa_id is null or btrim(p_empresa_id) = '' then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;
  if not public.usuario_puede(p_empresa_id, p_pantalla, p_accion) then
    raise exception '%', p_mensaje using errcode = '42501';
  end if;
end;
$$;

-- Evalúa las certificaciones de un equipo contra el catálogo. No valida permisos (lo hace quien la llama).
create or replace function public.flota__evaluar_requisitos(p_empresa_id text, p_activo_id text, p_fecha date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_categoria text;
  v_items jsonb := '[]'::jsonb;
  v_bloqueado boolean := false;
  r record;
  v_estado text;
  v_requerida boolean;
begin
  select a.tipo_categoria into v_categoria
  from public.activos a where a.id = p_activo_id and a.empresa_id = p_empresa_id;
  if not found then
    raise exception 'El equipo no existe en esta empresa.' using errcode = '22023';
  end if;

  for r in
    select t.id as tipo_id, t.nombre, t.requiere_adjunto, t.dias_alerta,
           (t.activo and t.obligatoria and (t.aplica_categorias is null or cardinality(t.aplica_categorias) = 0
              or v_categoria = any(t.aplica_categorias))) as obligatoria_catalogo,
           c.id as cert_id, c.numero, c.emisor, c.fecha_emision, c.fecha_vencimiento, c.storage_path, coalesce(c.obligatoria, false) as obligatoria_cert
    from public.flota_certificacion_tipos t
    left join public.activo_certificaciones c
      on c.tipo_id = t.id and c.activo_id = p_activo_id and c.estado = 'activa'
    where t.empresa_id = p_empresa_id
      and (c.id is not null
           or (t.activo and t.obligatoria and (t.aplica_categorias is null or cardinality(t.aplica_categorias) = 0
               or v_categoria = any(t.aplica_categorias))))
    order by t.nombre
  loop
    v_requerida := r.obligatoria_catalogo or r.obligatoria_cert;
    if r.cert_id is null then
      v_estado := 'faltante';
    elsif r.fecha_vencimiento is not null and r.fecha_vencimiento < p_fecha then
      v_estado := 'vencida';
    elsif r.requiere_adjunto and r.storage_path is null then
      v_estado := 'sin_adjunto';
    elsif r.fecha_vencimiento is not null and r.fecha_vencimiento <= p_fecha + r.dias_alerta then
      v_estado := 'por_vencer';
    else
      v_estado := 'vigente';
    end if;
    if v_requerida and v_estado in ('faltante','vencida','sin_adjunto') then
      v_bloqueado := true;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'tipo_id', r.tipo_id, 'tipo', r.nombre, 'obligatoria', v_requerida, 'estado', v_estado,
      'certificacion_id', r.cert_id, 'numero', r.numero, 'emisor', r.emisor,
      'fecha_emision', r.fecha_emision, 'fecha_vencimiento', r.fecha_vencimiento,
      'bloquea', v_requerida and v_estado in ('faltante','vencida','sin_adjunto')));
  end loop;

  return jsonb_build_object('activo_id', p_activo_id, 'fecha', p_fecha, 'bloqueado', v_bloqueado, 'requisitos', v_items);
end;
$$;

create or replace function public.flota__ruta_valida(p_empresa_id text, p_carpeta text, p_path text)
returns boolean
language sql
immutable
as $$
  select p_path is null or (p_path like p_empresa_id || '/' || p_carpeta || '/%' and position('..' in p_path) = 0);
$$;

-- =====================================================================
-- 8. RPC de catálogos
-- =====================================================================
create or replace function public.flota_guardar_certificacion_tipo(p_empresa_id text, p_tipo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid := nullif(p_tipo->>'id', '')::uuid;
  v_antes jsonb;
  v_row public.flota_certificacion_tipos;
  v_categorias text[];
begin
  perform public.flota__exigir(p_empresa_id, 'certificaciones_activo', 'editar', 'No tiene permiso para configurar el catálogo de certificaciones.');
  if p_tipo is null or jsonb_typeof(p_tipo) <> 'object' then
    raise exception 'Los datos del tipo son obligatorios.' using errcode = '22023';
  end if;
  if nullif(btrim(p_tipo->>'nombre'), '') is null then
    raise exception 'El nombre del tipo es obligatorio.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tipo->'aplica_categorias') = 'array' then
    select array_agg(distinct btrim(x)) filter (where btrim(x) <> '') into v_categorias
    from jsonb_array_elements_text(p_tipo->'aplica_categorias') x;
  end if;

  if v_id is null then
    begin
      insert into public.flota_certificacion_tipos (empresa_id, nombre, descripcion, obligatoria, aplica_categorias, requiere_adjunto, dias_alerta, activo)
      values (p_empresa_id, btrim(p_tipo->>'nombre'), nullif(btrim(p_tipo->>'descripcion'), ''),
              coalesce((p_tipo->>'obligatoria')::boolean, false), v_categorias,
              coalesce((p_tipo->>'requiere_adjunto')::boolean, false),
              coalesce(nullif(p_tipo->>'dias_alerta', '')::integer, 30),
              coalesce((p_tipo->>'activo')::boolean, true))
      returning * into v_row;
    exception when unique_violation then
      raise exception 'Ya existe un tipo de certificación llamado %.', btrim(p_tipo->>'nombre') using errcode = '23505';
    end;
    perform public.flota__evento(p_empresa_id, 'certificacion_tipo', v_row.id::text, 'creado', to_jsonb(v_row));
  else
    select to_jsonb(t) into v_antes from public.flota_certificacion_tipos t where t.id = v_id and t.empresa_id = p_empresa_id for update;
    if v_antes is null then
      raise exception 'El tipo de certificación no existe.' using errcode = '22023';
    end if;
    begin
      update public.flota_certificacion_tipos set
        nombre = btrim(p_tipo->>'nombre'),
        descripcion = nullif(btrim(p_tipo->>'descripcion'), ''),
        obligatoria = coalesce((p_tipo->>'obligatoria')::boolean, obligatoria),
        aplica_categorias = case when p_tipo ? 'aplica_categorias' then v_categorias else aplica_categorias end,
        requiere_adjunto = coalesce((p_tipo->>'requiere_adjunto')::boolean, requiere_adjunto),
        dias_alerta = coalesce(nullif(p_tipo->>'dias_alerta', '')::integer, dias_alerta),
        activo = coalesce((p_tipo->>'activo')::boolean, activo),
        version = version + 1,
        updated_at = now()
      where id = v_id
      returning * into v_row;
    exception when unique_violation then
      raise exception 'Ya existe un tipo de certificación llamado %.', btrim(p_tipo->>'nombre') using errcode = '23505';
    end;
    perform public.flota__evento(p_empresa_id, 'certificacion_tipo', v_row.id::text, 'actualizado', jsonb_build_object('antes', v_antes, 'despues', to_jsonb(v_row)));
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_guardar_garantia_tipo(p_empresa_id text, p_tipo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid := nullif(p_tipo->>'id', '')::uuid;
  v_antes jsonb;
  v_row public.flota_garantia_tipos;
begin
  perform public.flota__exigir(p_empresa_id, 'garantias_flota', 'editar', 'No tiene permiso para configurar el catálogo de garantías.');
  if p_tipo is null or jsonb_typeof(p_tipo) <> 'object' then
    raise exception 'Los datos del tipo son obligatorios.' using errcode = '22023';
  end if;
  if nullif(btrim(p_tipo->>'nombre'), '') is null then
    raise exception 'El nombre del tipo es obligatorio.' using errcode = '22023';
  end if;

  if v_id is null then
    if nullif(p_tipo->>'categoria', '') is null then
      raise exception 'La categoría del tipo de garantía es obligatoria.' using errcode = '22023';
    end if;
    begin
      insert into public.flota_garantia_tipos (empresa_id, nombre, categoria, descripcion, requiere_monto, dias_alerta, activo)
      values (p_empresa_id, btrim(p_tipo->>'nombre'), p_tipo->>'categoria', nullif(btrim(p_tipo->>'descripcion'), ''),
              coalesce((p_tipo->>'requiere_monto')::boolean, p_tipo->>'categoria' in ('carta_fianza','poliza')),
              coalesce(nullif(p_tipo->>'dias_alerta', '')::integer, 60),
              coalesce((p_tipo->>'activo')::boolean, true))
      returning * into v_row;
    exception when unique_violation then
      raise exception 'Ya existe un tipo de garantía llamado %.', btrim(p_tipo->>'nombre') using errcode = '23505';
    end;
    perform public.flota__evento(p_empresa_id, 'garantia_tipo', v_row.id::text, 'creado', to_jsonb(v_row));
  else
    select to_jsonb(t) into v_antes from public.flota_garantia_tipos t where t.id = v_id and t.empresa_id = p_empresa_id for update;
    if v_antes is null then
      raise exception 'El tipo de garantía no existe.' using errcode = '22023';
    end if;
    begin
      update public.flota_garantia_tipos set
        nombre = btrim(p_tipo->>'nombre'),
        categoria = coalesce(nullif(p_tipo->>'categoria', ''), categoria),
        descripcion = nullif(btrim(p_tipo->>'descripcion'), ''),
        requiere_monto = coalesce((p_tipo->>'requiere_monto')::boolean, requiere_monto),
        dias_alerta = coalesce(nullif(p_tipo->>'dias_alerta', '')::integer, dias_alerta),
        activo = coalesce((p_tipo->>'activo')::boolean, activo),
        version = version + 1,
        updated_at = now()
      where id = v_id
      returning * into v_row;
    exception when unique_violation then
      raise exception 'Ya existe un tipo de garantía llamado %.', btrim(p_tipo->>'nombre') using errcode = '23505';
    end;
    perform public.flota__evento(p_empresa_id, 'garantia_tipo', v_row.id::text, 'actualizado', jsonb_build_object('antes', v_antes, 'despues', to_jsonb(v_row)));
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_guardar_checklist_item(p_empresa_id text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid := nullif(p_item->>'id', '')::uuid;
  v_row public.flota_checklist_items;
begin
  perform public.flota__exigir(p_empresa_id, 'actas_despachos', 'editar', 'No tiene permiso para configurar el checklist de actas.');
  if nullif(btrim(p_item->>'texto'), '') is null then
    raise exception 'El texto del punto de control es obligatorio.' using errcode = '22023';
  end if;
  begin
    if v_id is null then
      insert into public.flota_checklist_items (empresa_id, tipo_acta, texto, orden, activo)
      values (p_empresa_id, coalesce(nullif(p_item->>'tipo_acta', ''), 'ambos'), btrim(p_item->>'texto'),
              coalesce(nullif(p_item->>'orden', '')::integer, 0), coalesce((p_item->>'activo')::boolean, true))
      returning * into v_row;
    else
      update public.flota_checklist_items set
        tipo_acta = coalesce(nullif(p_item->>'tipo_acta', ''), tipo_acta),
        texto = btrim(p_item->>'texto'),
        orden = coalesce(nullif(p_item->>'orden', '')::integer, orden),
        activo = coalesce((p_item->>'activo')::boolean, activo),
        updated_at = now()
      where id = v_id and empresa_id = p_empresa_id
      returning * into v_row;
      if v_row.id is null then
        raise exception 'El punto de control no existe.' using errcode = '22023';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ese punto de control ya existe.' using errcode = '23505';
  end;
  perform public.flota__evento(p_empresa_id, 'checklist_item', v_row.id::text, case when v_id is null then 'creado' else 'actualizado' end, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

-- Carga tipos sugeridos SOLO para la empresa que lo pide (nunca siembra otras empresas).
create or replace function public.flota_cargar_catalogo_sugerido(p_empresa_id text, p_catalogo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_n integer := 0;
begin
  if p_catalogo = 'certificaciones' then
    perform public.flota__exigir(p_empresa_id, 'certificaciones_activo', 'editar', 'No tiene permiso para configurar el catálogo de certificaciones.');
    insert into public.flota_certificacion_tipos (empresa_id, nombre, descripcion, obligatoria, requiere_adjunto, dias_alerta)
    select p_empresa_id, s.nombre, s.descripcion, false, s.adjunto, s.dias
    from (values
      ('Seguridad minera', 'Certificado de operación segura en mina', true, 30),
      ('Revisión técnica', 'Revisión técnica vehicular o de equipo', true, 30),
      ('Izaje y carga', 'Equipos con pluma o capacidad de izaje', true, 30),
      ('Inspección de extintores', 'Control periódico de extintores del equipo', false, 15)
    ) as s(nombre, descripcion, adjunto, dias)
    where not exists (select 1 from public.flota_certificacion_tipos t where t.empresa_id = p_empresa_id and lower(btrim(t.nombre)) = lower(s.nombre));
    get diagnostics v_n = row_count;
  elsif p_catalogo = 'garantias' then
    perform public.flota__exigir(p_empresa_id, 'garantias_flota', 'editar', 'No tiene permiso para configurar el catálogo de garantías.');
    insert into public.flota_garantia_tipos (empresa_id, nombre, categoria, descripcion, requiere_monto, dias_alerta)
    select p_empresa_id, s.nombre, s.categoria, s.descripcion, s.monto, s.dias
    from (values
      ('Garantía de fábrica', 'fabrica', 'Proveedor original · equipo completo', false, 60),
      ('Garantía de componente', 'componente', 'Repuesto o sistema específico', false, 60),
      ('Garantía de overhaul', 'overhaul', 'Trabajo de taller y componentes intervenidos', false, 60),
      ('Garantía extendida', 'extendida', 'Contrato de extensión con proveedor', false, 60),
      ('Carta fianza', 'carta_fianza', 'Fianza bancaria de fiel cumplimiento o adelanto', true, 30),
      ('Póliza de seguro', 'poliza', 'Póliza de seguro del equipo o de responsabilidad civil', true, 30)
    ) as s(nombre, categoria, descripcion, monto, dias)
    where not exists (select 1 from public.flota_garantia_tipos t where t.empresa_id = p_empresa_id and lower(btrim(t.nombre)) = lower(s.nombre));
    get diagnostics v_n = row_count;
  elsif p_catalogo = 'checklist' then
    perform public.flota__exigir(p_empresa_id, 'actas_despachos', 'editar', 'No tiene permiso para configurar el checklist de actas.');
    insert into public.flota_checklist_items (empresa_id, tipo_acta, texto, orden)
    select p_empresa_id, s.tipo, s.texto, s.orden
    from (values
      ('ambos', 'Sin daños estructurales visibles', 1),
      ('ambos', 'Protecciones y alarmas operativas', 2),
      ('ambos', 'Accesorios y herramientas completos', 3),
      ('ambos', 'Sin fugas de aceite, combustible o refrigerante', 4),
      ('retorno', 'Equipo limpio y sin material del cliente', 5)
    ) as s(tipo, texto, orden)
    where not exists (select 1 from public.flota_checklist_items t where t.empresa_id = p_empresa_id and t.tipo_acta = s.tipo and lower(btrim(t.texto)) = lower(s.texto));
    get diagnostics v_n = row_count;
  else
    raise exception 'Catálogo no reconocido.' using errcode = '22023';
  end if;
  if v_n > 0 then
    perform public.flota__evento(p_empresa_id, 'catalogo', p_catalogo, 'sugeridos_cargados', jsonb_build_object('filas', v_n));
  end if;
  return jsonb_build_object('catalogo', p_catalogo, 'insertados', v_n);
end;
$$;

-- =====================================================================
-- 9. RPC de certificaciones
-- =====================================================================
create or replace function public.flota_registrar_certificacion(p_empresa_id text, p_cert jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_activo text := nullif(p_cert->>'activo_id', '');
  v_tipo public.flota_certificacion_tipos;
  v_prev uuid;
  v_row public.activo_certificaciones;
  v_path text := nullif(p_cert->>'storage_path', '');
begin
  perform public.flota__exigir(p_empresa_id, 'certificaciones_activo', 'crear', 'No tiene permiso para registrar certificaciones.');
  if v_activo is null then raise exception 'El equipo es obligatorio.' using errcode = '22023'; end if;
  if not exists (select 1 from public.activos a where a.id = v_activo and a.empresa_id = p_empresa_id and a.propietario_tipo = 'propio' and a.estado is distinct from 'dado_baja') then
    raise exception 'El equipo no existe, no es propio o está dado de baja.' using errcode = '22023';
  end if;
  select * into v_tipo from public.flota_certificacion_tipos t where t.id = nullif(p_cert->>'tipo_id', '')::uuid and t.empresa_id = p_empresa_id;
  if v_tipo.id is null then raise exception 'El tipo de certificación es obligatorio.' using errcode = '22023'; end if;
  if not v_tipo.activo then raise exception 'El tipo de certificación % está inactivo.', v_tipo.nombre using errcode = '22023'; end if;
  if v_tipo.requiere_adjunto and v_path is null then
    raise exception 'El tipo % exige adjuntar el documento.', v_tipo.nombre using errcode = '22023';
  end if;
  if not public.flota__ruta_valida(p_empresa_id, 'certificaciones', v_path) then
    raise exception 'La ruta del adjunto no es válida.' using errcode = '22023';
  end if;

  select c.id into v_prev from public.activo_certificaciones c
  where c.activo_id = v_activo and c.tipo_id = v_tipo.id and c.estado = 'activa' for update;
  if v_prev is not null then
    update public.activo_certificaciones set estado = 'reemplazada', updated_at = now() where id = v_prev;
  end if;

  insert into public.activo_certificaciones (empresa_id, activo_id, tipo_id, numero, emisor, fecha_emision, fecha_vencimiento, obligatoria, storage_path, notas, reemplaza_id)
  values (p_empresa_id, v_activo, v_tipo.id, nullif(btrim(p_cert->>'numero'), ''), nullif(btrim(p_cert->>'emisor'), ''),
          nullif(p_cert->>'fecha_emision', '')::date, nullif(p_cert->>'fecha_vencimiento', '')::date,
          v_tipo.obligatoria or coalesce((p_cert->>'obligatoria')::boolean, false),
          v_path, nullif(btrim(p_cert->>'notas'), ''), v_prev)
  returning * into v_row;

  perform public.flota__evento(p_empresa_id, 'certificacion', v_row.id::text, case when v_prev is null then 'registrada' else 'renovada' end,
                               jsonb_build_object('activo_id', v_activo, 'tipo', v_tipo.nombre, 'reemplaza_id', v_prev, 'fecha_vencimiento', v_row.fecha_vencimiento));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_actualizar_certificacion(p_id uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old public.activo_certificaciones;
  v_tipo public.flota_certificacion_tipos;
  v_row public.activo_certificaciones;
  v_path text;
begin
  select * into v_old from public.activo_certificaciones where id = p_id for update;
  if v_old.id is null then raise exception 'La certificación no existe.' using errcode = '22023'; end if;
  perform public.flota__exigir(v_old.empresa_id, 'certificaciones_activo', 'editar', 'No tiene permiso para editar certificaciones.');
  if v_old.estado <> 'activa' then raise exception 'Solo se puede editar la certificación activa.' using errcode = '22023'; end if;
  select * into v_tipo from public.flota_certificacion_tipos where id = v_old.tipo_id;
  v_path := case when p_cambios ? 'storage_path' then nullif(p_cambios->>'storage_path', '') else v_old.storage_path end;
  if v_tipo.requiere_adjunto and v_path is null then
    raise exception 'El tipo % exige adjuntar el documento.', v_tipo.nombre using errcode = '22023';
  end if;
  if not public.flota__ruta_valida(v_old.empresa_id, 'certificaciones', v_path) then
    raise exception 'La ruta del adjunto no es válida.' using errcode = '22023';
  end if;
  update public.activo_certificaciones set
    numero = case when p_cambios ? 'numero' then nullif(btrim(p_cambios->>'numero'), '') else numero end,
    emisor = case when p_cambios ? 'emisor' then nullif(btrim(p_cambios->>'emisor'), '') else emisor end,
    fecha_emision = case when p_cambios ? 'fecha_emision' then nullif(p_cambios->>'fecha_emision', '')::date else fecha_emision end,
    fecha_vencimiento = case when p_cambios ? 'fecha_vencimiento' then nullif(p_cambios->>'fecha_vencimiento', '')::date else fecha_vencimiento end,
    obligatoria = v_tipo.obligatoria or coalesce((p_cambios->>'obligatoria')::boolean, obligatoria),
    storage_path = v_path,
    notas = case when p_cambios ? 'notas' then nullif(btrim(p_cambios->>'notas'), '') else notas end,
    updated_at = now()
  where id = p_id
  returning * into v_row;
  perform public.flota__evento(v_old.empresa_id, 'certificacion', p_id::text, 'actualizada', jsonb_build_object('antes', to_jsonb(v_old), 'despues', to_jsonb(v_row)));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_anular_certificacion(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old public.activo_certificaciones;
begin
  select * into v_old from public.activo_certificaciones where id = p_id for update;
  if v_old.id is null then raise exception 'La certificación no existe.' using errcode = '22023'; end if;
  perform public.flota__exigir(v_old.empresa_id, 'certificaciones_activo', 'anular', 'No tiene permiso para anular certificaciones.');
  if v_old.estado <> 'activa' then raise exception 'La certificación ya no está activa.' using errcode = '22023'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'El motivo de anulación es obligatorio.' using errcode = '22023'; end if;
  update public.activo_certificaciones set estado = 'anulada', anulado_motivo = btrim(p_motivo), updated_at = now() where id = p_id;
  perform public.flota__evento(v_old.empresa_id, 'certificacion', p_id::text, 'anulada', jsonb_build_object('motivo', btrim(p_motivo)));
  return jsonb_build_object('id', p_id, 'estado', 'anulada');
end;
$$;

create or replace function public.flota_requisitos_despacho(p_empresa_id text, p_activo_id text, p_fecha date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id)
     or not (public.usuario_puede(p_empresa_id, 'actas_despachos', 'ver')
             or public.usuario_puede(p_empresa_id, 'certificaciones_activo', 'ver')
             or public.usuario_puede(p_empresa_id, 'flota_panel', 'ver')) then
    raise exception 'No tiene permiso para consultar los requisitos del equipo.' using errcode = '42501';
  end if;
  return public.flota__evaluar_requisitos(p_empresa_id, p_activo_id, coalesce(p_fecha, current_date));
end;
$$;

-- Estado Rental de los equipos propios: despacho abierto y bloqueo por certificaciones.
create or replace function public.flota_estado_equipos(p_empresa_id text)
returns table (
  activo_id text,
  despachado boolean,
  acta_salida_id uuid,
  acta_salida_numero text,
  contrato_alquiler_id text,
  contrato_numero text,
  fecha_salida timestamptz,
  bloqueado boolean,
  requisitos jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.usuario_tiene_empresa(p_empresa_id)
     or not (public.usuario_puede(p_empresa_id, 'flota_panel', 'ver') or public.usuario_puede(p_empresa_id, 'actas_despachos', 'ver')) then
    raise exception 'No tiene permiso para consultar el estado de la flota.' using errcode = '42501';
  end if;
  return query
  select a.id,
         m.id is not null,
         ar.id, ar.numero,
         m.contrato_alquiler_id, ca.numero, m.fecha,
         coalesce((ev.r->>'bloqueado')::boolean, false),
         coalesce(ev.r->'requisitos', '[]'::jsonb)
  from public.activos a
  left join public.movimientos_equipo_rental m
    on m.activo_id = a.id and m.tipo = 'salida' and m.abierto and not m.anulado
  left join public.actas_rental ar on ar.id = m.acta_id
  left join public.contratos_alquiler ca on ca.id = m.contrato_alquiler_id
  cross join lateral (select public.flota__evaluar_requisitos(p_empresa_id, a.id, current_date) as r) ev
  where a.empresa_id = p_empresa_id
    and a.propietario_tipo = 'propio'
    and a.estado is distinct from 'dado_baja'
    and (m.id is null or public.flota_sociedad_en_alcance(p_empresa_id, m.sociedad_id));
end;
$$;

-- =====================================================================
-- 10. RPC de garantías y reclamos
-- =====================================================================
create or replace function public.flota_guardar_garantia(p_empresa_id text, p_garantia jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid := nullif(p_garantia->>'id', '')::uuid;
  v_old public.garantias_flota;
  v_tipo public.flota_garantia_tipos;
  v_activo text := nullif(p_garantia->>'activo_id', '');
  v_contrato text := nullif(p_garantia->>'contrato_alquiler_id', '');
  v_sociedad uuid;
  v_inicio date := nullif(p_garantia->>'fecha_inicio', '')::date;
  v_fin date := nullif(p_garantia->>'fecha_fin', '')::date;
  v_monto numeric := nullif(p_garantia->>'monto', '')::numeric;
  v_moneda text := upper(nullif(btrim(p_garantia->>'moneda'), ''));
  v_path text := nullif(p_garantia->>'storage_path', '');
  v_reemplaza uuid := nullif(p_garantia->>'reemplaza_id', '')::uuid;
  v_row public.garantias_flota;
begin
  if v_id is null then
    perform public.flota__exigir(p_empresa_id, 'garantias_flota', 'crear', 'No tiene permiso para registrar garantías.');
  else
    perform public.flota__exigir(p_empresa_id, 'garantias_flota', 'editar', 'No tiene permiso para editar garantías.');
    select * into v_old from public.garantias_flota where id = v_id and empresa_id = p_empresa_id for update;
    if v_old.id is null then raise exception 'La garantía no existe.' using errcode = '22023'; end if;
    if v_old.estado <> 'vigente' then raise exception 'Solo se puede editar una garantía vigente.' using errcode = '22023'; end if;
  end if;

  select * into v_tipo from public.flota_garantia_tipos where id = nullif(p_garantia->>'tipo_id', '')::uuid and empresa_id = p_empresa_id;
  if v_tipo.id is null then raise exception 'El tipo de garantía es obligatorio.' using errcode = '22023'; end if;
  if not v_tipo.activo and (v_old.id is null or v_old.tipo_id <> v_tipo.id) then
    raise exception 'El tipo de garantía % está inactivo.', v_tipo.nombre using errcode = '22023';
  end if;
  if v_activo is null and v_contrato is null then
    raise exception 'Indique el equipo, el contrato o ambos.' using errcode = '22023';
  end if;
  if v_activo is not null and not exists (select 1 from public.activos a where a.id = v_activo and a.empresa_id = p_empresa_id and a.propietario_tipo = 'propio') then
    raise exception 'El equipo no existe o no es propio.' using errcode = '22023';
  end if;
  if v_contrato is not null then
    select ca.sociedad_id into v_sociedad from public.contratos_alquiler ca where ca.id = v_contrato and ca.empresa_id = p_empresa_id;
    if v_sociedad is null then raise exception 'El contrato no existe en esta empresa.' using errcode = '22023'; end if;
    if not public.flota_sociedad_en_alcance(p_empresa_id, v_sociedad) then
      raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
    end if;
    if v_activo is not null and not exists (select 1 from public.contratos_alquiler_equipos cae where cae.contrato_alquiler_id = v_contrato and cae.equipo_id = v_activo) then
      raise exception 'El equipo no pertenece al contrato indicado.' using errcode = '22023';
    end if;
  end if;
  if v_inicio is null or v_fin is null then raise exception 'Las fechas de cobertura son obligatorias.' using errcode = '22023'; end if;
  if v_fin < v_inicio then raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023'; end if;
  if v_tipo.requiere_monto and (v_monto is null or v_moneda is null) then
    raise exception 'El tipo % exige monto y moneda.', v_tipo.nombre using errcode = '22023';
  end if;
  if (v_monto is null) <> (v_moneda is null) then
    raise exception 'Indique monto y moneda juntos.' using errcode = '22023';
  end if;
  if not public.flota__ruta_valida(p_empresa_id, 'garantias', v_path) then
    raise exception 'La ruta del adjunto no es válida.' using errcode = '22023';
  end if;

  if v_id is null then
    if v_reemplaza is not null then
      update public.garantias_flota set estado = 'reemplazada', motivo_estado = 'Renovada', updated_at = now()
      where id = v_reemplaza and empresa_id = p_empresa_id and estado = 'vigente';
      if not found then raise exception 'La garantía a renovar no existe o no está vigente.' using errcode = '22023'; end if;
    end if;
    insert into public.garantias_flota (empresa_id, sociedad_id, tipo_id, activo_id, contrato_alquiler_id, componente, numero, emisor, beneficiario,
                                        monto, moneda, fecha_inicio, fecha_fin, responsable, storage_path, notas, reemplaza_id)
    values (p_empresa_id, v_sociedad, v_tipo.id, v_activo, v_contrato, nullif(btrim(p_garantia->>'componente'), ''),
            nullif(btrim(p_garantia->>'numero'), ''), nullif(btrim(p_garantia->>'emisor'), ''), nullif(btrim(p_garantia->>'beneficiario'), ''),
            v_monto, v_moneda, v_inicio, v_fin, nullif(btrim(p_garantia->>'responsable'), ''), v_path, nullif(btrim(p_garantia->>'notas'), ''), v_reemplaza)
    returning * into v_row;
    perform public.flota__evento(p_empresa_id, 'garantia', v_row.id::text, case when v_reemplaza is null then 'registrada' else 'renovada' end,
                                 jsonb_build_object('tipo', v_tipo.nombre, 'reemplaza_id', v_reemplaza, 'fecha_fin', v_fin));
  else
    update public.garantias_flota set
      sociedad_id = v_sociedad, tipo_id = v_tipo.id, activo_id = v_activo, contrato_alquiler_id = v_contrato,
      componente = nullif(btrim(p_garantia->>'componente'), ''), numero = nullif(btrim(p_garantia->>'numero'), ''),
      emisor = nullif(btrim(p_garantia->>'emisor'), ''), beneficiario = nullif(btrim(p_garantia->>'beneficiario'), ''),
      monto = v_monto, moneda = v_moneda, fecha_inicio = v_inicio, fecha_fin = v_fin,
      responsable = nullif(btrim(p_garantia->>'responsable'), ''),
      storage_path = case when p_garantia ? 'storage_path' then v_path else storage_path end,
      notas = nullif(btrim(p_garantia->>'notas'), ''), updated_at = now()
    where id = v_id
    returning * into v_row;
    perform public.flota__evento(p_empresa_id, 'garantia', v_id::text, 'actualizada', jsonb_build_object('antes', to_jsonb(v_old), 'despues', to_jsonb(v_row)));
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_cambiar_estado_garantia(p_id uuid, p_estado text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old public.garantias_flota;
begin
  select * into v_old from public.garantias_flota where id = p_id for update;
  if v_old.id is null then raise exception 'La garantía no existe.' using errcode = '22023'; end if;
  if p_estado not in ('liberada','ejecutada','anulada') then
    raise exception 'Estado de garantía no permitido.' using errcode = '22023';
  end if;
  perform public.flota__exigir(v_old.empresa_id, 'garantias_flota', case when p_estado = 'anulada' then 'anular' else 'editar' end,
                               'No tiene permiso para cambiar el estado de la garantía.');
  if v_old.sociedad_id is not null and not public.flota_sociedad_en_alcance(v_old.empresa_id, v_old.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  if v_old.estado <> 'vigente' then raise exception 'La garantía ya no está vigente.' using errcode = '22023'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'El motivo es obligatorio.' using errcode = '22023'; end if;
  update public.garantias_flota set estado = p_estado, motivo_estado = btrim(p_motivo), updated_at = now() where id = p_id;
  perform public.flota__evento(v_old.empresa_id, 'garantia', p_id::text, p_estado, jsonb_build_object('motivo', btrim(p_motivo)));
  return jsonb_build_object('id', p_id, 'estado', p_estado);
end;
$$;

create or replace function public.flota_registrar_reclamo(p_garantia_id uuid, p_reclamo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_g public.garantias_flota;
  v_next integer;
  v_row public.garantia_reclamos;
begin
  select * into v_g from public.garantias_flota where id = p_garantia_id for update;
  if v_g.id is null then raise exception 'La garantía no existe.' using errcode = '22023'; end if;
  perform public.flota__exigir(v_g.empresa_id, 'garantias_flota', 'crear', 'No tiene permiso para registrar reclamos.');
  if v_g.sociedad_id is not null and not public.flota_sociedad_en_alcance(v_g.empresa_id, v_g.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  if v_g.estado <> 'vigente' then raise exception 'Solo se reclama sobre una garantía vigente.' using errcode = '22023'; end if;
  if nullif(btrim(p_reclamo->>'descripcion'), '') is null then raise exception 'La descripción del reclamo es obligatoria.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('garantia_reclamo:' || v_g.empresa_id));
  select coalesce(max(substring(codigo from '^RCL-(\d+)$')::integer), 0) + 1 into v_next
  from public.garantia_reclamos where empresa_id = v_g.empresa_id;
  insert into public.garantia_reclamos (empresa_id, garantia_id, codigo, fecha, descripcion, responsable, monto_reclamado)
  values (v_g.empresa_id, v_g.id, 'RCL-' || lpad(v_next::text, 4, '0'),
          coalesce(nullif(p_reclamo->>'fecha', '')::date, current_date), btrim(p_reclamo->>'descripcion'),
          nullif(btrim(p_reclamo->>'responsable'), ''), nullif(p_reclamo->>'monto_reclamado', '')::numeric)
  returning * into v_row;
  perform public.flota__evento(v_g.empresa_id, 'garantia', v_g.id::text, 'reclamo_registrado', jsonb_build_object('reclamo_id', v_row.id, 'codigo', v_row.codigo));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.flota_actualizar_reclamo(p_reclamo_id uuid, p_estado text, p_resolucion text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_r public.garantia_reclamos;
  v_g public.garantias_flota;
begin
  select * into v_r from public.garantia_reclamos where id = p_reclamo_id for update;
  if v_r.id is null then raise exception 'El reclamo no existe.' using errcode = '22023'; end if;
  select * into v_g from public.garantias_flota where id = v_r.garantia_id;
  perform public.flota__exigir(v_r.empresa_id, 'garantias_flota', 'editar', 'No tiene permiso para actualizar reclamos.');
  if v_g.sociedad_id is not null and not public.flota_sociedad_en_alcance(v_g.empresa_id, v_g.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
  end if;
  if v_r.estado = 'cerrado' then raise exception 'El reclamo ya está cerrado.' using errcode = '22023'; end if;
  if p_estado not in ('abierto','en_analisis','aprobado','rechazado','cerrado') then
    raise exception 'Estado de reclamo no permitido.' using errcode = '22023';
  end if;
  if p_estado in ('aprobado','rechazado','cerrado') and nullif(btrim(p_resolucion), '') is null then
    raise exception 'La resolución es obligatoria para este estado.' using errcode = '22023';
  end if;
  update public.garantia_reclamos set estado = p_estado, resolucion = coalesce(nullif(btrim(p_resolucion), ''), resolucion), updated_at = now()
  where id = p_reclamo_id;
  perform public.flota__evento(v_r.empresa_id, 'garantia', v_r.garantia_id::text, 'reclamo_' || p_estado,
                               jsonb_build_object('reclamo_id', v_r.id, 'codigo', v_r.codigo, 'resolucion', nullif(btrim(p_resolucion), '')));
  return jsonb_build_object('id', p_reclamo_id, 'estado', p_estado);
end;
$$;

-- =====================================================================
-- 11. RPC de actas: guardar borrador y confirmar en una sola llamada atómica
-- =====================================================================
create or replace function public.flota_guardar_acta(p_empresa_id text, p_acta jsonb, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid := nullif(p_acta->>'id', '')::uuid;
  v_acta public.actas_rental;
  v_cae record;
  v_tipo text;
  v_numero text;
  v_next integer;
  v_item jsonb;
  v_paths text[];
  v_roles text[];
  v_guia text := nullif(p_acta->>'guia_remision_id', '');
  v_horometro_actual numeric;
  v_estado_activo text;
  v_salida public.movimientos_equipo_rental;
  v_req jsonb;
  v_mov uuid;
  v_fecha timestamptz;
  v_sin_responder integer;
begin
  if v_id is null then
    perform public.flota__exigir(p_empresa_id, 'actas_despachos', 'crear', 'No tiene permiso para crear actas.');
    v_tipo := p_acta->>'tipo';
    if v_tipo not in ('despacho','retorno') then
      raise exception 'El tipo de acta debe ser despacho o retorno.' using errcode = '22023';
    end if;
    select cae.id, cae.equipo_id, ca.id as contrato_id, ca.sociedad_id, ca.estado, ca.fecha_inicio, ca.fecha_fin, ca.numero
      into v_cae
    from public.contratos_alquiler_equipos cae
    join public.contratos_alquiler ca on ca.id = cae.contrato_alquiler_id
    where cae.id = nullif(p_acta->>'contrato_equipo_id', '')::uuid and ca.empresa_id = p_empresa_id;
    if not found then
      raise exception 'Seleccione un contrato y un equipo válidos.' using errcode = '22023';
    end if;
    if not public.flota_sociedad_en_alcance(p_empresa_id, v_cae.sociedad_id) then
      raise exception 'No tiene alcance sobre la sociedad del contrato.' using errcode = '42501';
    end if;
    if v_tipo = 'despacho' and v_cae.estado <> 'vigente' then
      raise exception 'Solo se despacha contra un contrato vigente (el contrato % está %).', v_cae.numero, v_cae.estado using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('acta_rental:' || p_empresa_id || ':' || v_tipo));
    select coalesce(max(substring(numero from '-(\d+)$')::integer), 0) + 1 into v_next
    from public.actas_rental
    where empresa_id = p_empresa_id and tipo = v_tipo and numero like (case v_tipo when 'despacho' then 'DES-' else 'RET-' end) || to_char(current_date, 'YYYY') || '-%';
    v_numero := (case v_tipo when 'despacho' then 'DES-' else 'RET-' end) || to_char(current_date, 'YYYY') || '-' || lpad(v_next::text, 4, '0');
    insert into public.actas_rental (empresa_id, sociedad_id, numero, tipo, contrato_alquiler_id, contrato_equipo_id, activo_id)
    values (p_empresa_id, v_cae.sociedad_id, v_numero, v_tipo, v_cae.contrato_id, v_cae.id, v_cae.equipo_id)
    returning * into v_acta;
    perform public.flota__evento(p_empresa_id, 'acta', v_acta.id::text, 'creada', jsonb_build_object('numero', v_numero, 'tipo', v_tipo));
  else
    select * into v_acta from public.actas_rental where id = v_id and empresa_id = p_empresa_id for update;
    if not found then raise exception 'El acta no existe.' using errcode = '22023'; end if;
    perform public.flota__exigir(p_empresa_id, 'actas_despachos', case when p_confirmar then 'crear' else 'editar' end, 'No tiene permiso para modificar actas.');
    if not public.flota_sociedad_en_alcance(p_empresa_id, v_acta.sociedad_id) then
      raise exception 'No tiene alcance sobre la sociedad del acta.' using errcode = '42501';
    end if;
    if v_acta.estado <> 'borrador' then
      raise exception 'El acta % ya está %; no se puede modificar.', v_acta.numero, v_acta.estado using errcode = '22023';
    end if;
  end if;

  -- Datos del borrador
  if v_guia is not null and not exists (select 1 from public.guias_remision g where g.id = v_guia and g.empresa_id = p_empresa_id and coalesce(g.anulado, false) = false) then
    raise exception 'La guía de remisión no existe o está anulada.' using errcode = '22023';
  end if;
  if p_acta ? 'checklist' and jsonb_typeof(p_acta->'checklist') <> 'array' then
    raise exception 'El checklist debe ser una lista.' using errcode = '22023';
  end if;
  update public.actas_rental set
    fecha_movimiento = coalesce(nullif(p_acta->>'fecha_movimiento', '')::timestamptz, fecha_movimiento),
    horometro = case when p_acta ? 'horometro' then nullif(p_acta->>'horometro', '')::numeric else horometro end,
    ubicacion_destino = case when p_acta ? 'ubicacion_destino' then nullif(btrim(p_acta->>'ubicacion_destino'), '') else ubicacion_destino end,
    checklist = coalesce(p_acta->'checklist', checklist),
    observaciones = case when p_acta ? 'observaciones' then nullif(btrim(p_acta->>'observaciones'), '') else observaciones end,
    guia_remision_id = case when p_acta ? 'guia_remision_id' then v_guia else guia_remision_id end,
    guia_no_requerida_motivo = case when p_acta ? 'guia_no_requerida_motivo' then nullif(btrim(p_acta->>'guia_no_requerida_motivo'), '') else guia_no_requerida_motivo end,
    updated_at = now()
  where id = v_acta.id
  returning * into v_acta;

  -- Evidencias: el borrador refleja exactamente la lista enviada
  if jsonb_typeof(p_acta->'evidencias') = 'array' then
    select coalesce(array_agg(e->>'storage_path'), '{}') into v_paths from jsonb_array_elements(p_acta->'evidencias') e;
    delete from public.acta_rental_evidencias where acta_id = v_acta.id and not (storage_path = any(v_paths));
    for v_item in select * from jsonb_array_elements(p_acta->'evidencias') loop
      if not public.flota__ruta_valida(p_empresa_id, 'actas', v_item->>'storage_path') or nullif(v_item->>'storage_path', '') is null then
        raise exception 'La ruta de una evidencia no es válida.' using errcode = '22023';
      end if;
      insert into public.acta_rental_evidencias (acta_id, empresa_id, tipo, storage_path, descripcion, sha256, geo)
      values (v_acta.id, p_empresa_id, coalesce(nullif(v_item->>'tipo', ''), 'foto'), v_item->>'storage_path',
              nullif(btrim(v_item->>'descripcion'), ''), nullif(v_item->>'sha256', ''), case when jsonb_typeof(v_item->'geo') = 'object' then v_item->'geo' end)
      on conflict (acta_id, storage_path) do update set descripcion = excluded.descripcion;
    end loop;
  end if;

  -- Firmas por rol
  if jsonb_typeof(p_acta->'firmas') = 'array' then
    select coalesce(array_agg(f->>'rol'), '{}') into v_roles from jsonb_array_elements(p_acta->'firmas') f;
    delete from public.acta_rental_firmas where acta_id = v_acta.id and not (rol = any(v_roles));
    for v_item in select * from jsonb_array_elements(p_acta->'firmas') loop
      if not public.flota__ruta_valida(p_empresa_id, 'actas', v_item->>'storage_path') or nullif(v_item->>'storage_path', '') is null then
        raise exception 'La ruta de una firma no es válida.' using errcode = '22023';
      end if;
      if nullif(btrim(v_item->>'nombre'), '') is null then
        raise exception 'Cada firma debe indicar el nombre de quien firma.' using errcode = '22023';
      end if;
      insert into public.acta_rental_firmas (acta_id, empresa_id, rol, nombre, documento, storage_path, sha256, geo)
      values (v_acta.id, p_empresa_id, v_item->>'rol', btrim(v_item->>'nombre'), nullif(btrim(v_item->>'documento'), ''),
              v_item->>'storage_path', nullif(v_item->>'sha256', ''), case when jsonb_typeof(v_item->'geo') = 'object' then v_item->'geo' end)
      on conflict (acta_id, rol) do update set nombre = excluded.nombre, documento = excluded.documento,
        storage_path = excluded.storage_path, sha256 = excluded.sha256, geo = excluded.geo, firmado_at = now();
    end loop;
  end if;

  if not coalesce(p_confirmar, false) then
    perform public.flota__evento(p_empresa_id, 'acta', v_acta.id::text, 'borrador_guardado', jsonb_build_object('numero', v_acta.numero));
    return jsonb_build_object('acta_id', v_acta.id, 'numero', v_acta.numero, 'estado', v_acta.estado);
  end if;

  -- ===== Confirmación atómica =====
  select a.horometro_actual, a.estado into v_horometro_actual, v_estado_activo
  from public.activos a where a.id = v_acta.activo_id for update;
  v_fecha := v_acta.fecha_movimiento;

  if v_acta.horometro is null then
    raise exception 'Registre el horómetro de %.', case v_acta.tipo when 'despacho' then 'salida' else 'retorno' end using errcode = '22023';
  end if;
  if v_horometro_actual is not null and v_acta.horometro < v_horometro_actual then
    raise exception 'El horómetro (%) no puede ser menor que el último registrado (%).', v_acta.horometro, v_horometro_actual using errcode = '22023';
  end if;
  if jsonb_array_length(v_acta.checklist) = 0 then
    raise exception 'Complete el checklist de condición del equipo.' using errcode = '22023';
  end if;
  select count(*) into v_sin_responder from jsonb_array_elements(v_acta.checklist) c where coalesce(jsonb_typeof(c->'ok'), '') <> 'boolean';
  if v_sin_responder > 0 then
    raise exception 'Faltan % punto(s) del checklist por responder.', v_sin_responder using errcode = '22023';
  end if;
  if not exists (select 1 from public.acta_rental_evidencias e where e.acta_id = v_acta.id and e.tipo = 'foto') then
    raise exception 'Agregue al menos una foto del equipo.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.acta_rental_firmas f where f.acta_id = v_acta.id and f.rol = 'responsable_empresa') then
    raise exception 'Falta la firma del responsable de la empresa.' using errcode = '22023';
  end if;
  if v_acta.guia_remision_id is null and v_acta.guia_no_requerida_motivo is null then
    raise exception 'Enlace la guía de remisión o indique por qué este traslado no la exige.' using errcode = '22023';
  end if;

  if v_acta.tipo = 'despacho' then
    if v_estado_activo in ('dado_baja','en_mantenimiento') then
      raise exception 'El equipo está % y no se puede despachar.', replace(v_estado_activo, '_', ' ') using errcode = '22023';
    end if;
    if not exists (select 1 from public.contratos_alquiler ca where ca.id = v_acta.contrato_alquiler_id and ca.estado = 'vigente'
                   and (v_fecha at time zone 'America/Lima')::date between ca.fecha_inicio and ca.fecha_fin) then
      raise exception 'La fecha del despacho debe caer dentro de la vigencia de un contrato vigente.' using errcode = '22023';
    end if;
    select * into v_salida from public.movimientos_equipo_rental m
    where m.activo_id = v_acta.activo_id and m.tipo = 'salida' and m.abierto and not m.anulado;
    if v_salida.id is not null then
      raise exception 'El equipo ya está despachado (acta %); registre primero su retorno.',
        (select numero from public.actas_rental where id = v_salida.acta_id) using errcode = '23P01';
    end if;
    v_req := public.flota__evaluar_requisitos(p_empresa_id, v_acta.activo_id, (v_fecha at time zone 'America/Lima')::date);
    if (v_req->>'bloqueado')::boolean then
      raise exception 'Despacho bloqueado por certificaciones obligatorias: %.',
        (select string_agg((r->>'tipo') || ' (' || replace(r->>'estado', '_', ' ') || ')', ', ')
         from jsonb_array_elements(v_req->'requisitos') r where (r->>'bloquea')::boolean) using errcode = '22023';
    end if;
    begin
      insert into public.movimientos_equipo_rental (empresa_id, sociedad_id, activo_id, contrato_alquiler_id, contrato_equipo_id, acta_id, tipo, fecha, horometro, abierto)
      values (p_empresa_id, v_acta.sociedad_id, v_acta.activo_id, v_acta.contrato_alquiler_id, v_acta.contrato_equipo_id, v_acta.id, 'salida', v_fecha, v_acta.horometro, true)
      returning id into v_mov;
    exception when unique_violation then
      raise exception 'El equipo ya fue despachado por otro usuario hace un momento.' using errcode = '23P01';
    end;
  else
    select * into v_salida from public.movimientos_equipo_rental m
    where m.activo_id = v_acta.activo_id and m.tipo = 'salida' and m.abierto and not m.anulado
    for update;
    if v_salida.id is null then
      raise exception 'El equipo no tiene un despacho abierto; no hay nada que recibir.' using errcode = '22023';
    end if;
    if v_salida.contrato_equipo_id <> v_acta.contrato_equipo_id then
      raise exception 'El equipo salió con otro contrato (acta %); registre el retorno contra ese contrato.',
        (select numero from public.actas_rental where id = v_salida.acta_id) using errcode = '22023';
    end if;
    if v_fecha < v_salida.fecha then
      raise exception 'La fecha de retorno no puede ser anterior a la de salida.' using errcode = '22023';
    end if;
    v_req := public.flota__evaluar_requisitos(p_empresa_id, v_acta.activo_id, (v_fecha at time zone 'America/Lima')::date);
    update public.movimientos_equipo_rental set abierto = false where id = v_salida.id;
    insert into public.movimientos_equipo_rental (empresa_id, sociedad_id, activo_id, contrato_alquiler_id, contrato_equipo_id, acta_id, tipo, fecha, horometro, salida_id)
    values (p_empresa_id, v_acta.sociedad_id, v_acta.activo_id, v_acta.contrato_alquiler_id, v_acta.contrato_equipo_id, v_acta.id, 'retorno', v_fecha, v_acta.horometro, v_salida.id)
    returning id into v_mov;
  end if;

  update public.activos set horometro_actual = v_acta.horometro, updated_at = now() where id = v_acta.activo_id;
  insert into public.historial_lecturas_activo (empresa_id, activo_id, fecha_lectura, valor, unidad, origen, origen_id, registrado_por)
  values (p_empresa_id, v_acta.activo_id, (v_fecha at time zone 'America/Lima')::date, v_acta.horometro, 'horas', 'manual', v_acta.id::text, auth.uid());

  update public.actas_rental set estado = 'confirmada', requisitos_snapshot = v_req, confirmada_at = now(), confirmada_por = auth.uid(), updated_at = now()
  where id = v_acta.id;
  perform public.flota__evento(p_empresa_id, 'acta', v_acta.id::text, 'confirmada',
                               jsonb_build_object('numero', v_acta.numero, 'tipo', v_acta.tipo, 'movimiento_id', v_mov, 'horometro', v_acta.horometro));
  return jsonb_build_object('acta_id', v_acta.id, 'numero', v_acta.numero, 'estado', 'confirmada', 'movimiento_id', v_mov);
end;
$$;

create or replace function public.flota_anular_acta(p_acta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_acta public.actas_rental;
  v_mov public.movimientos_equipo_rental;
  v_ultimo uuid;
begin
  select * into v_acta from public.actas_rental where id = p_acta_id for update;
  if v_acta.id is null then raise exception 'El acta no existe.' using errcode = '22023'; end if;
  perform public.flota__exigir(v_acta.empresa_id, 'actas_despachos', 'anular', 'No tiene permiso para anular actas.');
  if not public.flota_sociedad_en_alcance(v_acta.empresa_id, v_acta.sociedad_id) then
    raise exception 'No tiene alcance sobre la sociedad del acta.' using errcode = '42501';
  end if;
  if v_acta.estado = 'anulada' then raise exception 'El acta ya está anulada.' using errcode = '22023'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'El motivo de anulación es obligatorio.' using errcode = '22023'; end if;

  if v_acta.estado = 'confirmada' then
    perform 1 from public.activos where id = v_acta.activo_id for update;
    select * into v_mov from public.movimientos_equipo_rental where acta_id = v_acta.id for update;
    select m.id into v_ultimo from public.movimientos_equipo_rental m
    where m.activo_id = v_acta.activo_id and not m.anulado order by m.fecha desc, m.created_at desc limit 1;
    if v_ultimo is distinct from v_mov.id then
      raise exception 'Solo se puede anular el último movimiento confirmado del equipo.' using errcode = '22023';
    end if;
    update public.movimientos_equipo_rental set anulado = true, abierto = false where id = v_mov.id;
    if v_mov.tipo = 'retorno' then
      update public.movimientos_equipo_rental set abierto = true where id = v_mov.salida_id;
    end if;
  end if;

  update public.actas_rental set estado = 'anulada', anulado_motivo = btrim(p_motivo), anulada_at = now(), anulada_por = auth.uid(), updated_at = now()
  where id = v_acta.id;
  perform public.flota__evento(v_acta.empresa_id, 'acta', v_acta.id::text, 'anulada',
                               jsonb_build_object('numero', v_acta.numero, 'estado_previo', v_acta.estado, 'motivo', btrim(p_motivo),
                                                  'nota', case when v_acta.estado = 'confirmada' then 'El horómetro registrado se conserva en el historial de lecturas.' end));
  return jsonb_build_object('acta_id', v_acta.id, 'estado', 'anulada');
end;
$$;

-- =====================================================================
-- 12. Alertas de vencimiento (certificaciones y garantías)
-- =====================================================================
create or replace function public.flota_alertas_vencimiento(p_empresa_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_certs jsonb := '[]'::jsonb;
  v_gars jsonb := '[]'::jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;
  if public.usuario_puede(p_empresa_id, 'certificaciones_activo', 'ver') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'activo_id', c.activo_id, 'activo_codigo', a.codigo, 'tipo', t.nombre, 'numero', c.numero,
             'fecha_vencimiento', c.fecha_vencimiento, 'obligatoria', c.obligatoria,
             'estado', case when c.fecha_vencimiento < current_date then 'vencida' else 'por_vencer' end,
             'dias', c.fecha_vencimiento - current_date) order by c.fecha_vencimiento), '[]'::jsonb)
      into v_certs
    from public.activo_certificaciones c
    join public.flota_certificacion_tipos t on t.id = c.tipo_id
    join public.activos a on a.id = c.activo_id
    where c.empresa_id = p_empresa_id and c.estado = 'activa' and a.estado is distinct from 'dado_baja'
      and c.fecha_vencimiento is not null and c.fecha_vencimiento <= current_date + t.dias_alerta;
  end if;
  if public.usuario_puede(p_empresa_id, 'garantias_flota', 'ver') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', g.id, 'tipo', t.nombre, 'numero', g.numero, 'activo_id', g.activo_id, 'contrato_alquiler_id', g.contrato_alquiler_id,
             'fecha_fin', g.fecha_fin, 'estado', case when g.fecha_fin < current_date then 'vencida' else 'por_vencer' end,
             'dias', g.fecha_fin - current_date) order by g.fecha_fin), '[]'::jsonb)
      into v_gars
    from public.garantias_flota g
    join public.flota_garantia_tipos t on t.id = g.tipo_id
    where g.empresa_id = p_empresa_id and g.estado = 'vigente'
      and g.fecha_fin <= current_date + t.dias_alerta
      and (g.sociedad_id is null or public.flota_sociedad_en_alcance(p_empresa_id, g.sociedad_id));
  end if;
  return jsonb_build_object('certificaciones', v_certs, 'garantias', v_gars);
end;
$$;

-- =====================================================================
-- 13. Storage privado para evidencias, firmas y documentos de flota
--     Ruta: {empresa_id}/{actas|certificaciones|garantias}/...
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flota-rental', 'flota-rental', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create or replace function public.flota__pantalla_storage(p_name text)
returns text
language sql
immutable
as $$
  select case split_part(p_name, '/', 2)
    when 'actas' then 'actas_despachos'
    when 'certificaciones' then 'certificaciones_activo'
    when 'garantias' then 'garantias_flota'
  end;
$$;

-- Un archivo ya registrado en un acta confirmada o en un documento vigente no se puede borrar.
create or replace function public.flota__objeto_registrado(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.acta_rental_evidencias e join public.actas_rental a on a.id = e.acta_id where e.storage_path = p_name and a.estado <> 'borrador')
      or exists (select 1 from public.acta_rental_firmas f join public.actas_rental a on a.id = f.acta_id where f.storage_path = p_name and a.estado <> 'borrador')
      or exists (select 1 from public.activo_certificaciones c where c.storage_path = p_name)
      or exists (select 1 from public.garantias_flota g where g.storage_path = p_name);
$$;

drop policy if exists storage_flota_rental_select on storage.objects;
create policy storage_flota_rental_select on storage.objects for select to authenticated
  using (bucket_id = 'flota-rental'
         and public.usuario_tiene_empresa(split_part(name, '/', 1))
         and public.flota__pantalla_storage(name) is not null
         and public.usuario_puede(split_part(name, '/', 1), public.flota__pantalla_storage(name), 'ver'));

drop policy if exists storage_flota_rental_insert on storage.objects;
create policy storage_flota_rental_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'flota-rental'
              and public.usuario_tiene_empresa(split_part(name, '/', 1))
              and public.flota__pantalla_storage(name) is not null
              and (public.usuario_puede(split_part(name, '/', 1), public.flota__pantalla_storage(name), 'crear')
                   or public.usuario_puede(split_part(name, '/', 1), public.flota__pantalla_storage(name), 'editar')));

drop policy if exists storage_flota_rental_delete on storage.objects;
create policy storage_flota_rental_delete on storage.objects for delete to authenticated
  using (bucket_id = 'flota-rental'
         and public.usuario_tiene_empresa(split_part(name, '/', 1))
         and public.flota__pantalla_storage(name) is not null
         and (public.usuario_puede(split_part(name, '/', 1), public.flota__pantalla_storage(name), 'crear')
              or public.usuario_puede(split_part(name, '/', 1), public.flota__pantalla_storage(name), 'editar'))
         and not public.flota__objeto_registrado(name));

-- =====================================================================
-- 14. Permisos de ejecución
-- =====================================================================
revoke all on function public.flota__evento(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.flota__exigir(text, text, text, text) from public, anon, authenticated;
revoke all on function public.flota__evaluar_requisitos(text, text, date) from public, anon, authenticated;
revoke all on function public.flota__ruta_valida(text, text, text) from public, anon;
revoke all on function public.flota__pantalla_storage(text) from public, anon;
revoke all on function public.flota__objeto_registrado(text) from public, anon;
grant execute on function public.flota__ruta_valida(text, text, text) to authenticated;
grant execute on function public.flota__pantalla_storage(text) to authenticated;
grant execute on function public.flota__objeto_registrado(text) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.flota_guardar_certificacion_tipo(text, jsonb)',
    'public.flota_guardar_garantia_tipo(text, jsonb)',
    'public.flota_guardar_checklist_item(text, jsonb)',
    'public.flota_cargar_catalogo_sugerido(text, text)',
    'public.flota_registrar_certificacion(text, jsonb)',
    'public.flota_actualizar_certificacion(uuid, jsonb)',
    'public.flota_anular_certificacion(uuid, text)',
    'public.flota_requisitos_despacho(text, text, date)',
    'public.flota_estado_equipos(text)',
    'public.flota_guardar_garantia(text, jsonb)',
    'public.flota_cambiar_estado_garantia(uuid, text, text)',
    'public.flota_registrar_reclamo(uuid, jsonb)',
    'public.flota_actualizar_reclamo(uuid, text, text)',
    'public.flota_guardar_acta(text, jsonb, boolean)',
    'public.flota_anular_acta(uuid, text)',
    'public.flota_alertas_vencimiento(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- =====================================================================
-- 15. Permisos de pantalla
--     a) Roles que hoy editan contratos: ver, crear y editar en las 3 pantallas nuevas.
--     b) Resto de roles no administradores de empresa: solo lectura (las pantallas legacy no tenían compuerta).
-- =====================================================================
insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select pr.rol_id, s.pantalla, true, true, true, false, false, false, false, false, '{}'::jsonb
from public.permisos_roles pr
cross join (values ('actas_despachos'), ('certificaciones_activo'), ('garantias_flota')) as s(pantalla)
where pr.pantalla = 'contratos_alquiler' and pr.puede_ver and pr.puede_editar
  and not exists (select 1 from public.permisos_roles x where x.rol_id = pr.rol_id and x.pantalla = s.pantalla);

insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select r.id, s.pantalla, true, false, false, false, false, false, false, false, '{}'::jsonb
from public.roles r
cross join (values ('actas_despachos'), ('certificaciones_activo'), ('garantias_flota')) as s(pantalla)
where r.empresa_id is not null and r.es_superadmin is not true and r.es_admin_empresa is not true
  and not exists (select 1 from public.permisos_roles x where x.rol_id = r.id and x.pantalla = s.pantalla);

-- =====================================================================
-- 16. Comprobación: si algo no quedó como se espera, la migración se revierte sola
-- =====================================================================
do $$
declare
  v_tablas text[] := array['flota_certificacion_tipos','flota_garantia_tipos','flota_checklist_items','activo_certificaciones',
                           'garantias_flota','garantia_reclamos','actas_rental','acta_rental_evidencias','acta_rental_firmas',
                           'movimientos_equipo_rental','flota_eventos'];
  t text;
  v_faltan integer;
  v_editores integer;
  v_sembrados integer;
begin
  foreach t in array v_tablas loop
    if to_regclass('public.' || t) is null then
      raise exception 'Falta la tabla %.', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS no está activa en %.', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'La tabla % tiene políticas de escritura; las escrituras deben ir por RPC.', t;
    end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'flota\_%' and proname not like 'flota\_\_%'
      and proname in ('flota_guardar_certificacion_tipo','flota_guardar_garantia_tipo','flota_guardar_checklist_item','flota_cargar_catalogo_sugerido',
                      'flota_registrar_certificacion','flota_actualizar_certificacion','flota_anular_certificacion','flota_requisitos_despacho',
                      'flota_estado_equipos','flota_guardar_garantia','flota_cambiar_estado_garantia','flota_registrar_reclamo',
                      'flota_actualizar_reclamo','flota_guardar_acta','flota_anular_acta','flota_alertas_vencimiento')) <> 16 then
    raise exception 'Faltan funciones RPC de PR B.';
  end if;
  if has_function_privilege('authenticated', 'public.flota__evaluar_requisitos(text, text, date)', 'execute')
     or has_function_privilege('anon', 'public.flota_guardar_acta(text, jsonb, boolean)', 'execute') then
    raise exception 'Privilegios de ejecución demasiado amplios.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'flota-rental' and public = false) then
    raise exception 'Falta el bucket privado flota-rental.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'storage_flota_rental_%') <> 3 then
    raise exception 'Faltan políticas de storage de flota-rental.';
  end if;

  select count(*) into v_faltan
  from public.roles r
  cross join (values ('actas_despachos'), ('certificaciones_activo'), ('garantias_flota')) as s(pantalla)
  where r.empresa_id is not null and r.es_superadmin is not true and r.es_admin_empresa is not true
    and not exists (select 1 from public.permisos_roles x where x.rol_id = r.id and x.pantalla = s.pantalla and x.puede_ver);
  if v_faltan <> 0 then
    raise exception 'Quedan % combinaciones rol × pantalla sin lectura.', v_faltan;
  end if;
  select count(distinct rol_id) into v_editores from public.permisos_roles where pantalla = 'contratos_alquiler' and puede_ver and puede_editar;
  select count(*) into v_sembrados from public.permisos_roles pr
  where pr.pantalla = 'actas_despachos' and pr.puede_crear
    and exists (select 1 from public.permisos_roles c where c.rol_id = pr.rol_id and c.pantalla = 'contratos_alquiler' and c.puede_ver and c.puede_editar);
  if v_sembrados <> v_editores then
    raise exception 'Permisos de edición sembrados incorrectos: editores=%, sembrados=%.', v_editores, v_sembrados;
  end if;
end;
$$;
