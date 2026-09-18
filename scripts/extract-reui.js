const fs = require("fs");
const path = require("path");
const src = process.argv[2];
const dest = process.argv[3];
const j = JSON.parse(fs.readFileSync(src, "utf8"));
let c = j.files[0].content.replaceAll('from "cn"', 'from "@/lib/utils"');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, c);
console.log("wrote", dest, c.length);
