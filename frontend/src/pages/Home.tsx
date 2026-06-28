import ActionSidebar from "../components/ActionSidebar";
import BookingsPanel from "../components/BookingsPanel";
import type { usePushNotifications } from "../hooks/usePushNotifications";

interface HomeProps {
  push: ReturnType<typeof usePushNotifications>;
}

function Home({ push }: HomeProps) {
  return (
    <div className="home">
      <ActionSidebar staffName="Georgia" push={push} />
      <BookingsPanel />
    </div>
  );
}

export default Home;
