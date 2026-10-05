import type { Metadata } from "next";
import { repo } from "@/server/repo";
import { requireUserPage } from "@/server/session";
import { SettingsForms } from "@/components/app/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUserPage();
  const usage = await repo.usage(user.id);
  return <SettingsForms user={user} usage={usage} />;
}
