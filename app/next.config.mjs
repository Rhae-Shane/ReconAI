import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute app root. `import.meta.dirname` is empty on some Windows Next 16 boots and Turbopack panics. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/close",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
