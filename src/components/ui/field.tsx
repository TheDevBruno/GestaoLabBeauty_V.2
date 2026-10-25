import { type ComponentProps, type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Label } from './label';
import { NativeSelect } from './native-select';

// Peças do Field do shadcn/ui e os campos prontos das telas. Regras: label visível, dica e erro ligados
// ao controle por aria-describedby, erro logo abaixo do controle e aria-invalid quando há erro. O erro
// não usa role="alert": o foco vai para o primeiro campo inválido e o leitor de tela lê a descrição.

function Field({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="field" className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-error"
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    />
  );
}

interface FieldIds {
  id: string;
  hintId: string;
  errorId: string;
  describedBy: string | undefined;
}

function useFieldIds(hint: unknown, error: unknown): FieldIds {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return { id, hintId, errorId, describedBy: describedBy || undefined };
}

interface FieldFrameProps {
  ids: FieldIds;
  label: string;
  hint: string | undefined;
  error: string | undefined;
  children: ReactNode;
}

function FieldFrame({ ids, label, hint, error, children }: FieldFrameProps) {
  return (
    <Field>
      <Label htmlFor={ids.id}>{label}</Label>
      {hint ? <FieldDescription id={ids.hintId}>{hint}</FieldDescription> : null}
      {children}
      {error ? <FieldError id={ids.errorId}>{error}</FieldError> : null}
    </Field>
  );
}

interface InputFieldProps extends Omit<ComponentProps<'input'>, 'id' | 'name'> {
  name: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

function InputField({ name, label, hint, error, ...inputProps }: InputFieldProps) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error}>
      <Input
        id={ids.id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...inputProps}
      />
    </FieldFrame>
  );
}

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id' | 'name'> {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  hint?: string | undefined;
  error?: string | undefined;
}

function SelectField({ name, label, options, hint, error, ...selectProps }: SelectFieldProps) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error}>
      <NativeSelect
        id={ids.id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </FieldFrame>
  );
}

export { Field, FieldDescription, FieldError, InputField, SelectField };
