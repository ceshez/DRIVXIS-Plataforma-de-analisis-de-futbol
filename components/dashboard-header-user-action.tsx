import Link from "next/link";
import { Bot } from "lucide-react";
import { UserProfileMenu } from "@/components/user-profile-menu";

type DashboardHeaderUserActionProps = {
  name?: string | null;
  email?: string | null;
  hasAvatar?: boolean;
  avatarVersion?: string | null;
  showChatbotShortcut?: boolean;
  showProfileMenu?: boolean;
  profileMenuDirection?: "down" | "up";
};

export function DashboardHeaderUserAction({
  name,
  email,
  hasAvatar = false,
  avatarVersion = null,
  showChatbotShortcut = true,
  showProfileMenu = true,
  profileMenuDirection = "down",
}: DashboardHeaderUserActionProps) {
  return (
    <div className="dashboard-header-action">
      {showChatbotShortcut ? (
        <Link className="dashboard-chatbot-link" href="/dashboard/chatbot" aria-label="Abrir chatbot">
          <Bot size={14} />
          <span>Chatbot</span>
        </Link>
      ) : null}
      {showProfileMenu ? (
        <UserProfileMenu
          name={name}
          email={email}
          hasAvatar={hasAvatar}
          avatarVersion={avatarVersion}
          dropdownDirection={profileMenuDirection}
        />
      ) : null}
    </div>
  );
}
