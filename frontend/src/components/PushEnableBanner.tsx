import type { usePushNotifications } from "../hooks/usePushNotifications";

interface PushEnableBannerProps {
  push: ReturnType<typeof usePushNotifications>;
}

function PushEnableBanner({ push }: PushEnableBannerProps) {
  if (push.status === "unsupported" || push.status === "subscribed") {
    return null;
  }

  return (
    <button
      type="button"
      className="push-banner push-banner--global"
      onClick={() => void push.subscribe()}
      disabled={push.status === "subscribing"}
    >
      <span>
        {push.status === "subscribing" && "Enabling notifications…"}
        {push.status === "denied" && "Notifications blocked — check device Settings"}
        {push.status === "error" && "Couldn't enable notifications — tap to retry"}
        {push.status === "idle" && "Enable push notifications on this device"}
      </span>
    </button>
  );
}

export default PushEnableBanner;
