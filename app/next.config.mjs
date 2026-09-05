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
  transpilePackages: ["controller-harness"],
  // Avoid bundling Floating UI into the RSC graph under the `react-server`
  // react-dom condition (that build omits `flushSync`).
  serverExternalPackages: ["@floating-ui/react-dom", "@floating-ui/dom", "@floating-ui/core"],
  turbopack: {
    root: appRoot,
  },
  webpack: (config) => {
    // @floating-ui/react-dom does `import * as ReactDOM from 'react-dom'` then
    // `ReactDOM.flushSync`. Under Webpack + React 19's `react-server` export
    // condition, flushSync is absent → "Attempted import error". Prefer the
    // browser/default conditions for that package only.
    config.module.rules.push({
      test: /node_modules[\\/]@floating-ui[\\/]react-dom[\\/]/,
      resolve: {
        conditionNames: ["browser", "import", "require", "default"],
      },
    });
    return config;
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
