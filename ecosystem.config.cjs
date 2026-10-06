const fs = require("fs");
const path = require("path");

const cwd = __dirname;
const runner = path.join(cwd, "infra/deploy/with-env.py");
/** Override on VPS if pnpm is not on PATH, e.g. /home/exito/.local/node/bin/pnpm */
const pnpm = process.env.JURICON_PNPM || "pnpm";

function envValue(key, fallback) {
  const envPath = path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) return process.env[key] || fallback;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const k = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (k !== key) continue;
    let v = line.slice(eq + 1).trim();
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return process.env[key] || fallback;
}

const hostPort = envValue("JURICON_HOST_PORT", "3010");

module.exports = {
  apps: [
    {
      name: "juricon-app",
      cwd,
      script: runner,
      args: `${pnpm} exec next start --hostname 0.0.0.0 --port ${hostPort}`,
      interpreter: "python3",
      autorestart: true,
    },
    {
      name: "juricon-worker",
      cwd,
      script: runner,
      args: `--worker ${pnpm} exec tsx worker/index.ts`,
      interpreter: "python3",
      autorestart: true,
    },
  ],
};
