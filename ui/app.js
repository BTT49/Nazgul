// Nazgul frontend. No build step: plain JS + Tauri's global API.
//
// Two kinds of saved item:
//  - "command": has a shell template, runs via the Rust side, optional custom UI.
//  - "panel":   custom UI only, no shell command (e.g. a notes app, a client-side lookup).
//
// Two views: RUN (default; shows the custom UI or the arg form) and EDIT (all settings).
//
// Each item keeps its own state across switches:
//  - state.outputs[id]  = last run result for a command (independent per item)
//  - item.data          = arbitrary JSON a custom UI can save/restore via postMessage
const $ = (s) => document.querySelector(s);
const invoke = (...a) => window.__TAURI__.core.invoke(...a);
const STORE_KEY = "nazgul.v1";
const IS_WIN = /win/i.test(navigator.platform);

// ---------- seed widgets (example OSINT / cybersecurity custom interfaces) ----------
const WIDGET_NMAP = "<!doctype html>\n<meta charset=\"utf-8\">\n<style>\n  body{font-family:system-ui,sans-serif;margin:0;padding:14px;background:#0d0d0f;color:#e9e5e3}\n  h2{margin:0 0 10px;font-size:15px;color:#e3b4b1}\n  input{width:100%;background:#1b1a1d;border:1px solid #2e2a2c;color:#e9e5e3;border-radius:6px;padding:8px;font:14px monospace;margin-bottom:8px}\n  .presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}\n  button{background:#272225;color:#e9e5e3;border:1px solid #2e2a2c;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px}\n  button.active{background:#b23b36;border-color:#b23b36;color:#fff}\n  button.run{background:#b23b36;border-color:#b23b36;color:#fff;font-size:13px;padding:8px 14px}\n  pre{background:#0a0a0b;border-radius:6px;padding:10px;height:220px;overflow:auto;white-space:pre-wrap;font-size:12px;margin-top:10px}\n  .muted{color:#948b89;font-size:12px}\n</style>\n<h2>Nmap Scan</h2>\n<input id=\"target\" placeholder=\"Target (IP, host, or CIDR) \u2014 e.g. scanme.nmap.org\">\n<div class=\"presets\">\n  <button data-flags=\"-T4 -F\" class=\"preset\">Quick</button>\n  <button data-flags=\"-sV -T4\" class=\"preset active\">Service/Version</button>\n  <button data-flags=\"-p- -T4\" class=\"preset\">All ports</button>\n  <button data-flags=\"-sS -T4 -Pn\" class=\"preset\">Stealth SYN</button>\n  <button data-flags=\"-O -T4\" class=\"preset\">OS detect</button>\n</div>\n<p class=\"muted\">Flags: <span id=\"flagsLabel\">-sV -T4</span></p>\n<button class=\"run\" id=\"go\">Scan</button>\n<pre id=\"result\">Results will appear here. Only scan systems you own or have written permission to test.</pre>\n<script>\n  var flags = \"-sV -T4\";\n  var target = document.getElementById('target');\n  var label = document.getElementById('flagsLabel');\n  var result = document.getElementById('result');\n\n  document.querySelectorAll('.preset').forEach(function (b) {\n    b.onclick = function () {\n      document.querySelectorAll('.preset').forEach(function (x) { x.classList.remove('active'); });\n      b.classList.add('active');\n      flags = b.dataset.flags;\n      label.textContent = flags;\n      sendArgs();\n    };\n  });\n  target.oninput = sendArgs;\n\n  function sendArgs() {\n    parent.postMessage({ type: 'setArgs', args: { flags: flags, target: target.value } }, '*');\n  }\n\n  document.getElementById('go').onclick = function () {\n    result.textContent = 'Scanning ' + target.value + ' ...';\n    parent.postMessage({ type: 'run', args: { flags: flags, target: target.value } }, '*');\n  };\n\n  window.addEventListener('message', function (e) {\n    var msg = e.data || {};\n    if (msg.type === 'init') {\n      if (msg.data && msg.data.lastTarget) target.value = msg.data.lastTarget;\n      else if (msg.values && msg.values.target) target.value = msg.values.target;\n    }\n    if (msg.type === 'result') {\n      var r = msg.result;\n      result.textContent = (r.stdout || '') + (r.stderr ? ('\\n' + r.stderr) : '');\n      parent.postMessage({ type: 'saveData', data: { lastTarget: target.value, lastFlags: flags } }, '*');\n    }\n  });\n</script>\n";
const WIDGET_SUBDOMAIN = "<!doctype html>\n<meta charset=\"utf-8\">\n<style>\n  body{font-family:system-ui,sans-serif;margin:0;padding:14px;background:#0d0d0f;color:#e9e5e3}\n  h2{margin:0 0 10px;font-size:15px;color:#e3b4b1}\n  input{width:70%;background:#1b1a1d;border:1px solid #2e2a2c;color:#e9e5e3;border-radius:6px;padding:8px;font:14px monospace}\n  button{background:#b23b36;border:1px solid #b23b36;color:#fff;border-radius:6px;padding:8px 14px;cursor:pointer;margin-left:6px}\n  ul{margin-top:10px;max-height:260px;overflow:auto;padding-left:18px;font-family:ui-monospace,monospace;font-size:12.5px}\n  .muted{color:#948b89;font-size:12px;margin-top:8px}\n</style>\n<h2>Subdomain Finder (crt.sh)</h2>\n<input id=\"domain\" placeholder=\"example.com\">\n<button id=\"go\">Search</button>\n<p class=\"muted\">Queries crt.sh's public certificate-transparency log directly from this panel \u2014 no local tool required. Needs internet access; results depend on crt.sh being reachable.</p>\n<div id=\"status\" class=\"muted\"></div>\n<ul id=\"results\"></ul>\n<script>\n  var domain = document.getElementById('domain');\n  var results = document.getElementById('results');\n  var status = document.getElementById('status');\n\n  function render(list) {\n    results.innerHTML = '';\n    list.forEach(function (d) {\n      var li = document.createElement('li');\n      li.textContent = d;\n      results.appendChild(li);\n    });\n  }\n\n  document.getElementById('go').onclick = function () {\n    var d = domain.value.trim();\n    if (!d) return;\n    status.textContent = 'Searching\u2026';\n    results.innerHTML = '';\n    fetch('https://crt.sh/?q=%25.' + encodeURIComponent(d) + '&output=json')\n      .then(function (r) { return r.json(); })\n      .then(function (rows) {\n        var set = {};\n        rows.forEach(function (row) {\n          (row.name_value || '').split('\\n').forEach(function (n) { set[n.trim()] = true; });\n        });\n        var list = Object.keys(set).sort();\n        render(list);\n        status.textContent = list.length + ' names found.';\n        parent.postMessage({ type: 'saveData', data: { lastDomain: d, lastCount: list.length } }, '*');\n      })\n      .catch(function (e) { status.textContent = 'Lookup failed: ' + e.message; });\n  };\n\n  window.addEventListener('message', function (e) {\n    var msg = e.data || {};\n    if (msg.type === 'init' && msg.data && msg.data.lastDomain) {\n      domain.value = msg.data.lastDomain;\n      status.textContent = 'Last search: ' + msg.data.lastCount + ' names for ' + msg.data.lastDomain + '. Press Search to refresh.';\n    }\n  });\n</script>\n";
const WIDGET_HASH = "<!doctype html>\n<meta charset=\"utf-8\">\n<style>\n  body{font-family:system-ui,sans-serif;margin:0;padding:14px;background:#0d0d0f;color:#e9e5e3}\n  h2{margin:0 0 10px;font-size:15px;color:#e3b4b1}\n  textarea{width:100%;background:#1b1a1d;border:1px solid #2e2a2c;color:#e9e5e3;border-radius:6px;padding:8px;font:13px monospace;height:70px}\n  ul{margin-top:10px;padding-left:18px;font-size:13px}\n  .muted{color:#948b89;font-size:12px}\n</style>\n<h2>Hash Identifier</h2>\n<textarea id=\"hash\" placeholder=\"Paste a hash\u2026\"></textarea>\n<p class=\"muted\">Guesses the likely hash type from its length and character set, entirely offline. Heuristic only, not a guarantee.</p>\n<ul id=\"guesses\"></ul>\n<script>\n  var hash = document.getElementById('hash');\n  var guesses = document.getElementById('guesses');\n  var rules = [\n    [/^[a-f0-9]{32}$/i, 'MD5 or NTLM (32 hex chars)'],\n    [/^[a-f0-9]{40}$/i, 'SHA-1 (40 hex chars)'],\n    [/^[a-f0-9]{56}$/i, 'SHA-224 (56 hex chars)'],\n    [/^[a-f0-9]{64}$/i, 'SHA-256 (64 hex chars)'],\n    [/^[a-f0-9]{96}$/i, 'SHA-384 (96 hex chars)'],\n    [/^[a-f0-9]{128}$/i, 'SHA-512 (128 hex chars)'],\n    [/^\\$2[aby]\\$\\d{2}\\$/, 'bcrypt'],\n    [/^\\$1\\$/, 'MD5 crypt (Unix)'],\n    [/^\\$6\\$/, 'SHA-512 crypt (Unix)'],\n    [/^[A-Fa-f0-9]{32}:[A-Fa-f0-9]{32}$/, 'NTLM pair (LM:NT)']\n  ];\n\n  hash.oninput = function () {\n    var v = hash.value.trim();\n    guesses.innerHTML = '';\n    if (!v) return;\n    var any = false;\n    rules.forEach(function (r) {\n      if (r[0].test(v)) {\n        any = true;\n        var li = document.createElement('li');\n        li.textContent = r[1];\n        guesses.appendChild(li);\n      }\n    });\n    if (!any) {\n      var li = document.createElement('li');\n      li.textContent = 'No common pattern matched.';\n      guesses.appendChild(li);\n    }\n  };\n</script>\n";
const WIDGET_NOTES = "<!doctype html>\n<meta charset=\"utf-8\">\n<style>\n  body{font-family:system-ui,sans-serif;margin:0;padding:14px;background:#0d0d0f;color:#e9e5e3}\n  h2{margin:0 0 10px;font-size:15px;color:#e3b4b1}\n  textarea{width:100%;background:#1b1a1d;border:1px solid #2e2a2c;color:#e9e5e3;border-radius:6px;padding:8px;font:13px monospace;height:70px}\n  button{background:#b23b36;border:1px solid #b23b36;color:#fff;border-radius:6px;padding:7px 12px;cursor:pointer;margin-top:6px}\n  .note{background:#1b1a1d;border:1px solid #2e2a2c;border-radius:6px;padding:8px 36px 8px 8px;margin-top:8px;white-space:pre-wrap;font-size:12.5px;font-family:ui-monospace,monospace;position:relative}\n  .note time{display:block;color:#948b89;font-size:11px;margin-bottom:4px}\n  .note button{position:absolute;top:6px;right:6px;padding:2px 8px;font-size:11px;margin:0}\n  .hint{color:#948b89;font-size:12px}\n</style>\n<h2>Notes</h2>\n<p class=\"hint\">Paste a command's output here to keep track of findings. Notes are saved with this panel, so they're still here next time you open it.</p>\n<textarea id=\"input\" placeholder=\"Paste an output or write a finding\u2026\"></textarea>\n<button id=\"add\">+ Save note</button>\n<div id=\"list\"></div>\n<script>\n  var input = document.getElementById('input');\n  var list = document.getElementById('list');\n  var notes = [];\n\n  function render() {\n    list.innerHTML = '';\n    notes.slice().reverse().forEach(function (n) {\n      var div = document.createElement('div');\n      div.className = 'note';\n      var t = document.createElement('time');\n      t.textContent = n.at;\n      var del = document.createElement('button');\n      del.textContent = 'Delete';\n      del.onclick = function () {\n        notes = notes.filter(function (x) { return x.id !== n.id; });\n        save();\n        render();\n      };\n      div.appendChild(t);\n      div.appendChild(del);\n      div.appendChild(document.createTextNode(n.text));\n      list.appendChild(div);\n    });\n  }\n\n  function save() {\n    parent.postMessage({ type: 'saveData', data: { notes: notes } }, '*');\n  }\n\n  document.getElementById('add').onclick = function () {\n    var v = input.value.trim();\n    if (!v) return;\n    notes.push({ id: Date.now() + Math.random(), text: v, at: new Date().toLocaleString() });\n    input.value = '';\n    save();\n    render();\n  };\n\n  window.addEventListener('message', function (e) {\n    var msg = e.data || {};\n    if (msg.type === 'init' && msg.data && Array.isArray(msg.data.notes)) {\n      notes = msg.data.notes;\n      render();\n    }\n  });\n</script>\n";

