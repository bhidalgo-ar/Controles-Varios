---
name: hya-brand
description: "Guía oficial de marca Hidalgo & Asociados (H&A). Aplicar en cualquier entregable visual o textual con identidad H&A: PPT, HTML, PDF, Word, emails, banners, posts. Incluye paleta exacta, tipografía, layouts oficiales, datos corporativos verificados, headers/footers y reglas de tono."
---

---

# Skill: Hidalgo & Asociados (H&A) — Branding, Contexto Corporativo & Herramientas Digitales Internas

> **Versión:** 3.0 — incorpora el sistema de diseño completo del Validador de Recibos (junio 2026) como referencia canónica para herramientas web internas de Payroll.
> **Fecha de la última actualización:** 29 de junio de 2026.

---

## 0. REGLAS NO NEGOCIABLES (leer esto primero, siempre)

Aplicar SIEMPRE que se genere un entregable visual o textual con identidad H&A (PPT, HTML, PDF, Word, email, banner, post), sin excepción y sin que el usuario tenga que pedirlo explícitamente:

- **Paleta permitida, nada más:** `#00ACD4` (celeste, ancla visual), `#8C837B` (gris, solo wordmark), `#000000` (cuerpo de texto), `#FFFFFF` (fondos). Ningún verde, naranja, lavanda, beige o warm-neutral como color de marca, aunque aparezca en algún material viejo.
- **Tipografía:** Source Sans Pro + Arial como fallback. Excepción: herramientas web internas de Payroll usan DM Serif Display (display) + Plus Jakarta Sans (cuerpo).
- **Nunca inventar datos corporativos.** Cifras, direcciones, nombres de directivos y demás usar tal cual figuran en la sección 2 de este documento, no aproximar ni completar de memoria.
- **No usar:** líneas decorativas finas bajo títulos, bandas de color uniformes a todo el ancho, sombras dramáticas o gradientes fuera del logo.
- Logo + wordmark siempre en footer derecho de contenido; isotipo solo en portadas/cierres.

El detalle completo de cada regla (con excepciones y contexto) está en las secciones siguientes. Esta sección es el resumen de lo que no se negocia; si hay conflicto entre esta sección y una sección posterior, gana esta.

---

## 1. IDENTIDAD VISUAL

### 1.1 Paleta oficial (hex exactos verificados)

| Rol | Hex | RGB | Uso |
|---|---|---|---|
| **Celeste H&A** (primario) | `#00ACD4` | `0, 172, 212` | Logo, títulos, acentos, cápsulas decorativas, paneles laterales, links |
| **Gris cálido wordmark** (secundario) | `#8C837B` | `140, 131, 123` | Texto del wordmark "Hidalgo & Asociados", subtítulos en cierre |
| **Negro cuerpo** | `#000000` | `0, 0, 0` | Cuerpo de texto en slides y documentos |
| **Blanco** | `#FFFFFF` | `255, 255, 255` | Fondos, espacios negativos, logo en negativo |
| **Azul agua oscuro** (fotográfico) | n/a | foto JPG | Bandas laterales y portadas con foto de mar/agua submarina |

**Reglas:**
- **Celeste primario es el ancla visual.** Todo lo que es marca H&A vive en `#00ACD4` o blanco sobre celeste.
- **Gris `#8C837B` solo para wordmark** y elementos tipográficos secundarios. No usar como color de fondo ni para títulos principales.
- **No introducir verdes, naranjas, lavandas u otros colores como "marca H&A".** Si aparecen en algún material existente (ej. cápsulas verdes en un PPT viejo), son uso ad-hoc del autor del material, no marca corporativa.
- **Colores de vendors aliados** (monday.com lavanda, AxtonIT, etc.) sólo se usan en slides dedicadas a ese vendor.

### 1.2 Tipografía

Fuente oficial: **Source Sans Pro** (primaria) + **Arial** (fallback web-safe). Disponible vía Google Fonts.

| Elemento | Fuente | Peso |
|---|---|---|
| Títulos | Source Sans Pro | Bold (700) |
| Subtítulos | Source Sans Pro | SemiBold (600) |
| Cuerpo | Source Sans Pro | Regular (400) |
| Wordmark "Hidalgo & Asociados" | Source Sans Pro | Light (300), color `#8C837B` |
| Fallback web-safe | Arial, sans-serif | — |

**Stack CSS recomendado:**
```css
font-family: "Source Sans Pro", Arial, Helvetica, sans-serif;
```

**Excepción — herramientas web internas de Payroll:** usan `DM Serif Display` (display/números grandes) + `Plus Jakarta Sans` (cuerpo). Ver sección 10.

### 1.3 Logo

Tres versiones canónicas:

1. **Isotipo (círculo solo):** círculo `#00ACD4` con monograma "H&A" en blanco.
   - Uso: avatares, redes sociales, marcadores, esquinas decorativas.
   - Archivo: `Logo_Solo_-_CONSULTORA.png`
2. **Logo + wordmark horizontal:** isotipo + texto "Hidalgo & Asociados" en gris `#8C837B`.
   - Uso: footers de slides de contenido, firmas de email, encabezados de documentos.
3. **Logo en negativo:** isotipo blanco sobre fondo celeste o foto oscura.
   - Uso: portadas con foto de agua, paneles celestes laterales.

**Reglas de placement:**
- Logo + wordmark **siempre en footer derecho** de slides de contenido (margen ~40 px del borde).
- Isotipo solo en portadas, divisores de sección y cierre.
- Espacio mínimo alrededor del logo: equivalente a la altura del isotipo.

### 1.4 Elementos decorativos recurrentes

| Elemento | Cuándo | Cómo |
|---|---|---|
| **Cápsula celeste** (rectángulo redondeado) | Acento sobre títulos en slides de contenido | Esquina superior izquierda, ~5% del ancho |
| **Panel lateral derecho con foto de mar** | Slides de contenido formal y cierre de sección | Banda vertical de ~30% del ancho |
| **Panel lateral derecho sólido `#00ACD4`** | Slides divisoras de sección | Banda vertical de ~30% del ancho |
| **Arco/paréntesis abierto celeste** | Slides de agenda, listados, transición | Lado derecho, abriendo hacia la izquierda |
| **Foto de mar/agua submarina full-bleed** | Portadas y cierres impactantes | Imagen completa con overlay sutil |

**No usar:**
- Líneas decorativas finas bajo títulos (look "AI slop")
- Bandas de color uniformes a todo el ancho
- Fondos crema, beige o cualquier warm-neutral
- Sombras dramáticas o gradientes que no sean los del logo

---

## 2. EMPRESA: DATOS VERIFICADOS

### 2.1 Identidad corporativa

| Campo | Valor | Fuente |
|---|---|---|
| Razón social | Hidalgo & Asociados | hidalgoyasociados.com.ar |
| Año de fundación | **1987** | nosotros/ |
| Antigüedad actual | **39 años** (cumpleaños 1° de mayo) | calculado a fecha actual |
| Sitio web | https://hidalgoyasociados.com.ar | — |
| Versión inglés | https://hidalgoyasociados.com.ar/en | — |
| Email contacto | info_ar@bhidalgo.com.ar | contacto/ |
| Teléfono | +54 11 2284 2031 | contacto/ |
| WhatsApp | wa.me/541122842031 | contacto/ |
| LinkedIn | linkedin.com/company/hidalgo-&-asociados/ | — |
| Facebook | facebook.com/hidalgo.asociados | — |
| Instagram | instagram.com/hidalgoyasociados/ | — |
| División Executive Search | Global Finder (globalfinder.com.ar) | inicio |

