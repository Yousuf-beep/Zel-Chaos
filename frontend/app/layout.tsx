import type { Metadata, Viewport } from "next";
import { Inter_Tight, Noto_Sans_Devanagari, Noto_Sans_Kannada, Noto_Sans_Tamil } from "next/font/google";
import DisclaimerFooter from "@/components/DisclaimerFooter";
import Header from "@/components/Header";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const sans = Inter_Tight({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sans", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500"], variable: "--font-deva", display: "swap" });
const knda = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["400", "500"], variable: "--font-knda", display: "swap" });
const taml = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "500"], variable: "--font-taml", display: "swap" });

export const metadata: Metadata = {
  title: "Nola",
  description: "Speak or type how you feel, in your own language. Health information and care guidance — never a diagnosis.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0fa" },
    { media: "(prefers-color-scheme: dark)", color: "#16121c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${deva.variable} ${knda.variable} ${taml.variable}`}>
      <body>
        <StoreProvider>
          <div className="curtain" aria-hidden="true">
            <div className="curtain-word">
              {"Nola".split("").map((c, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{c}</span>)}
            </div>
          </div>
          <a className="skip-link" href="#main">Skip to content</a>
          <Header />
          <main id="main">{children}</main>
          <DisclaimerFooter />
        </StoreProvider>
      </body>
    </html>
  );
}
