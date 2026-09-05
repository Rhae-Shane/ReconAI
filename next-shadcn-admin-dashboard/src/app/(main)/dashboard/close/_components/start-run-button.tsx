"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function StartRunButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const res = await fetch("/api/close/runs", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start run");
      const data = (await res.json()) as { run: { id: string } };
      toast.success(`Close run ${data.run.id} started - watching it climb.`);
      router.refresh();
    } catch {
      toast.error("Could not start the close run.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={handleStart} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <Play data-icon="inline-start" />}
      Start close run
    </Button>
  );
}
