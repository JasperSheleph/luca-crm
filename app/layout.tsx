import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LUCA CRM",
  description: "Lead and deal management for LUCA Elevators",

  /**
   * Stops iOS Safari rewriting the page before React sees it.
   *
   * Left on, iOS finds anything resembling a phone number, date or address and
   * wraps it in its own link with x-apple-data-detectors attributes. That
   * happens before hydration, so React finds markup it did not render and
   * reports "a tree hydrated but some attributes of the server rendered HTML
   * didn't match" — on a page that is now a column of 50 phone numbers, it is
   * guaranteed.
   *
   * Nothing is lost: tapping a number still calls, because every phone is
   * already an explicit <a href="tel:…"> built from telHref().
   */
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