// ---------- state ----------
const uid = () => (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());
const blank = () => ({ kind: "command", name: "", template: "", cwd: "", description: "", shell: "default", distro: "", ui: null, data: {} });

function seed() {
  return {
    commands: [
      { ...blank(), id: uid(), name: "Nmap Scan", description: "Port/service scan with scan-type presets.", template: "nmap {{flags|-sV -T4}} {{target}}", ui: WIDGET_NMAP },
      { ...blank(), id: uid(), name: "WHOIS Lookup", description: "Domain registration info.", template: "whois {{domain}}" },
      { ...blank(), id: uid(), name: "DNS Lookup", description: "Resolve a host's DNS records.", template: "nslookup {{domain}}" },
      { ...blank(), kind: "panel", id: uid(), name: "Subdomain Finder", description: "Certificate-transparency lookup via crt.sh — no local tool needed.", ui: WIDGET_SUBDOMAIN },
      { ...blank(), kind: "panel", id: uid(), name: "Hash Identifier", description: "Offline hash-type guesser.", ui: WIDGET_HASH },
      { ...blank(), kind: "panel", id: uid(), name: "Notes", description: "Log findings and command output as you work.", ui: WIDGET_NOTES },
    ],
    outputs: {},
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.commands)) return { outputs: {}, ...s };
  } catch {}
  return seed();
}
const persist = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));

