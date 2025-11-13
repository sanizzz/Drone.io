/** @type {import("next").NextConfig} */
const config = {
  experimental: {
    turbo: {
      root: "./", // Explicitly set root to frontend directory to avoid lockfile detection issues
    },
  },
};

export default config;

