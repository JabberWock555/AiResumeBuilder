"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog as RDialog } from "radix-ui";
import { Menu as MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/ui/layout";
import type { Usage } from "@/server/repo/types";
import { NAV, activeHref } from "./nav-items";
import { UsageBox } from "./app-sidebar";
import { CreateResumeButton } from "./create-resume";

/** Below lg the sidebar becomes a left drawer behind a menu button. */
export function MobileNav({ usage }: { usage: Usage }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger asChild>
        <Button variant="ghost" iconOnly aria-label="Open menu" className="lg:hidden">
          <MenuIcon aria-hidden className="size-5" />
        </Button>
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-scrim/60 data-[state=open]:animate-fade-in" />
        <RDialog.Content className="fixed inset-y-0 left-0 z-50 shadow-modal focus:outline-none" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          <RDialog.Title className="sr-only">Menu</RDialog.Title>
          <RDialog.Description className="sr-only">Main navigation</RDialog.Description>
          <div className="h-full" key={pathname}>
            <SidebarNav
              items={NAV}
              current={activeHref(pathname)}
              primary={<CreateResumeButton className="w-full" atLimit={usage.resume.max !== null && usage.resume.used >= usage.resume.max} />}
              footer={<UsageBox usage={usage} />}
            />
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