let state = load();
let currentId = null;     // null = unsaved new item
let model = blank();      // working copy of the active item
let argValues = {};       // values for {{placeholders}}

// ---------- templates ----------
const PLACEHOLDER = /\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g;

function parseArgs(template) {
  const seen = new Map();
  for (const m of template.matchAll(PLACEHOLDER)) if (!seen.has(m[1])) seen.set(m[1], (m[2] ?? "").trim());
  return [...seen].map(([name, def]) => ({ name, def }));
}

// Quote values so an argument can't inject extra shell syntax.
// WSL and non-Windows use POSIX quoting; plain Windows uses cmd-style double quotes.
function quote(v, shell) {
  v = String(v);
  if (v !== "" && /^[\w@%+=:,./\\~-]+$/.test(v)) return v;
  const posix = shell === "wsl" || !IS_WIN;
  return posix ? `'${v.replace(/'/g, `'\\''`)}'` : `"${v.replace(/"/g, '""')}"`;
}

function buildCommand(template, values, shell) {
  const defs = Object.fromEntries(parseArgs(template).map((a) => [a.name, a.def]));
  return template.replace(PLACEHOLDER, (_, name) => {
    const v = values[name] !== undefined && values[name] !== "" ? values[name] : defs[name] ?? "";
    return quote(v, shell);
  });
}
const currentCommand = () => buildCommand(model.template, argValues, model.shell);

