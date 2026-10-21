/* Anotación Xenometer — lógica del cliente.
   Lee anotacion.db (SQLite, solo lectura) con sql.js y guarda cada calificación
   en Google Apps Script (si config.js tiene la URL) y en este navegador como respaldo. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var URLB = (window.APPS_SCRIPT_URL || "").trim();

  var ESCALA = [
    { v: -3, t: "Muy\nxenófobo", d: "Llama a la violencia contra EyPE" },
    { v: -2, t: "Xenófobo", d: "Odio abierto o apoya lo xenófobo" },
    { v: -1, t: "Leve", d: "Indirectamente hiriente" },
    { v: 0, t: "Neutral", d: "Hechos o fuera de tema" },
    { v: 1, t: "Leve pro", d: "Generalmente humanitario" },
    { v: 2, t: "Pro-EyPE", d: "Critica la xenofobia" },
    { v: 3, t: "Muy\npro-EyPE", d: "Llama a actuar a favor" }
  ];

  var db = null, user = null, rows = [], idx = 0, ratings = {}, view = [];

  // ---------- utilidades ----------
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  async function sha256(s) {
    var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }
  function lsKey() { return "xeno_rat_" + user.usuario; }
  function outKey() { return "xeno_out_" + user.usuario; }
  function readLS(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---------- carga de la base ----------
  async function openDB() {
    var SQL = await initSqlJs({ locateFile: function (f) { return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f; } });
    var buf = await fetch(window.DB_FILE || "anotacion.db").then(function (r) {
      if (!r.ok) throw new Error("No se pudo cargar la base (" + r.status + ")");
      return r.arrayBuffer();
    });
    db = new SQL.Database(new Uint8Array(buf));
  }
  function q(sql, params) {
    var st = db.prepare(sql); if (params) st.bind(params);
    var out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out;
  }

  // ---------- login ----------
  async function doLogin(u, p) {
    var r = q("SELECT * FROM usuarios WHERE usuario=?", [u]);
    if (!r.length) return null;
    var h = await sha256(r[0].salt + p);
    return h === r[0].clave_hash ? r[0] : null;
  }

  function loadAssigned() {
    rows = q(
      "SELECT t.*, a.orden AS orden, s.etiqueta AS sug_etiqueta, s.motivo AS sug_motivo, s.nota AS sug_nota " +
      "FROM asignacion a JOIN tweets t ON t.id=a.tweet_id " +
      "LEFT JOIN sugerencias s ON s.tweet_id=t.id " +
      "WHERE a.equipo=? ORDER BY a.orden", [user.equipo]);
  }

  // ---------- sincronización ----------
  function setSync(txt, bad) { var s = $("#sync"); s.textContent = txt; s.className = "sync" + (bad ? " bad" : ""); }

  async function pullRatings() {
    ratings = readLS(lsKey());               // respaldo local primero
    if (!URLB) { setSync("Sin conexión central: se guarda solo en este equipo."); return; }
    try {
      var res = await fetch(URLB + "?action=load&usuario=" + encodeURIComponent(user.usuario)).then(function (r) { return r.json(); });
      if (res && res.ok) {
        Object.keys(res.calificaciones).forEach(function (id) {
          ratings[id] = { etiqueta: res.calificaciones[id].etiqueta, comentario: res.calificaciones[id].comentario };
        });
        writeLS(lsKey(), ratings);
        setSync("Conectado.");
      }
    } catch (e) { setSync("Sin internet ahora: se guarda local y se enviará luego.", true); }
    flushOutbox();
  }

  function enqueue(item) {
    var o = readLS(outKey()); o[item.tweet_id] = item; writeLS(outKey(), o);
  }
  async function flushOutbox() {
    if (!URLB) return;
    var o = readLS(outKey()); var ids = Object.keys(o);
    if (!ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      var ok = await postSave(o[ids[i]], true);
      if (ok) { delete o[ids[i]]; writeLS(outKey(), o); }
    }
    var left = Object.keys(readLS(outKey())).length;
    setSync(left ? (left + " calificación(es) pendientes de enviar.") : "Todo sincronizado ✓", left > 0);
  }
  async function postSave(item, silent) {
    if (!URLB) return false;
    try {
      var res = await fetch(URLB, { method: "POST", body: JSON.stringify(item) }).then(function (r) { return r.json(); });
      return !!(res && res.ok);
    } catch (e) { if (!silent) setSync("Sin internet: guardado local, se enviará luego.", true); return false; }
  }

  // ---------- vista ----------
  function applyFilter() {
    var f = $("#filter").value;
    view = rows.filter(function (r) {
      var done = ratings[r.id] != null && ratings[r.id].etiqueta !== "" && ratings[r.id].etiqueta != null;
      return f === "all" ? true : f === "todo" ? !done : done;
    });
    if (!view.length) view = rows.slice();
    if (idx >= view.length) idx = 0;
  }
  function doneCount() { return rows.filter(function (r) { return ratings[r.id] && ratings[r.id].etiqueta !== "" && ratings[r.id].etiqueta != null; }).length; }

  function render() {
    applyFilter();
    var r = view[idx]; if (!r) return;
    var pop = r.poblacion_objetivo && r.poblacion_objetivo !== "No identificada" ? '<span class="chip">' + esc(r.poblacion_objetivo) + '</span>' : "";
    var quoted = r.es_cita && r.texto_citado ? '<div class="quoted"><b>@' + esc(r.cita_a) + ':</b> ' + esc(r.texto_citado) + '</div>' : "";
    var reply = r.es_respuesta && r.responde_a ? '<span class="chip">En respuesta a @' + esc(r.responde_a) + '</span>' : "";
    var sug = r.sug_etiqueta != null ? '<div class="sug"><b>Sugerencia previa:</b> ' + r.sug_etiqueta + ' · ' + esc(r.sug_motivo || "") + (r.sug_nota ? " — " + esc(r.sug_nota) : "") + '</div>' : "";
    $("#card").innerHTML =
      '<div class="meta"><span class="au">@' + esc(r.autor) + '</span>' +
      '<span>' + esc(r.timestamp_colombia) + '</span>' +
      (r.autor_ubicacion ? '<span>· ' + esc(r.autor_ubicacion) + '</span>' : "") +
      '<span class="chip">' + esc(r.contexto_colombia || "") + '</span>' + reply + pop + '</div>' +
      '<div class="body">' + esc(r.texto) + '</div>' + quoted +
      '<div class="foot">' +
      '<span>♥ ' + (r.likes || 0) + '</span><span>↻ ' + (r.retweets || 0) + '</span>' +
      (r.alertas ? '<span>⚠ ' + esc(r.alertas) + '</span>' : "") +
      '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">ver en X ↗</a></div>' + sug;

    var cur = ratings[r.id] || {};
    Array.prototype.forEach.call(document.querySelectorAll(".scale button"), function (b) {
      b.classList.toggle("sel", String(cur.etiqueta) === b.dataset.v);
    });
    $("#comment").value = cur.comentario || "";
    $("#saved").classList.toggle("hidden", cur.etiqueta == null || cur.etiqueta === "");

    var done = doneCount();
    $("#count").textContent = done + " / " + rows.length;
    $("#bar").style.width = (rows.length ? (done / rows.length * 100) : 0) + "%";
    $("#card").scrollIntoView({ block: "nearest" });
  }

  async function setRating(v) {
    var r = view[idx]; if (!r) return;
    var comentario = $("#comment").value.trim();
    ratings[r.id] = { etiqueta: v, comentario: comentario };
    writeLS(lsKey(), ratings);
    render();
    var item = { action: "save", tweet_id: r.id, usuario: user.usuario, equipo: user.equipo, etiqueta: v, comentario: comentario };
    enqueue(item);
    var ok = await postSave(item);
    if (ok) { var o = readLS(outKey()); delete o[r.id]; writeLS(outKey(), o); setSync("Guardado ✓"); }
    flushOutbox();
  }
  function saveComment() {
    var r = view[idx]; if (!r || !ratings[r.id]) return;
    if (ratings[r.id].comentario === $("#comment").value.trim()) return;
    setRating(ratings[r.id].etiqueta);
  }

  function go(n) {
    saveComment();
    idx = Math.max(0, Math.min(view.length - 1, idx + n));
    render();
  }
  function jumpUnrated() {
    $("#filter").value = "todo"; applyFilter(); idx = 0; render();
    $("#filter").value = "all";
  }

  // ---------- montaje ----------
  function buildScale() {
    $("#scale").innerHTML = ESCALA.map(function (e) {
      return '<button data-v="' + e.v + '" title="' + e.d + '"><span>' + (e.v > 0 ? "+" + e.v : e.v) + "</span><small>" + esc(e.t).replace(/\n/g, "<br>") + "</small></button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".scale button"), function (b) {
      b.addEventListener("click", function () { setRating(parseInt(b.dataset.v, 10)); });
    });
  }

  function startApp() {
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#who").innerHTML = esc(user.nombre) + "<small>" + esc(user.usuario) + " · " + esc(user.equipo === "equipo1" ? "Equipo 1" : "Equipo 2") + "</small>";
    buildScale();
    loadAssigned();
    pullRatings().then(render);
    setInterval(flushOutbox, 30000);
  }

  // eventos
  $("#loginForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    $("#loginErr").textContent = "";
    $("#loginBtn").disabled = true;
    try {
      var u = $("#u").value.trim(), p = $("#p").value;
      var r = await doLogin(u, p);
      if (!r) { $("#loginErr").textContent = "Usuario o contraseña incorrectos."; $("#loginBtn").disabled = false; return; }
      user = r; sessionStorage.setItem("xeno_user", u); startApp();
    } catch (e) { $("#loginErr").textContent = "Error: " + e.message; $("#loginBtn").disabled = false; }
  });
  $("#prev").addEventListener("click", function () { go(-1); });
  $("#next").addEventListener("click", function () { go(1); });
  $("#jump").addEventListener("click", jumpUnrated);
  $("#filter").addEventListener("change", function () { idx = 0; render(); });
  $("#comment").addEventListener("blur", saveComment);
  $("#logout").addEventListener("click", function () { saveComment(); sessionStorage.removeItem("xeno_user"); location.reload(); });
  $("#theme").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : cur === "light" ? "dark" : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("xeno_theme", next); } catch (e) {}
  });
  document.addEventListener("keydown", function (e) {
    if ($("#app").classList.contains("hidden")) return;
    if (document.activeElement && document.activeElement.id === "comment") return;
    if (e.key >= "1" && e.key <= "7") { setRating(ESCALA[parseInt(e.key, 10) - 1].v); }
    else if (e.key === "ArrowRight") { go(1); }
    else if (e.key === "ArrowLeft") { go(-1); }
  });

  // tema guardado
  try { var th = localStorage.getItem("xeno_theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch (e) {}

  // arranque
  openDB().then(function () {
    var remembered = sessionStorage.getItem("xeno_user");
    if (remembered) {
      var r = q("SELECT * FROM usuarios WHERE usuario=?", [remembered]);
      if (r.length) { user = r[0]; startApp(); return; }
    }
    $("#u").focus();
  }).catch(function (e) {
    $("#loginErr").textContent = "No se pudo iniciar: " + e.message;
  });
})();
