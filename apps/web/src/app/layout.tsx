import type { Metadata } from "next";

import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";
import { getToken } from "@/lib/auth-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scrollect - AI-Powered Personal Learning Feed",
  description: "Transform your saved content into a scrollable feed of bite-sized learning cards.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers initialToken={token}>
          <div className="grid grid-rows-[auto_1fr] h-svh">
            <Header />
            <main className="flex flex-col overflow-y-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
