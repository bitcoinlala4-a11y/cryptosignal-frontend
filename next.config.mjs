/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  env: {
    NEXT_PUBLIC_API_URL: "https://cryptosignal-backend.onrender.com",
    NEXT_PUBLIC_WS_URL: "wss://cryptosignal-backend.onrender.com",
  },
};

export default nextConfig;
