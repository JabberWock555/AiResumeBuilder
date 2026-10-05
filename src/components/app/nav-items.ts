import { Briefcase, FileText, LayoutDashboard, Library, Mail, Mic, Settings, Sparkles } from "lucide-react";
import type { NavItem } from "@/components/ui/layout";

export const NAV: NavItem[] = [
  { href: "/app", label: "Resumes", icon: LayoutDashboard },
  { href: "/app/letters", label: "Cover letters", icon: Mail },
  { href: "/app/assistant", label: "AI assistant", icon: Sparkles },
  { href: "/app/jobs", label: "Job tracker", icon: Briefcase },
  { href: "/app/interview", label: "Interview practice", icon: Mic },
  { href: "/app/examples", label: "Examples", icon: Library },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export const RAIL: NavItem[] = [
  { href: "/app", label: "All resumes", icon: FileText },
  ...NAV.slice(1),
];

/** The nav item that owns a path ("/app/settings/billing" → "/app/settings"). */
export function activeHref(pathname: string, items: NavItem[] = NAV) {
  return items.map((i) => i.href).filter((h) => pathname === h || pathname.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0] ?? "";
}
