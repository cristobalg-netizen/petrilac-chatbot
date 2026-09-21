/**
 * Petrilac chat widget — self-contained embed script.
 *
 * Usage: add this before </body> on petrilac.com:
 *   <script src="https://YOUR_STATIC_HOST/petrilac-chat-widget.js"
 *           data-endpoint="https://petrilac-chatbot.YOUR-SUBDOMAIN.workers.dev/chat"></script>
 *
 * data-endpoint should point at the deployed Cloudflare Worker's /chat route.
 */
(function () {
  var CURRENT_SCRIPT = document.currentScript;
  var ENDPOINT = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-endpoint")) || "";

  if (!ENDPOINT) {
    console.error("[Petrilac chat widget] falta data-endpoint en el <script> tag.");
    return;
  }

  var STORAGE_KEY = "petrilac_chat_history_v1";
  var BRAND_COLOR = "#e30613"; // ajustar al rojo/paleta real de Petrilac si difiere
  var BRAND_COLOR_DARK = "#b8050f";

  var state = {
    open: false,
    history: [], // [{role, content}]
    sending: false,
  };

  try {
    var saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) state.history = JSON.parse(saved);
  } catch (e) {
    /* ignore */
  }

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(-16)));
    } catch (e) {
      /* ignore */
    }
  }

  // ---- styles ----
  var style = document.createElement("style");
  style.textContent = [
    "#pt-chat-bubble{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;",
    "background:" + BRAND_COLOR + ";box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;",
    "display:flex;align-items:center;justify-content:center;z-index:999999;border:none;transition:transform .15s ease;}",
    "#pt-chat-bubble:hover{transform:scale(1.06);}",
    "#pt-chat-bubble svg{width:28px;height:28px;fill:#fff;}",
    "#pt-chat-panel{position:fixed;bottom:92px;right:20px;width:360px;max-width:92vw;height:520px;max-height:75vh;",
    "background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.25);display:none;flex-direction:column;",
    "overflow:hidden;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}",
    "#pt-chat-panel.pt-open{display:flex;}",
    "#pt-chat-header{background:" + BRAND_COLOR + ";color:#fff;padding:14px 16px;font-weight:600;",
    "display:flex;align-items:center;justify-content:space-between;font-size:15px;}",
    "#pt-chat-header button{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}",
    "#pt-chat-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f7f7f8;}",
    "#pt-chat-messages::-webkit-scrollbar{width:6px;}",
    "#pt-chat-messages::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px;}",
    ".pt-msg{max-width:82%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;}",
    ".pt-msg-user{align-self:flex-end;background:" + BRAND_COLOR + ";color:#fff;border-bottom-right-radius:3px;}",
    ".pt-msg-bot{align-self:flex-start;background:#fff;color:#222;border:1px solid #e5e5e7;border-bottom-left-radius:3px;}",
    ".pt-msg-bot.pt-typing{color:#999;font-style:italic;}",
    "#pt-chat-inputrow{display:flex;border-top:1px solid #e5e5e7;padding:8px;gap:8px;background:#fff;}",
    "#pt-chat-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:9px 14px;font-size:13.5px;outline:none;resize:none;font-family:inherit;max-height:80px;}",
    "#pt-chat-input:focus{border-color:" + BRAND_COLOR + ";}",
    "#pt-chat-send{background:" + BRAND_COLOR + ";border:none;color:#fff;border-radius:50%;width:38px;height:38px;",
    "flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;}",
    "#pt-chat-send:disabled{background:#ccc;cursor:default;}",
    "#pt-chat-send svg{width:17px;height:17px;fill:#fff;}",
    "#pt-chat-footer{text-align:center;font-size:10.5px;color:#aaa;padding:4px 0 8px;background:#fff;}",
  ].join("");
  document.head.appendChild(style);

  // ---- DOM ----
  var bubble = document.createElement("button");
  bubble.id = "pt-chat-bubble";
  bubble.setAttribute("aria-label", "Abrir chat de Petrilac");
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.4 1.08 4.57 2.84 6.19L4 22l5.05-1.44C10 20.85 10.98 21 12 21c5.52 0 10-4.02 10-9s-4.48-9-10-9z"/></svg>';

  var panel = document.createElement("div");
  panel.id = "pt-chat-panel";
  panel.innerHTML =
    '<div id="pt-chat-header"><span>Petrilac — Asesor de productos</span><button id="pt-chat-close" aria-label="Cerrar">&times;</button></div>' +
    '<div id="pt-chat-messages"></div>' +
    '<div id="pt-chat-inputrow">' +
    '<textarea id="pt-chat-input" rows="1" placeholder="Escribí tu consulta..."></textarea>' +
    '<button id="pt-chat-send" aria-label="Enviar"><svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button>' +
    "</div>" +
    '<div id="pt-chat-footer">Asistente automático — puede cometer errores</div>';

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#pt-chat-messages");
  var inputEl = panel.querySelector("#pt-chat-input");
  var sendBtn = panel.querySelector("#pt-chat-send");
  var closeBtn = panel.querySelector("#pt-chat-close");

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessage(role, content) {
    var div = document.createElement("div");
    div.className = "pt-msg " + (role === "user" ? "pt-msg-user" : "pt-msg-bot");
    div.textContent = content;
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function renderHistory() {
    messagesEl.innerHTML = "";
    if (state.history.length === 0) {
      renderMessage(
        "assistant",
        "¡Hola! Soy el asesor de productos de Petrilac. Contame en qué superficie estás trabajando (madera, metal, piso, pared, techo, náutica) y si es interior o exterior, y te ayudo a elegir el producto."
      );
      return;
    }
    state.history.forEach(function (m) {
      renderMessage(m.role, m.content);
    });
  }

  function setOpen(open) {
    state.open = open;
    panel.classList.toggle("pt-open", open);
    if (open) {
      renderHistory();
      inputEl.focus();
    }
  }

  bubble.addEventListener("click", function () {
    setOpen(!state.open);
  });
  closeBtn.addEventListener("click", function () {
    setOpen(false);
  });

  inputEl.addEventListener("input", function () {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + "px";
  });

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  sendBtn.addEventListener("click", sendMessage);

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text || state.sending) return;

    inputEl.value = "";
    inputEl.style.height = "auto";
    state.history.push({ role: "user", content: text });
    renderMessage("user", text);
    persist();

    var typingEl = renderMessage("assistant", "Escribiendo...");
    typingEl.classList.add("pt-typing");

    state.sending = true;
    sendBtn.disabled = true;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: state.history.slice(0, -1).slice(-8),
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("bad_status_" + res.status);
        return res.json();
      })
      .then(function (data) {
        typingEl.remove();
        var reply = data.reply || "Perdón, no pude generar una respuesta. Probá de nuevo en un momento.";
        renderMessage("assistant", reply);
        state.history.push({ role: "assistant", content: reply });
        persist();
      })
      .catch(function () {
        typingEl.remove();
        renderMessage(
          "assistant",
          "Hubo un problema de conexión. Probá de nuevo, o comunicate al 0800.77PETRI (73874)."
        );
      })
      .finally(function () {
        state.sending = false;
        sendBtn.disabled = false;
      });
  }
})();
