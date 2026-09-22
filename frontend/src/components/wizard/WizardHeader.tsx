interface WizardHeaderProps {
  title: string;
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
}

function WizardHeader({ title, stepIndex, stepCount, onBack }: WizardHeaderProps) {
  return (
    <div className="wizard-header">
      <button className="wizard-header__back" onClick={onBack} aria-label="Back">
        ‹
      </button>
      <div className="wizard-header__center">
        <h2>{title}</h2>
        <div className="wizard-header__dots">
          {Array.from({ length: stepCount }).map((_, index) => (
            <span
              key={index}
              className={`wizard-header__dot ${index <= stepIndex ? "wizard-header__dot--active" : ""}`}
            />
          ))}
        </div>
      </div>
      <div className="wizard-header__spacer" />
    </div>
  );
}

export default WizardHeader;
