import { Suspense } from "react";
import type { Metadata } from "next";
import { repo } from "@/server/repo";
import { requireUserPage } from "@/server/session";
import { ProfileEditor } from "@/components/app/profile-editor";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const user = await requireUserPage();
  const [profile, usage] = await Promise.all([repo.getProfile(user.id), repo.usage(user.id)]);
  return (
    <Suspense>
      <ProfileEditor profile={profile} user={{ id: user.id, fullName: user.fullName, email: user.email }} usage={usage} />
    </Suspense>
  );
}
