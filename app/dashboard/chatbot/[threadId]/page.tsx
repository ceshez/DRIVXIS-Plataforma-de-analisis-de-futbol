import { DashboardChatbot } from "@/components/dashboard-chatbot-demo";
import { requireUser } from "@/lib/session";

export default async function ChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const [user, { threadId }] = await Promise.all([requireUser(), params]);
  return (
    <main className="chatbot-route">
      <DashboardChatbot
        userName={user.name}
        userEmail={user.email}
        hasAvatar={Boolean(user.avatarObjectKey)}
        avatarVersion={user.updatedAt.toISOString()}
        initialThreadId={threadId}
      />
    </main>
  );
}
