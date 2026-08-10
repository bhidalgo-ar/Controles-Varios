# CLAUDE.md — Instrucciones para Claude Code

> Este archivo se lee automáticamente en cada sesión de Claude Code en este repo.
> Define cómo Claude debe trabajar en este proyecto. Mantener corto y vigente.

---

## 1. Contexto del proyecto

**Nombre:** Controles Nómina
**Owner:** Willy (Guille) — Payroll, IT & Implementation Manager en Hidalgo & Asociados (H&A)
**Tipo:** Herramienta interna HTML browser-side para validación de nóminas.
**Audiencia:** Equipo de Payroll de H&A. Eventualmente exportables para clientes finales.

**Para qué sirve:** Validar la nómina maestra de un cliente (export de Meta4 / PeopleNet) contra archivos resumen del mismo período, generar insights, comparar mes a mes y exportar resultados al cliente — todo sin reconfigurar nada en Meta4.

**Para qué NO sirve:** No es una herramienta de cálculo de nómina, no escribe a Meta4, no se conecta a ningún sistema de origen. Es 100% lectura y análisis local.

---

## 2. Stack técnico

- **Frontend:** HTML + Vanilla JS con módulos ES6 (`import` / `export`). Sin framework.
- **Estilos:** CSS plano, sin preprocesadores. Variables CSS para la paleta H&A.
- **Excel:** SheetJS (`xlsx`) vía CDN — `https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js`
- **IndexedDB:** Dexie.js vía CDN — `https://unpkg.com/dexie@4/dist/dexie.min.js`
- **PDF (v2 en adelante):** pdf.js vía CDN — `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/`
- **Build:** Ninguno. Todo se sirve como archivos estáticos, con un static server simple (hoy GitHub Pages).
- **Sin transpilación, sin bundler, sin npm install.** Esto es deliberado: cualquiera del equipo tiene que poder abrir el repo y que funcione sin instalar nada. Aclaración técnica: la app usa ES modules (`type="module"` en `index.html`), por lo que **no funciona abriendo el HTML con doble click desde `file://`** — requiere servirse. Ver `DECISIONS.md`.

---

## 3. Estructura del repo (sugerida)

```
controles-nomina/
├── CLAUDE.md            ← este archivo
├── .claude/
│   ├── settings.json    ← allowlist de permisos común del equipo (versionado)
│   └── skills/          ← skills del proyecto (versionadas — ver §5.1)
├── PRD.md               ← qué hace la herramienta y por qué
├── ARCHITECTURE.md      ← cómo está construida
├── ROADMAP.md           ← qué viene después del MVP
├── DECISIONS.md         ← log de decisiones (se va creando a demanda)
├── CHANGELOG.md         ← se va escribiendo a medida que se versiona
├── README.md            ← guía de uso para el equipo H&A
├── index.html           ← entry point único
├── css/
│   ├── tokens.css       ← variables CSS (paleta H&A, tipografía, espaciados)
│   ├── base.css         ← reset + estilos generales
│   └── components.css   ← componentes UI (pills, wizard, tablas, etc.)
├── js/
│   ├── main.js          ← bootstrap de la app
│   ├── db.js            ← capa de IndexedDB (Dexie schemas + helpers)
│   ├── parsers/         ← parseo de cada tipo de archivo
│   │   ├── nominaMaestra.js
│   │   ├── resumenLargoExcel.js
│   │   └── resumenTabuladoHorizontalExcel.js
│   ├── matching.js      ← lógica de cruce nómina vs resumen
│   ├── insights.js      ← cálculo de los insights (totales, top diffs, etc.)
│   ├── ui/              ← componentes de UI
│   │   ├── wizard.js
│   │   ├── fileUpload.js
│   │   ├── grouperEditor.js
│   │   ├── resultsView.js
│   │   └── sessionsList.js
│   ├── export/          ← exports a Excel y JSON de sesión
│   │   ├── toExcel.js
│   │   └── toSessionJson.js
│   └── utils/
│       ├── currency.js  ← formateo y parsing de números (es-AR)
│       ├── dates.js     ← manejo de períodos
│       └── validators.js
└── assets/
    └── (logos, íconos, etc.)
```