// ---------- views ----------
function setMode(mode) {
  document.body.dataset.mode = mode;
  mode === "run" ? renderRun() : renderEdit();
  renderList();
}

function renderList() {
  const q = $("#search").value.toLowerCase();
  const fill = (ul, kind) => {
    ul.innerHTML = "";
    state.commands
      .filter((c) => c.kind === kind && (c.name + (c.template || "")).toLowerCase().includes(q))
      .forEach((c) => {
        const li = document.createElement("li");
        if (c.id === currentId) li.className = "active";
        const b = document.createElement("b");
        b.textContent = (c.name || "Untitled") + (c.ui ? " 🧩" : "") + (c.shell === "wsl" ? " 🐧" : "");
        const s = document.createElement("small");
        s.textContent = kind === "command" ? c.template : c.description || "custom panel";
        li.append(b, s);
        li.onclick = () => select(c.id);
        ul.appendChild(li);
      });
  };
  fill($("#list-commands"), "command");
  fill($("#list-panels"), "panel");
}

// ----- run view -----
function renderRun() {
  $("#run-title").textContent = model.name || "Untitled";
  $("#run-desc").textContent = model.description || "";
  const badge = $("#run-badge");
  badge.hidden = model.shell !== "wsl";
  badge.textContent = "WSL" + (model.distro ? ` · ${model.distro}` : "");

  const isPanel = model.kind === "panel";
  const hasUi = !!model.ui;

  $("#ui-card").hidden = !hasUi;
  $("#args-card").hidden = isPanel || hasUi || parseArgs(model.template).length === 0;
  $("#runbar").hidden = isPanel;
  $("#output-card").hidden = isPanel;

  if (hasUi) $("#ui-frame").srcdoc = model.ui;
  else $("#ui-frame").removeAttribute("srcdoc");

  if (!isPanel) {
    renderArgs();
    const saved = state.outputs[currentId];
    saved ? showOutput(saved, saved.cmd) : clearOutput();
  }
}