### 2.2 Oficinas

| Sede | Dirección | Código postal |
|---|---|---|
| **Pacheco de Melo** (Buenos Aires) | Pacheco de Melo 1833, Piso 6° | C1126AAA |
| **Tucumán** (Buenos Aires) | Tucumán 829, Piso 1° y 5° | C1049AAQ |
| **Neuquén** (Capital) | Fotheringham 478 | — |

### 2.3 Equipo directivo

| Nombre | Rol |
|---|---|
| Bernardo Hidalgo | Presidente |
| Manuel Rossi | CEO |

### 2.4 Servicios (7 áreas)

H&A es una **consultora HR full-stack**, no boutique de payroll.

1. **Payroll y Administración de Personal** (área principal del usuario de la skill)
2. Personal Eventual y Tercerización de Servicios
3. Compensaciones y Proyectos
4. Transición de Carrera y Coaching
5. Selección
6. Capacitación y Desarrollo
7. Evaluaciones

**Cuando el contexto es payroll**, ampliar con:
- Conectividad con SAP, Success Factors, Meta4, PeopleSoft, Workday
- Experiencia en procesos masivos y complejos
- Cobertura: Argentina / Chile / Perú / Uruguay
- Atención personalizada de expertos en nómina
- Conocimiento comprobado en temas laborales, previsionales e impositivos

### 2.5 Datos cuantitativos (cifras reales)

| Dato | Valor | Vigencia / fuente |
|---|---|---|
| Antigüedad | 39 años (desde 1987) | a mayo 2026 |
| Clientes | **+200** | web oficial (hidalgoyasociados.com.ar) |
| Recibos procesados anuales | **+300.000** | proyectado 2026 (basado en dato 2024 del PPT Toyota) |
| Países con presencia | 4 (Argentina, Chile, Perú, Uruguay) | web payroll |
| Sedes | 3 (Pacheco de Melo, Tucumán, Neuquén) | contacto |

**Regla de uso:** siempre citar el dato con el año o vigencia. Ej: *"+300.000 recibos procesados (2026)"*, no *"+300.000 recibos"* a secas.

### 2.6 Valores corporativos (lenguaje oficial)

Usar textual cuando se mencionan los valores en materiales:

1. **Socio estratégico** — Acompañamos y asesoramos a nuestros clientes en los diferentes procesos.
2. **Profesionalismo** — Alto nivel de competencia, excelencia y ética.
3. **Transparencia** — Honestidad y confiabilidad en cada interacción.
4. **Confianza** — Fiabilidad e integridad en cada acción.
5. **Conocimiento del mercado** — Investigación y actualización constante.
6. **Especialización en procesos de RRHH** — Equipo capacitado, soluciones personalizadas.

### 2.7 Tagline oficial

> **"Impulsando espacios de transformación en Recursos Humanos"**

(Confirmado en banner LinkedIn oficial 2026 acompañando al "39 años".)

---

## 3. AUDIENCIA, TONO Y MENSAJE

### 3.1 Audiencias principales

- **Gerentes/Directores de RRHH** de medianas y grandes empresas en Argentina y LATAM.
- **CFOs** evaluando outsourcing de payroll.
- **Multinacionales** que requieren compliance local + reporting global.

### 3.2 Tono de voz

- **Cercano y profesional** — sin jerga contable/técnica innecesaria.
- **Directo, basado en datos** — siempre que se haga una afirmación, sustentarla con cifra o ejemplo.
- **Idioma:** español rioplatense neutro. Usar "vos" en comunicaciones informales internas, "usted/ustedes" en propuestas formales a clientes nuevos, "tú/ustedes" cuando el cliente es de otro país hispanohablante.
- **Bilingüe disponible** — el sitio tiene versión inglés; si el cliente es internacional, ofrecer materiales en inglés.

### 3.3 Pitch en 3 frases (template)

> *Hidalgo & Asociados acompaña a empresas medianas y grandes desde 1987. Procesamos +300.000 recibos al año para más de 200 clientes en Argentina, Chile, Perú y Uruguay. Nos especializamos en convertirnos en socio estratégico de RRHH, no en un proveedor más.*

---

## 4. LAYOUTS OFICIALES POR FORMATO

### 4.1 PPT — Layouts canónicos

| # | Layout | Uso |
|---|---|---|
| **L1** | **Portada full-bleed** con foto de mar/agua submarina + isotipo a la izquierda + cápsula celeste con título a la derecha | Slide 1 de cualquier propuesta |
| **L2** | **Contenido con cápsula** celeste arriba-izquierda como acento de título + cuerpo en columna izquierda (60-70%) + logo+wordmark abajo-derecha | Slides de contenido textual |
| **L3** | **Contenido con banda lateral** de foto de agua a la derecha (~30% del ancho) + título y bullets a la izquierda + logo+wordmark abajo-derecha | Slides con peso narrativo |
| **L4** | **Divisor de sección** con panel celeste sólido a la derecha (~30% del ancho) + isotipo en negativo abajo-derecha | Transición entre secciones |
| **L5** | **Cierre** con isotipo + wordmark centrados arriba + datos de contacto centrados + arco/half-circle celeste decorativo abajo | Última slide |

### 4.2 HTML / Web — Estructura recomendada (materiales externos)

Para materiales web de cara al cliente (propuestas, landing pages, presentaciones online):

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --hya-celeste: #00ACD4;
      --hya-gris: #8C837B;
      --hya-negro: #000000;
      --hya-blanco: #FFFFFF;
    }
    body { font-family: "Source Sans Pro", Arial, sans-serif; color: var(--hya-negro); margin: 0; }
    h1, h2, h3 { color: var(--hya-celeste); font-weight: 700; }
    a { color: var(--hya-celeste); }
  </style>
</head>
<body><!-- contenido --></body>
</html>
```

**Para herramientas web internas (Payroll, validadores, dashboards):** usar el sistema completo de la sección 10, que incluye la paleta digital extendida, dark mode, tipografía de producto (DM Serif Display + Plus Jakarta Sans) y todos los componentes.

### 4.3 PDF — Pauta de armado

- **Página tamaño A4** (210 × 297 mm), márgenes de 25 mm laterales, 20 mm superior/inferior.
- **Header:** isotipo `#00ACD4` arriba-izquierda (alto ~15 mm) + título de documento centrado en gris `#8C837B`.
- **Footer:** texto reducido en gris con número de página, nombre del documento y datos de contacto en una línea (ver sección 5).
- **Cuerpo:** Source Sans Pro 11 pt, interlineado 1.4, títulos celeste H&A 16/14/12 pt.
- **Color de tinta de títulos:** `#00ACD4`.

### 4.4 Word — Pauta de armado

- **Estilos personalizados:**
  - `H&A Título 1` — Source Sans Pro 18 pt Bold, color `#00ACD4`, espacio antes 18 pt / después 6 pt.
  - `H&A Título 2` — Source Sans Pro 14 pt SemiBold, color `#00ACD4`.
  - `H&A Cuerpo` — Source Sans Pro 11 pt Regular, color `#000000`, interlineado múltiple 1.15.
  - `H&A Cita` — Source Sans Pro 11 pt Italic, color `#8C837B`, sangría izquierda 1 cm.
