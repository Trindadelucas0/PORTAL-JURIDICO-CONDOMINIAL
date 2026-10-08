// Captura os prints do guia a partir do servidor de DEMONSTRAÇÃO (banco PORTAL-JURIDICO-GUIA).
// Uso: GUIA_COOKIE_JAR=<cookie jar do curl após login demo> node docs/guia-cliente/capturar-prints.mjs [print1,print2]
// Atenção: "03c-confirmar" vincula o número demo de verdade (cria a triagem usada em "05-triagem").
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "prints");
const baseUrl = process.env.GUIA_BASE_URL || "http://localhost:3011";
const debugPort = 9333;
const viewport = { width: 1440, height: 900 };

const CONVERSA_ID = "6d9ae06c-b518-4df2-883e-547e9e897000";
const CHAMADO_ID = "f0c42d27-9cf2-41d6-ad75-6c367a35d396";

const shots = [
  {
    name: "01-atendimento",
    url: "/atendimento",
    waitText: "Sindico Demo",
    steps: [{ click: "Sindico Demo" }, { waitText: "Aguardando aprovação" }],
    marks: [
      { n: 1, text: "Sindico Demo" },
      { n: 2, text: "Rascunho" },
      { n: 3, text: "Aprovar e enviar", last: true },
      { n: 4, text: "Resumo IA", last: true },
    ],
  },
  {
    name: "02-documentos",
    url: "/documentos",
    waitText: "Residencial Demo Guia",
    steps: [
      { click: "Residencial Demo Guia" },
      { waitText: "Regimento Interno vigente 3.0" },
      { click: "Regimento Interno vigente 3.0", contains: true },
      { waitText: "Permitir busca da IA" },
    ],
    marks: [
      { n: 1, text: "Novo documento" },
      { n: 2, text: "Regimento Interno vigente 3.0", contains: true },
      { n: 3, text: "Pode enviar ao cliente" },
      { n: 4, text: "Permitir busca da IA" },
    ],
  },
  {
    name: "03-nao-vinculados",
    url: "/nao-vinculados",
    waitText: "99900-0099",
    steps: [{ click: "+55 (31) 99900-0099" }, { waitText: "Vincular ao fluxo" }],
    marks: [
      { n: 1, text: "+55 (31) 99900-0099" },
      { n: 2, text: "Oi, sou novo no predio", contains: true, last: true },
      { n: 3, text: "Vincular ao fluxo" },
    ],
  },
  {
    name: "03b-vincular",
    url: "/nao-vinculados",
    waitText: "99900-0099",
    steps: [
      { click: "+55 (31) 99900-0099" },
      { waitText: "Vincular ao fluxo" },
      { click: "Vincular ao fluxo" },
      { waitText: "Condomínio" },
      { fill: "#en-nome", value: "Morador Demo" },
      { select: "#en-condo", option: "Residencial Demo Guia" },
    ],
    marks: [
      { n: 1, text: "Nome", tag: "label" },
      { n: 2, text: "Condomínio", tag: "label" },
      { n: 3, text: "Vincular ao fluxo", tag: "button", last: true },
    ],
    after: [{ click: "Vincular ao fluxo", tag: "button", last: true }, { waitText: "Isso cadastra o contato" }],
  },
  {
    name: "03c-confirmar",
    reuse: true,
    marks: [{ n: 1, text: "Confirmar vínculo", tag: "button", last: true }],
    after: [{ click: "Confirmar vínculo", tag: "button", last: true }, { wait: 2500 }],
  },
  {
    name: "04-analise",
    url: `/chamados/${CHAMADO_ID}`,
    waitText: "Horário de silêncio",
    steps: [{ click: "Resumo IA" }, { waitText: "Análise do atendimento" }, { wait: 1200 }],
    marks: [
      { n: 1, text: "Análise do atendimento" },
      { n: 2, text: "Entendimento", insideDialog: true },
      { n: 3, text: "Contexto utilizado", insideDialog: true },
      { n: 4, text: "Documentos consultados", insideDialog: true },
    ],
  },
  {
    name: "04b-analise-resposta",
    reuse: true,
    steps: [{ scrollDialogTo: "Resposta sugerida" }],
    marks: [
      { n: 5, text: "Resposta sugerida", insideDialog: true },
      { n: 6, text: "Próxima ação", insideDialog: true },
    ],
  },
  {
    name: "05-triagem",
    url: "/triagem",
    waitText: "Morador Demo",
    steps: [{ click: "Morador Demo" }, { waitText: "Criar chamado" }, { wait: 800 }],
    marks: [
      { n: 1, text: "Morador Demo" },
      { n: 2, text: "Classificação" },
      { n: 3, text: "Criar chamado" },
    ],
  },
  {
    name: "05b-chamado",
    url: `/chamados/${CHAMADO_ID}`,
    waitText: "Horário de silêncio",
    steps: [{ wait: 800 }],
    marks: [
      { n: 1, text: "2026-GUIA-01", contains: true },
      { n: 2, text: "Caso", tag: "tab" },
      { n: 3, text: "Linha do tempo", tag: "tab" },
      { n: 4, text: "Comunicação", tag: "tab" },
      { n: 5, text: "Resumo IA", tag: "tab" },
    ],
  },
];

