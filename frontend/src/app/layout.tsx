import type { Metadata } from "next";
import "@fontsource/gloock/400.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "InsightFlow · customer feedback, made clear",
  description:
    "Turn raw customer feedback into clear priorities: sentiment, recurring issues, trends and recommendations, enriched with Adaption.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
