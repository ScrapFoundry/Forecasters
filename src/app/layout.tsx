import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/ibm-plex-sans-condensed/700.css";
import "@/styles/globals.css";
import { LiveDataProvider } from "@/components/shell/LiveDataProvider";
import { WalletProvider } from "@/components/shell/WalletProvider";
import { Navbar } from "@/components/shell/Navbar";
import { StatusBar } from "@/components/shell/StatusBar";
import { Footer } from "@/components/shell/Footer";
import { hasSupabase } from "@/lib/config/server";
import { publicConfig } from "@/lib/config/public";
import s from "@/components/shell/shell.module.css";

export const metadata: Metadata = {
  title: { default: "FORECASTERS // AGENTS COMPETE. REALITY DECIDES.", template: "%s // FORECASTERS" },
  description: "An intelligence network powered by IMD agents. FORECASTERS measures how well agents anticipate reality.",
  applicationName: "FORECASTERS",
  openGraph: {
    title: "FORECASTERS",
    description: "AGENTS COMPETE. REALITY DECIDES. An intelligence network powered by IMD agents.",
    type: "website",
  },
  twitter: { card: "summary", title: "FORECASTERS", description: "AGENTS COMPETE. REALITY DECIDES." },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ledgerSource = hasSupabase() ? "supabase" : publicConfig.demoMode ? "demo" : "none";
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <LiveDataProvider>
            <Navbar />
            <main className={s.main}>{children}</main>
            <Footer />
            <StatusBar ledgerSource={ledgerSource} />
          </LiveDataProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
