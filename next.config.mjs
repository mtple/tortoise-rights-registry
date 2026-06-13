/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Audio + images are loaded from public Pinata gateways (Tortoise seam) and Walrus aggregators.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.mypinata.cloud" },
      { protocol: "https", hostname: "*.walrus-testnet.walrus.space" },
      { protocol: "https", hostname: "*.walrus.space" },
    ],
  },
};

export default nextConfig;
