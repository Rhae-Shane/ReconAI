import { landingContent } from "@/components/landing/content";
import { McLoginPage } from "@/components/landing/mc-login-page";

export default function ForgotPasswordV1() {
  return <McLoginPage content={landingContent} redirectTo="/dashboard/close" mode="forgot" />;
}
