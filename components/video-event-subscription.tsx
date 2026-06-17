"use client";

import { useEffect, useEffectEvent } from "react";

type VideoEventSubscriptionProps<TVideo> = {
  videoId: string;
  onVideo: (video: TVideo) => void;
  onError: () => void;
};

export function VideoEventSubscription<TVideo>({
  videoId,
  onVideo,
  onError,
}: VideoEventSubscriptionProps<TVideo>) {
  const handleVideo = useEffectEvent(onVideo);
  const handleError = useEffectEvent(onError);

  useEffect(() => {
    const eventSource = new EventSource(`/api/videos/${videoId}/events`);
    const receiveVideo = (event: Event) => {
      const nextVideo = JSON.parse((event as MessageEvent).data) as TVideo;
      handleVideo(nextVideo);
      if (
        nextVideo &&
        typeof nextVideo === "object" &&
        "status" in nextVideo &&
        (nextVideo.status === "COMPLETED" || nextVideo.status === "FAILED")
      ) {
        eventSource.close();
      }
    };
    const receiveError = () => {
      eventSource.close();
      handleError();
    };

    eventSource.addEventListener("video", receiveVideo);
    eventSource.addEventListener("error", receiveError);
    return () => {
      eventSource.removeEventListener("video", receiveVideo);
      eventSource.removeEventListener("error", receiveError);
      eventSource.close();
    };
  }, [videoId]);

  return null;
}
