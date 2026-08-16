# Importación de ZAHORY

La importación actual fija el contexto de ZAHORY en el rol de gerente y expone el catálogo completo de pantallas. En esta fase no se reprodujeron el selector de roles original —gerente y técnico— ni el dashboard específico del técnico.

ZAHORY original tenía una inconsistencia entre las rutas visibles en el menú técnico y las rutas que su router implementaba realmente para ese rol. Esta importación no reprodujo esa inconsistencia, pero tampoco la corrigió: el comportamiento queda pendiente de una decisión explícita.

Durante la revisión módulo por módulo se deberá decidir si el modo técnico se reproduce como estaba, se reconstruye usando la sesión y los permisos reales de TIDEO, o se descarta. Esa decisión no forma parte de esta fase de importación.

También quedan pendientes el selector de tema, el buscador y la campana de notificaciones. El buscador y la campana del original tienen funcionalidad mínima o inexistente; el selector de tema deberá revisarse contra el sistema de tema real de TIDEO antes de incorporarse. No se reproducirán la identidad ficticia ni el cierre de sesión simulado de ZAHORY: Operaciones ya debe usar la sesión real de TIDEO y duplicarlos crearía dos sistemas de sesión en conflicto.
