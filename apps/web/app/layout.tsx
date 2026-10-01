import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import { Providers } from "@/components/providers"
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar"
import { THEME_INIT_SCRIPT } from "@/lib/theme"
import "@/styles/globals.css"

// Section 18.2: Inter for UI text, JetBrains Mono for code and complexity chips.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: { default: "SeeCode", template: "%s · SeeCode" },
  description:
    "Learn to see the approach, not memorize the answer. Plan it, visualize it, remember it. Free.",
}

export const viewport: Viewport = {
  colorScheme: "dark light",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the stored theme and sidebar state before first paint. */}
        <script
          dangerouslySetInnerHTML={{ __html: `${THEME_INIT_SCRIPT};${SIDEBAR_INIT_SCRIPT};` }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
