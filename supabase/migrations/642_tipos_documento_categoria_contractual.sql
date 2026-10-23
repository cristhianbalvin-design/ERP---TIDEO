-- 642: Normaliza la categoría 'Contractual' de los tipos de documento de contrato y adenda en todas las empresas.
-- Caso: tipos creados después de la migración 280 quedaron en 'Otros' (el formulario no tenía campo de categoría).
-- Alcance acotado: solo tipos cuyo nombre contiene 'contrat' o 'adenda' y que hoy no son 'Contractual'
-- (al 2026-10-21: 3 de WHYNCO y 1 de TIDEO TECH). No cambia ningún otro campo.

begin;

do $$
declare
  v_previstos int;
  v_actualizados int;
begin
  select count(*) into v_previstos
  from public.tipos_documento_empresa
  where coalesce(categoria, '') <> 'Contractual'
    and (nombre ilike '%contrat%' or nombre ilike '%adenda%');

  if v_previstos > 10 then
    raise exception '642: se esperaban a lo sumo 10 tipos a normalizar y hay %', v_previstos;
  end if;

  update public.tipos_documento_empresa
     set categoria = 'Contractual', updated_at = now()
   where coalesce(categoria, '') <> 'Contractual'
     and (nombre ilike '%contrat%' or nombre ilike '%adenda%');
  get diagnostics v_actualizados = row_count;

  if v_actualizados <> v_previstos then
    raise exception '642: se actualizaron % tipos y se esperaban %', v_actualizados, v_previstos;
  end if;

  if exists (
    select 1 from public.tipos_documento_empresa
    where coalesce(categoria, '') <> 'Contractual'
      and (nombre ilike '%contrat%' or nombre ilike '%adenda%')
  ) then
    raise exception '642: quedaron tipos de contrato o adenda fuera de la categoría Contractual';
  end if;

  raise notice '642: % tipos normalizados a Contractual', v_actualizados;
end $$;

commit;
