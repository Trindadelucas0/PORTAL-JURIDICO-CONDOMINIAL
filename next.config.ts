import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // A pasta pai (condominio-advogada) tem outro lockfile. Sem este root o
  // Turbopack sobe um nível e deixa de registrar rotas aninhadas, como
  // /api/conversations/:id/messages.
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    proxyClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
