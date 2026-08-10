import { ResetPasswordPageContent } from "@/components/password-recovery";

type ResetPasswordPageProps = { searchParams?: Promise<{ email?: string; code?: string }> };

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = (await searchParams) ?? {};
  return <ResetPasswordPageContent initialEmail={params.email || ""} initialCode={params.code || ""} />;
}
