import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function TableWrap({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-x-auto rounded-xl border border-white/8 bg-ink-870/60', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full min-w-[720px] border-collapse text-left text-[13px]', className)} {...props}>
      {children}
    </table>
  )
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-1 border-b border-white/8 bg-ink-900/95 px-3.5 py-2.5 text-[11px] font-semibold tracking-[0.09em] whitespace-nowrap text-fg-faint uppercase backdrop-blur',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('border-b border-white/5 px-3.5 py-3 align-middle text-fg-soft', className)} {...props}>
      {children}
    </td>
  )
}

export function Tr({
  className,
  children,
  selected,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors duration-150 hover:bg-white/[0.035]',
        selected && 'bg-brand-500/[0.06] hover:bg-brand-500/[0.09]',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
}
