import { redirect } from "next/navigation";

/** Close Cockpit merged into All runs — keep /dashboard/close as a stable entry URL. */
export default function CloseCockpitPage() {
  redirect("/dashboard/close/runs");
}
