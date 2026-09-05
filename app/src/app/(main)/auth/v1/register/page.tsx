import { McLoginPage } from "@/components/landing/mc-login-page";
import { landingContent } from "@/components/landing/content";

export default function RegisterV1() {
  return (
    <McLoginPage content={landingContent} redirectTo="/dashboard/close" mode="register" />
  );
}
