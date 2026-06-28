import { useState } from "react";
import PinPad from "../components/PinPad";
import { useAuth } from "../auth/AuthContext";

function PinSetupScreen() {
  const { setupPin, error, user } = useAuth();
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function reset() {
    setPin("");
    setConfirmPin("");
    setStage("enter");
  }

  async function handleChange(value: string) {
    setLocalError(null);

    if (stage === "enter") {
      setPin(value);
      if (value.length === 6) setStage("confirm");
      return;
    }

    setConfirmPin(value);
    if (value.length !== 6) return;

    if (value !== pin) {
      setLocalError("Codes don't match — try again");
      reset();
      return;
    }

    try {
      await setupPin(pin, value);
    } catch {
      reset();
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Set your code</h1>
        <p className="auth-subtitle">
          {stage === "enter"
            ? `Hi ${user?.name ?? "there"}, choose a 6-digit code`
            : "Confirm your code"}
        </p>

        <PinPad value={stage === "enter" ? pin : confirmPin} onChange={handleChange} />

        {(localError || error) && <p className="auth-error">{localError ?? error}</p>}
      </div>
    </div>
  );
}

export default PinSetupScreen;
