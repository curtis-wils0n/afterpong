import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn-style Button themed to the app's slate/emerald dark palette. Variants
// are derived from the buttons that actually exist in the app: a filled emerald
// primary, a filled slate secondary, a transparent ghost, and a slate→red
// destructive affordance (the delete/undo ×). No focus:outline-none — keep the
// default browser focus ring for accessibility.
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-emerald-600 text-white hover:bg-emerald-500',
        secondary: 'bg-slate-700 text-white hover:bg-slate-600',
        ghost: 'text-slate-400 hover:bg-slate-700 hover:text-white',
        destructive: 'text-slate-500 hover:text-red-400',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'px-4 py-2 text-sm',
        xs: 'px-2 py-1 text-xs rounded',
        icon: 'w-5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
