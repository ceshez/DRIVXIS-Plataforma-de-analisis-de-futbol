import { ForgotPasswordPageContent } from "@/components/password-recovery";

type ForgotPasswordPageProps = { searchParams?: Promise<{ email?: string }> };

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = (await searchParams) ?? {};
  return <ForgotPasswordPageContent initialEmail={params.email || ""} />;
}
