import Script from "next/script";
import "./globals.css";
import { AppProvider } from "./src/providers/AppProvider";
import { Header } from "./components/Header";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Script
          src="/localStorage-polyfill.js"
          strategy="beforeInteractive"
        />
        <AppProvider>
          <Header />
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
