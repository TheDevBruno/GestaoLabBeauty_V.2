import { type SelectHTMLAttributes, useId } from 'react';

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'name'> {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  hint?: string | undefined;
  error?: string | undefined;
}

// Seleção provisória até o design system da Sprint 1.4, com as mesmas regras do TextField: label
// visível, dica e erro ligados por aria-describedby e alvo de 44 px.
export function SelectField({
  name,
  label,
  options,
  hint,
  error,
  ...selectProps
}: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-base text-ink outline-none focus-visible:ring-3 focus-visible:ring-focus aria-invalid:border-danger"
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
