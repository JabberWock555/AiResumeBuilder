import Link from "next/link";
import { focusRing } from "@/lib/cn";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-16 items-center px-4 md:px-8">
        <Link href="/" className={`flex items-center gap-2 rounded-md text-base font-semibold text-text ${focusRing}`}>
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-on-accent" aria-hidden>
            R
          </span>
          Resume builder
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 md:pt-16">
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface p-6 shadow-card md:p-8">{children}</div>
      </main>
    </div>
  );
}
