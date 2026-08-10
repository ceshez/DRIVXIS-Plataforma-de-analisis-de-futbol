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
    const receiveVideoError = () => {
      eventSource.close();
      handleError();
    };
    const receiveTransportError = () => {
      if (eventSource.readyState === EventSource.CLOSED) handleError();
    };

    eventSource.addEventListener("video", receiveVideo);
    eventSource.addEventListener("video-error", receiveVideoError);
    eventSource.addEventListener("error", receiveTransportError);
    return () => {
      eventSource.removeEventListener("video", receiveVideo);
      eventSource.removeEventListener("video-error", receiveVideoError);
      eventSource.removeEventListener("error", receiveTransportError);
      eventSource.close();
    };
  }, [videoId]);

  return null;
}
