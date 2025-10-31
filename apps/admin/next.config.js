/** @type {import('next').NextConfig} */
const rawGameEnabled = process.env.GAME_ENABLED ?? process.env.NEXT_PUBLIC_GAME_ENABLED ?? '0';

const path = require('path');

const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  env: {
    GAME_ENABLED: rawGameEnabled,
    NEXT_PUBLIC_GAME_ENABLED: rawGameEnabled,
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@supabase/supabase-js'] = path.resolve(__dirname, '../../packages/supabase-js-stub');
    return config;
  },
};

module.exports = nextConfig;
