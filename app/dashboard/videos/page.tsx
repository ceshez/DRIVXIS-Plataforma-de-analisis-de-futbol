import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { VideoHistory } from "@/components/video-history";
import { requireUser } from "@/lib/session";
import { DEFAULT_VIDEO_PAGE_SIZE, getVideoListPage, parseVideoListQuery } from "@/lib/video-list";

export default async function VideosPage() {
  const user = await requireUser();
  const videosPage = await getVideos(user.id);

  return (
    <main className="app-frame app-frame--videos-watch">
      <DashboardHeader
        navItems={[
          { href: "/dashboard", label: "Panel", exact: true },
          { href: "/dashboard/videos", label: "Historial" },
        ]}
        action={
          <DashboardHeaderUserAction
            name={user.name}
            email={user.email}
            hasAvatar={Boolean(user.avatarObjectKey)}
            avatarVersion={user.updatedAt.toISOString()}
          />
        }
      />

      <VideoHistory initialPagination={videosPage.pagination} initialVideos={videosPage.videos} />
    </main>
  );
}

async function getVideos(ownerId: string) {
  try {
    return await getVideoListPage(ownerId, parseVideoListQuery(new URLSearchParams({ limit: String(DEFAULT_VIDEO_PAGE_SIZE) })));
  } catch {
    return { videos: [], pagination: { page: 1, pageSize: DEFAULT_VIDEO_PAGE_SIZE, totalItems: 0, totalPages: 1 } };
  }
}
