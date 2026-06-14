interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle-track ${checked ? "toggle-track-on" : "toggle-track-off"}`}
    >
      <span
        className={`toggle-knob ${checked ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
