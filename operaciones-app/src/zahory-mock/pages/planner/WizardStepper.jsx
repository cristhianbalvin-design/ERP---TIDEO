export function WizardStepper({ steps, current }) {
  return (
    <ol className="dx-planner-stepper" aria-label="Pasos de planificación">
      {steps.map((label, index) => {
        const number = index + 1;
        const state = number < current ? 'is-done' : number === current ? 'is-current' : 'is-pending';
        return (
          <li key={label} className={state} aria-current={number === current ? 'step' : undefined}>
            <span className="dx-planner-step-dot" aria-hidden="true">
              {number < current ? '✓' : number}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
