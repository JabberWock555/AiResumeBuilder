import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Job tracker" };

export default function Page() {
  return <ComingSoon title="Job tracker" icon="Briefcase" body="Keep track of where you’ve applied and what happened next. Coming in a later release." />;
}
