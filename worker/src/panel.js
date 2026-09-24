/** Panel privado del chatbot. Se sirve en GET /panel desde el propio Worker. */
export const PANEL_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Panel del chatbot — Petrilac</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" />
<style>
  :root{
    --bg:#F7F5F2;--card:#fff;--ink:#23201E;--muted:#6E6862;--line:#E7E2DB;
    --brand:#F05423;--brand-deep:#D1431A;--ok:#2F7D4F;--warn:#B4541C;
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}
  .wrap{max-width:1040px;margin:0 auto;padding:28px 16px 60px;}
  header{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:22px;}
  h1{font-size:20px;margin:0;}
  h1 small{display:block;font-size:11.5px;font-weight:600;letter-spacing:.06em;
    text-transform:uppercase;color:var(--brand);margin-bottom:4px;}
  .tabs{display:flex;gap:6px;}
  .tabs button{background:none;border:1px solid var(--line);border-radius:8px;padding:7px 13px;
    font-size:12.5px;font-weight:600;font-family:inherit;color:var(--muted);cursor:pointer;}
  .tabs button.on{background:var(--brand);border-color:var(--brand);color:#fff;}

  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px;}
  .tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
  .tile b{display:block;font-size:24px;font-variant-numeric:tabular-nums;line-height:1.15;}
  .tile span{font-size:11px;color:var(--muted);letter-spacing:.03em;text-transform:uppercase;font-weight:600;}

  .panel{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
    padding:11px 14px;border-bottom:1px solid var(--line);}
  td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.5;}
  tr:last-child td{border-bottom:none;}
  td.fecha{white-space:nowrap;color:var(--muted);font-size:11.5px;}
  td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  code{font-size:11.5px;background:var(--bg);padding:2px 6px;border-radius:5px;}
  .resp{color:var(--muted);}

  .barra{display:flex;gap:9px;align-items:center;margin-bottom:14px;flex-wrap:wrap;}
  input[type=search],input[type=password]{border:1px solid var(--line);border-radius:8px;padding:8px 12px;
    font-size:13px;font-family:inherit;min-width:220px;}
  button.accion{background:var(--brand);color:#fff;border:none;border-radius:8px;padding:8px 14px;
    font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;}
  button.chico{background:none;border:1px solid var(--line);color:var(--warn);border-radius:7px;
    padding:4px 9px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;}
  a.exportar{font-size:12px;color:var(--brand);text-decoration:none;font-weight:600;}

  #login{max-width:360px;margin:12vh auto;background:var(--card);border:1px solid var(--line);
    border-radius:12px;padding:24px;}
  #login h2{font-size:15px;margin:0 0 6px;}
  #login p{font-size:12.5px;color:var(--muted);line-height:1.55;margin:0 0 16px;}
  #login input{width:100%;margin-bottom:10px;}
  #login button{width:100%;}
  .err{color:var(--brand-deep);font-size:12px;margin-top:9px;}
  .vacio{padding:30px 16px;text-align:center;color:var(--muted);font-size:13px;}
  [hidden]{display:none!important;}
</style>
</head>
<body>

<div id="login">
  <h2>Panel del chatbot</h2>
  <p>Ingresá la clave del panel. Es la que está guardada como <code>PANEL_TOKEN</code> en Cloudflare.</p>
  <input type="password" id="clave" placeholder="Clave" autocomplete="current-password" />
  <button class="accion" id="entrar">Entrar</button>
  <div class="err" id="errLogin" hidden>Clave incorrecta.</div>
</div>

<div class="wrap" id="app" hidden>
  <header>
    <h1><small>Petrilac</small>Panel del chatbot</h1>
    <div class="tabs">
      <button data-tab="conversaciones" class="on">Conversaciones</button>
      <button data-tab="visitantes">Visitantes</button>
    </div>
  </header>

  <div class="tiles" id="tiles"></div>

  <section id="tab-conversaciones">
    <div class="barra">
      <input type="search" id="buscar" placeholder="Buscar en las consultas..." />
      <button class="accion" id="btnBuscar">Buscar</button>
      <a class="exportar" id="btnExportar" href="#">Exportar a CSV</a>
    </div>
    <div class="panel"><div id="tablaConv"></div></div>
  </section>

  <section id="tab-visitantes" hidden>
    <div class="panel"><div id="tablaVis"></div></div>
  </section>
</div>

