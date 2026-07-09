import "./globals.css";
export const metadata = { title: "Terminal WDO", description: "Painel de operação — mini dólar" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };
export default function RootLayout({ children }) {
  return (<html lang="pt-BR"><body>{children}</body></html>);
}
