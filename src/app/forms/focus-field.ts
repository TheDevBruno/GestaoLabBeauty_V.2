// Move o foco para o campo pelo nome. O campo já existe no DOM quando o erro aparece, então o foco
// pode ser movido logo após a validação, sem esperar a nova renderização.
export function focusField(form: HTMLFormElement | null, name: string | null): void {
  if (!form || !name) return;
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLElement) element.focus();
}
