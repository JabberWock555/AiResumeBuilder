import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Interview practice" };

export default function Page() {
  return <ComingSoon title="Interview practice" icon="Mic" body="Practise answers out loud and get feedback on pace and clarity. Coming in a later release." />;
}
