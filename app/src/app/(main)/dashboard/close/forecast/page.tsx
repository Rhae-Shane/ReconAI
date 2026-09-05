import { redirect } from "next/navigation";

/** Cash forecast lives under Settlement now. */
export default function ForecastPage() {
  redirect("/dashboard/close/settlement");
}
