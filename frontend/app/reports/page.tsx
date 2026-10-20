"use client";
import AppShell from "@/components/AppShell";
import ReportsView from "@/components/ReportsView";
import { useAuthGuard } from "@/lib/authGuard";

export default function ReportsPage() {
  useAuthGuard(["viewer", "admin", "supervisor"]);
  return (
    <AppShell>
      <ReportsView />
    </AppShell>
  );
}
