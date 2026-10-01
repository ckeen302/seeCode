import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { test as base, expect, type BrowserContext } from "@playwright/test"

// The Workspace loads Pyodide and Monaco from jsDelivr (Sections 9.1 and 13.2), and so do
// these tests. Some sandboxes send HTTPS through a proxy that re-signs TLS with a private
// CA: Node trusts it (NODE_EXTRA_CA_CERTS) but the test browser does not. There, the CDN
// files are fetched by Node instead and kept in a disk cache. CI loads them directly.
// PW_CDN_VIA_NODE=1 or 0 forces either way.

const CDN_ORIGIN = "https://cdn.jsdelivr.net/"
const CACHE_DIR = path.resolve(__dirname, "../../node_modules/.cache/seecode-e2e-cdn")

export function cdnViaNode(): boolean {
  const flag = process.env.PW_CDN_VIA_NODE
  if (flag === "1" || flag === "0") return flag === "1"
  return Boolean(process.env.HTTPS_PROXY && process.env.NODE_EXTRA_CA_CERTS)
}

interface CachedFile {
  body: Buffer
  contentType: string
}

async function fetchCached(url: string): Promise<CachedFile> {
  const file = path.join(CACHE_DIR, createHash("sha256").update(url).digest("hex"))
  try {
    const [body, meta] = await Promise.all([readFile(file), readFile(`${file}.json`, "utf8")])
    return { body, contentType: (JSON.parse(meta) as { contentType: string }).contentType }
  } catch {
    // Not cached yet.
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  const body = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get("content-type") ?? "application/octet-stream"
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(file, body)
  await writeFile(`${file}.json`, JSON.stringify({ url, contentType }))
  return { body, contentType }
}

export async function serveCdnThroughNode(context: BrowserContext): Promise<void> {
  await context.route(`${CDN_ORIGIN}**`, async (route) => {
    try {
      const { body, contentType } = await fetchCached(route.request().url())
      await route.fulfill({
        status: 200,
        body,
        headers: {
          "content-type": contentType,
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=31536000, immutable",
        },
      })
    } catch {
      await route.abort("failed")
    }
  })
}

export const test = base.extend({
  // (Playwright's fixture callback is usually named `use`; that trips the React hooks rule.)
  context: async ({ context }, provide) => {
    if (cdnViaNode()) await serveCdnThroughNode(context)
    await provide(context)
  },
})

export { expect }
