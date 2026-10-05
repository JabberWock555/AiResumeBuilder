"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { User } from "@/server/repo/types";
import { useUpgrade } from "./upgrade";

export function AccountMenu({ user }: { user: User }) {
  const router = useRouter();
  const upgrade = useUpgrade();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-1.5">
          <Avatar name={user.fullName || user.email} decorative />
          <span className="sr-only">Account menu</span>
        </Button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel className="flex flex-col gap-1">
          <span className="truncate text-sm text-text">{user.fullName}</span>
          <span className="truncate">{user.email}</span>
          <span>
            <Badge tone={user.plan === "free" ? "neutral" : "pro"}>{user.plan === "free" ? "Free plan" : "Pro"}</Badge>
          </span>
        </MenuLabel>
        <MenuSeparator />
        {user.plan === "free" && <MenuItem onSelect={() => upgrade()}>Upgrade to Pro</MenuItem>}
        <MenuItem asChild>
          <Link href="/app/settings">
            <Settings aria-hidden className="size-4" /> Settings
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await api("/api/auth/logout", { method: "POST" });
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut aria-hidden className="size-4" /> Log out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
