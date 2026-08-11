BLOQUE SEG-2b — ENDURECER POSTULACIÓN PÚBLICA

CONTEXTO
registrar_postulacion_publica es una de las cinco RPC legítimamente públicas,
pero tiene dos defectos explotables:

1. NO VALIDA public_token. El frontend resuelve la vacante por token antes de
   mostrar el formulario, pero la RPC recibe empresa_id y vacante_id y confía en
   ellos. Quien conozca ambos puede postular sin token, saltándose el enlace.

2. SOBRESCRIBE el perfil de candidatos existentes. Ante un DNI ya registrado
   ejecuta un UPDATE de nombre, telefono, email, cv_url y cv_path. Un tercero
   puede alterar los datos de contacto y el CV de cualquier candidato del que
   conozca el DNI.

3. HALLAZGO ADICIONAL — subida de CV sin validación. Existe una política de
   Storage que permite a anon escribir en documentos-privados bajo
   '%/reclutamiento/%':
     WITH CHECK (bucket_id = 'documentos-privados'
                 AND name LIKE '%/reclutamiento/%')
   La carga ocurre ANTES de llamar a la RPC, así que validar el token dentro de
   la función no protege la subida. Cualquiera puede llenar el bucket privado
   con archivos arbitrarios, sin postular siquiera.

FASE 1 — DIAGNÓSTICO (solo lectura, reportar y detenerse)

1. Confirmar la definición literal actual de registrar_postulacion_publica y de
   la política de Storage citada.

2. Reportar cómo el frontend construye la ruta del archivo al subir el CV: si
   incluye empresa_id, vacante_id o algún identificador derivable del token.

3. Reportar cuántos objetos existen hoy en ese bucket bajo la ruta de
   reclutamiento, y si hay huérfanos: archivos sin candidatura asociada.

4. Evaluar las opciones para la subida del CV y reportar la recomendación:
     a) Edge Function que valide el token y devuelva una URL firmada de subida
     b) Restringir la política de Storage con una condición sobre la ruta que
        incluya el token, si es verificable desde la política
     c) Permitir la subida pero limpiar huérfanos periódicamente
   Considerar cuál es implementable sin romper el flujo actual del postulante.

5. Confirmar si la candidatura es idempotente hoy: qué ocurre si el mismo
   candidato postula dos veces a la misma vacante.

FASE 2 — IMPLEMENTACIÓN (solo tras aprobación)

  A. La RPC recibe p_public_token y resuelve la vacante EXCLUSIVAMENTE por él.
     empresa_id y vacante_id se derivan de esa fila; no se confía en los
     suministrados por el llamador. La vacante debe estar abierta.

  B. Ante un DNI existente, reutilizar el candidato pero NO sobrescribir su
     perfil ni su CV desde la ruta pública. Los datos nuevos pueden guardarse
     asociados a la candidatura, no al candidato maestro.

  C. Candidatura idempotente por (vacante_id, candidato_id): postular dos veces
     no debe duplicar ni sobrescribir el historial.

  D. Subida del CV, según lo decidido en la Fase 1.

  E. El frontend transmite el token, que ya tiene resuelto.

RESTRICCIONES
- La