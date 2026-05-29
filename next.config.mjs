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
  serverExternalPackages: SERVER_ONLY_EXTERNALS,
  // Pin the workspace root so Next doesn't pick up a stray pnpm-lock.yaml
  // higher up the tree (e.g. in the user home dir) and infer the wrong root.
  turbopack: {
    root: import.meta.dirname,
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
}

export default withBundleAnalyzer(nextConfig)