- **Header:** isotipo arriba-izquierda + título del documento.
- **Footer:** ver sección 5.

---

## 5. HEADERS Y FOOTERS — TEMPLATES LISTOS

### 5.1 Footer estándar (HTML)

```html
<footer style="background:#FFFFFF;border-top:1px solid #E7E6E6;padding:32px 40px;color:#8C837B;font-family:'Source Sans Pro',Arial,sans-serif;font-size:13px;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
    <div style="width:36px;height:36px;border-radius:50%;background:#00ACD4;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:700;font-size:14px;">H&amp;A</div>
    <span style="color:#8C837B;font-weight:300;font-size:16px;">Hidalgo &amp; Asociados</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
    <div><strong style="color:#00ACD4;">Pacheco de Melo</strong><br>Pacheco de Melo 1833, Piso 6°<br>C1126AAA — C.A.B.A.</div>
    <div><strong style="color:#00ACD4;">Tucumán</strong><br>Tucumán 829, Piso 1° y 5°<br>C1049AAQ — C.A.B.A.</div>
    <div><strong style="color:#00ACD4;">Neuquén</strong><br>Fotheringham 478<br>Neuquén Capital</div>
    <div><strong style="color:#00ACD4;">Contacto</strong><br>info_ar@bhidalgo.com.ar<br>+54 11 2284 2031</div>
  </div>
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E7E6E6;font-size:11px;">
    Hidalgo &amp; Asociados © 1987–2026. Todos los derechos reservados. — hidalgoyasociados.com.ar
  </div>
</footer>
```

### 5.2 Header estándar (HTML)

```html
<header style="background:#FFFFFF;padding:20px 40px;display:flex;align-items:center;justify-content:space-between;font-family:'Source Sans Pro',Arial,sans-serif;">
  <div style="display:flex;align-items:center;gap:12px;">
    <div style="width:44px;height:44px;border-radius:50%;background:#00ACD4;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:700;font-size:16px;">H&amp;A</div>
    <span style="color:#8C837B;font-weight:300;font-size:18px;">Hidalgo &amp; Asociados</span>
  </div>
  <div style="color:#8C837B;font-size:13px;">Desde 1987 · 39 años acompañando a nuestros clientes</div>
</header>
```

### 5.3 Footer para PDF (texto plano para una línea inferior)

```
Hidalgo & Asociados · Pacheco de Melo 1833 6° / Tucumán 829 1°-5° / Fotheringham 478 Neuquén · info_ar@bhidalgo.com.ar · +54 11 2284 2031 · hidalgoyasociados.com.ar · Página X de Y
```

### 5.4 Header para PDF (línea superior)

```
[ISOTIPO]  Hidalgo & Asociados  ·  [Título del documento]  ·  [Fecha]
```

### 5.5 Footer para Word

Insertar como footer de página:
- Línea 1: `Hidalgo & Asociados — info_ar@bhidalgo.com.ar — +54 11 2284 2031`
- Línea 2: `Pacheco de Melo 1833 6° · Tucumán 829 1°-5° · Fotheringham 478 Neuquén`
- Línea 3 (alineada derecha): `Página X de Y`
- Color del texto del footer: `#8C837B`, tamaño 9 pt, Source Sans Pro Light.

### 5.6 Header para Word

Insertar como header de página:
- Isotipo H&A arriba-izquierda (alto 12 mm).
- Título del documento centrado, Source Sans Pro Bold 11 pt, color `#00ACD4`.
- Línea horizontal de 0.5 pt color `#E7E6E6` debajo.

### 5.7 Aviso de seguridad de datos (obligatorio en HTML interactivos)

Insertar antes de cualquier formulario o campo de input en HTML:

```html
<div style="background:#FFF8E1;border-left:4px solid #00ACD4;padding:12px 16px;margin:16px 0;font-family:'Source Sans Pro',Arial,sans-serif;font-size:13px;color:#5D4037;">
  <strong style="color:#00ACD4;">⚠ Aviso de privacidad:</strong>
  Por seguridad, no subas información personal de empleados o clientes a este formulario o herramienta. Usá datos de prueba o anonimizados.
</div>
```

---

## 6. INTEGRACIONES Y VENDORS ALIADOS

H&A trabaja con socios tecnológicos. **No son marca H&A**, son herramientas. En slides dedicadas a un vendor se respeta su paleta; en cualquier otro contexto se usa la paleta H&A.

| Vendor | Función | Paleta propia |
|---|---|---|
| **monday.com** | Gestión de tareas y proyectos | Lavanda `#6161FF`, oscuro `#2C2C83`, fondo `#F2F3FE` |
| **AxtonIT** | Integración de sistemas y oficina digital | Paleta propia (mantener en slides AxtonIT) |
| **DataOK** (Loopsys) | Bot de QA payroll automatizado — diferenciador exclusivo del área Payroll | Paleta propia |

**Importante sobre DataOK:** mencionarlo **únicamente** en materiales del área de Payroll y Administración de Personal. No es un diferenciador transversal de H&A; es un activo específico de la práctica de payroll. En materiales de Selección, Capacitación, Coaching, etc. **no incluir** referencias a DataOK.

**Regla:** logos de vendors siempre con fondo blanco o sobre cápsula celeste, nunca rotados ni alterados en color.

---

## 7. CHECKLIST DE QA PRE-ENTREGA

Antes de mandar cualquier entregable con marca H&A, verificar:

- [ ] Celeste exacto `#00ACD4` (no `#18B7E8`, no otros celestes)
- [ ] Gris wordmark exacto `#8C837B`
- [ ] No hay verdes, naranjas, lavandas u otros colores como "marca H&A"
- [ ] Source Sans Pro o Arial fallback (consistente en todo el documento)
- [ ] Logo presente en footer (slides de contenido) o header (HTML/PDF/Word)
- [ ] Datos verificados: 39 años, +200 clientes, +300.000 recibos (2026), 1987 fundación
- [ ] Las 3 sedes mencionadas si aplica (Pacheco de Melo / Tucumán / Neuquén)
- [ ] Email y teléfono correctos: info_ar@bhidalgo.com.ar / +54 11 2284 2031
- [ ] Tono cercano y profesional, sin jerga
- [ ] Idioma español argentino (o inglés si la audiencia lo requiere)
- [ ] HTML interactivos: aviso de seguridad de datos visible antes de cualquier input
- [ ] Footer y header coherentes con templates de sección 5

---

## 8. PREFERENCIAS DEL USUARIO DE LA SKILL (Guille)

- **Rol:** Payroll, IT & Implementation Manager en H&A · monday.com Certified Partner.
- **Estilo de respuestas:** clasificaciones del 1 al 10 para elegir entre opciones, citar fuentes reales (no suposiciones), datos reales con vigencia y año.
- **Idioma:** español argentino, tono directo y eficiente.
- **Brainstorming antes de código:** validar objetivo principal del chat antes de generar artifacts.
- **Aclaración obligatoria en todo HTML interactivo:** "no subir información personal de empleados o clientes".

---

## 9. ASSETS OFICIALES POR URL

Estos assets están publicados en el sitio oficial `hidalgoyasociados.com.ar` y pueden referenciarse directamente desde HTML, emails, Word (con campo de imagen vinculada) o cualquier documento que admita carga remota. Cuando el entorno no permita cargar imágenes externas (ej. PDF generado en sandbox sin red, slides offline, cliente de email que bloquea remote images), usar el **fallback CSS** de la sección 9.4.

