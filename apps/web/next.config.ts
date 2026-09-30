import { existsSync } from "node:fs"
import path from "node:path"

import type { NextConfig } from "next"

// One `.env` at the repo root serves both apps (Section 22.1). Variables already set in
// the environment (Vercel, CI) win over the file.
const rootEnv = path.join(process.cwd(), "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the dev-only indicator clear of the sidebar's profile menu.
  devIndicators: { position: "bottom-right" },
}

export default nextConfig