Claude Code puede ajustar esto si tiene buen motivo, pero documentar el cambio en `DECISIONS.md`.

---

## 4. Convenciones de código

- **Idioma:**
  - Código (nombres de variables, funciones, archivos): **inglés**.
  - Comentarios, mensajes de UI, strings visibles al usuario: **español argentino**.
- **Indentación:** 2 espacios.
- **Strings:** comillas simples por defecto. Template literals cuando hay interpolación.
- **Punto y coma:** sí, siempre.
- **Async:** `async/await`, no callbacks ni `.then()` encadenados largos.
- **Errores:** capturar siempre, mostrar mensajes claros al usuario en español. Nunca dejar un `console.error` como única respuesta al usuario.
- **Nombres:** `camelCase` para funciones y variables, `PascalCase` para clases, `UPPER_SNAKE` para constantes globales.
- **No usar `var`.** Solo `const` y `let`.
- **Imports relativos** dentro del proyecto (`import { x } from './utils/foo.js'`).
- **JSDoc** opcional pero bienvenido en funciones públicas de cada módulo.

---

## 5. Marca H&A — uso obligatorio

Todo HTML del proyecto debe aplicar el skill **`hya-brand`** ubicado en `/mnt/skills/user/hya-brand/SKILL.md`.

Reglas mínimas no negociables:
- Celeste primario **`#00ACD4`** como color de marca.
- Gris wordmark **`#8C837B`** para el texto "Hidalgo & Asociados".
- Tipografía **Source Sans Pro** (Google Fonts) con fallback Arial.
- Logo H&A en header de la app (usar fallback CSS de la sección 9.4 del skill si no hay conexión a red).
- Footer con datos de contacto corporativos cuando aplique.

**Aviso de privacidad obligatorio** (banner visible antes de cualquier input de archivo):

> ⚠ **Aviso de privacidad:** Esta herramienta procesa los datos 100% en tu navegador — nada se sube a internet. Aun así, **no compartas información personal identificable de empleados o clientes** fuera de los canales autorizados por H&A. Usá esta herramienta solo en equipos corporativos.

Snippet HTML del banner: ver `SKILL.md` sección 5.

### 5.1 Skills del proyecto

Viven en `.claude/skills/` y **están versionadas** — las ve todo el equipo, no son
configuración personal. Se invocan con `/<nombre>` o se disparan solas cuando el
pedido coincide con su `description`.

| Skill | Cuándo |
|---|---|
| `nuevo-control` | Agregar un control nuevo a la batería, o una variante "Generar Reporte" de uno existente. Cablea los 6 puntos de integración y aplica los patrones de UI de §11. |

`.claude/settings.json` también se versiona (allowlist de comandos del proyecto).
El resto de `.claude/` está en `.gitignore` — ver D-017 en `DECISIONS.md`.

---

## 6. Privacidad y seguridad

Esto es **crítico** y aplica a todo el código:

1. **Nada sale del navegador.** No hay backend, no hay API calls a servicios externos (salvo CDNs de librerías). Todos los datos viven en IndexedDB local del usuario.
2. **No loguear datos sensibles a consola.** En producción, los `console.log` de datos de empleados están prohibidos. En desarrollo, OK pero limpiar antes de mergear.
3. **El export JSON de sesión incluye datos personales.** Avisar al usuario al exportar: "Este archivo contiene datos sensibles de empleados. Tratalo como información confidencial."
4. **No telemetría, no analytics, no tracking.** Nada de Google Analytics, Sentry, etc.
5. **Los entregables que van a Finanzas no llevan información de HR.** Cuando el archivo que genera un control lo recibe Finanzas/tesorería del cliente (no el equipo de Payroll), no puede incluir datos de HR: dotación, conteos de empleados por lista, altas y bajas, excepciones de empleados, atributos como jornalizado/mensualizado. En muchos clientes Finanzas no tiene acceso a esa información. Va sólo lo que hace falta para pagar: legajo, nombre, CUIT, CBU, banco, importe y fecha. Todo lo demás se muestra en la pantalla de resultados de la app, que la ve el analista. Ver D-020 en `DECISIONS.md`.

