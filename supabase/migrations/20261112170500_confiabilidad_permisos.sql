-- Los editores de backlog reciben crear y editar en PM y SOS.
-- El resto de roles no administradores recibe lectura, como en la migración 654.
insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select pr.rol_id, p.pantalla, true, true, true, false, false, false, false, false, '{}'::jsonb
from public.permisos_roles pr
cross join (values ('programacion_pm'), ('analisis_sos')) p(pantalla)
where pr.pantalla = 'backlog' and pr.puede_ver and pr.puede_editar
  and not exists (select 1 from public.permisos_roles x where x.rol_id = pr.rol_id and x.pantalla = p.pantalla);

insert into public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select r.id, p.pantalla, true, false, false, false, false, false, false, false, '{}'::jsonb
from public.roles r
cross join (values ('confiabilidad_kpis'), ('disponibilidad_mecanica'), ('programacion_pm'), ('analisis_sos')) p(pantalla)
where r.empresa_id is not null and r.es_superadmin is not true and r.es_admin_empresa is not true
  and not exists (select 1 from public.permisos_roles x where x.rol_id = r.id and x.pantalla = p.pantalla);

-- Igual que 651: preservar la capacidad de creación para quienes ya editan.
update public.permisos_roles set puede_crear = true, updated_at = now()
where pantalla = 'backlog' and puede_editar and not puede_crear;

do $$
begin
  if exists (
    select 1 from public.roles r
    cross join (values ('confiabilidad_kpis'), ('disponibilidad_mecanica'), ('programacion_pm'), ('analisis_sos')) p(pantalla)
    where r.empresa_id is not null and r.es_superadmin is not true and r.es_admin_empresa is not true
      and not exists (select 1 from public.permisos_roles x where x.rol_id = r.id and x.pantalla = p.pantalla and x.puede_ver)
  ) then
    raise exception 'Faltan permisos de lectura de confiabilidad.';
  end if;
end $$;
