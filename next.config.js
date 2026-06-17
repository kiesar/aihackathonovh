const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  sassOptions: {
    includePaths: ["node_modules"],
  },
  // Prevent webpack from bundling these server-only packages
  serverExternalPackages: ["pdf-parse", "tesseract.js"],
  // Silence the "multiple lockfiles" workspace root warning
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
