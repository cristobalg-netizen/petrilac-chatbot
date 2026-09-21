# Chatbot Petrilac — versión propia (Claude API), reemplazo de Chatbase

Recrea el bot "PETRILAC" de Chatbase (mismo contexto de negocio, mismo rol de
asesor de producto, mismas guardrails) pero corriendo sobre la API de Claude,
sin el límite de 50 mensajes/mes del plan free de Chatbase.

## Estructura del repo

- `worker/` — backend (Cloudflare Worker), endpoint `/chat`. Busca los
  productos relevantes en `worker/src/corpus.json` (86 documentos: 71 fichas
  de producto + FAQ, crawleados de petrilac.com el 07/09/2026) y le pregunta
  a Claude con el mismo system prompt y guardrails que tenía el bot de
  Chatbase.
- `widget/petrilac-chat-widget.js` — el widget de chat embebible (burbuja
  flotante), un solo `<script>`, sin dependencias. Esta es la versión que
  eventualmente va a petrilac.com.
- `docs/` — página pública de prueba (pensada para GitHub Pages): tiene un
  campo para pegar la URL de tu Worker ya desplegado y probar el chat real
  desde un link, sin instalar nada. **Es la forma más simple de probarlo
  antes de tocar petrilac.com.**

## Cómo probarlo — GitHub + Cloudflare, sin Terminal

Esto te da un link público para probar el bot de verdad, y de paso deja
armado el pipeline de deploy: cada vez que subís un cambio a GitHub, se
redespliega solo.

### 1. Subilo a GitHub

Si no usás Terminal habitualmente, la forma más simple es con **GitHub
Desktop** (desktop.github.com): "Add local repository" → elegís esta
carpeta → "Publish repository" (dejalo en privado si preferís). Si preferís
Terminal:

```bash
cd chatbot-petrilac
git init
git add .
git commit -m "Chatbot Petrilac inicial"
gh repo create petrilac-chatbot --private --source=. --push
# (o creá el repo vacío en github.com y hacé git remote add origin ... && git push)
```

### 2. Activá GitHub Pages (para la página de prueba pública)

En el repo en github.com → **Settings → Pages** → Source: "Deploy from a
branch" → Branch: `main`, carpeta `/docs` → Save. En un minuto vas a tener
un link tipo `https://TU-USUARIO.github.io/petrilac-chatbot/` — esa es tu
página de prueba (todavía no va a responder hasta el paso 3).

### 3. Conectá el repo a Cloudflare (esto despliega el backend)

En dash.cloudflare.com → **Workers & Pages → Create → Import a repository**
→ elegís este repo de GitHub → Cloudflare detecta `worker/wrangler.toml`
solo. Como *root directory* del proyecto indicá `worker`. Dale a Deploy.

Después, andá a tu Worker → **Settings → Variables and Secrets → Add** →
nombre `ANTHROPIC_API_KEY`, tipo **Secret**, pegás tu key de
console.anthropic.com. **Esto lo hacés vos, ahí en el dashboard de
Cloudflare — nunca me pegues la key a mí ni la pongas en el código.**

Cloudflare te va a dar una URL tipo
`https://petrilac-chatbot.<tu-cuenta>.workers.dev`.

### 4. Probalo

Abrí tu página de GitHub Pages del paso 2, pegá en el campo la URL de
Cloudflare del paso 3 seguida de `/chat`
(`https://petrilac-chatbot.<tu-cuenta>.workers.dev/chat`), y guardá. Te
aparece la burbuja de chat abajo a la derecha — es el bot real, respondiendo
con Claude sobre el contenido de petrilac.com. Compartí ese mismo link de
GitHub Pages si querés que alguien más de Petrilac lo pruebe antes de
publicarlo en el sitio.

De ahora en más, cualquier cambio que subas a GitHub (al corpus, al prompt,
al widget) se redespliega solo en Cloudflare.

## Cuando esté listo para petrilac.com

