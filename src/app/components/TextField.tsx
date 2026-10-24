import { type InputHTMLAttributes, useId } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name'> {
  name: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

// Campo provisório até o design system da Sprint 1.4: label visível, dica e erro ligados por
// aria-describedby, erro junto ao campo e alvo de 44 px.
export function TextField({ name, label, hint, error, ...inputProps }: TextFieldProps) {
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
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="min-h-11 rounded-md border border-line bg-surface px-3 text-base text-ink outline-none focus-visible:ring-3 focus-visible:ring-focus aria-invalid:border-danger"
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
