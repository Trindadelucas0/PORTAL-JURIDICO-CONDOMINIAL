import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SmoothScroll } from "@/components/smooth-scroll";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/themes";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Juricon — escritório interno",
  description: "Portal jurídico condominial para o escritório. O síndico não opera neste sistema.",
};

export const viewport: Viewport = {
  themeColor: "#1E3A5F",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" className={`${inter.variable} ${fraunces.variable} h-full`}
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full antialiased">
        <SmoothScroll>
          <Providers>{children}</Providers>
        </SmoothScroll>
      </body>
    </html>
  );
}
