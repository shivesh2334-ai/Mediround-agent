/** @type {import('next').NextConfig} */
export default {
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
    outputFileTracingIncludes: { "/api/run": ["./node_modules/@sparticuz/chromium/bin/**"] },
  },
};
