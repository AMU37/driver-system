"use client";

import { useSearchParams } from "next/navigation";
import TripClient from "@/components/TripClient";

export default function TripLive() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  return <TripClient id={id} />;
}