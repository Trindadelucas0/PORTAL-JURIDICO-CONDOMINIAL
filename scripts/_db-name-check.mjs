import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const match = env.match(/^DATABASE_URL=(.*)$/m);
if (!match) {
  console.log("NO_URL");
  process.exit(1);
}
let raw = match[1].trim();
if (
  (raw.startsWith('"') && raw.endsWith('"')) ||
  (raw.startsWith("'") && raw.endsWith("'"))
) {
  raw = raw.slice(1, -1);
}
const url = new URL(raw);
console.log(
  JSON.stringify({
    host: url.hostname,
    port: url.port,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  }),
);
