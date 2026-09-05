import { McLoginPage } from "@/components/landing/mc-login-page";
import { landingContent } from "@/components/landing/content";

export default function LoginV2() {
  return <McLoginPage content={landingContent} redirectTo="/dashboard/close" />;
}
