-- Demo PRUEBA · 09 Ajustes finales de textos (ejecutado el 2026-11-08)
do $$ begin set local session_replication_role = replica;
update valorizaciones set motivo_anulacion='Error en horas reportadas; se reemplaza por nueva valorización' where empresa_id='emp_2000000000' and motivo_anulacion ~* 'prueba';
update ot_segmento_repuestos_acciones set observacion='Se libera reserva por cambio de alcance' where empresa_id='emp_2000000000' and observacion ~* 'prueba';
update wms_demandas set destino='Retiro de Minera Huaytapallana' where empresa_id='emp_2000000000' and destino ~* 'prueba';
update wms_demandas set observacion='Retiro parcial de repuestos' where empresa_id='emp_2000000000' and observacion ~* 'prueba';
update diagnostico_tecnico_estado_historial set motivo='Se agregan fotos del hallazgo al informe' where empresa_id='emp_2000000000' and motivo ~* 'prueba';
update guias_remision set llegada_direccion='Campamento km 4, Cerro de Pasco', destinatario_razon_social='Minera Huaytapallana' where empresa_id='emp_2000000000';
update ruta_paradas set descripcion_libre='Entrega en campamento' where empresa_id='emp_2000000000' and descripcion_libre ~* 'prueba';
update centros_costo set descripcion='Pruebas de carga, aislamiento y continuidad.' where empresa_id='emp_2000000000' and descripcion ~* '^Prueba de carga';
end $$;
