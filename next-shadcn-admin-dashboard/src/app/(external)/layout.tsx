import type { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";

import "@/components/landing/landing.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

export default function ExternalLayout({ children }: { children: ReactNode }) {
  return <div className={`mc-landing ${display.variable}`}>{children}</div>;
}