### 9.1 Logos

| Asset | URL | Uso recomendado |
|---|---|---|
| **Logo principal** (header del sitio) | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/logo-hidalgo-main.png` | Header de documentos, firma de email, papelería |
| **Isotipo** (círculo H&A solo) | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/ha-iso.png` | Avatares, favicons, footers compactos, marcadores |
| **Logo wordmark** (alternativo) | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/logo-ha.png` | Cierre de documento, slide final, watermark |

### 9.2 Imágenes corporativas

| Asset | URL | Uso recomendado |
|---|---|---|
| **Imagen destacada** (1280×720) | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/destacada-hya.png` | OG/Twitter image en HTML, hero de portada |
| **Imagen destacada** (1024×576) | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/destacada-hya-1024x576.png` | Versión más liviana para email/blog |

### 9.3 Línea de tiempo institucional (4 piezas, página /nosotros/)

| Asset | URL |
|---|---|
| Timeline 1 | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/linea-tiempo1b.png` |
| Timeline 2 | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/linea-tiempo2b.png` |
| Timeline 3 | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/linea-tiempo3b.png` |
| Timeline 4 | `https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/linea-tiempo4b.png` |

**Uso:** secciones de historia/trayectoria de la empresa. Las 4 piezas se muestran horizontalmente en la página oficial; replicar ese mismo layout cuando se reutilicen.

### 9.4 Fallback CSS — Isotipo H&A reconstruido en HTML/CSS puro

Cuando la URL del logo no se puede cargar, reemplazar la `<img>` por este bloque equivalente:

**Versión 36 px (footer compacto):**
```html
<div style="width:36px;height:36px;border-radius:50%;background:#00ACD4;display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-family:'Source Sans Pro',Arial,sans-serif;font-weight:700;font-size:14px;letter-spacing:-0.5px;">H&amp;A</div>
```

**Versión 48 px (header estándar):**
```html
<div style="width:48px;height:48px;border-radius:50%;background:#00ACD4;display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-family:'Source Sans Pro',Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:-0.5px;">H&amp;A</div>
```

**Versión 96 px (portada/hero):**
```html
<div style="width:96px;height:96px;border-radius:50%;background:#00ACD4;display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-family:'Source Sans Pro',Arial,sans-serif;font-weight:700;font-size:36px;letter-spacing:-1px;">H&amp;A</div>
```

**Versión con wordmark al lado** (logo + "Hidalgo & Asociados"):
```html
<div style="display:inline-flex;align-items:center;gap:12px;font-family:'Source Sans Pro',Arial,sans-serif;">
  <div style="width:44px;height:44px;border-radius:50%;background:#00ACD4;display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:700;font-size:16px;letter-spacing:-0.5px;">H&amp;A</div>
  <span style="color:#8C837B;font-weight:300;font-size:18px;">Hidalgo &amp; Asociados</span>
</div>
```

### 9.5 Patrón URL + fallback combinado (recomendado)

```html
<img src="https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/ha-iso.png"
     alt="Hidalgo & Asociados" width="48" height="48" style="border-radius:50%;"
     onerror="this.outerHTML='<div style=&quot;width:48px;height:48px;border-radius:50%;background:#00ACD4;display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-family:Source Sans Pro,Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:-0.5px;&quot;>H&amp;A</div>'">
```

### 9.6 Uso por formato de salida

| Formato | Recomendación |
|---|---|
| **HTML web/email moderno** | URL directa (sección 9.1–9.3) |
| **HTML email cliente conservador** (Outlook viejo, Gmail con imágenes bloqueadas) | Patrón combinado (sección 9.5) |
| **PDF generado con librería** | Descargar la URL primero a disco y embeber el binario; si no hay red, usar fallback CSS |
| **Word (.docx)** | Insertar imagen vinculada desde URL, o descargar y embeber |
| **PPT** | Descargar la URL al disco y embeber el PNG en la slide. No usar imagen vinculada |
| **Markdown** | URL directa con `![alt](url)` |

---

## 10. HERRAMIENTAS WEB INTERNAS DE PAYROLL — SISTEMA DE DISEÑO DIGITAL

> Esta sección es la referencia canónica para diseñar **cualquier herramienta web interna del equipo de Payroll**: validadores, dashboards, reportes interactivos, portales internos. La app de referencia es el **Validador de Recibos** (`https://willyesposito.github.io/validadorrecibos/`), de la cual se extrae todo este sistema.

### 10.1 Filosofía de diseño para herramientas internas

Las herramientas de Payroll son **apps de revisión de datos**. El operador carga archivos, un motor los procesa, y la app muestra resultados para que se encuentren y resuelvan diferencias. El diseño responde a eso:

- **Errores primero:** al finalizar el procesamiento, si hay problemas el filtro activo es `ERROR`. La app lleva directo a los problemas, no al resumen.
- **Flujo lineal fijo:** Cargar → Procesar → Revisar diferencias → Exportar → Siguiente cliente.
- **Densidad con jerarquía:** mucha data, pero ordenada. Cada pixel tiene una función.
- **Privacidad siempre visible:** comunicar que el procesamiento es 100% local antes de cualquier input.
- **Dark mode de primera clase:** toggle persistido en `localStorage`, contraste AA en ambos temas.

### 10.2 Tipografía para herramientas internas

```html
<!-- Cargar en el <head>, antes de cualquier CSS -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
```

| Rol | Fuente | Uso concreto |
|-----|--------|-------------|
| Display / números grandes | `DM Serif Display` 400 | H1, KPI numbers, nombres de sección |
| Cuerpo / UI | `Plus Jakarta Sans` 400–800 | Todo lo operativo |
| Fallback | `Source Sans Pro`, `Arial` | Siempre en la pila |

```css
--font:  'Plus Jakarta Sans', 'Source Sans Pro', system-ui, Arial, sans-serif;
--serif: 'DM Serif Display', Georgia, 'Times New Roman', serif;
```

### 10.3 Tokens CSS completos (modo claro)

Pegar este bloque en `:root` de cada herramienta interna. **No inventar colores fuera de aquí.**

```css
:root {
  /* Marca */
  --celeste:        #00ACD4;
  --celeste-dark:   #0090B4;
  --celeste-deeper: #007896;
  --celeste-dim:    rgba(0, 172, 212, 0.10);
  --celeste-border: rgba(0, 172, 212, 0.30);
  --gris:           #8C837B;

  /* Texto */
  --ink:   #15263D;   /* serif display / títulos fuertes */
  --t1:    #1E3A5F;   /* texto principal */
  --t2:    #4A6080;   /* texto secundario */
  --t3:    #8FA3BA;   /* terciario / placeholders */

  /* Superficies */
  --paper:     #FCFCFB;   /* fondo de página (cálido casi blanco) */
  --white:     #FFFFFF;   /* superficie de cards */
  --line:      #E7E6E6;   /* hairline estándar */
  --line-soft: #EFEEEC;   /* hairline sutil */

  /* Estado */
  --ok:      #22C55E;   --ok-bg:      rgba(34,197,94,0.10);    --ok-bd:      rgba(34,197,94,0.30);    --ok-tx:      #177A50;
  --warn:    #F59E0B;   --warn-bg:    rgba(245,158,11,0.12);   --warn-bd:    rgba(245,158,11,0.32);   --warn-tx:    #9A5A0B;
  --error:   #E85518;   --error-bg:   rgba(232,85,24,0.10);    --error-bd:   rgba(232,85,24,0.30);    --error-tx:   #C0420F;
  --neutral: #8C837B;   --neutral-bg: rgba(140,131,123,0.12);  --neutral-bd: rgba(140,131,123,0.30);  --neutral-tx: #6B635C;

  /* Espaciado, radios, sombras */
  --r-sm:       8px;
  --r:          14px;
  --r-full:     9999px;
  --sh-sm:      0 1px 4px rgba(30,58,95,0.06);
  --sh:         0 6px 24px rgba(30,58,95,0.09);
  --sh-celeste: 0 8px 28px rgba(0,172,212,0.18);

  /* Animación */
  --ease: cubic-bezier(.4, 0, .2, 1);
  --t:    0.22s;

  /* Fuentes */
  --font:  'Plus Jakarta Sans', 'Source Sans Pro', system-ui, Arial, sans-serif;
  --serif: 'DM Serif Display', Georgia, 'Times New Roman', serif;

  /* Layout */
  --hdr-h: 73px;   /* alto del header sticky — para thead sticky */
}
```

