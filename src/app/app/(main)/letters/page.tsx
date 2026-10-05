import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Cover letters" };

export default function Page() {
  return <ComingSoon title="Cover letters" icon="Mail" body="Write a cover letter that matches one of your resumes. Coming in a later release." />;
}
