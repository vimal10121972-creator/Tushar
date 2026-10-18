import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false, turbopack: { root: process.cwd() }, serverExternalPackages: ["pdf-lib"] };
export default config;
