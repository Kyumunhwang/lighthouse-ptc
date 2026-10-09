import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lighthouse PTC",
  description: "Lighthouse PTC - Parent-Teacher Conference Booking Portal",
  icons: {
    icon: "/emblum.png",
    shortcut: "/emblum.png",
    apple: "/emblum.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="icon" href="/emblum.png" type="image/png" />
        <link rel="shortcut icon" href="/emblum.png" type="image/png" />
        <link rel="apple-touch-icon" href="/emblum.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,600;0,8..60,700;1,8..60,600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#f8f9ff] text-[#171c22] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