function readSessionCookie() {
  const jar = process.env.GUIA_COOKIE_JAR;
  if (!jar || !existsSync(jar)) throw new Error("Defina GUIA_COOKIE_JAR com o cookie jar do login demo.");
  const line = readFileSync(jar, "utf8")
    .split(/\r?\n/)
    .find((l) => l.includes("\tjuricon_session\t"));
  if (!line) throw new Error("Cookie juricon_session não encontrado no jar.");
  const cols = line.split("\t");
  return cols[cols.length - 1];
}

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome/Edge não encontrado.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) return;
    } catch {
      /* ainda subindo */
    }
    await sleep(200);
  }
  throw new Error("Chrome não abriu a porta de depuração.");
}

async function openPage() {
  const res = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function evaluate(page, fn, arg) {
  const expression = `(${fn})(${JSON.stringify(arg ?? null)})`;
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

// Executado dentro da página. mode: "locate" devolve a caixa, "click" clica, "scroll" rola até o texto.
function actInPage(q) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = norm(q.text);
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'));
  const root = q.insideDialog ? dialogs[dialogs.length - 1] || document.body : document.body;
  const selector = { tab: '[role="tab"]', label: "label", button: "button" }[q.tag] || "*";
  let pool = Array.from(root.querySelectorAll(selector)).filter((el) => {
    if (el.closest("[data-guia-mark]")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (q.mode === "locate" && (r.bottom < 0 || r.top > innerHeight)) return false;
    const t = norm(el.innerText);
    return q.contains ? t.includes(wanted) : t === wanted;
  });
  pool = pool.filter((el) => !pool.some((o) => o !== el && el.contains(o)));
  const el = q.last ? pool[pool.length - 1] : pool[0];
  if (!el) return null;
  if (q.mode === "scroll") {
    el.scrollIntoView({ block: "start" });
    return true;
  }
  if (q.mode === "click") {
    const target = el.closest('button, a, [role="tab"], [role="button"], tr, li') || el;
    target.scrollIntoView({ block: "center" });
    target.click();
    return true;
  }
  let r = el.getBoundingClientRect();
  if (el.children.length === 0) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const textBox = range.getBoundingClientRect();
    if (textBox.width > 2) r = textBox;
  }
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

// Preenche input/select controlado pelo React disparando os eventos nativos.
function setFieldInPage(q) {
  const el = document.querySelector(q.selector);
  if (!el) return false;
  let value = q.value;
  if (el.tagName === "SELECT") {
    const opt = Array.from(el.options).find((o) => o.textContent.trim() === q.option);
    if (!opt) return false;
    value = opt.value;
  }
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function drawMarks(boxes) {
  document.querySelectorAll("[data-guia-mark]").forEach((n) => n.remove());
  document.querySelectorAll("nextjs-portal").forEach((n) => (n.style.display = "none"));
  for (const b of boxes) {
    const pad = 4;
    const ring = document.createElement("div");
    ring.dataset.guiaMark = "1";
    Object.assign(ring.style, {
      position: "fixed",
      left: `${b.x - pad}px`,
      top: `${b.y - pad}px`,
      width: `${b.w + pad * 2}px`,
      height: `${b.h + pad * 2}px`,
      border: "2.5px solid #e11d48",
      borderRadius: "8px",
      zIndex: 2147483646,
      pointerEvents: "none",
      boxShadow: "0 0 0 3px rgba(225,29,72,0.18)",
    });
    const badge = document.createElement("div");
    badge.dataset.guiaMark = "1";
    badge.textContent = String(b.n);
    Object.assign(badge.style, {
      position: "fixed",
      left: `${Math.max(2, b.x - pad - 13)}px`,
      top: `${Math.max(2, b.y - pad - 13)}px`,
      width: "26px",
      height: "26px",
      borderRadius: "50%",
      background: "#e11d48",
      color: "#fff",
      font: "700 14px/26px system-ui, sans-serif",
      textAlign: "center",
      zIndex: 2147483647,
      pointerEvents: "none",
      boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
    });
    document.body.append(ring, badge);
  }
}

async function waitForText(page, text, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await evaluate(
      page,
      (t) => !!document.body && document.body.innerText.toLowerCase().includes(t.toLowerCase()),
      text,
    );
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`Texto não apareceu: "${text}"`);
}

async function runSteps(page, steps = []) {
  for (const step of steps) {
    if (step.wait) await sleep(step.wait);
    if (step.waitText) await waitForText(page, step.waitText);
    if (step.click) {
      const ok = await evaluate(page, actInPage, { ...step, text: step.click, mode: "click" });
      if (!ok) throw new Error(`Não achei para clicar: "${step.click}"`);
      await sleep(600);
    }
    if (step.fill || step.select) {
      const ok = await evaluate(page, setFieldInPage, { selector: step.fill || step.select, value: step.value, option: step.option });
      if (!ok) throw new Error(`Não consegui preencher: ${step.fill || step.select}`);
      await sleep(300);
    }
    if (step.scrollDialogTo) {
      const ok = await evaluate(page, actInPage, { text: step.scrollDialogTo, insideDialog: true, mode: "scroll" });
      if (!ok) throw new Error(`Não achei para rolar: "${step.scrollDialogTo}"`);
      await sleep(400);
    }
  }
}

async function capture(page, shot) {
  if (!shot.reuse) {
    await page.send("Page.navigate", { url: baseUrl + shot.url });
    await waitForText(page, shot.waitText, 60000);
    await sleep(700);
  }
  await evaluate(page, () => document.querySelectorAll("[data-guia-mark]").forEach((n) => n.remove()));
  await runSteps(page, shot.steps);
  await sleep(500);
  const boxes = [];
  const missing = [];
  for (const m of shot.marks) {
    const box = await evaluate(page, actInPage, { ...m, mode: "locate" });
    if (box) boxes.push({ ...box, n: m.n });
    else missing.push(m.text);
  }
  await evaluate(page, drawMarks, boxes);
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(outDir, `${shot.name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  await evaluate(page, () => document.querySelectorAll("[data-guia-mark]").forEach((n) => n.remove()));
  await runSteps(page, shot.after);
  return { file, marked: boxes.length, missing };
}

async function main() {
  const only = process.argv[2]?.split(",");
  const token = readSessionCookie();
  mkdirSync(outDir, { recursive: true });
  const profile = path.join(tmpdir(), "guia-juricon-chrome");
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      `--window-size=${viewport.width},${viewport.height}`,
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    { stdio: "ignore" },
  );
  try {
    await waitForDebugger();
    const page = await openPage();
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
    const host = new URL(baseUrl).hostname;
    await page.send("Network.setCookie", { name: "juricon_session", value: token, domain: host, path: "/", httpOnly: true });
    for (const shot of shots) {
      if (only && !only.includes(shot.name)) continue;
      try {
        const r = await capture(page, shot);
        console.log(`ok ${shot.name}: ${r.marked} marcas${r.missing.length ? `, faltou: ${r.missing.join(" | ")}` : ""}`);
      } catch (err) {
        const { data } = await page.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(path.join(tmpdir(), `guia-erro-${shot.name}.png`), Buffer.from(data, "base64"));
        console.log(`ERRO ${shot.name}: ${err.message}`);
      }
    }
    page.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
