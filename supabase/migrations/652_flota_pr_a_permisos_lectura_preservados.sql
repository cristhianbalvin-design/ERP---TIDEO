-- Versiona el backfill de permisos ya aplicado en producción.
-- Preserva la lectura que estas pantallas legacy tenían antes de incorporar
-- una compuerta de permisos, sin modificar filas de permisos ya existentes.

insert into public.permisos_roles (
  rol_id,
  pantalla,
  puede_ver,
  puede_crear,
  puede_editar,
  puede_anular,
  puede_aprobar,
  puede_exportar,
  puede_ver_costos,
  puede_ver_finanzas,
  permisos_extra
)
select
  r.id,
  p.pantalla,
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  '{}'::jsonb
from public.roles r
cross join (values
  ('contratos_alquiler'),
  ('flota_panel'),
  ('pasaporte_equipos')
) as p(pantalla)
where r.empresa_id is not null
  and r.es_superadmin is not true
  and r.es_admin_empresa is not true
  and not exists (
    select 1
    from public.permisos_roles pr
    where pr.rol_id = r.id
      and pr.pantalla = p.pantalla
  );

do $$
begin
  if exists (
    select 1
    from public.roles r
    cross join (values
      ('contratos_alquiler'),
      ('flota_panel'),
      ('pasaporte_equipos')
    ) as p(pantalla)
    where r.empresa_id is not null
      and r.es_superadmin is not true
      and r.es_admin_empresa is not true
      and not exists (
        select 1
        from public.permisos_roles pr
        where pr.rol_id = r.id
          and pr.pantalla = p.pantalla
      )
  ) then
    raise exception 'Faltan permisos de lectura preservados para una o más combinaciones elegibles de rol y pantalla';
  end if;
end;
$$;
