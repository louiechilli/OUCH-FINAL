import { useConnectivity } from "./ConnectivityContext";

export default function OfflineBanner() {
  const { isOnline } = useConnectivity();

  if (isOnline) return null;

  return (
    <div className="offline-banner" role="alert">
      Device is offline — please restore connection
    </div>
  );
}
