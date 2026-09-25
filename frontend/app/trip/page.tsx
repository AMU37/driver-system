import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import TripLive from "@/components/TripLive";

export default function TripPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="loader-page">جارٍ تحميل الرحلة...</div>
        </AppShell>
      }
    >
      <TripLive />
    </Suspense>
  );
}