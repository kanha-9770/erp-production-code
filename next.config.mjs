import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

// Server-only packages we never want bundled — they shell out to Node-only
// dependencies (pdfjs-dist dynamic requires, mammoth's stream pipeline) that
// the bundler would otherwise try to resolve. serverExternalPackages covers
// both the route bundle and the instrumentation bundle under Turbopack.
const SERVER_ONLY_EXTERNALS = [
  'node-cron',
  'nodemailer',
  'xlsx',
  'pdf-parse',
  'pdfjs-dist',
  'mammoth',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
<<<<<<< HEAD
  serverExternalPackages: SERVER_ONLY_EXTERNALS,
  // Pin the workspace root so Next doesn't pick up a stray pnpm-lock.yaml
  // higher up the tree (e.g. in the user home dir) and infer the wrong root.
  turbopack: {
    root: import.meta.dirname,
=======
  // Long-lived caching for static assets that never change content under a
  // given filename. `/models/*` holds the face-api.js weight shards (~7 MB
  // total) used by the attendance face-capture flow — the files are
  // immutable for a given face-api version, so they should be downloaded
  // ONCE per browser and reused forever. Without this header, browsers
  // fell back to default heuristics and re-fetched ~7 MB on every fresh
  // session, dominating first-punch latency on slow connections.
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
>>>>>>> ec1bb8fbf0c734758a18fddea034b14152d5218d
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Tree-shake these barrel packages so importing one icon / helper doesn't
    // pull the entire library into the chunk. Biggest win on `lucide-react`
    // (hundreds of icons) — present in nearly every page chunk in this app.
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'react-icons',
      '@radix-ui/react-icons',
      'recharts',
    ],
  },
<<<<<<< HEAD
=======
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
    } else {
      // Client bundle: face-api.js (and a couple of other libs) reference
      // Node-only modules in dead-code branches. Without an explicit
      // `fs: false`, webpack sees the unresolved `require('fs')` inside
      // face-api's env detection and fails the entire client compile —
      // which silently breaks descriptor extraction in the attendance
      // widget. The `false` fallback tells webpack to substitute an
      // empty module for the unresolvable id, which is exactly what
      // face-api's runtime check expects when it falls back to the
      // browser code path.
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        crypto: false,
        encoding: false,
      };
    }
    return config;
  },
>>>>>>> ec1bb8fbf0c734758a18fddea034b14152d5218d
}

export default withBundleAnalyzer(nextConfig)
