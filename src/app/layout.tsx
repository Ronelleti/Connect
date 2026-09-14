import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-heebo"
});

export const metadata: Metadata = {
  title: "Wecomconnect",
  description: "Shift scheduling for three-shift teams",
  icons: {
    icon: "/wecom-logo.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("wecomconnect-theme");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}`
          }}
        />
        {children}
      </body>
    </html>
  );
}