---

## 7. Git workflow — obligatorio

**Cada cambio de código debe terminar con el ciclo completo: commit → push → PR → merge a main.** Sin excepciones, sin pedir confirmación a Willy.

Secuencia exacta:
```
git add <archivos modificados>
git commit -m "..."
git checkout -b feat/nombre-descriptivo   # o fix/ según corresponda
git push -u origin feat/nombre-descriptivo
"C:\Program Files\GitHub CLI\gh.exe" pr create --base main --head feat/nombre-descriptivo --title "..." --body "..."
"C:\Program Files\GitHub CLI\gh.exe" pr merge --merge --delete-branch
```

Notas:
- `gh` no está en el PATH — usar ruta completa `C:\Program Files\GitHub CLI\gh.exe`
- Willy es el único owner del repo, no hay reviewers — mergear directo
- El objetivo es que el cambio esté en `main` antes de terminar la respuesta

---

## 8. Estilo de commits

Usar **Conventional Commits** (es el estándar más práctico):

- `feat:` nueva funcionalidad
- `fix:` corrección de bug
- `docs:` cambios en documentación
- `refactor:` cambio de código sin cambiar comportamiento
- `style:` formato, espacios, sin cambio de lógica
- `test:` agregar/modificar tests
- `chore:` tareas de mantenimiento

Ejemplos:
```
feat: agregar parser de resumen tabulado horizontal
fix: corregir error en matching cuando legajo es numérico vs string
docs: actualizar PRD con insight de variación mes a mes
```

Mensajes en español, body opcional pero bienvenido cuando el cambio es no obvio.

---

## 8. Cómo trabajar con Willy

- **Brainstorming antes de código.** No tirarse a implementar de una si el pedido tiene ambigüedad. Validar el objetivo principal primero.
- **Opciones con ranking 1–10** cuando haya decisiones de diseño.
- **Datos reales, no suposiciones.** Si Claude no sabe algo (ej: cómo viene exactamente un archivo del cliente), preguntar.
- **Idioma:** español argentino, registro directo e informal.
- **Cuando sea posible, mostrar working output rápido** antes de pulir. Iteración visual > planificación exhaustiva.
- **No sobre-formatear** las respuestas (Willy lo agradece).

---

## 9. Testing

Para el MVP, **no se exige cobertura formal de tests automáticos.** Sí se exige:

- Tener archivos de prueba anonimizados en `tests/fixtures/` que cubran los formatos soportados.
- Testing manual documentado en `README.md` antes de cada release.
- Si Claude Code identifica una zona de alto riesgo (parsing, cálculos de diferencias), proponer tests unitarios concretos.

---

## 10. Documentos vivos del proyecto

Estos archivos se actualizan a medida que el proyecto evoluciona. Claude Code puede proponer cambios cuando detecte que están desactualizados:

| Documento | Frecuencia de actualización |
|---|---|
| `CLAUDE.md` | Cuando cambian convenciones o stack |
| `PRD.md` | Cuando cambia el scope o se redefine una feature |
| `ARCHITECTURE.md` | Cuando cambia un schema, módulo o flujo importante |
| `ROADMAP.md` | Después de cada release |
| `DECISIONS.md` | Cuando se toma una decisión técnica no obvia |
| `CHANGELOG.md` | En cada commit relevante |
| `README.md` | Cuando cambia el flujo de uso para el equipo |

---

## 11. Pendientes anotados por Willy (sesión 2026-07-14)

