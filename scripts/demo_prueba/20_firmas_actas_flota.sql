-- Demo PRUEBA · 20 Firmas en las actas de despacho/retorno (2026-11-09)
-- Las imágenes se subieron desde la sesión de Cristhian con el asistente de actas (carpeta 599fcd4e-…), sin guardar el acta.
-- Responsable de la empresa: Martín Huamán Rojas (ficticio). Firmantes del cliente ficticios, uno por cliente.
do $$
declare
  v_emp constant text := 'emp_2000000000';
  v_usr constant uuid := 'ae6bc722-85c7-4816-a830-c350d2a3d0b5';
  v_dir constant text := 'emp_2000000000/actas/599fcd4e-5dd6-4750-b24f-df75ec0827cd/';
  n int;
begin
  insert into acta_rental_firmas (id, acta_id, empresa_id, rol, nombre, documento, storage_path, sha256, geo, firmado_at, created_by)
  select gen_random_uuid(), a.id, v_emp, f.rol, f.nombre, f.documento, v_dir || f.archivo, null, null, a.confirmada_at - interval '20 minutes', v_usr
  from actas_rental a
  join contratos_alquiler c on c.id = a.contrato_alquiler_id
  join (values
    (null::text, 'responsable_empresa', 'Martín Huamán Rojas', '45871236', 'foto-f7efd596-7719-418e-8455-4732ef90a50c.jpg'),
    ('cta_demo_02', 'cliente', 'Raúl Quispe Torres', '41236598', 'foto-0f1cf33b-9878-49c4-b261-942d756fe71f.jpg'),
    ('cta_demo_13', 'cliente', 'Carmen Villanueva Soto', '43651287', 'foto-d6148d2a-06a0-4a50-b204-82d2032ce957.jpg'),
    ('cta_demo_04', 'cliente', 'Óscar Medina Paredes', '40987123', 'foto-eebde8c5-5f59-4947-8d6d-c9f514a7d4e6.jpg'),
    ('cta_demo_01', 'cliente', 'Javier Ríos Calderón', '42519874', 'foto-66e89b29-3b44-462b-b058-1151bf416c9a.jpg')
  ) f(cuenta_id, rol, nombre, documento, archivo) on f.cuenta_id is null or f.cuenta_id = c.cuenta_id
  where a.empresa_id = v_emp and a.estado = 'confirmada'
  on conflict (acta_id, rol) do nothing;
  get diagnostics n = row_count;
  if n <> 18 then raise exception 'se esperaban 18 firmas (9 actas × 2) y se crearon %', n; end if;
  if exists (select 1 from acta_rental_firmas f where f.empresa_id = v_emp
             and not exists (select 1 from storage.objects o where o.bucket_id = 'flota-rental' and o.name = f.storage_path)) then
    raise exception 'hay firmas que apuntan a archivos inexistentes';
  end if;
end $$;
