import { redirect } from "next/navigation";

export default async function JoinByInvitePage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  redirect(`/auth/line?invite=${encodeURIComponent(token)}`);
}
