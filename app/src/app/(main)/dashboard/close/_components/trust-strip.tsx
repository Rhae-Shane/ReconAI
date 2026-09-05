import Link from "next/link";

import { ShieldCheck, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTrustSnapshot } from "@/lib/close/trust";

/** Compact trust gate shown on the Close Cockpit. */
export function TrustStrip() {
  const snap = getTrustSnapshot();
  if (snap.status === "NO_RUN") return null;

  const verified = snap.status === "VERIFIED";

  return (
    <Card className={verified ? "border-green-700/25 bg-green-500/5" : "border-amber-700/25 bg-amber-500/5"}>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2.5">
          {verified ? (
            <ShieldCheck className="size-4 text-green-700 dark:text-green-300" />
          ) : (
            <ShieldX className="size-4 text-amber-700 dark:text-amber-300" />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm">
              {verified ? "CLOSE VERIFIED ✓" : "Close blocked — human review"}
            </span>
            <span className="text-muted-foreground text-xs">
              {snap.matched} matched · {snap.partial} partial · {snap.humanReview} review · silent drops{" "}
              {snap.silentDrops}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{verified ? "Verified" : "BLOCKED"}</Badge>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/close/trust">Trust board</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