<script>
(function(){
  var token = "";
  try { token = localStorage.getItem("petrilac_panel_token") || ""; } catch(e){}

  function api(ruta, opciones){
    opciones = opciones || {};
    opciones.headers = Object.assign({}, opciones.headers, {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    });
    return fetch(ruta, opciones).then(function(r){
      if (r.status === 401) throw new Error("no_autorizado");
      return r.json();
    });
  }

  var elLogin = document.getElementById("login");
  var elApp = document.getElementById("app");

  function entrar(clave){
    token = clave;
    return api("/api/resumen").then(function(){
      try { localStorage.setItem("petrilac_panel_token", token); } catch(e){}
      elLogin.hidden = true; elApp.hidden = false;
      cargarTodo();
    });
  }

  document.getElementById("entrar").addEventListener("click", function(){
    entrar(document.getElementById("clave").value.trim())
      .catch(function(){ document.getElementById("errLogin").hidden = false; });
  });
  document.getElementById("clave").addEventListener("keydown", function(e){
    if (e.key === "Enter") document.getElementById("entrar").click();
  });

  function fecha(ms){
    var d = new Date(ms);
    return d.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}) + " " +
           d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
  }
  function plata(n){ return "US$ " + (n||0).toFixed(2); }
  function esc(s){ var d=document.createElement("div"); d.textContent = s==null?"":s; return d.innerHTML; }

  function cargarTodo(){ cargarResumen(); cargarConversaciones(); cargarVisitantes(); }

  function cargarResumen(){
    api("/api/resumen").then(function(d){
      document.getElementById("tiles").innerHTML =
        tile(d.mensajes_hoy, "Mensajes hoy") +
        tile(plata(d.costo_hoy), "Costo hoy") +
        tile(d.mensajes_30, "Mensajes 30 días") +
        tile(plata(d.costo_30), "Costo 30 días") +
        tile(d.conversaciones_30, "Conversaciones 30 días");
    });
  }
  function tile(valor, etiqueta){
    return '<div class="tile"><b>' + esc(String(valor)) + '</b><span>' + esc(etiqueta) + '</span></div>';
  }

  function cargarConversaciones(){
    var q = encodeURIComponent(document.getElementById("buscar").value.trim());
    api("/api/conversaciones?q=" + q).then(function(d){
      var cont = document.getElementById("tablaConv");
      if (!d.filas.length){ cont.innerHTML = '<div class="vacio">Todavía no hay conversaciones registradas.</div>'; return; }
      var html = '<table><thead><tr><th>Fecha</th><th>Consulta</th><th>Respuesta</th><th style="text-align:right">Costo</th></tr></thead><tbody>';
      d.filas.forEach(function(f){
        html += '<tr><td class="fecha">' + fecha(f.ts) + '</td><td>' + esc(f.pregunta) +
                '</td><td class="resp">' + esc((f.respuesta||"").slice(0,240)) +
                ((f.respuesta||"").length > 240 ? "…" : "") +
                '</td><td class="num">' + (f.costo||0).toFixed(4) + '</td></tr>';
      });
      cont.innerHTML = html + "</tbody></table>";
    });
  }

  function cargarVisitantes(){
    api("/api/visitantes").then(function(d){
      var cont = document.getElementById("tablaVis");
      if (!d.filas.length){ cont.innerHTML = '<div class="vacio">Sin actividad registrada.</div>'; return; }
      var html = '<table><thead><tr><th>Visitante</th><th style="text-align:right">Mensajes (30 días)</th><th>Estado</th><th></th></tr></thead><tbody>';
      d.filas.forEach(function(f){
        html += '<tr><td><code>' + esc(f.visitante) + '</code></td><td class="num">' + f.n +
                '</td><td>' + (f.bloqueado ? '<span style="color:var(--warn);font-weight:600">Bloqueado</span>' +
                (f.motivo ? ' — ' + esc(f.motivo) : '') : 'Activo') + '</td><td style="text-align:right">' +
                '<button class="chico" data-v="' + esc(f.visitante) + '" data-accion="' +
                (f.bloqueado ? 'desbloquear' : 'bloquear') + '">' +
                (f.bloqueado ? 'Desbloquear' : 'Bloquear') + '</button></td></tr>';
      });
      cont.innerHTML = html + "</tbody></table>";
      cont.querySelectorAll("button[data-v]").forEach(function(b){
        b.addEventListener("click", function(){
          api("/api/" + b.dataset.accion, {
            method: "POST",
            body: JSON.stringify({ visitante: b.dataset.v, motivo: "manual desde el panel" })
          }).then(cargarVisitantes);
        });
      });
    });
  }

  document.getElementById("btnBuscar").addEventListener("click", cargarConversaciones);
  document.getElementById("buscar").addEventListener("keydown", function(e){
    if (e.key === "Enter") cargarConversaciones();
  });
  document.getElementById("btnExportar").addEventListener("click", function(e){
    e.preventDefault();
    fetch("/api/exportar", { headers: { "Authorization": "Bearer " + token } })
      .then(function(r){ return r.blob(); })
      .then(function(b){
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "conversaciones-petrilac.csv";
        a.click();
      });
  });

  document.querySelectorAll(".tabs button").forEach(function(b){
    b.addEventListener("click", function(){
      document.querySelectorAll(".tabs button").forEach(function(x){ x.classList.remove("on"); });
      b.classList.add("on");
      document.getElementById("tab-conversaciones").hidden = b.dataset.tab !== "conversaciones";
      document.getElementById("tab-visitantes").hidden = b.dataset.tab !== "visitantes";
    });
  });

  if (token) {
    entrar(token).catch(function(){ /* clave vieja: queda la pantalla de login */ });
  }
})();
</script>
</body>
</html>`;