### 10.4 Dark mode

El toggle de tema debe estar en el primer `<script>` inline del `<head>` (antes de que el navegador pinte el body, evita flash de color incorrecto):

```html
<script>
(function(){
  var t = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (t === 'dark') document.documentElement.setAttribute('data-theme','dark');
})();
</script>
```

Toggle del botón (en el body):
```js
btn.addEventListener('click', function(){
  var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});
```

Override de variables en dark mode (pegar en el CSS después de `:root`):

```css
[data-theme="dark"] {
  color-scheme: dark;
  --celeste:        #1FBEE0;
  --celeste-dark:   #16A6C6;
  --celeste-deeper: #5AD2EE;
  --celeste-dim:    rgba(31,190,224,0.14);
  --celeste-border: rgba(31,190,224,0.34);
  --gris:           #9FB1C2;
  --ink:       #EAF1F8;
  --t1:        #DCE6F0;
  --t2:        #92A6BC;
  --t3:        #5F758D;
  --paper:     #0B1521;
  --white:     #111E2C;
  --line:      #23364A;
  --line-soft: #1A2837;
  --ok-bg:      rgba(34,197,94,0.15);   --ok-bd:      rgba(34,197,94,0.36);   --ok-tx:      #4ADE80;
  --warn-bg:    rgba(245,158,11,0.15);  --warn-bd:    rgba(245,158,11,0.36);  --warn-tx:    #FBBF24;
  --error-bg:   rgba(232,85,24,0.16);   --error-bd:   rgba(232,85,24,0.42);   --error-tx:   #FB8254;
  --neutral-bg: rgba(140,131,123,0.18); --neutral-bd: rgba(140,131,123,0.34); --neutral-tx: #B6ABA0;
  --sh-sm:      0 1px 4px rgba(0,0,0,0.40);
  --sh:         0 8px 28px rgba(0,0,0,0.50);
  --sh-celeste: 0 8px 28px rgba(31,190,224,0.22);
}
/* Colores hardcodeados que las variables no alcanzan */
[data-theme="dark"] .hdr         { background: rgba(11,21,33,0.85); }
[data-theme="dark"] thead th     { background: #16263A; box-shadow: inset 0 -1.5px 0 var(--line); }
[data-theme="dark"] tbody tr.row:hover { background: rgba(255,255,255,0.03); }
[data-theme="dark"] .di          { background: rgba(255,255,255,0.025); }
```

### 10.5 Reset base y layout

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; color-scheme: light; }
body {
  background: var(--paper); color: var(--t1);
  font-family: var(--font); line-height: 1.55; min-height: 100vh;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  transition: background var(--t) var(--ease), color var(--t) var(--ease);
}
.num { font-variant-numeric: tabular-nums; }

/* Layout principal */
.main { max-width: 1280px; margin: 0 auto; padding: 0 40px; }
@media (max-width: 640px) { .hdr-in, .main { padding: 0 22px; } }
```

### 10.6 Componente: Header sticky con glassmorphism

```html
<header class="hdr">
  <div class="hdr-in">
    <div class="hdr-brand">
      <img src="logo.png" alt="H&amp;A" width="42" height="42" style="border-radius:50%;flex:none;">
      <div class="wm">
        <b>Hidalgo <span class="amp">&amp;</span> Asociados</b>
        <span>Nombre de la herramienta</span>
      </div>
    </div>
    <!-- Badge de contexto (opcional) -->
    <div class="hdr-r">
      <span class="dot"></span>
      Procesamiento 100% local
    </div>
    <!-- Toggle dark/light -->
    <button class="btn-theme" id="btn-theme" aria-label="Cambiar tema">
      <svg class="ico-sun" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      <svg class="ico-moon" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</header>
