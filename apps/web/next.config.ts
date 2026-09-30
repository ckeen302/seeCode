import { existsSync } from "node:fs"
import path from "node:path"

import type { NextConfig } from "next"

// One `.env` at the repo root serves both apps (Section 22.1). Variables already set in
// the environment (Vercel, CI) win over the file.
const rootEnv = path.join(process.cwd(), "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

// Optional same-origin API: with API_PROXY_TARGET set (e.g. http://127.0.0.1:8000), this
// server forwards /api/v1/* to the API and NEXT_PUBLIC_API_URL can be "/api/v1". GitHub
// Codespaces uses it, since only the web port is reachable from the browser there.
// Read at build time.
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "")

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the dev-only indicator clear of the sidebar's profile menu.
  devIndicators: { position: "bottom-right" },
  async rewrites() {
    return apiProxyTarget
      ? [{ source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` }]
      : []
  },
}

export default nextConfig
