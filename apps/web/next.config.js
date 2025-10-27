const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // ensure Next can trace files from monorepo root during build
  experimental: { outputFileTracingRoot: path.join(__dirname, "../..") },
  transpilePackages: ["@pluto/api"],
  reactStrictMode: true,
};

module.exports = nextConfig;