import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn-style Input themed to match the app's text/number inputs. Default is
// the common bg-slate-800 surface; callers on a slate-700 modal surface (or
// needing a width like w-full / flex-1) override via className — cn +
// tailwind-merge resolves the conflicts.
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-500',
        'focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
