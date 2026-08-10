import Link from "next/link";
import { AuthPageContent } from "@/components/auth-page-content";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

type RegisterPageProps = {
  searchParams?: Promise<{ email?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  if (await getCurrentUser()) redirect("/dashboard");
  const params = (await searchParams) ?? {};

  return <AuthPageContent mode="register" initialEmail={params.email || ""} />;
}
