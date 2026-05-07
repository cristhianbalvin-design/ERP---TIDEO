                                                                                -- TIDEO ERP - CRUD de personal operativo y administrativo desde UI
                                                                                -- 1. Completa columnas usadas por la ficha administrativa.
                                                                                -- 2. Habilita politicas DELETE para que eliminar desde la UI se refleje en BD.

                                                                                alter table public.personal_administrativo
                                                                                  add column if not exists dni text,
                                                                                  add column if not exists fecha_nacimiento date,
                                                                                  add column if not exists direccion text,
                                                                                  add column if not exists supervisor text,
                                                                                  add column if not exists sede text,
                                                                                  add column if not exists turno_id text,
                                                                                  add column if not exists tipo_contrato text,
                                                                                  add column if not exists fecha_inicio_contrato date,
                                                                                  add column if not exists remuneracion numeric(14,2) default 0,
                                                                                  add column if not exists modalidad text,
                                                                                  add column if not exists dias_vacaciones_total numeric(8,2) default 30,
                                                                                  add column if not exists dias_vacaciones_usados numeric(8,2) default 0,
                                                                                  add column if not exists dias_vacaciones_disponibles numeric(8,2) default 0,
                                                                                  add column if not exists contacto_emergencia text,
                                                                                  add column if not exists relacion_emergencia text,
                                                                                  add column if not exists telefono_emergencia text,
                                                                                  add column if not exists nivel_estudios text,
                                                                                  add column if not exists especialidad text,
                                                                                  add column if not exists institucion text,
                                                                                  add column if not exists documentos jsonb default '[]'::jsonb;

                                                                                update public.personal_administrativo
                                                                                set dni = coalesce(dni, documento),
                                                                                    fecha_inicio_contrato = coalesce(fecha_inicio_contrato, fecha_ingreso),
                                                                                    remuneracion = coalesce(remuneracion, sueldo_base, 0),
                                                                                    modalidad = coalesce(modalidad, 'Presencial'),
                                                                                    tipo_contrato = coalesce(tipo_contrato, 'Planilla'),
                                                                                    dias_vacaciones_disponibles = coalesce(dias_vacaciones_disponibles, vacaciones_pendientes, 0),
                                                                                    documentos = coalesce(documentos, '[]'::jsonb);

                                                                                drop policy if exists rrhh_operativo_delete on public.personal_operativo;
                                                                                create policy rrhh_operativo_delete on public.personal_operativo
                                                                                  for delete
                                                                                  using (
                                                                                    public.usuario_puede(empresa_id, 'rrhh_operativo', 'editar')
                                                                                    or public.usuario_puede(empresa_id, 'personal_operativo', 'editar')
                                                                                  );

                                                                                drop policy if exists rrhh_admin_delete on public.personal_administrativo;
                                                                                create policy rrhh_admin_delete on public.personal_administrativo
                                                                                  for delete
                                                                                  using (
                                                                                    public.usuario_puede(empresa_id, 'rrhh_admin', 'editar')
                                                                                  );

                                                                                select pg_notify('pgrst', 'reload schema');
