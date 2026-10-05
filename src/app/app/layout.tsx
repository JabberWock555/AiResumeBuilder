import { requireUserPage } from "@/server/session";
import { AppProviders } from "@/components/app/providers";

export default async function SignedInLayout({ children }: LayoutProps<"/app">) {
  await requireUserPage("/app");
  return <AppProviders>{children}</AppProviders>;
}
