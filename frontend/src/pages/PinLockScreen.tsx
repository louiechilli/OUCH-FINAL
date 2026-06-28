import { useState } from "react";
import PinPad from "../components/PinPad";
import { useAuth } from "../auth/AuthContext";

function PinLockScreen() {
  const { unlockWithPin, error, user, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleChange(value: string) {
    setLocalError(null);
    setPin(value);

    if (value.length === 6) {
      try {
        await unlockWithPin(value);
      } catch {
        setLocalError("Incorrect code");
        setPin("");
      }
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Welcome back{user ? `, ${user.name}` : ""}</h1>
        <p className="auth-subtitle">Enter your 6-digit code</p>

        <PinPad value={pin} onChange={handleChange} />

        {(localError || error) && <p className="auth-error">{localError ?? error}</p>}

        <button type="button" className="auth-link" onClick={logout}>
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}

export default PinLockScreen;
