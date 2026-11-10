import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LectureProvider } from "@/lib/lecture-context";
import { Motion } from "@/components/Motion";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Cuewise — accurate lecture captions",
  description: "Publish accurate lecture captions and help students understand lectures faster.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-on"
        >
          Skip to content
        </a>
        <LectureProvider>
          <Motion>{children}</Motion>
        </LectureProvider>
      </body>
    </html>
  );
}
