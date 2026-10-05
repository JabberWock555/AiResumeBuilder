"use client";

import { usePathname } from "next/navigation";
import { SidebarNav, UsageMeter } from "@/components/ui/layout";
import type { Usage } from "@/server/repo/types";
import { NAV, activeHref } from "./nav-items";
import { CreateResumeButton } from "./create-resume";

export function UsageBox({ usage }: { usage: Usage }) {
  return (
    <UsageMeter
      rows={[
        { label: "Resumes", used: usage.resume.used, max: usage.resume.max },
        { label: "AI suggestions", used: usage.ai_generation.used, max: usage.ai_generation.max },
        { label: "PDF downloads", used: usage.pdf_download.used, max: usage.pdf_download.max },
      ]}
    />
  );
}

export function AppSidebar({ usage }: { usage: Usage }) {
  const pathname = usePathname();
  return (
    <SidebarNav
      items={NAV}
      current={activeHref(pathname)}
      primary={<CreateResumeButton className="w-full" atLimit={usage.resume.max !== null && usage.resume.used >= usage.resume.max} />}
      footer={<UsageBox usage={usage} />}
    />
  );
}
