import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Examples" };

export default function Page() {
  return <ComingSoon title="Examples" icon="Library" body="Example resumes for common roles, written by us. Coming in a later release." />;
}
