import type { Metadata } from "next";
import { ResetForm } from "@/components/app/auth-forms";
import { auth } from "@/server/repo";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function Page() {
  // The emailed link signs the user in on the way here (/auth/confirm).
  return <ResetForm signedIn={Boolean(await auth.currentUserId())} />;
}