Ideas validadas por Willy. §11.1 y §11.2 se generalizaron a los 9 controles restantes el 2026-08-07
(ver `js/ui/resultBlocks.js` y la entrada del `CHANGELOG.md` de esa fecha) — quedan documentadas como
referencia del patrón, no como pendiente.

1. **Ocultar filas/columnas sin datos reales — generalizado.**
   Patrón: filtrar por `hasAnyValue`-style antes de armar la tabla (`hasAnyNrValue` en `nr.js`, y su
   equivalente en `brutos.js`/`gsPers.js`), ocultar columnas/grupos sin ninguna diferencia
   (`rendVsTabu.js`), y un toggle "sólo con diferencia / todos" para distribuciones que coinciden 1:1
   (`catXEmpleados.js`, las tablas por Puesto/CC). Rendimiento vs Asiento ya lo hacía desde antes
   (`buildDrillRollup` en `js/controls/rendVsAsiento.js`).

2. **Veredicto + tiles arriba de la tabla — generalizado.**
   `js/ui/resultBlocks.js` saca el patrón a un módulo: `renderVerdict` (ícono + titular en prosa),
   `renderTiles` (label/valor/subtexto), `renderIssues` ("casos para revisar" con severidad y por qué) y
   `renderChecks` (chequeos de coherencia). `renderResumenDetalle()` envuelve todo en dos solapas fijas —
   **Resumen** (estos bloques) y **Detalle** (la tabla completa, buscador + paginación + export, sin
   cambios en qué exporta). Aplicado a los 9 controles que faltaban: `nr.js`, `brutos.js`, `gsPers.js`,
   `catXEmpleados.js`, `rendVsTabu.js`, `rendXEe.js`, `rendVsAsiento.js`, `agrupadores.js`,
   `acreditaciones.js`. Variación entre períodos y Acumuladores Ganancias quedan para otra tanda (Willy
   los está encarando por otro lado).
   Para un control nuevo: usar `resultBlocks.js` desde el principio en vez de armar el hero a mano — ver
   `nr.js` como referencia.

3. **Modo "Controlar" de Acreditaciones (Axton).**
   El modo "Generar Reporte" ya está (`acreditaciones_reporte` en el registry, ver
   `specs/control-acreditaciones-axton.md`). Falta el cruce de las acreditaciones contra el Tabulado, que
   Willy dejó para definir después. Cuando se defina, entra como segunda entrada del mismo `group`
   (`{ id: 'acreditaciones', mode: 'Controlar' }`) reusando el parser y la normalización de tipos.

4. **Nada del cliente cableado en el código del control — hecho en Variaciones, patrón a seguir.**
   Los códigos de concepto de un cliente no van como constantes del módulo: van a `controlConfigs`
   (`[clientCode+controlId]`, ver `js/db.js`), que además viaja en el export/import del seed. En el módulo
   quedan como **semilla** para el cliente que todavía no configuró nada. Y qué columna del archivo
   representa a cada concepto lo **confirma el analista** en el Paso 2, con el código como precarga — así
   una renumeración del cliente se arregla desde la pantalla y no con un commit. Ver D-035 y
   `js/ui/variacionesConceptMap.js`.

5. **Un default silencioso es un bug.** Si un control no puede resolver algo (una columna que no aparece,
   un concepto que no matchea), no lo completa solo con 0,00: lo pide explícitamente y no deja avanzar, o
   lo saca como aviso en la pantalla de resultados. Lo mismo vale para los parsers — validar que lo que se
   leyó tenga la forma esperada (ancho de la fila de encabezados, totales contra la fila `TOTAL GENERAL`)
   y cortar con un error que diga qué se esperaba y qué se encontró.

---

**Última actualización:** 10 de agosto de 2026 — §11.4/§11.5 anotados a partir del rediseño de Variaciones (D-035). Pendiente §11.3, modo "Controlar" de Acreditaciones.
