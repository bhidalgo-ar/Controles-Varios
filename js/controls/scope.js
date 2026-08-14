// scope.js — ¿Qué controles se le ofrecen a qué cliente?
//
// Un control se ofrece a un cliente si pasa tres filtros, en este orden:
//
//   1. Override explícito del admin (controlConfigs.status) — gana sobre todo.
//      Es la vía de escape cuando el scope quedó mal cargado: el analista no
//      queda bloqueado, se fuerza desde #/admin con motivo obligatorio.
//   2. Scope declarativo (scope + scopeMeta) — a qué universo de clientes
//      pertenece el control.
//   3. appliesWhen(client) — predicado fino sobre atributos del cliente
//      (pluriempleo, holding, paymentUsd...). Default: () => true.
//
// Los cuatro scopes posibles:
//   'general'  → cualquier cliente activo.
//   'sistema'  → clientes cuyo sourceSystem esté en scopeMeta.sourceSystems.
//                Ej: { scope: 'sistema', scopeMeta: { sourceSystems: ['meta4'] } }
//                es "control estándar de Meta4, lo ve cualquier cliente Meta4".
//   'convenio' → clientes cuyos ccts intersecten scopeMeta.ccts.
//   'cliente'  → sólo los clientes de scopeMeta.clients (por `code`).
//
// IMPORTANTE: esto filtra qué controles se *ofrecen* para ejecutar. No filtra
// resultados ya guardados — una corrida histórica de un control que hoy no
// aplica al cliente se sigue viendo (ver checklistView.js y controlsResults.js,
// que resuelven CONTROL_REGISTRY[controlId] por id sin pasar por acá).

/** Estados de controlConfigs que fuerzan el resultado, sin importar el scope. */
const FORCED_ON  = 'forzado_activo';
const FORCED_OFF = 'forzado_no_aplica';
const NOT_APPLIC = 'no_aplica';

/**
 * ¿El scope declarativo del control incluye a este cliente?
 * @param {object} ctrl   - entrada del CONTROL_REGISTRY
 * @param {object} client - cliente ({ code, sourceSystem, ccts, ... })
 */
export function scopeMatchesClient(ctrl, client) {
  const meta = ctrl.scopeMeta || {};
  switch (ctrl.scope) {
    case 'general':
      return true;
    case 'sistema':
      return (meta.sourceSystems || []).includes(client?.sourceSystem);
    case 'convenio': {
      const clientCcts = client?.ccts || [];
      return (meta.ccts || []).some(cct => clientCcts.includes(cct));
    }
    case 'cliente':
      return (meta.clients || []).includes(client?.code);
    default:
      // Scope desconocido (o control sin migrar): no lo escondemos por un dato
      // que falta — es preferible ofrecerlo de más que bloquear al analista.
      return true;
  }
}

/**
 * ¿Este control se le ofrece a este cliente?
 *
 * @param {object} ctrl   - entrada del CONTROL_REGISTRY
 * @param {object} client - cliente
 * @param {object} [config] - fila de controlConfigs de ese [clientCode+controlId], si existe
 * @returns {boolean}
 */
export function controlAppliesToClient(ctrl, client, config) {
  if (!ctrl) return false;

  // 1. El admin manda: forzado_activo / forzado_no_aplica ignoran el scope.
  if (config?.status === FORCED_ON)  return true;
  if (config?.status === FORCED_OFF) return false;
  if (config?.status === NOT_APPLIC) return false;

  // 1.5. `hidden` saca al control de circulación para todo el mundo, incluso
  // dentro de su scope — está anotado pero todavía no se ofrece a nadie
  // (ej. agrupadores: falta definir el archivo de Nómina Maestra estándar).
  // Un forzado_activo puntual desde #/admin lo puede volver a mostrar igual.
  if (ctrl.hidden) return false;

  // 2. Scope declarativo.
  if (!scopeMatchesClient(ctrl, client)) return false;

  // 3. Predicado fino por atributos del cliente.
  const predicate = ctrl.appliesWhen || (() => true);
  return predicate(client) === true;
}

/**
 * Etiqueta legible del scope de un control — para la UI de admin, donde hay
 * que entender qué se está forzando y por qué el control aparece o no.
 */
export function scopeLabel(ctrl) {
  const meta = ctrl.scopeMeta || {};
  switch (ctrl.scope) {
    case 'general':  return 'Todos los clientes';
    case 'sistema':  return `Sistema: ${(meta.sourceSystems || []).join(', ') || '—'}`;
    case 'convenio': return `CCT: ${(meta.ccts || []).join(', ') || '—'}`;
    case 'cliente':  return `Cliente: ${(meta.clients || []).join(', ') || '—'}`;
    default:         return 'Sin scope declarado';
  }
}

/**
 * Filtra una lista de controles por cliente.
 * @param {object[]} controls
 * @param {object} client
 * @param {Map<string, object>} [configByControlId] - controlConfigs del cliente, por controlId
 */
export function filterControlsForClient(controls, client, configByControlId) {
  return controls.filter(c =>
    controlAppliesToClient(c, client, configByControlId?.get(c.id))
  );
}

const SOURCE_SYSTEM_LABEL = { meta4: 'Meta4', axton: 'Axton' };

/**
 * Origen de un control para el wizard de ejecución (Paso 1) — dónde se agrupa
 * y con qué chip se filtra. Deliberadamente separado del semáforo de
 * diferencias (ok/warn/error): `tier` sólo tiene dos valores visuales
 * ('general' | 'scoped') para no pisar esos colores; `label` es el texto
 * específico (sistema, CCT o cliente) que se muestra en el chip.
 *
 * @param {object} ctrl   - entrada del CONTROL_REGISTRY
 * @param {object} client - cliente actual (para el caso scope: 'cliente')
 */
export function controlOrigin(ctrl, client) {
  const meta = ctrl.scopeMeta || {};
  switch (ctrl.scope) {
    case 'sistema': {
      const labels = (meta.sourceSystems || []).map(s => SOURCE_SYSTEM_LABEL[s] || s);
      return { tier: 'scoped', label: labels.join(' / ') || 'Sistema' };
    }
    case 'convenio':
      return { tier: 'scoped', label: (meta.ccts || []).join(' / ') || 'Convenio' };
    case 'cliente':
      return { tier: 'scoped', label: client?.name || 'Cliente' };
    case 'general':
    default:
      return { tier: 'general', label: 'General' };
  }
}
