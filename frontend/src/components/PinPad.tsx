interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function PinPad({ value, onChange, maxLength = 6 }: PinPadProps) {
  function pressKey(key: string) {
    if (key === "") return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  }

  return (
    <div className="pin-pad">
      <div className="pin-pad__dots">
        {Array.from({ length: maxLength }).map((_, index) => (
          <span
            key={index}
            className={`pin-pad__dot ${index < value.length ? "pin-pad__dot--filled" : ""}`}
          />
        ))}
      </div>

      <div className="pin-pad__keys">
        {KEYS.map((key, index) => (
          <button
            key={index}
            type="button"
            className={`pin-pad__key ${key === "" ? "pin-pad__key--spacer" : ""}`}
            disabled={key === ""}
            onClick={() => pressKey(key)}
          >
            {key === "del" ? "⌫" : key}
          </button>
        ))}
      </div>
    </div>
  );
}

export default PinPad;