```

```css
.hdr {
  background: rgba(252,252,251,0.85); border-bottom: 1px solid var(--line);
  padding: 15px 0; position: sticky; top: 0; z-index: 50;
  backdrop-filter: saturate(180%) blur(8px);
}
.hdr-in { max-width: 1280px; margin: 0 auto; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.hdr-brand { display: flex; align-items: center; gap: 13px; }
.wm { display: flex; flex-direction: column; line-height: 1.25; }
.wm b { font-weight: 700; font-size: 1rem; color: var(--ink); letter-spacing: -0.01em; }
.wm b .amp { color: var(--gris); font-weight: 400; font-style: italic; }
.wm span { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--celeste); }
.hdr-r { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; color: var(--t2); text-transform: uppercase; border: 1px solid var(--line); border-radius: var(--r-full); padding: 7px 15px; background: var(--white); }
.hdr-r .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex: none; }
.btn-theme { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 38px; height: 38px; border-radius: var(--r-full); border: 1px solid var(--line); background: var(--white); color: var(--t2); cursor: pointer; transition: border-color var(--t) var(--ease), color var(--t) var(--ease); }
.btn-theme:hover { border-color: var(--celeste); color: var(--celeste); }
.btn-theme .ico-sun { display: none; }
[data-theme="dark"] .btn-theme .ico-moon { display: none; }
[data-theme="dark"] .btn-theme .ico-sun  { display: block; }
```

### 10.7 Componente: Hero panel (2 columnas)

Pantalla de bienvenida y carga de archivos. La columna izquierda describe la herramienta; la derecha tiene el input de contexto (nombre de cliente) y la guía de pasos.

```css
.hero {
  display: grid; grid-template-columns: 1.5fr 1fr; gap: 0; margin-top: 18px;
  background: var(--white); border: 1px solid var(--line); border-radius: var(--r);
  box-shadow: var(--sh-sm); overflow: hidden;
}
@media (max-width: 860px) { .hero { grid-template-columns: 1fr; } }
.hero-l { padding: 24px 30px 22px; display: flex; flex-direction: column; }
.hero-eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--celeste); margin-bottom: 12px; }
.hero h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(1.5rem, 2.4vw, 2.05rem); line-height: 1.06; color: var(--ink); letter-spacing: -0.01em; }
.hero h1 .accent { color: var(--celeste); }
.hero-sub { margin-top: 9px; font-size: 0.9rem; line-height: 1.5; color: var(--t2); text-wrap: pretty; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: auto; padding-top: 16px; }
.hero-meta .mi { display: inline-flex; align-items: center; gap: 8px; font-size: 0.84rem; color: var(--t2); font-weight: 600; }
.hero-meta .mi .bullet { width: 7px; height: 7px; border-radius: 50%; background: var(--celeste); flex: none; }
.hero-meta .mi b { color: var(--ink); font-weight: 800; }
.hero-r { position: relative; padding: 22px 26px; border-left: 1px solid var(--line); background: linear-gradient(180deg, rgba(0,172,212,0.035), rgba(0,172,212,0) 60%); display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
/* Arcos decorativos celestes (SVG, posición: absolute right:-48px bottom:-42px opacity:0.2) */
/* Campo de contexto (nombre de cliente) */
.cli-l { display: block; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--celeste); margin-bottom: 8px; }
.cli-input { width: 100%; padding: 11px 14px; border: 1px solid var(--line); border-radius: var(--r-sm); font-family: inherit; font-size: 0.96rem; font-weight: 700; color: var(--ink); background: var(--white); outline: none; transition: border-color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.cli-input:focus { border-color: var(--celeste); box-shadow: 0 0 0 3px var(--celeste-dim); }
.cli-hint { font-size: 0.73rem; color: var(--t3); margin-top: 7px; }
/* Pasos de uso */
.hero-steps { display: flex; flex-direction: column; gap: 9px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
.hstep { display: flex; align-items: baseline; gap: 12px; }
.hstep .hs-no { font-family: var(--serif); font-size: 1.05rem; color: var(--celeste); line-height: 1; min-width: 1.5em; }
.hstep .hs-tx { font-size: 0.85rem; color: var(--t2); line-height: 1.35; }
.hstep .hs-tx b { color: var(--ink); font-weight: 700; }
```

### 10.8 Componente: Aviso de privacidad (obligatorio)

```html
<div class="privacy">
  <span class="lock" aria-hidden="true"><!-- SVG candado --></span>
  <p><b>Privacidad:</b> esta herramienta procesa los archivos <b>100% en tu navegador</b>.
  Ningún dato se sube a internet ni a ningún servidor — todo el cálculo ocurre en tu equipo.</p>
</div>
```

```css
.privacy { display: flex; gap: 14px; align-items: flex-start; background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 11px 16px; box-shadow: var(--sh-sm); }
.privacy .lock { flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--celeste-dim); color: var(--celeste); display: inline-flex; align-items: center; justify-content: center; }
.privacy p { font-size: 0.86rem; color: var(--t2); line-height: 1.5; }
.privacy b { color: var(--ink); font-weight: 700; }
```

### 10.9 Componente: Bloque/sección numerada

Encabezado de sección con número serif grande, eyebrow celeste, título y separador hairline.

```css
.block { padding: 20px 0 0; }
.block-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 18px; }
.block-no { font-family: var(--serif); font-weight: 400; font-size: 1.9rem; line-height: 0.8; color: var(--t3); flex: none; min-width: 1.5em; }
.block-titles .eyebrow { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--celeste); margin-bottom: 3px; }
.block-titles h2 { font-family: var(--serif); font-weight: 400; font-size: 1.35rem; color: var(--ink); letter-spacing: -0.01em; line-height: 1.1; }
.block-rule { flex: 1; height: 1px; background: var(--line); align-self: center; }
```

### 10.10 Componente: Dropzones de carga de archivos

Estados: normal → `.drag` (arrastrando encima) → `.filled` (archivos cargados). El ícono cambia de celeste a verde al estar llena.

```css
.dropzones { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 720px) { .dropzones { grid-template-columns: 1fr; } }
.dz { position: relative; border: 1.5px dashed var(--line); background: var(--white); border-radius: var(--r); padding: 20px; text-align: center; cursor: pointer; transition: border-color var(--t) var(--ease), background var(--t) var(--ease), box-shadow var(--t) var(--ease), transform var(--t) var(--ease); }
.dz:hover  { border-color: var(--celeste-border); box-shadow: var(--sh); transform: translateY(-2px); }
.dz.drag   { border-color: var(--celeste); border-style: solid; background: var(--celeste-dim); }
.dz.filled { border-style: solid; border-color: var(--ok-bd); background: var(--ok-bg); }
.dz input[type=file] { display: none; }
.dz .dz-ico { width: 50px; height: 50px; border-radius: 50%; margin: 0 auto 12px; background: var(--celeste-dim); color: var(--celeste); display: inline-flex; align-items: center; justify-content: center; transition: background var(--t), color var(--t); }
.dz.filled .dz-ico { background: rgba(34,197,94,0.14); color: var(--ok-tx); }
.dz .dz-title { font-weight: 700; font-size: 1.02rem; color: var(--ink); }
.dz .dz-hint  { font-size: 0.8rem; color: var(--t3); margin-top: 5px; }
.dz .dz-files { font-size: 0.83rem; color: var(--ok-tx); margin-top: 9px; font-weight: 700; word-break: break-word; }
```

### 10.11 Componente: Botones

**Regla absoluta:** siempre `border-radius: var(--r-full)` (pill). Nunca cuadrados ni levemente redondeados.

```css
.btn { display: inline-flex; align-items: center; gap: 8px; border-radius: var(--r-full); font-family: inherit; font-weight: 700; letter-spacing: 0.01em; cursor: pointer; border: none; white-space: nowrap; transition: background var(--t) var(--ease), box-shadow var(--t) var(--ease), opacity var(--t) var(--ease), border-color var(--t) var(--ease), color var(--t) var(--ease); }
.btn-primary  { background: var(--celeste); color: #fff; padding: 13px 30px; font-size: 0.95rem; }
.btn-primary:hover:not(:disabled) { background: var(--celeste-dark); box-shadow: var(--sh-celeste); }
.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-ghost    { background: transparent; border: 1px solid var(--line); color: var(--t2); padding: 9px 18px; font-size: 0.85rem; }
.btn-ghost:hover { border-color: var(--celeste); color: var(--celeste); }
.btn-export   { background: var(--white); border: 1px solid var(--line); color: var(--ink); padding: 9px 16px; font-size: 0.82rem; }
.btn-export:hover { border-color: var(--celeste); color: var(--celeste-deeper); box-shadow: var(--sh-sm); }
.btn-sm { padding: 8px 16px; font-size: 0.82rem; }
```

### 10.12 Componente: Barra de progreso con spinner

Controlar mostrando/ocultando `.progress.show`. La barra avanza con `pbarFill.style.width = pct + '%'`.

```css
.progress { display: none; align-items: center; gap: 16px; padding: 22px 0; margin-top: 24px; border-top: 1px solid var(--line-soft); }
.progress.show { display: flex; }
.spinner { width: 28px; height: 28px; border-radius: 50%; flex: none; border: 3px solid var(--celeste-dim); border-top-color: var(--celeste); animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.pgr { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.ptop { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ptxt { font-size: 0.95rem; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppct { font-size: 0.95rem; font-weight: 800; color: var(--celeste-deeper); font-variant-numeric: tabular-nums; flex: none; }
.pbar { height: 8px; background: var(--line-soft); border-radius: 5px; overflow: hidden; }
.pbar > span { display: block; height: 100%; width: 0; background: var(--celeste); border-radius: 5px; transition: width 0.2s var(--ease); }
```

### 10.13 Componente: Banner de error

```css
.errbanner { display: none; gap: 12px; align-items: flex-start; background: var(--error-bg); border: 1px solid var(--error-bd); border-radius: var(--r); padding: 15px 18px; margin-top: 24px; font-size: 0.9rem; color: var(--error-tx); }
.errbanner.show { display: flex; }
```

### 10.14 Componente: Panel de veredicto

Aparece al inicio de la sección de resultados. Variantes de clase: `v-ok` / `v-warn` / `v-error`.

```css
.verdict { display: flex; align-items: center; gap: 16px; border-radius: var(--r); padding: 18px 22px; margin-bottom: 18px; border: 1px solid var(--line); }
.verdict .v-ico { width: 46px; height: 46px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 700; }
.verdict .v-title { font-family: var(--serif); font-weight: 400; font-size: 1.5rem; line-height: 1.05; color: var(--ink); letter-spacing: -0.01em; }
.verdict .v-title b { font-family: var(--font); font-weight: 800; }
.verdict .v-sub { font-size: 0.86rem; color: var(--t2); margin-top: 4px; }
.verdict.v-error { background: var(--error-bg); border-color: var(--error-bd); }
.verdict.v-error .v-ico { background: var(--error); color: #fff; }
.verdict.v-error .v-title b { color: var(--error-tx); }
.verdict.v-warn  { background: var(--warn-bg);  border-color: var(--warn-bd); }
.verdict.v-warn  .v-ico { background: var(--warn);  color: #fff; }
.verdict.v-warn  .v-title b { color: var(--warn-tx); }
.verdict.v-ok    { background: var(--ok-bg);    border-color: var(--ok-bd); }
.verdict.v-ok    .v-ico { background: var(--ok);    color: #fff; }
.verdict.v-ok    .v-title b { color: var(--ok-tx); }
```

### 10.15 Componente: Tira de contexto de corrida

```css
.runctx { display: flex; flex-wrap: wrap; border: 1px solid var(--line); border-radius: var(--r); background: var(--white); padding: 4px; margin-bottom: 22px; box-shadow: var(--sh-sm); }
.rc { display: flex; flex-direction: column; gap: 2px; padding: 8px 18px; }
.rc + .rc { border-left: 1px solid var(--line-soft); }
.rc-l { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--t3); }
.rc-v { font-size: 0.88rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.rc-v.celeste { color: var(--celeste-deeper); }
```

### 10.16 Componente: KPI cards (filtros clicables)

Grid de 4 tarjetas. Click filtra la tabla. El card activo muestra una stripe de color en el tope.

```css
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
@media (max-width: 700px) { .cards { grid-template-columns: repeat(2, 1fr); } }
.kpi { position: relative; padding: 18px 20px 16px; cursor: pointer; background: var(--white); border: 1px solid var(--line); border-radius: var(--r); transition: border-color var(--t) var(--ease), box-shadow var(--t) var(--ease), transform var(--t) var(--ease); }
.kpi::before { content: ""; position: absolute; left: 16px; right: 16px; top: 0; height: 3px; background: var(--celeste); border-radius: 0 0 3px 3px; opacity: 0; transition: opacity var(--t) var(--ease); }
.kpi:hover { box-shadow: var(--sh); transform: translateY(-2px); border-color: var(--celeste-border); }
.kpi.active { border-color: var(--ink); box-shadow: var(--sh); }
.kpi.active::before { opacity: 1; }
.kpi.active.k-error::before { background: var(--error); }
.kpi.active.k-warn::before  { background: var(--warn); }
.kpi.active.k-ok::before    { background: var(--ok); }
.kpi-l { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--t3); margin-bottom: 8px; }
.kpi-n { font-family: var(--serif); font-weight: 400; font-size: 2.7rem; line-height: 0.9; letter-spacing: -0.01em; }
.kpi-d { font-size: 0.72rem; color: var(--t3); margin-top: 8px; }
.kpi-n.c-total { color: var(--ink); }
.kpi-n.c-ok    { color: var(--ok-tx); }
.kpi-n.c-error { color: var(--error-tx); }
.kpi-n.c-warn  { color: var(--warn-tx); }
```

### 10.17 Componente: Chips de categoría (filtro por tipo)

```css
.catchips { display: none; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 18px; }
.catchips.show { display: flex; }
.catchip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: var(--r-full); border: 1px solid var(--line); background: var(--white); color: var(--t1); font-family: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: border-color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.catchip:hover { border-color: var(--celeste-border); box-shadow: var(--sh-sm); }
.catchip .cc-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.catchip .cc-n { font-weight: 800; padding: 1px 8px; border-radius: var(--r-full); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.catchip.sev-error   .cc-dot { background: var(--error); }
.catchip.sev-error   .cc-n  { background: var(--error-bg); color: var(--error-tx); }
.catchip.sev-warn    .cc-dot { background: var(--warn); }
.catchip.sev-warn    .cc-n  { background: var(--warn-bg); color: var(--warn-tx); }
.catchip.sev-neutral .cc-dot { background: var(--neutral); }
.catchip.sev-neutral .cc-n  { background: var(--neutral-bg); color: var(--neutral-tx); }
.catchip.active { border-color: var(--ink); }
.catchip.active.sev-error   { border-color: var(--error); }
.catchip.active.sev-warn    { border-color: var(--warn); }
.catchip.active.sev-neutral { border-color: var(--neutral-tx); }
```

### 10.18 Componente: Panel de causa raíz (ranking con barras)

Cuando un mismo código afecta a varios registros, este panel lo muestra como ranking clicable para filtrar la tabla.

```css
.conceptos { display: none; background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 16px 20px; margin-bottom: 22px; box-shadow: var(--sh-sm); }
.conceptos.show { display: block; }
.conceptos .cn-title { font-family: var(--serif); font-weight: 400; font-size: 1.05rem; color: var(--ink); letter-spacing: -0.01em; }
.conceptos .cn-row { display: flex; align-items: center; gap: 12px; padding: 5px 8px; margin: 0 -8px; cursor: pointer; border-radius: var(--r-sm); transition: background var(--t) var(--ease); }
.conceptos .cn-row:hover, .conceptos .cn-row.active { background: var(--celeste-dim); }
.conceptos .cn-code { font-variant-numeric: tabular-nums; font-size: 0.78rem; color: var(--t3); width: 54px; flex: none; font-weight: 700; }
.conceptos .cn-name { font-size: 0.85rem; color: var(--t2); width: 168px; flex: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conceptos .cn-bar  { flex: 1; height: 9px; background: var(--line-soft); border-radius: 5px; overflow: hidden; }
.conceptos .cn-bar > span { display: block; height: 100%; background: var(--celeste); border-radius: 5px; }
.conceptos .cn-row.active .cn-bar > span { background: var(--celeste-deeper); }
.conceptos .cn-n { font-weight: 800; font-variant-numeric: tabular-nums; width: 88px; text-align: right; flex: none; color: var(--ink); font-size: 0.82rem; }
```

### 10.19 Componente: Tabla densa con thead sticky y filas expandibles

```css
.tw { border-radius: var(--r); border: 1px solid var(--line); background: var(--white); box-shadow: var(--sh-sm); overflow: visible; }
@media (max-width: 1100px) { .tw { overflow-x: auto; } }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
thead th { position: sticky; top: var(--hdr-h); z-index: 10; background: #F7F9FB; padding: 11px 14px; text-align: left; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--t3); white-space: nowrap; cursor: pointer; user-select: none; box-shadow: inset 0 -1.5px 0 var(--line); }
@media (max-width: 1100px) { thead th { position: static; } }
th.r { text-align: right; } th.c { text-align: center; }
th .si { opacity: 0.3; margin-left: 3px; }
th.sorted .si { opacity: 0.9; color: var(--celeste); }
th.sorted { color: var(--ink); }
tbody tr { border-bottom: 1px solid var(--line-soft); transition: background 0.1s; }
tbody tr.row:hover { background: #FAFCFE; }
/* Stripe de estado en borde izquierdo */
tbody tr.s-error { box-shadow: inset 3px 0 0 var(--error); }
tbody tr.s-error:hover { background: rgba(232,85,24,0.04); }
tbody tr.s-warn  { box-shadow: inset 3px 0 0 var(--warn); }
tbody tr.s-sinpar { box-shadow: inset 3px 0 0 var(--neutral); }
td { padding: 9px 14px; vertical-align: middle; }
td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.c { text-align: center; }
/* Pills de estado */
.pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 11px; border-radius: var(--r-full); font-size: 0.71rem; font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
.p-ok     { background: var(--ok-bg);      color: var(--ok-tx);      border-color: var(--ok-bd); }
.p-error  { background: var(--error-bg);   color: var(--error-tx);   border-color: var(--error-bd); }
.p-warn   { background: var(--warn-bg);    color: var(--warn-tx);    border-color: var(--warn-bd); }
.p-sinpar { background: var(--neutral-bg); color: var(--neutral-tx); border-color: var(--neutral-bd); }
/* Mini tags en el nombre del empleado (fila principal) */
.nom-tag { display: inline-block; font-size: 0.63rem; font-weight: 700; padding: 1px 7px; border-radius: 5px; white-space: nowrap; }
.nom-tag.sev-error   { background: var(--error-bg);   color: var(--error-tx); }
.nom-tag.sev-warn    { background: var(--warn-bg);    color: var(--warn-tx); }
.nom-tag.sev-neutral { background: var(--neutral-bg); color: var(--neutral-tx); }
/* Badge de tipo de hallazgo en fila de detalle */
.ht { display: inline-block; padding: 2px 9px; border-radius: 5px; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
/* Triángulo de expansión de fila */
.xi { color: var(--t3); font-size: 0.7rem; transition: transform 0.15s; display: inline-block; }
tr.open .xi { transform: rotate(90deg); color: var(--celeste); }
/* Fila de detalle */
tr.dr td { padding: 0; }
.di { padding: 14px 22px 16px 30px; background: #FAFCFE; display: none; }
tr.dr.open .di { display: block; }
.dt { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.dt th { font-size: 0.62rem; padding: 7px 11px; border-bottom: 1px solid var(--line); background: none; box-shadow: none; position: static; color: var(--t3); cursor: default; }
.dt td { padding: 7px 11px; border-bottom: 1px solid var(--line-soft); }
.dt tr:last-child td { border-bottom: none; }
/* Estado vacío */
.empty { text-align: center; padding: 52px 24px; color: var(--t3); }
.empty strong { display: block; font-family: var(--serif); font-weight: 400; font-size: 1.4rem; color: var(--ink); margin-bottom: 6px; }
```

### 10.20 Componente: Barra compacta post-procesamiento (Runbar)

Reemplaza la zona de carga después de validar. Muestra resumen + acciones.

```css
.runbar { display: flex; align-items: center; gap: 12px; background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 16px; box-shadow: var(--sh-sm); }
.runbar .rb-ico { width: 34px; height: 34px; border-radius: 50%; flex: none; background: rgba(34,197,94,0.14); color: var(--ok-tx); display: inline-flex; align-items: center; justify-content: center; }
.runbar .rb-files { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.runbar .rb-sep { width: 1px; align-self: stretch; background: var(--line-soft); flex: none; margin: 2px 0; }
.runbar .rb-l { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--t3); }
.runbar .rb-v { font-size: 0.88rem; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.runbar .rb-count { font-size: 0.82rem; color: var(--t2); font-weight: 600; white-space: nowrap; flex: none; }
.runbar .rb-count b { color: var(--ink); font-weight: 800; }
```

### 10.21 Footer para herramientas internas

```css
.foot { border-top: 1px solid var(--line); padding: 38px 0 46px; color: var(--gris); font-size: 0.84rem; margin-top: 64px; }
.foot-in { max-width: 1280px; margin: 0 auto; padding: 0 40px; }
.foot-top { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.foot-top span { font-weight: 700; font-size: 1.05rem; color: var(--ink); }
.foot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 22px; }
.foot-grid div { line-height: 1.6; color: var(--t2); }
.foot-grid strong { display: block; color: var(--celeste); font-weight: 700; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
.foot-legal { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line-soft); font-size: 0.74rem; color: var(--t3); }
```

### 10.22 Reglas de diseño para herramientas internas (no romper)

1. **Errores primero:** al finalizar el procesamiento, si hay errores el filtro activo es `ERROR`. La app lleva directo a los problemas.
2. **Dark mode desde el `<head>`:** el script de detección de tema va en el primer `<script>` inline del `<head>`, antes del `<body>` — evita el flash de color incorrecto.
3. **Botones siempre pill:** `border-radius: var(--r-full)`. Sin excepciones.
4. **Thead sticky al header:** `top: var(--hdr-h)` en `thead th`. Así el encabezado de tabla queda debajo del header de la app, no flotando en el aire.
5. **Sin icon fonts ni librerías de iconos:** SVGs inline custom solamente. No importar Heroicons, Lucide ni FontAwesome.
6. **Separadores solo por hairline:** `var(--line)` / `var(--line-soft)`. Nunca bordes de accent de un solo lado.
7. **Números siempre tabulares:** `font-variant-numeric: tabular-nums` en columnas de datos numéricos.
8. **Privacidad antes de cualquier input:** el aviso de privacidad (`§10.8`) aparece visiblemente antes del primer campo o botón de carga.
9. **Transición base:** `all var(--t) var(--ease)` para hover de cards; propiedades específicas para el resto.
10. **Serif para display:** `var(--serif)` (DM Serif Display) solo para números KPI grandes, H1 y nombres de sección. Todo lo operativo en `var(--font)` (Plus Jakarta Sans).

### 10.23 Patrones de interacción

**Colapsar zona de carga post-validación:**
```js
// Agrega clase collapsed al section de carga; CSS lo colapsa y muestra el runbar.
secCarga.classList.add('collapsed');
```

**Progreso durante extracción de archivos grandes:**
```js
// Patrón: la extracción ocupa el 90% de la barra; parseo+validación el 10% final.
// Ceder el hilo entre archivos para que el DOM se actualice:
const yield_ = () => new Promise(r => setTimeout(r, 0));
await yield_();
```

**Filtros encadenados (patrón del Validador):**
```js
// F  = filtro por nivel (all/OK/ERROR/ADVERTENCIA/SIN_PAR)
// FT = filtro por tipo de hallazgo (string | null)
// FC = filtro por código/clave específica (string | null)
// SQ = búsqueda de texto
// Al activar FT o FC, resetear F='all' y el otro filtro.
// Al activar un KPI card, resetear FT y FC.
```

**Export CSV con BOM para Excel:**
```js
const csv = '\uFEFF' + lineas.join('\r\n'); // BOM evita problemas con acentos en Excel
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
```

---

**Última actualización:** 29 de junio de 2026 — integración del sistema de diseño del Validador de Recibos v1.0 (diseño completo extraído del codebase fuente).
