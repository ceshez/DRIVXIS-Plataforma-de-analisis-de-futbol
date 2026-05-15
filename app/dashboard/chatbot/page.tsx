import { DashboardChatbotDemo } from "@/components/dashboard-chatbot-demo";
import { requireUser } from "@/lib/session";

export default async function ChatbotPage() {
  const user = await requireUser();

  return (
    <main className="chatbot-route">
      <DashboardChatbotDemo
        userName={user.name}
        userEmail={user.email}
        hasAvatar={Boolean(user.avatarObjectKey)}
        avatarVersion={user.updatedAt.toISOString()}
      />
    </main>
  );
}
