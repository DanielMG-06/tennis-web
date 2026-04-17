import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tennis Admin",
  description: "Panel administrativo de torneos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}