function clearOutput() {
  $("#out").textContent = "Nothing run yet.";
  $("#out-meta").textContent = "";
}

function renderArgs() {
  const box = $("#args");
  box.innerHTML = "";
  parseArgs(model.template).forEach(({ name, def }) => {
    const label = document.createElement("label");
    label.textContent = name;
    const input = document.createElement("input");
    input.placeholder = def || "";
    input.value = argValues[name] ?? "";
    input.oninput = () => { argValues[name] = input.value; updatePreview(); };
    label.appendChild(input);
    box.appendChild(label);
  });
  updatePreview();
}

function updatePreview() {
  $("#preview").textContent = "$ " + (currentCommand() || "(empty)");
}

// ----- edit view -----
function renderEdit() {
  $("#edit-title").textContent = currentId ? "Edit" : "New";
  $("#f-kind").value = model.kind;
  $("#f-name").value = model.name;
  $("#f-desc").value = model.description;
  $("#f-template").value = model.template;
  $("#f-shell").value = model.shell || "default";
  $("#f-distro").value = model.distro || "";
  $("#f-cwd").value = model.cwd;
  updateEditView();
}
function updateEditView() {
  const isPanel = $("#f-kind").value === "panel";
  $("#command-fields").hidden = isPanel;
  $("#distro-wrap").hidden = $("#f-shell").value !== "wsl";
  const names = parseArgs($("#f-template").value).map((a) => a.name);
  $("#detected").textContent = names.length ? names.join(", ") : "none";
  $("#ui-hint").textContent = isPanel ? "— required for a panel" : "— shown instead of the form when you run this command";
  $("#ui-status").textContent = model.ui ? "A custom interface is attached." : "No custom interface attached.";
  $("#btn-ui-remove").hidden = !model.ui;
  $("#btn-delete").hidden = currentId === null;
}

// ---------- actions ----------
function select(id) {
  const c = state.commands.find((x) => x.id === id);
  if (!c) return;
  currentId = id;
  model = { ...blank(), ...c, data: c.data || {} };
  argValues = {};
  setMode("run");
}

function newDraft() {
  currentId = null;
  model = blank();
  argValues = {};
  setMode("edit");
  $("#f-name").focus();
}

function readForm() {
  model.kind = $("#f-kind").value;
  model.name = $("#f-name").value.trim() || "Untitled";
  model.description = $("#f-desc").value.trim();
  model.template = $("#f-template").value;
  model.shell = $("#f-shell").value;
  model.distro = $("#f-distro").value.trim();
  model.cwd = $("#f-cwd").value.trim();
}

function save() {
  readForm();
  if (model.kind === "command" && !model.template.trim()) return alert("Write a command first.");
  if (model.kind === "panel" && !model.ui) return alert("Panels need a custom interface — attach an .html file first.");
  if (currentId) {
    const i = state.commands.findIndex((c) => c.id === currentId);
    state.commands[i] = { ...model, id: currentId };
  } else {
    currentId = uid();
    state.commands.push({ ...model, id: currentId });
  }
  persist();
  argValues = {};
  setMode("run");
}

function cancel() {
  if (currentId) return select(currentId);
  state.commands.length ? select(state.commands[0].id) : null;
}

function del() {
  if (!currentId || !confirm("Delete this item?")) return;
  state.commands = state.commands.filter((c) => c.id !== currentId);
  delete state.outputs[currentId];
  persist();
  currentId = null;
  state.commands.length ? select(state.commands[0].id) : newDraft();
}

