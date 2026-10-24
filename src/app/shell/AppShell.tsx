import { ChevronsUpDownIcon, LayoutDashboardIcon, MenuIcon, UsersIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { memberRoleLabels } from '@/shared/roles';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/app/auth/auth-context';
import { SignOutButton } from '@/app/components/SignOutButton';
import { useActiveTenant } from '@/app/tenancy/tenancy-context';
import { usePermission } from '@/app/tenancy/usePermission';
import { useMediaQuery } from './use-media-query';

const DESKTOP_QUERY = '(min-width: 1024px)';

// Moldura do painel (/app/*), montada dentro de RequireTenant. A partir de 1024 px, navegação lateral
// fixa; abaixo disso, barra superior com o menu numa gaveta. Só uma das duas existe no DOM.
export function AppShell() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-control bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-3 focus-visible:ring-ring"
      >
        Pular para o conteúdo
      </a>
      {isDesktop ? (
        <aside className="sticky top-0 flex h-dvh flex-col overflow-y-auto border-r bg-card">
          <ShellNavigation />
        </aside>
      ) : (
        <MobileHeader />
      )}
      <main id="conteudo" tabIndex={-1} className="min-w-0 outline-none">
        <Outlet />
      </main>
    </div>
  );
}

function MobileHeader() {
  const { state } = useActiveTenant();
  const [open, setOpen] = useState(false);
  const tenantName = state.status === 'active' ? state.membership.tenantName : '';

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-card px-2 py-1">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Abrir menu">
            <MenuIcon aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="gap-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação, empresa e conta.</SheetDescription>
          <ShellNavigation
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
      <p className="min-w-0 truncate text-base font-semibold">{tenantName}</p>
    </header>
  );
}

// Conteúdo comum à lateral e à gaveta: empresa ativa, navegação e conta.
function ShellNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { state: auth } = useAuth();
  const { state } = useActiveTenant();
  const canManageMembers = usePermission('members.manage') === 'allowed';
  if (state.status !== 'active') return null;
  const { membership, memberships } = state;

  return (
    <div className="flex min-h-full flex-1 flex-col gap-6 p-4 pt-6">
      <div className="flex flex-col gap-3 pr-10 lg:pr-0">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">LabBeautyPro</p>
        <div>
          <p className="text-lg font-semibold break-words">{membership.tenantName}</p>
          <p className="text-sm text-muted-foreground">{memberRoleLabels[membership.role]}</p>
        </div>
        {memberships.length > 1 ? (
          <TenantSwitcher currentId={membership.tenantId} onNavigate={onNavigate} />
        ) : null}
      </div>

      <nav aria-label="Principal">
        <ul className="flex flex-col gap-1">
          <ShellNavItem to="/app" end icon={<LayoutDashboardIcon />} onNavigate={onNavigate}>
            Painel
          </ShellNavItem>
          {canManageMembers ? (
            <ShellNavItem to="/app/equipe" icon={<UsersIcon />} onNavigate={onNavigate}>
              Equipe e convites
            </ShellNavItem>
          ) : null}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t pt-4">
        <p className="text-sm break-all text-muted-foreground">
          {auth.status === 'signed-in' ? (auth.session.email ?? 'sem e-mail') : null}
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}

function ShellNavItem({
  to,
  end = false,
  icon,
  onNavigate,
  children,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  onNavigate: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <li>
      {/* NavLink marca aria-current="page" no item da rota atual. */}
      <NavLink
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex min-h-control items-center gap-3 rounded-control px-3 text-base font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-accent [&_svg]:text-muted-foreground',
          )
        }
      >
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
        {children}
      </NavLink>
    </li>
  );
}

// Troca de empresa sem sair da tela (RN-025): o menu lista só as outras empresas das memberships do
// usuário. A escolha vira a "última usada" e leva ao painel da nova empresa.
function TenantSwitcher({
  currentId,
  onNavigate,
}: {
  currentId: string;
  onNavigate: (() => void) | undefined;
}) {
  const { state, select } = useActiveTenant();
  const navigate = useNavigate();
  if (state.status !== 'active') return null;
  const others = state.memberships.filter((m) => m.tenantId !== currentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="justify-between">
          Trocar de empresa
          <ChevronsUpDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Suas outras empresas</DropdownMenuLabel>
        {others.map((m) => (
          <DropdownMenuItem
            key={m.tenantId}
            className="flex-col items-start justify-center gap-0 py-1"
            onSelect={() => {
              select(m.tenantId);
              onNavigate?.();
              void navigate('/app');
            }}
          >
            <span className="font-medium">{m.tenantName}</span>
            <span className="text-sm text-muted-foreground">{memberRoleLabels[m.role]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
