# Controles Nómina — Hidalgo & Asociados

Herramienta interna de H&A para validar la nómina mensual de un cliente contra sus archivos de control (Reporte de Brutos, Rendimiento, Tabulado, etc.), sin tocar Meta4/Axton y sin subir datos a ningún lado. Corre 100% en el navegador.

Ver `PRD.md` para el detalle de producto y `ARCHITECTURE.md` para el diseño técnico. Este documento es la guía práctica para levantar el proyecto y usarlo.

---

## Requisitos

- Un navegador moderno (Chrome, Edge o Firefox).
- Python 3 (para servir la app localmente) o cualquier otro static server.
- Node.js 20+ **solo si vas a correr los tests** — la app en sí no lo necesita para funcionar.

No hay build step, ni bundler, ni `npm install` para usar la app (ver `CLAUDE.md` §2). `npm install` sólo hace falta para correr la suite de tests.

---

## Cómo correr la app localmente

La app usa ES modules (`type="module"` en `index.html`), así que **no funciona abriendo `index.html` con doble click** (`file://`) — el navegador bloquea los `import`. Hay que servirla:

```bash
python3 -m http.server 4173
```

Y abrir `http://localhost:4173` en el navegador.

Cualquier otro static server sirve igual (`npx serve`, la extensión Live Server de VS Code, etc.) — lo único que importa es que sea HTTP, no `file://`.

---

## Uso básico

1. Al entrar, la app arma su base local (IndexedDB vía Dexie) — no requiere login ni configuración inicial.
2. Elegí un cliente de la lista. Los controles que ves dependen del cliente: el motor de reglas (`appliesWhen`, ver `ARCHITECTURE.md` §4) decide qué controles aplican según los atributos de ese cliente (sistema de origen, convenio, si es holding, etc.).
3. Cargá los archivos que pide el control elegido (típicamente el Tabulado como pivote, más el reporte a controlar).
4. Revisá el resultado: semáforo de estado, hero con el conteo de empleados sin diferencias vs con diferencias, y detalle línea por línea.
5. Exportá a Excel cuando haga falta compartir el resultado con el cliente o con otro analista.

### Controles disponibles hoy

Definidos en `js/controls/registry.js`:

| Control | Qué compara |
|---|---|
| Cruce por Agrupadores | Nómina Maestra vs Resumen (Largo o Tabulado Horizontal) — el control original, ahora reimplementado como una entrada más del registry |
| EE x CATEG | Empleados por categoría |
| Brutos (Controlar / Generar Reporte) | Reporte de Brutos vs Tabulado |
| GS Pers (Controlar / Generar Reporte) | Reporte de GS Pers vs Tabulado |
| Control NR (Controlar / Generar Reporte) | Reporte de NR vs Tabulado |
| Rendimiento vs Tabulado | Reporte de Rendimiento vs Tabulado |
| Rendimiento vs Asiento | Rendimiento vs Contabilidad Desglosada (+ CC x Empleado opcional). Admite subir varios archivos de Contabilidad a la vez (ej. varios meses juntos); se avisa si dos archivos comparten filas idénticas |
| Rendimiento x EE | Rendimiento vs Costo Total por empleado |
| Variación Sueldos / Variación Conceptos | Compara el Tabulado del período actual contra el del período anterior del mismo cliente y muestra la variación por empleado: sueldos (899999 + 1000) y premios (2517, 2519). Detecta cuándo un concepto se paga en escalones fijos (0/50%/70%/100%) y separa las bajas de escalón que se explican con una licencia/ausencia de las que no. Reusa el Tabulado del mes anterior si ese mes ya se corrió. Solo Plastic Omnium Florida |
| Acreditaciones — Generar Reporte | Ordena las acreditaciones del mes del export `contacred` de Axton: una hoja por acreditación (tipo de liquidación × fecha) más una hoja CONTROL que las lista y cierra con fórmulas contra el total del archivo de origen. Es el único control de clientes Axton; el modo "Controlar" (contra el Tabulado) está pendiente |
| Asiento de Remuneraciones — Generar Reporte | Arma el asiento contable de remuneraciones de FINADIET desde el excel mensual "FINADIET CONCEPTOS" de Meta4: cuentas de Resultado con el prefijo de su centro de costo, cuentas Patrimoniales consolidadas por categoría entre todos los centros, y el control de que el asiento cierre (Debe = Haber). Sale un .xlsx de 3 solapas para Contaduría del cliente. El plan de cuentas y los centros de costo se editan desde el Paso 2 (no son código). Solo Finadiet — ver `specs/finadiet-asiento-remuneraciones.md` |

Las variantes "Generar Reporte" arman el archivo a controlar a partir del Tabulado, en vez de pedirlo cargado. Para agregar un control nuevo o una variante de uno existente, usar la skill `/nuevo-control` (ver `.claude/skills/nuevo-control/SKILL.md`) — cablea los 6 puntos de integración y aplica los patrones de UI obligatorios.

