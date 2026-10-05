import Link from "next/link";
import { Button } from "@/components/ui/button";
import { focusRing } from "@/lib/cn";
import { currentUser } from "@/server/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-(--layout-content-max) items-center gap-4 px-4 md:px-6">
          <Link href="/" className={`flex items-center gap-2 rounded-md text-base font-semibold text-text ${focusRing}`}>
            <span className="flex size-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-on-accent" aria-hidden>
              R
            </span>
            Resume builder
          </Link>
          <nav aria-label="Main" className="hidden flex-1 md:block">
            <ul className="flex gap-1">
              {[
                ["/templates", "Templates"],
                ["/tools/ats-checker", "Free resume check"],
                ["/pricing", "Pricing"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className={`rounded-md px-3 py-2 text-sm text-text-muted hover:text-text ${focusRing}`}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link href="/app">Your resumes</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Start free</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-(--layout-content-max) flex-wrap gap-4 px-4 py-8 text-sm text-text-muted md:px-6">
          <span>Resume builder</span>
          <Link href="/templates" className="hover:text-text">Templates</Link>
          <Link href="/pricing" className="hover:text-text">Pricing</Link>
        </div>
      </footer>
    </div>
  );
}
