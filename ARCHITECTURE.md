# ARCHITECTURE — Controles Nómina

> **Última actualización:** 29 de julio de 2026
> Reescrito desde el código real (`db.js` v3, `js/controls/registry.js`) más el rediseño multi-cliente acordado.

---

## 1. Visión técnica de alto nivel

Aplicación 100% client-side. Sin servidor, sin build, sin transpilación — pero con ES modules (`type="module"`), por lo que requiere ser servida (no funciona con doble click desde `file://`).

```
┌───────────────────────────────────────────────────────────────────┐
│                    Browser (Chrome/Edge/Firefox)                  │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                     UI (HTML + JS)                        │    │
│  │  Lista clientes · Wizard de controles · Resultados ·      │    │
│  │  Checklist mensual · Modo admin (password)                │    │
│  └──────┬──────────────────┬──────────────────┬──────────────┘    │
│         │                  │                  │                  │
│  ┌──────▼───────┐   ┌──────▼───────────┐  ┌───▼────────────────┐  │
│  │  CONTROL_    │   │  Adaptadores por │  │  IndexedDB (Dexie) │  │
│  │  REGISTRY    │   │  sourceSystem    │  │  clients·configs·  │  │
│  │  (lógica)    │   │  (meta4/axton)   │  │  controlRuns       │  │
│  └──────────────┘   └──────────────────┘  └─────────────────────┘  │
│                                                                    │
│  Seed externo (import manual, hoy) ──► clients + controlConfigs   │
│  Librerías CDN: SheetJS · Dexie.js · pdf.js (v2+)                 │
└─────────────────────────────────────────────────────────────────┘
```

No hay backend. No hay tracking. El seed de configuración se distribuye por fuera del repo (SharePoint), importado manualmente por ahora.

---

## 2. Identidad de cliente: de `++id` a `code`

**Problema que resuelve:** con `++id` autoincremental, el cliente 5 en el navegador de un analista no es el cliente 5 en el de otro. Un seed compartido no puede referenciar ids locales.

**Solución:** `code` es la clave estable (`MARVAL`, `SPORTLINE`, `SIASA`, etc.), asignada una vez y nunca reutilizada. El `++id` de Dexie sigue existiendo como clave primaria interna, pero ninguna referencia cruzada (seed, `controlConfigs`, `controlRuns`) usa el id local — todas usan `code`.

```js
// v4 — code como identidad estable de cliente
db.version(4).stores({
  clients:           '&code, name, sourceSystem, active, team',
  groupers:          '++id, clientCode, name',
  grouperConcepts:   '++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:      '++id, clientCode, fileType, [clientCode+fileType]',
  sessions:          '++id, clientCode, period, isDefinitive, [clientCode+period]',
  sessionFiles:      '++id, sessionId, fileType',
  sessionResults:    '++id, sessionId',
  appConfig:         'key',
  controlRuns:       '++id, clientCode, period, isDefinitive, createdAt, sourceSystem, [clientCode+period]',
  controlRunFiles:   '++id, controlRunId, fileType, [controlRunId+fileType]',
  controlRunResults: '++id, controlRunId, controlId, [controlRunId+controlId]',
  clientCatalogs:    'clientCode',
  controlConfigs:    '[clientCode+controlId], clientCode, controlId, status',
});
```

`controlRuns.sourceSystem` guarda con qué sistema se ejecutó la corrida — necesario porque un cliente puede migrar de Meta4 a Axton a mitad de año y las corridas viejas siguen siendo válidas con el sistema viejo.

**Migración de v3 a v4:** requiere backfill: a cada `client` existente asignarle un `code` (slug del `name`), y reescribir las FK de `groupers`, `fileProfiles`, `sessions`, `controlRuns`, `clientCatalogs` de `clientId` numérico a `clientCode`. Ejecutar una sola vez, con export JSON previo de respaldo.

**Nota (2026-07-31 — D-011/D-016):** el schema de arriba es el ideal final; no se llegó a él en un solo salto. `clients` mantuvo `++id` como primary key real (con `&code` como índice único agregado en v4) hasta hoy — v3→v4 fue aditiva, no un reemplazo de PK. El cierre (v6, T10) llevó `groupers`/`fileProfiles`/`sessions`/`controlRuns` a indexar por `clientCode` como muestra el bloque de arriba, con una excepción real que este documento no anticipaba: `clientCatalogs` sigue usando `clientId` como primary key por dentro (no `clientCode`), porque Dexie no permite cambiar la primary key de una tabla existente — confirmado empíricamente al implementar T10. `clientCode` existe ahí como índice secundario; `db.js` resuelve la diferencia y nada fuera de ese archivo la ve.

---

## 3. Cliente y entidad

Clientes con más de una entidad legal (Poincenot, Carrier, Lowsedo, Sportline) guardan `entityCount` en el registro del cliente. En v2 no se opera por entidad individual — es un dato informativo para saber que un Tabulado puede venir consolidado o por entidad. Modelar la jerarquía completa (entidad como sub-registro operable) queda para cuando un caso real lo requiera (candidato: Sportline).

---

## 4. Los tres niveles del control

**Definición (código, `js/controls/registry.js`):**

