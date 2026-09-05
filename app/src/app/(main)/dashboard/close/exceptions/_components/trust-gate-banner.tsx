"use client";

import Link from "next/link";

import { ShieldCheck, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown on Exceptions — flips to CLOSE VERIFIED when the open queue is empty. */
export function TrustGateBanner({ openExceptions }: { openExceptions: number }) {
  if (openExceptions === 0) {
    return (
      <Card className="border-green-700/30 bg-green-500/5 dark:border-green-300/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-green-700 dark:text-green-300" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">CLOSE VERIFIED ✓</p>
              <p className="text-muted-foreground text-xs">
                Exception queue cleared. Financial invariants passed. Silent drops = 0.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/close/trust">View trust board</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-700/25 bg-amber-500/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <ShieldX className="size-5 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-medium text-sm">Close remains BLOCKED</p>
            <p className="text-muted-foreground text-xs">
              Resolve or override the {openExceptions} open exception
              {openExceptions === 1 ? "" : "s"} below to unlock CLOSE VERIFIED.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/close/trust">Why trust?</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
