# Probarlo local con Terminal (alternativa a GitHub Pages + Cloudflare dashboard)

Requiere Node.js instalado en tu Mac y una API key de Anthropic
(console.anthropic.com → API Keys).

```bash
cd worker
npm install

# Creá este archivo vos mismo (nunca le pegues tu key a Claude en el chat):
cat > .dev.vars << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGIN=*
EOF

npx wrangler dev
```

Con eso corriendo (deja la terminal abierta, va a decir algo como "Ready on
http://localhost:8787"), en otra pestaña probá:

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"tengo una reja de metal oxidada, que uso?"}'
```

Si devuelve un JSON con `"reply"`, funciona. Para probar la experiencia
completa del widget (no solo curl), abrí `../widget/test-local.html` con
doble clic mientras `wrangler dev` sigue corriendo — apunta a
`http://localhost:8787/chat` sin simular nada.

## Deploy manual a Cloudflare (sin pasar por GitHub)

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```