```js
{
  id:          'control_holding',
  label:       '(ejemplo hipotético — ningún control real usa esto todavía)',
  scope:       'cliente',           // 'general' | 'convenio' | 'cliente'
  scopeMeta:   { clients: ['POINCENOT'] },   // o { ccts: ['Comercio'] } si scope=convenio
  appliesWhen: (client) => client.attributes.holding === true,
  paramSchema: { /* qué parámetros pide configurar */ },
  inputs:      [{ key: 'tabulado', logical: 'tabulado' }],  // formas lógicas, no columnas crudas
  run, summarize, renderResults,
}
```

`appliesWhen` es el mecanismo default de activación: en vez de tildar manualmente 22 clientes × 15 controles, el control se ofrece solo donde el predicado da verdadero. `controlConfigs.status` permite el override manual (`forzado_activo` / `forzado_no_aplica`) con motivo, para las excepciones que el predicado no capture.

Ejemplos de predicados según atributos ya cargados en el seed: `pluriempleo === true` (Sportline, Lowsedo), `holding === true` (Poincenot, Sportline, Lowsedo), `paymentUsd === true` (Geopagos, Piano). Ninguno de los 10 controles reales de hoy usa `appliesWhen` para restringirse — es mecanismo puro, ver D-012 y T4 en `specs/plan-v2-t0-t6.md`.

**Configuración (dato, `controlConfigs`):** clave `[clientCode + controlId]`. Reemplaza el uso indebido de `fileProfiles` para guardar cosas como `brutos_tab_config` o `rendvstabu_concept_grouping` — eso vuelve a ser exclusivamente mapeo de columnas.

```js
controlConfigs: {
  clientCode: 'MARVAL',
  controlId:  'nr',
  status:     'activo',            // 'activo' | 'no_aplica' | 'sin_configurar' | 'forzado_activo' | 'forzado_no_aplica'
  overrideReason: null,
  params:     { /* validado contra paramSchema del control */ },
}
```

**Scope (en la definición):**
- `general`: se ofrece a cualquier cliente activo.
- `convenio`: se ofrece a clientes cuyo `ccts` intersecte `scopeMeta.ccts` (ej. un control de escala salarial de Comercio, reusable en COELSA, Red Bull, TIM, Sportline, Carrier).
- `cliente`: lógica propia de un cliente puntual (`scopeMeta.clients`), no un motor de reglas genérico — un control nuevo por caso real, no un DSL.

---

## 5. Seam de adaptadores por sourceSystem

Los controles no vuelven a ver una columna cruda de Meta4 o Axton. Cada control declara `inputs` en forma lógica (`tabulado`, `reporte_brutos`, `reporte_nr`); un índice de adaptadores resuelve, según el `sourceSystem` del cliente, cómo parsear el archivo real a esa forma lógica.

```
js/adapters/
├── meta4/
│   ├── tabulado.js
│   ├── reporteBrutos.js
│   └── ...
└── axton/
    ├── tabulado.js       ← nuevo, piloto con Merz
    └── ...
```

El texto de ayuda ("Bajá el Reporte de Brutos de M4") pasa del control al adaptador correspondiente, porque es información del sistema de origen, no de la lógica del control.

**Piloto de Axton:** Merz (44 pays, complejidad 1, un solo CCT) antes de escalar a Siasa, COELSA, Red Bull, Plastic Omnium Pilar, Epiroc, Geopagos, Poincenot y Coty.

---

## 6. Seed de configuración

Archivo `hya-controles-config.json`, generado desde modo admin, distribuido por fuera del repo (SharePoint). Contiene `schemaVersion`, `configVersion`, `clients[]`, `controlConfigs[]`, `catalogs[]`.

**Carga:** intento silencioso de `fetch('./config/hya-controles-config.json')` (útil cuando se sirva desde infraestructura propia de H&A); si falla, cae a import manual de archivo — el único camino real mientras el hosting sea GitHub Pages.

**Merge:** autoritativo sobre clientes y `controlConfigs`; nunca toca `controlRuns` locales. Si un analista modificó un parámetro local respecto del seed, queda marcado como override visible en la UI, no se pisa en silencio.

---

## 7. Modo admin

Pantalla dentro de la misma app, protegida por contraseña cuyo hash (SHA-256) se compara del lado del cliente. Como el código corre en GitHub Pages, esto es una barrera contra el acceso accidental, no un control de seguridad real — cualquiera con acceso al código fuente puede leer el hash y, con esfuerzo, evadirlo. El control de seguridad real es el permiso de escritura sobre la carpeta de SharePoint donde vive el seed: un analista que accede al modo admin puede editar su copia local, pero no puede publicar cambios que afecten a los demás. Ver `DECISIONS.md` para el registro de esta decisión.

El modo admin habilita: editar atributos de cliente, editar `controlConfigs`, y exportar el seed actualizado.

---

## 8. Retiro del flujo de agrupadores

`main.js` mantiene hoy dos rutas de validación en paralelo: `#/wizard/:clientId` (agrupadores + `matching.js`) y `#/controls/:clientId` (`CONTROL_REGISTRY`). El cruce por agrupadores es, de hecho, el único control genuinamente general que existe hoy — se convierte en una entrada más del registry (`scope: 'general'`), y la ruta separada se retira.
