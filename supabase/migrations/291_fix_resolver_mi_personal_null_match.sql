-- Fix: resolver_mi_personal_rrhh() podia emparejar por error dos "desconocidos".
--
-- Bug encontrado en produccion: el mismo hueco de logica se detecto primero en el
-- cliente movil (getFichaColaboradorMovil en pages_mobile.jsx), donde una sesion
-- de auth aun no resuelta (id null) calzaba contra cualquier ficha sin cuenta
-- vinculada (auth_user_id null), atribuyendo marcaciones de asistencia a la
-- persona equivocada.
--
-- Esta funcion SQL tiene una version mas leve del mismo problema: la comparacion
-- de auth_user_id ya es segura (NULL = NULL evalua a NULL en SQL, nunca TRUE),
-- pero el fallback por email usa coalesce(..., '') en ambos lados:
--   lower(coalesce(p.email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
-- Si una ficha no tiene email cargado Y el JWT no trae claim de email (poco
-- comun pero posible), ambos lados caen a '' y la comparacion da verdadero por
-- error. Se corrige exigiendo que ambos lados tengan un valor real antes de
-- comparar.

create or replace function public.resolver_mi_personal_rrhh()
returns table (
  empresa_id text,
  personal_id text,
  personal_tipo text,
  nombre text,
  documento text,
  email text,
  telefono text,
  email_personal text,
  celular_personal text,
  telefono_personal text,
  cargo text,
  area text,
  sede text,
  fecha_ingreso date,
  regimen_jornada text,
  dias_ciclo_trabajo integer,
  dias_ciclo_descanso integer,
  dias_vacaciones_disponibles numeric
)
language sql
security definer
set search_path = public
as $$
  select p.empresa_id, p.id, 'operativo', p.nombre, p.documento, p.email, p.telefono,
         p.email_personal, p.celular_personal, p.telefono_personal,
         p.cargo, p.area, p.sede, p.fecha_ingreso, p.regimen_jornada,
         p.dias_ciclo_trabajo, p.dias_ciclo_descanso, p.dias_vacaciones_disponibles
    from public.personal_operativo p
   where p.auth_user_id::text = auth.uid()::text
      or (
        p.email is not null and btrim(p.email) <> ''
        and (auth.jwt() ->> 'email') is not null and btrim(auth.jwt() ->> 'email') <> ''
        and lower(p.email) = lower(auth.jwt() ->> 'email')
      )
  union all
  select p.empresa_id, p.id, 'administrativo', p.nombre, coalesce(p.documento, p.dni), p.email, p.telefono,
         p.email_personal, p.celular_personal, p.telefono_personal,
         p.cargo, p.area, p.sede, p.fecha_ingreso, p.regimen_jornada,
         p.dias_ciclo_trabajo, p.dias_ciclo_descanso, p.dias_vacaciones_disponibles
    from public.personal_administrativo p
   where p.auth_user_id::text = auth.uid()::text
      or (
        p.email is not null and btrim(p.email) <> ''
        and (auth.jwt() ->> 'email') is not null and btrim(auth.jwt() ->> 'email') <> ''
        and lower(p.email) = lower(auth.jwt() ->> 'email')
      )
  limit 1;
$$;

comment on function public.resolver_mi_personal_rrhh() is
  'Autoservicio RRHH: resuelve ficha propia. Las fechas de contrato se consultan en personal_documentos. Fix: ya no empareja por error dos valores vacios de email.';
