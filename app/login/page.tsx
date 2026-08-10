import Link from "next/link";
import { AuthPageContent } from "@/components/auth-page-content";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

type LoginPageProps = {
  searchParams?: Promise<{ email?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentUser()) redirect("/dashboard");
  const params = (await searchParams) ?? {};

  return <AuthPageContent mode="login" initialEmail={params.email || ""} />;
}
