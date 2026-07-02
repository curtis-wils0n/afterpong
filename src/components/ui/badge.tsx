import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn-style Badge for the small colored pills used across the app. Tailwind
// can't build class names from interpolated colors, so each color is enumerated
// as an explicit variant with full literal class strings.
const badgeVariants = cva('text-xs font-medium px-2 py-0.5 rounded-full', {
  variants: {
    color: {
      amber: 'text-amber-400 bg-amber-400/10',
      purple: 'text-purple-400 bg-purple-400/10',
      yellow: 'text-yellow-400 bg-yellow-400/10',
      sky: 'text-sky-400 bg-sky-400/10',
      red: 'text-red-400 bg-red-400/10',
      emerald: 'text-emerald-400 bg-emerald-400/10',
      slate: 'text-slate-400 bg-slate-400/10',
    },
  },
  defaultVariants: {
    color: 'slate',
  },
});

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, color, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ color }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
