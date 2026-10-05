"use client";

import { TooltipProvider, ToastProvider } from "@/components/ui/overlays";
import { UpgradeProvider } from "./upgrade";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <UpgradeProvider>{children}</UpgradeProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
