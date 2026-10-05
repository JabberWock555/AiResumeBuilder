import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "AI assistant" };

export default function Page() {
  return <ComingSoon title="AI assistant" icon="Sparkles" body="Ask for help with your resume in a chat. Coming in a later release." />;
}
