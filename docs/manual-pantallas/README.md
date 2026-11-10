# Manual de pantallas de Aria

Las fichas son texto global del producto y no contienen datos de empresas. Cada `.txt` tiene una cabecera `clave`, `tipo`, `pantalla` (clave de permiso de `src/data.js`), `catalogo` (entrada de `catalogo/pantallas.json`; obligatoria en fichas de pantalla), `titulo`, `resumen`, `componentes` (`archivo#Componente`, separados por comas) y `huella` (un hash por componente). Opcionales: `pantalla_recorrido`, `captura` y `ejemplo` (estos dos se reservan para el manual de clientes). Después declara `paso` numerados. Un paso usa `permiso=pantalla:acción` o `permiso=ninguno`. En procesos, cada paso indica su pantalla y hereda el permiso `ver` de esa pantalla.

Escribe para quien usa el ERP: frases breves, una o dos oraciones por paso, sin nombres internos de tablas, funciones o códigos. No describas acciones o permisos que el código no confirme. Las claves de pantalla deben coincidir con el catálogo.

La `huella` identifica el código revisado de cada componente: el componente y las declaraciones del mismo archivo que usa, no el archivo completo. Si cambia ese código, `node scripts/verificar-manual-pantallas.mjs` marca la ficha como desactualizada e indica qué componente cambió. Revisa la ficha y ejecuta `node scripts/generar-manual-pantallas.mjs --actualizar-huellas`, que también regenera `_sincronizar.sql` (la carga idempotente de las fichas en Supabase).

El permiso de acceso de pantalla se exige siempre. Los pasos sin permiso específico solo heredan ese acceso. Pasos sin permiso efectivo disponible se omiten por completo para cada usuario.


La interfaz de Caja Chica usa perm() (src/pages_fin.jsx:7147-7150), que considera er_finanzas habilitación general para acciones locales. La RPC del manual exige el permiso de acción explícito en usuario_puede; por eso sus filtros son más estrictos y pueden ocultar un paso a quien la interfaz sí se lo muestra.
