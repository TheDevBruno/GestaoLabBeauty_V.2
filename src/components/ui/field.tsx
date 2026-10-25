import { type ComponentProps, type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Label } from './label';
import { NativeSelect } from './native-select';
import { Textarea } from './textarea';

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

interface TextareaFieldProps extends Omit<ComponentProps<'textarea'>, 'id' | 'name'> {
  name: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

function TextareaField({ name, label, hint, error, ...textareaProps }: TextareaFieldProps) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error}>
      <Textarea
        id={ids.id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...textareaProps}
      />
    </FieldFrame>
  );
}

interface CheckboxFieldProps extends Omit<ComponentProps<'input'>, 'id' | 'name' | 'type'> {
  name: string;
  label: string;
  hint?: string | undefined;
}

// Caixa de seleção nativa: o rótulo inteiro é clicável e a linha tem 44 px de altura, então o alvo
// não depende do tamanho da caixa. A dica fica fora do rótulo, ligada por aria-describedby.
function CheckboxField({ name, label, hint, className, ...inputProps }: CheckboxFieldProps) {
  const ids = useFieldIds(hint, undefined);
  return (
    <Field className={className}>
      <label
        htmlFor={ids.id}
        className="flex min-h-control cursor-pointer items-center gap-3 self-start text-base font-medium text-foreground"
      >
        <input
          id={ids.id}
          name={name}
          type="checkbox"
          aria-describedby={ids.describedBy}
          className="size-5 shrink-0 cursor-pointer rounded-sm accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2"
          {...inputProps}
        />
        {label}
      </label>
      {hint ? (
        <FieldDescription id={ids.hintId} className="-mt-2">
          {hint}
        </FieldDescription>
      ) : null}
    </Field>
  );
}

export {
  CheckboxField,
  Field,
  FieldDescription,
  FieldError,
  InputField,
  SelectField,
  TextareaField,
};
