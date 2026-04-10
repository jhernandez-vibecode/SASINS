// ============================================================
// state.js
// Variables globales compartidas entre todos los módulos.
// Es la "memoria" del sistema mientras la página está abierta.
// Cuando se recarga la página, todo vuelve a cargarse de Firebase.
// ============================================================

// ── Datos principales cargados desde Firebase ────────────────
// Se llenan al iniciar la app con loadAll() en app.js
export const state = {

  // Lista completa de pólizas/recibos de la cartera
  polizas: [],

  // Lista de clientes registrados manualmente
  clientes: [],

  // Lista de productos INS con sus comisiones
  prods: [],

  // ── Estado del módulo Cobros ──────────────────────────────

  // Pólizas del mes activo seleccionado en Cobros
  cobData: [],

  // Pólizas visibles después de aplicar filtros en Cobros
  cobFiltered: [],

  // Página actual de la tabla de Cobros
  cobPage: 1,

  // Filtro activo: 'all', 'Pendiente', 'Período gracia', 'pagado'
  cobTab: 'all',

  // Filtros adicionales activos en Cobros
  cobFiltNowa: false,    // mostrar solo los que NO tienen WA enviado
  cobFiltNoEmail: false, // mostrar solo los que NO tienen correo

  // Cache de pólizas marcadas como pagadas { rowKey: true }
  // Se carga desde la colección "pagados" en Firebase
  pagadosCache: {},

  // Cache de WhatsApps enviados { rowKey: cantidad }
  // Se carga desde la colección "wa_envios" en Firebase
  waCache: {},

  // IDs seleccionados con el checkbox en la tabla de Cobros
  selectedCob: new Set(),

  // Mes activo seleccionado en el sidebar de Cobros (ej: "MAYO2026")
  mesActivo: '',

  // ── Estado del módulo Cartera ─────────────────────────────

  // Resultados de la última búsqueda en Cartera
  crResults: [],

  // Página actual de los resultados de búsqueda
  crPage: 1,

  // ── Estado de Gmail ───────────────────────────────────────

  // Token de acceso OAuth de Gmail (se obtiene al conectar)
  gmailToken: null,

  // Email del usuario conectado con Gmail
  gmailUser: null,

  // Indica si hay un envío masivo de correos en curso
  sendingActive: false,

  // ── Estado de modales ─────────────────────────────────────

  // ID del documento Firestore de la póliza abierta en el modal detalle
  currentPolId: null,

  // ID del documento Firestore del producto abierto en el modal producto
  currentProdId: null,

  // Tipo de cliente en el modal nuevo cliente: 'fisica' o 'juridica'
  tipoCliente: 'fisica',

  // ── Estado de importación XLS ─────────────────────────────

  // Registros pendientes de confirmar después de cargar un XLS
  xlsPending: null,

  // ID de la póliza para la que se abrió el modal WhatsApp
  currentWaIdx: null,
};
