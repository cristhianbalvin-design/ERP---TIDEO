# Manual de pantallas de Aria

Las fichas son texto global del producto y no contienen datos de empresas. Cada `.txt` tiene una cabecera `clave`, `tipo`, `pantalla`, `titulo`, `resumen`, `fuentes` y `revision`; después declara `paso` numerados. Un paso usa `permiso=pantalla:acción` o `permiso=ninguno`. En procesos, cada paso indica su pantalla y hereda el permiso `ver` de esa pantalla.

Escribe para quien usa el ERP: frases breves, una o dos oraciones por paso, sin nombres internos de tablas, funciones o códigos. No describas acciones o permisos que el código no confirme. Las claves de pantalla deben coincidir con el catálogo.

`revision` identifica el commit revisado. Si cambia un archivo fuente, revisa la ficha afectada y actualiza esa referencia al commit que contiene la revisión. Ejecuta `node scripts/verificar-manual-pantallas.mjs` antes de cerrar el cambio. Para regenerar la migración ejecuta `node scripts/generar-manual-pantallas.mjs`.

El permiso de acceso de pantalla se exige siempre. Los pasos sin permiso específico solo heredan ese acceso. Pasos sin permiso efectivo disponible se omiten por completo para cada usuario.


La interfaz de Caja Chica usa perm() (src/pages_fin.jsx:7147-7150), que considera er_finanzas habilitación general para acciones locales. La RPC del manual exige el permiso de acción explícito en usuario_puede; por eso sus filtros son más estrictos y pueden ocultar un paso a quien la interfaz sí se lo muestra.
