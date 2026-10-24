# Nazgul

A small desktop app (Tauri v2) for saving and running commands and custom tools
for OSINT / cybersecurity recon work — built around two kinds of saved items:

- **Commands** — a shell command template, e.g. `nmap {{flags|-sV -T4}} {{target}}`.
  Every `{{name}}` / `{{name|default}}` becomes an input field automatically, with
  a live preview of the final command, unless you attach a custom interface.
- **Panels** — a custom interface with *no* shell command behind it at all. Use
  this for things that aren't a terminal command, like a notes app or a tool
  that just queries a public API from the browser.

The **Run view** is the default screen for every item: it shows only the custom
interface (or the auto-generated form) and the output, with nothing else in the
way. All the settings — template, shell, working directory, attaching a custom
interface — live behind the **✎ Edit** button, so they don't clutter the main view.

Each item remembers its own state when you switch away and back:
- a command's last output stays saved per command (switching to another command
  and back doesn't lose it — each one behaves like its own shell session),
- a custom interface can save its own data (e.g. the Notes panel's note list, or
  a panel's last search) through the same mechanism, so it's still there next
  time you open it.

## Included examples (OSINT / cybersecurity)
- **Nmap Scan** (command + custom UI): target field, scan-type presets (quick,
  service/version, all ports, stealth SYN, OS detect), results shown inline.
- **WHOIS Lookup**, **DNS Lookup** (plain commands, auto-generated form — no
  custom UI needed for a single argument).
- **Subdomain Finder** (panel): queries crt.sh's public certificate-transparency
  log directly from the panel — no local tool required.
- **Hash Identifier** (panel): offline, client-side guess of a hash's likely
  type from its length and character set.
- **Notes** (panel): paste command output or write findings as you go; notes
  are saved with the panel.

Raw copies of each interface are in `examples/`, so you can also try the
**Attach .html file** import flow in the Edit view instead of using the seeded
versions.

> **Use responsibly.** Nmap scans, WHOIS/DNS lookups and similar recon tools
> should only be run against systems and domains you own or have explicit
> permission to test.

## Run it
Requirements: Node.js, Rust (https://rustup.rs) and the Tauri prerequisites for
your OS (https://v2.tauri.app/start/prerequisites/). `nmap` and `whois` need to
be installed separately if you want those specific example commands to work —
the app itself doesn't bundle them.

```
npm install
npm run tauri icon app-icon.png   # generates src-tauri/icons (first time only)
npm run dev
```

## WSL support (Windows)
Each command has a Shell setting: system default, or WSL. WSL commands run as
`wsl.exe -e bash -lc "<command>"`, optionally in a named distro and a Linux
working directory (e.g. `~/recon`). Argument values get POSIX-style quoting
when WSL is selected.

## Custom interface protocol
A custom interface is a self-contained `.html` file running in a sandboxed
iframe (`allow-scripts` only — no access to the host page or Tauri APIs
directly). It talks to the app with `postMessage`:

Widget → host:
- `{type:"setArgs", args:{...}}` — update argument values (command kind only)
- `{type:"run", args:{...}}` — set args and run the command (command kind only)
- `{type:"saveData", data:{...}}` — merge data into this item's own persisted storage (any kind)

Host → widget:
- `{type:"init", kind, template, args, values, data}` — sent once the iframe loads
- `{type:"result", result}` — sent after a run, with `{stdout, stderr, code, ms}`

## Security notes
This app runs shell commands by design, so only save commands you trust.
Argument values are quoted before insertion to stop them from injecting extra
shell syntax. Custom interfaces are sandboxed and can only suggest argument
values, ask the app to run the saved template, or save their own small bits of
data — they cannot call Tauri or reach outside their iframe except via normal
web requests (e.g. the crt.sh panel's own `fetch` calls).

## How AI was used
(Fill in: tool used, key prompts, bugs found and how you fixed them.)
