import type { usePushNotifications } from "../hooks/usePushNotifications";

interface PushEnableWallProps {
  push: ReturnType<typeof usePushNotifications>;
}

function PushEnableWall({ push }: PushEnableWallProps) {
  if (push.status === "subscribed") {
    return null;
  }

  const isUnsupported = push.status === "unsupported";
  const isDenied = push.status === "denied";
  const isError = push.status === "error";
  const isBusy = push.status === "subscribing";

  return (
    <div className="push-wall" role="dialog" aria-modal="true" aria-labelledby="push-wall-title">
      <div className="push-wall__content">
        <h1 id="push-wall-title" className="push-wall__title">
          NOTIFICATIONS
          <br />
          REQUIRED
        </h1>

        <p className="push-wall__text">
          {isUnsupported
            ? "This browser doesn't support push notifications. Install Ouch EPOS to your home screen on a supported iPad or iPhone to continue."
            : isDenied
              ? "Notifications are blocked on this device. You must allow them in Settings before you can use Ouch EPOS."
              : isError
                ? "We couldn't register this device for notifications. Check your connection and try again."
                : "Push notifications are required on this device. You'll receive booking updates, client messages, and payment alerts."}
        </p>

        {!isUnsupported ? (
          <img
            className="push-wall__bell"
            src="/bell.png"
            alt=""
            aria-hidden="true"
          />
        ) : null}

        {isDenied ? (
          <p className="push-wall__hint">
            On iPad: Settings → Notifications → find this app → Allow Notifications. Then return here
            and tap below.
          </p>
        ) : null}

        <button
          type="button"
          className="push-wall__btn"
          onClick={() => void (isDenied || isError ? push.recheck() : push.subscribe())}
          disabled={isBusy || isUnsupported}
        >
          <span>
            {isUnsupported && "Notifications not supported"}
            {isBusy && "Enabling…"}
            {!isBusy && !isUnsupported && isDenied && "I've allowed them — continue"}
            {!isBusy && !isUnsupported && isError && "Try again"}
            {!isBusy && !isUnsupported && !isDenied && !isError && "Enable notifications"}
          </span>
          {!isBusy && !isUnsupported ? <span className="push-wall__btn-arrow" aria-hidden="true">→</span> : null}
        </button>
      </div>
    </div>
  );
}

export default PushEnableWall;
