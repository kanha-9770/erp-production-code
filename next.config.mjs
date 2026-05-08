const SERVER_ONLY_EXTERNALS = ['node-cron', 'nodemailer', 'xlsx'];

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
        if (request && SERVER_ONLY_EXTERNALS.some((p) => request === p || request.startsWith(`${p}/`))) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
      config.externals = externals;
    }
    return config;
  },
}

export default nextConfig
