import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Agent Guild | Trust Infrastructure for Work",
  description: "Contracts, escrow, AI judgment, and reputation for modern client and freelancer workflows.",
  other: {
    "talentapp:project_verification":
      "034063e74a06cc0f7d3620e6e87f75ee1b7c8220842062684bb9df32a7b9ec07acf4c3758220f6afc48818e5014593cb0a5b897ae9413eb49b2ca48369988f26",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
