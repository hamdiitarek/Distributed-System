import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Aurum — Distributed Auction House",
  description: "CSE463 Distributed Real-Time Auction System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AuthProvider>
          <Header />
          <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
          <footer className="border-t border-white/5 mt-16 py-6 text-center text-xs text-neutral-600">
            Distributed Systems · CSE463
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
