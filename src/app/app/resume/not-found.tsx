import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-xl text-text">We can’t find that resume</h1>
      <p className="text-base text-text-muted">It may have been deleted, or it belongs to another account.</p>
      <Button asChild>
        <Link href="/app">Back to your resumes</Link>
      </Button>
    </main>
  );
}
