import SettingsPanel from "../components/SettingsPanel";

interface SettingsPageProps {
  onBack: () => void;
}

function SettingsPage({ onBack }: SettingsPageProps) {
  return <SettingsPanel onClose={onBack} fullPage />;
}

export default SettingsPage;