function showOutput(res, cmd) {
  const out = $("#out");
  out.innerHTML = "";
  const head = document.createElement("div");
  head.className = res.code === 0 ? "ok" : "err";
  head.textContent = `$ ${cmd}\n`;
  out.appendChild(head);
  if (res.stdout) out.appendChild(document.createTextNode(res.stdout));
  if (res.stderr) { const e = document.createElement("span"); e.className = "err"; e.textContent = res.stderr; out.appendChild(e); }
  $("#out-meta").textContent = `exit ${res.code ?? "?"} · ${res.ms} ms`;
}

async function run() {
  if (model.kind !== "command") return;
  const cmd = currentCommand();
  if (!cmd.trim()) return;
  const btn = $("#btn-run");
  btn.disabled = true;
  let res;
  try {
    res = await invoke("run_command", { command: cmd, cwd: model.cwd || null, shell: model.shell, distro: model.distro || null });
  } catch (e) {
    res = { stdout: "", stderr: String(e), code: null, ms: 0 };
  }
  res.cmd = cmd;
  state.outputs[currentId] = res;   // remembered independently per item
  persist();
  showOutput(res, cmd);
  btn.disabled = false;

  // let an attached custom UI react to the result too, regardless of what triggered the run
  if (model.ui) frame.contentWindow.postMessage({ type: "result", result: res }, "*");
  return res;
}

// ---------- custom UI (sandboxed iframe + postMessage) ----------
// Widget -> host:  {type:"run", args:{...}}       (command kind only)
//                  {type:"setArgs", args:{...}}    (command kind only)
//                  {type:"saveData", data:{...}}   (any kind — merged into the item's own storage)
// Host -> widget:  {type:"init", kind, template, args, values, data}
//                  {type:"result", result}
const frame = $("#ui-frame");
frame.addEventListener("load", () => {
  if (!frame.hasAttribute("srcdoc")) return;
  frame.contentWindow.postMessage(
    { type: "init", kind: model.kind, template: model.template || "", args: parseArgs(model.template || ""), values: argValues, data: model.data || {} },
    "*"
  );
});
window.addEventListener("message", async (e) => {
  if (e.source !== frame.contentWindow) return;
  const msg = e.data || {};
  if (msg.type === "saveData") {
    model.data = { ...(model.data || {}), ...(msg.data || {}) };
    if (currentId) {
      const item = state.commands.find((c) => c.id === currentId);
      if (item) { item.data = model.data; persist(); }
    }
    return;
  }
  if (model.kind !== "command") return;
  if (msg.type !== "setArgs" && msg.type !== "run") return;
  Object.entries(msg.args || {}).forEach(([k, v]) => (argValues[k] = String(v)));
  updatePreview();
  if (msg.type === "run") await run();
});

// ---------- import / export ----------
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

// ---------- wiring ----------
$("#search").oninput = renderList;
$("#btn-new").onclick = newDraft;
$("#btn-edit").onclick = () => setMode("edit");
$("#btn-save").onclick = save;
$("#btn-cancel").onclick = cancel;
$("#btn-delete").onclick = del;
$("#btn-run").onclick = run;
$("#f-template").oninput = updateEditView;
$("#f-shell").onchange = updateEditView;
$("#f-kind").onchange = updateEditView;

$("#btn-ui").onclick = () => $("#file-ui").click();
$("#file-ui").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  model.ui = await f.text();     // stored when you press Save
  e.target.value = "";
  updateEditView();
};
$("#btn-ui-remove").onclick = () => { model.ui = null; updateEditView(); };

$("#btn-export").onclick = () => download("nazgul-commands.json", JSON.stringify(state, null, 2));
$("#btn-import").onclick = () => $("#file-import").click();
$("#file-import").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data.commands;
    if (!Array.isArray(list)) throw new Error("No commands found");
    list.forEach((c) => state.commands.push({ ...blank(), ...c, id: uid() }));
    persist(); renderList();
  } catch (err) { alert("Import failed: " + err.message); }
  e.target.value = "";
};

renderList();
state.commands.length ? select(state.commands[0].id) : newDraft();
