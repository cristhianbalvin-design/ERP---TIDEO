-- Frontera RLS por sociedad para RR.HH. sensible.
-- Replica el predicado de 404_frontera_rls_sociedad.sql. No reasigna datos.
-- Los accesos de autoservicio por es_mi_personal_rrhh permanecen intactos.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

lock table
  public.amonestaciones_personal,
  public.portal_constancias_trabajo,
  public.solicitudes_rrhh
in share row exclusive mode;

do $preflight$
declare
  v_tabla text;
  v_esperadas integer;
  v_encontradas integer;
begin
  for v_tabla, v_esperadas in
    select tabla, esperadas
    from (values
      ('amonestaciones_personal', 2),
      ('portal_constancias_trabajo', 3),
      ('solicitudes_rrhh', 5)
    ) as esperadas_politicas(tabla, esperadas)
  loop
    select count(*)
      into v_encontradas
      from pg_policy p
      where p.polrelid = format('public.%I', v_tabla)::regclass;

    if v_encontradas <> v_esperadas then
      raise exception
        'B4_RRHH_PREFLIGHT: public.% debe tener % politicas y tiene %.',
        v_tabla, v_esperadas, v_encontradas;
    end if;
  end loop;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'amonestaciones_personal',
        'portal_constancias_trabajo',
        'solicitudes_rrhh'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'B4_RRHH_PREFLIGHT: RLS debe estar habilitado en las tres tablas.';
  end if;
end
$preflight$;

-- Mismo predicado de frontera usado por 404: NULL en el alcance representa
-- acceso global del tenant; un array concreto exige coincidencia societaria.
alter policy amonestaciones_personal_isolation
on public.amonestaciones_personal
using (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

-- Estas politicas combinan autoservicio y administracion. Se conserva sin
-- cambios la rama es_mi_personal_rrhh; solo se acota la rama administrativa.
alter policy portal_constancias_select
on public.portal_constancias_trabajo
using (
  es_mi_personal_rrhh(empresa_id, personal_id)
  or (
    usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from (
        select public.usuario_alcance_sociedades(empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
         or sociedad_id = any(alcance_usuario.alcance)
    )
  )
);

alter policy portal_constancias_insert
on public.portal_constancias_trabajo
with check (
  es_mi_personal_rrhh(empresa_id, personal_id)
  or (
    usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from (
        select public.usuario_alcance_sociedades(empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
         or sociedad_id = any(alcance_usuario.alcance)
    )
  )
);

alter policy portal_constancias_update
on public.portal_constancias_trabajo
using (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

alter policy sol_rrhh_insert
on public.solicitudes_rrhh
with check (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

alter policy sol_rrhh_select
on public.solicitudes_rrhh
using (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

alter policy sol_rrhh_update
on public.solicitudes_rrhh
using (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

-- sol_rrhh_delete permanece en false: no concede lectura ni escritura.

do $verificar$
declare
  v_total integer;
begin
  select count(*)
    into v_total
    from pg_policy p
    where p.polrelid in (
      'public.amonestaciones_personal'::regclass,
      'public.portal_constancias_trabajo'::regclass,
      'public.solicitudes_rrhh'::regclass
    )
    and p.polname not in (
      'amonestaciones_personal_self_select',
      'solicitudes_rrhh_self_select',
      -- No concede ningun acceso: se mantiene en false deliberadamente.
      'sol_rrhh_delete'
    )
    and (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%usuario_alcance_sociedades%'
      and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%usuario_alcance_sociedades%'
    );

  if v_total <> 0 then
    raise exception 'B4_RRHH_VERIFICACION: quedaron % politicas administrativas sin frontera societaria.', v_total;
  end if;
end
$verificar$;

commit;
