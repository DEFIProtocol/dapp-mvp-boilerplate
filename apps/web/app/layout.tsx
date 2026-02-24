import "./globals.css";
import { AppProvider } from "../src/providers/AppProvider";
import { Header } from "./components/Header";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Header />
          {children}
        </AppProvider>
      </body>
    </html>
  );
}