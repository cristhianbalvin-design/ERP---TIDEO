-- Demo PRUEBA · 10 Geocercas, cobranza vencida de Pacífico Sur y fotos (ejecutado el 2026-11-08)
do $$ begin set local session_replication_role = replica;
-- Las asignaciones demo dejan de usar la geocerca "Geocerca prueba ZAHORY" (geo_7fe550669d92), que no se toca
update rrhh_geocerca_asignaciones set geocerca_id='geo_04510126dd94' where empresa_id='emp_2000000000' and geocerca_id='geo_7fe550669d92';
update rrhh_geocercas set nombre='Campamento Cerro de Pasco' where id='geo_f1c79fdcc097' and empresa_id='emp_2000000000';
update rrhh_geocercas set nombre='Base operativa Huánuco' where id='geo_e4e711718715' and empresa_id='emp_2000000000';
-- Constructora Pacífico Sur: su deuda queda vencida
update facturas set fecha_emision=fecha_emision-40, fecha_vencimiento=fecha_vencimiento-40, created_at=created_at-interval '40 days' where empresa_id='emp_2000000000' and cuenta_id='cta_demo_03';
update cxc set fecha_emision=fecha_emision-40, fecha_vencimiento=fecha_vencimiento-40, estado=case when saldo>0 and fecha_vencimiento-40 < date '2026-11-08' then 'vencida' else estado end, created_at=created_at-interval '40 days' where empresa_id='emp_2000000000' and cuenta_id='cta_demo_03';
-- Fotos de hallazgos y evidencias de cierre: reutilizan las imágenes ya guardadas de PRUEBA en el almacenamiento
insert into diagnostico_tecnico_hallazgo_fotos(id,empresa_id,hallazgo_id,ruta_storage,nombre_original,mime_type,tamano_bytes,ancho,alto,leyenda,orden,excluir_del_informe,created_by,created_at,updated_at)
select gen_random_uuid(),'emp_2000000000',h.id,f.ruta_storage,'foto_hallazgo_'||f.rn||'.jpg',f.mime_type,f.tamano_bytes,f.ancho,f.alto,
  (array['Desgaste visible en el componente','Detalle de la zona afectada','Vista general antes de la intervención','Medición en campo'])[1+f.rn%4],1,false,null,h.created_at,h.created_at
from (select x.*, row_number() over (order by x.created_at) rn from respaldo_prueba_20261108.diagnostico_tecnico_hallazgo_fotos x
      where exists (select 1 from storage.objects o where o.bucket_id='diagnostico-fotos' and o.name=x.ruta_storage)) f
join (select h.*, row_number() over (order by h.created_at, h.id) rn from diagnostico_tecnico_hallazgos h where empresa_id='emp_2000000000') h on h.rn=f.rn;
insert into cierre_tecnico_evidencias(id,empresa_id,sociedad_id,cierre_id,orden_trabajo_id,tipo,path,sha256,mime,tamano_bytes,tomada_en,orden,created_at)
select gen_random_uuid(),'emp_2000000000','609a2f33-d057-411f-a001-4e3e83f700d0',c.id,c.orden_trabajo_id,e.tipo,e.path,e.sha256,e.mime,e.tamano_bytes,c.created_at,e.orden,c.created_at
from (select x.*, row_number() over (order by x.created_at) rn from respaldo_prueba_20261108.cierre_tecnico_evidencias x) e
join (select c.*, row_number() over (order by c.created_at, c.id) rn from cierres_tecnicos c where empresa_id='emp_2000000000') c on c.rn = 1 + (e.rn-1)/2;
end $$;
