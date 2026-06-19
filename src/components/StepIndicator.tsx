/**
 * Generic wizard step indicator — the shared Upatra look: a centered row of
 * numbered circles joined by em-dashes, with done / active / pending states.
 *
 * This is the portfolio-standard wizard header (matches Bulk Fulfill, Bulk
 * Tagging, etc.). It is i18n-agnostic: pass already-translated `label`s so the
 * component stays free of any namespace assumptions. Self-contained inline
 * styles — no CSS classes required.
 *
 *   const STEPS = [
 *     { id: "connect", label: t("steps.connect") },
 *     { id: "select", label: t("steps.select") },
 *   ];
 *   <StepIndicator steps={STEPS} current="select" />
 */

export interface Step {
  /** Stable id used as the React key and to locate the current step. */
  id: string;
  /** User-facing label — already translated by the caller. */
  label: string;
}

type StepState = "done" | "active" | "pending";

function stepState(isDone: boolean, isActive: boolean): StepState {
  if (isDone) return "done";
  if (isActive) return "active";
  return "pending";
}

const CIRCLE_BG: Record<StepState, string> = {
  done: "#d4edda",
  active: "#d0e3f1",
  pending: "#e9ecef",
};

const CIRCLE_COLOR: Record<StepState, string> = {
  done: "#2e7d32",
  active: "#2c6895",
  pending: "#888",
};

export default function StepIndicator({
  steps,
  current,
}: {
  steps: readonly Step[];
  current: string;
}) {
  const currentStep = steps.findIndex((s) => s.id === current) + 1;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "6px 0",
        padding: "4px 0",
      }}
    >
      {steps.map((s, index) => {
        const stepNum = index + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        const state = stepState(isDone, isActive);
        const circleBg = CIRCLE_BG[state];
        const circleColor = CIRCLE_COLOR[state];
        const circleBorder = isActive ? "2px solid #6ba4c9" : "none";
        const circleSize = 26;
        const circleFontSize = 12;
        const labelColor = isActive
          ? "var(--p-color-text)"
          : "var(--p-color-text-secondary)";

        return (
          <div
            key={s.id}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: circleSize,
                  height: circleSize,
                  borderRadius: "50%",
                  backgroundColor: circleBg,
                  border: circleBorder,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: circleColor,
                  fontWeight: 700,
                  fontSize: circleFontSize,
                  flexShrink: 0,
                }}
              >
                {stepNum}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: labelColor,
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                style={{
                  color: "var(--p-color-text-secondary)",
                  fontSize: 13,
                  margin: "0 6px",
                }}
              >
                —
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