1. En `worker/wrangler.toml`, cambiá `ALLOWED_ORIGIN` de `"*"` a
   `"https://www.petrilac.com"` (o el/los dominios reales, separados por
   coma) y subí el cambio — por ahora está abierto a cualquier origen para
   que puedas probarlo desde GitHub Pages sin fricción, pero antes de
   publicarlo en el sitio real conviene restringirlo.
2. Subí `widget/petrilac-chat-widget.js` al hosting del sitio (o dejalo
   servido desde GitHub Pages, andaría igual) y agregá antes de `</body>`:
   ```html
   <script
     src="https://TU-HOST/petrilac-chat-widget.js"
     data-endpoint="https://petrilac-chatbot.<tu-cuenta>.workers.dev/chat">
   </script>
   ```
   Como el sitio corre en Laravel, lo más simple suele ser poner el `.js` en
   `public/` y agregar el `<script>` al layout Blade principal.

## Probarlo en tu máquina en vez de con GitHub Pages (alternativa)

Si preferís no pasar por GitHub para probarlo, también podés correrlo
localmente con la CLI de Cloudflare (`wrangler`) — requiere Terminal y Node
instalado. Está detallado en `worker/README-local.md`.

## Qué reusé del bot de Chatbase y qué cambié

**Igual:** el contexto de negocio, el rol de "asesor de producto", y las 4
guardrails (no revelar la base de entrenamiento, no salirse de tema, no
inventar fuera del contexto, no hacer tareas fuera de rol) — están
traspasados casi textualmente en `worker/src/index.js`.

**Distinto / mejorado:**
- Sin límite de 50 mensajes/mes.
- El corpus lo armé crawleando petrilac.com directamente (71 fichas de
  producto + 14 FAQ) en vez de depender del crawler interno de Chatbase —
  podés ampliarlo con fichas técnicas/seguridad en PDF si querés respuestas
  más precisas en temas normativos.
- Control total del prompt y del modelo — lo podés ajustar vos sin depender
  del plan de Chatbase.
- Deploy automático: cualquier cambio subido a GitHub se redespliega solo.

## Confirmá esto antes de ir a producción

- **Modelo:** dejé `claude-haiku-4-5` en `worker/wrangler.toml` como default
  por costo/latencia — es una suposición razonable para un bot de atención
  simple, pero **confirmá el identificador exacto disponible en tu cuenta**
  en console.anthropic.com/settings/models antes de que esto reciba tráfico
  real; los ids de modelo cambian con el tiempo y no tengo forma de
  verificarlo desde acá.
- **Costo esperado:** con Haiku y ~5 pasajes de contexto por consulta, cada
  intercambio ronda unos pocos centavos de dólar por cada 1000 mensajes —
  muy por debajo de un plan pago de Chatbase, sin tope mensual salvo el que
  vos quieras poner.

## Limitaciones que hay que tener presentes (no son bugs, son el trade-off de un MVP)

1. **Búsqueda por palabras clave, no semántica.** Si alguien pregunta con
   sinónimos muy alejados de las palabras reales de las fichas (ej. "placard
   de melamina" cuando el corpus no tiene esa palabra), el bot puede no
   encontrar contexto relevante — ahí la guardrail #3 lo obliga a decir que
   no tiene esa info y derivar al 0800 en vez de inventar, pero no es tan
   robusto como una búsqueda con embeddings. Si en el uso real ves que pasa
   seguido, el siguiente paso natural es sumar una búsqueda vectorial (más
   costo/complejidad).
2. **No hay memoria entre sesiones** — el historial vive en `sessionStorage`
   del navegador del usuario, se pierde si cierra la pestaña.
3. **Sin rate limiting todavía** — con `ALLOWED_ORIGIN="*"` cualquiera que
   encuentre la URL del Worker puede generar costo. Para producción real
   conviene agregar un límite simple por IP antes de darle tráfico real, y
   restringir `ALLOWED_ORIGIN` como se explica arriba.
4. **El corpus es una foto del 07/09/2026.** Si cambian productos o precios,
   hay que re-correr el crawl y subir el cambio a GitHub — no se actualiza
   solo (el bot de Chatbase tampoco lo hacía automáticamente, salvo que
   tuvieras auto-retrain activado, que estaba en "Off").
