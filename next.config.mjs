import { builtinModules } from 'node:module';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const SERVER_ONLY_EXTERNALS = [
  'node-cron',
  'nodemailer',
  'xlsx',
  // Resume scanning — both shell out to Node-only dependencies (pdfjs-dist,
  // mammoth's stream pipeline). Letting webpack bundle them breaks the
  // dynamic requires inside pdf-parse and the worker resolution in pdfjs.
  'pdf-parse',
  'pdfjs-dist',
  'mammoth',
];

// Every Node built-in (crypto, path, stream, fs, ...) plus the `node:` prefixed
// form. The instrumentation bundle imports a chain of server-only modules
// (auth → bcrypt → crypto, scheduler → node-cron → path, etc.) and webpack
// otherwise tries to resolve them in browser space and fails.
const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    instrumentationHook: true,
    serverComponentsExternalPackages: SERVER_ONLY_EXTERNALS,
    // Tells the compiler to tree-shake these barrel packages so importing
    // one icon / helper doesn't pull the entire library into the chunk.
    // Biggest win on `lucide-react` (hundreds of icons) — present in nearly
    // every page chunk in this app.
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'react-icons',
      '@radix-ui/react-icons',
      'recharts',
    ],
  },
  // serverComponentsExternalPackages doesn't cover the instrumentation bundle,
  // so externalize the same packages at the webpack layer for the server build.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      externals.push(({ request }, callback) => {
        if (!request) return callback();
        // Node built-ins → bare `require("crypto")` at runtime.
        if (NODE_BUILTINS.has(request)) {
          return callback(null, `commonjs ${request}`);
        }
        // Server-only packages we never want webpack to bundle.
        if (SERVER_ONLY_EXTERNALS.some((p) => request === p || request.startsWith(`${p}/`))) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
      config.externals = externals;
    }
    return config;
  },
}

export default withBundleAnalyzer(nextConfig)
