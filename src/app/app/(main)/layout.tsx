import { repo } from "@/server/repo";
import { requireUserPage } from "@/server/session";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AccountMenu } from "@/components/app/account-menu";
import { MobileNav } from "@/components/app/mobile-nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  const usage = await repo.usage(user.id);
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-70 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="sticky top-0 hidden h-dvh lg:block">
        <AppSidebar usage={usage} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-(--layout-header) items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:px-6">
          <MobileNav usage={usage} />
          <div className="flex-1" />
          <AccountMenu user={user} />
        </header>
        <main id="main" className="mx-auto w-full max-w-(--layout-content-max) flex-1 px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
