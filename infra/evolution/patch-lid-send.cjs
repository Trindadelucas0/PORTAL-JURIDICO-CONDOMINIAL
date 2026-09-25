"use strict";

const fs = require("fs");
const path = require("path");

const replacements = [
  [
    'if(!n.exists&&!(0,P.isJidGroup)(n.jid)&&!n.jid.includes("@broadcast"))throw new f(n);',
    'if(!n.exists&&!(0,P.isJidGroup)(n.jid)&&!n.jid.includes("@broadcast")&&!String(n.jid||"").includes("@lid"))throw new f(n);',
  ],
  [
    'if(!s.exists&&!(0,P.isJidGroup)(s.jid)&&!s.jid.includes("@broadcast"))throw new f(s);',
    'if(!s.exists&&!(0,P.isJidGroup)(s.jid)&&!s.jid.includes("@broadcast")&&!String(s.jid||"").includes("@lid"))throw new f(s);',
  ],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (name.endsWith(".js")) files.push(full);
  }
  return files;
}

const root = "/evolution/dist";
if (!fs.existsSync(root)) return;

let patched = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of replacements) {
    if (!src.includes(from)) continue;
    src = src.split(from).join(to);
    changed = true;
  }
  if (!changed) continue;
  fs.writeFileSync(file, src);
  patched += 1;
}

if (patched > 0) {
  process.stderr.write(`[juricon] patch-lid-send: ${patched} bundles\n`);
}
