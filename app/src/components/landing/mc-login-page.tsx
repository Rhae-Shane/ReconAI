import { Space_Grotesk } from "next/font/google";

import "@/components/landing/landing.css";

import { type AuthMode, McLoginView } from "./mc-login-view";
import type { LandingContent } from "./types";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

export function McLoginPage({
  content,
  redirectTo,
  mode = "login",
}: {
  content: LandingContent;
  redirectTo: string;
  mode?: AuthMode;
}) {
  return (
    <div className={`mc-landing ${display.variable}`} suppressHydrationWarning>
      <McLoginView content={content} redirectTo={redirectTo} mode={mode} />
    </div>
  );
}
