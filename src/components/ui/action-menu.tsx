import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from './button';

export type MenuAction = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Navega para outra tela (renderiza um link). */
  to?: string;
  /** Executa uma ação (renderiza um item de menu). */
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

const itemClassName =
  'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted';

/**
 * Menu de ações secundárias de uma linha (botão de reticências). Usa o menu do Radix: abre com Enter, Espaço ou seta
 * para baixo, navega com as setas, fecha com Esc e devolve o foco ao botão. Itens de ação rodam depois que o foco
 * volta ao botão, para que diálogos de confirmação devolvam o foco ao lugar certo.
 */
export function ActionMenu({ label, items, className }: { label: string; items: MenuAction[]; className?: string }) {
  const pending = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} className={className}>
          <Ellipsis aria-hidden="true" className="size-5" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          aria-label={label}
          onCloseAutoFocus={() => {
            const run = pending.current;
            pending.current = null;
            if (run) queueMicrotask(run);
          }}
          className="z-50 min-w-48 rounded-xl border border-border bg-card p-1 text-card-foreground shadow-xl"
        >
          {items.map(({ id, label: itemLabel, icon: Icon, to, onSelect, destructive, disabled }) => (
            <DropdownMenu.Item
              key={id}
              asChild={Boolean(to)}
              disabled={disabled}
              onSelect={() => {
                if (onSelect) pending.current = onSelect;
              }}
              className={cn(itemClassName, destructive && 'text-destructive')}
            >
              {to ? (
                <Link to={to}>
                  {Icon && <Icon aria-hidden="true" className="size-4" />}
                  {itemLabel}
                </Link>
              ) : (
                <>
                  {Icon && <Icon aria-hidden="true" className="size-4" />}
                  {itemLabel}
                </>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