### Reportes standalone (fuera de la app)

Algunos entregables no son un control de la batería sino un HTML aparte que se abre solo. Viven en `reportes/`:

| Archivo | Qué hace |
|---|---|
| `reportes/opmobility-variaciones.html` | Lo mismo que los controles "Variación Sueldos" y "Variación Conceptos" de la app, pero fuera de ella. Compara el tabulado de OPmobility C-Power Argentina S.A. entre dos períodos (mes anterior vs mes actual) y arma los reportes de **Variación Sueldos** y **Variación Conceptos** por empleado, con exportación a PDF A4 horizontal. No usa ES modules: se abre con doble click. Guarda el período procesado en `localStorage`, así el mes siguiente alcanza con subir el tabulado nuevo. Ver `specs/reporte-variaciones-opmobility.md` |

### Modo admin

`#/admin` habilita editar clientes y la configuración de controles (`controlConfigs`), y exportar el seed (`hya-controles-config.json`) que se distribuye al resto del equipo. Está protegido por contraseña (hash SHA-256 local) — es una barrera contra el acceso accidental, no un control de seguridad real (ver `ARCHITECTURE.md` §7 y `DECISIONS.md` D-013). La primera vez se entra con la contraseña de arranque (pedísela a Willy); la pantalla avisa que hay que cambiarla y desde ahí se define una propia, que queda guardada en ese navegador y no en el repo. Es por navegador: cada uno la define una vez.

---

## Privacidad

**Nada de lo que cargás sale del navegador.** No hay backend propio ni telemetría — la única salida de red son los CDNs de las librerías (SheetJS, Dexie) y, en modo admin, el archivo de seed que se exporta manualmente.

Aun así:
- No compartas información personal identificable de empleados o clientes fuera de los canales autorizados por H&A.
- Usá esta herramienta solo en equipos corporativos.
- El export JSON de sesión contiene datos personales — tratalo como información confidencial.

Ver `CLAUDE.md` §6 para el detalle completo.

---

## Testing

```bash
npm install        # solo para tests, no para correr la app
npm run test:unit  # tests unitarios (parsers, migraciones de DB, seed)
npm run test:e2e   # tests end-to-end con Playwright (levanta la app con http.server)
npm test           # unit + e2e
```

CI (`.github/workflows/ci.yml`) corre ambas suites en cada PR y en push a `main`. `tests/rendVsAsientoDrill.test.js` queda afuera de CI a propósito: necesita archivos `.xlsx` reales de un cliente que no están (ni deben estar) en el repo.

No hay fixtures anonimizadas en `tests/fixtures/` todavía (`CLAUDE.md` §9 las pide) — los tests actuales generan sus propios datos de prueba inline o en fixtures puntuales por test. Si vas a agregar un parser o un cálculo de diferencias nuevo, sumá un test unitario concreto junto con el cambio.

---

## Estructura del repo

```
Controles-Varios/
├── index.html              ← entry point único, servido estático
├── css/                     ← tokens.css, base.css, components.css
├── js/
│   ├── main.js              ← bootstrap + router por hash (#/, #/controls/:clientCode, #/admin)
│   ├── controls/            ← CONTROL_REGISTRY y la lógica de cada control (nr.js, brutos.js, etc.)
│   ├── parsers/              ← parseo de cada tipo de archivo de origen
│   ├── ui/                  ← componentes de UI (wizard, adminView, fileUpload, etc.)
│   ├── data/, seed/, utils/  ← capa de datos (Dexie), import/export de seed, helpers
├── config/SEED_SCHEMA.md    ← schema del seed de configuración
├── tests/                    ← unit tests (Node) + tests/e2e (Playwright)
├── .claude/skills/           ← skills del proyecto (versionadas, ver CLAUDE.md §5.1)
├── PRD.md, ARCHITECTURE.md, ROADMAP.md, DECISIONS.md, CHANGELOG.md
└── CLAUDE.md                 ← convenciones y workflow para trabajar en este repo
```

---

## Stack

Vanilla JS (ES modules) + SheetJS (Excel) + Dexie.js (IndexedDB). Sin framework, sin bundler. Detalle completo en `CLAUDE.md` §2 y `ARCHITECTURE.md`.

---

## Documentos del proyecto

| Documento | Para qué |
|---|---|
| `CLAUDE.md` | Convenciones de código, workflow de git, reglas de marca y privacidad |
| `PRD.md` | Qué hace la herramienta, para quién, y por qué |
| `ARCHITECTURE.md` | Cómo está construida (schema de DB, modelo de controles, seed) |
| `ROADMAP.md` | Qué viene después del estado actual |
| `DECISIONS.md` | Log de decisiones técnicas no obvias |
| `CHANGELOG.md` | Historial de cambios por commit relevante |
