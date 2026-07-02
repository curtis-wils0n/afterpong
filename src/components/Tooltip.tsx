import type { ReactNode } from 'react';
import {
  Tooltip as TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from './ui/tooltip';

interface Props {
  content: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  widthClass?: string;
}

// Old align (which edge of the trigger the panel hugs) → Radix align, for a
// top-side tooltip in LTR. Keeps every existing call site unchanged.
const ALIGN = { left: 'start', center: 'center', right: 'end' } as const;

export default function Tooltip({
  content,
  children,
  align = 'right',
  widthClass = 'w-56',
}: Props) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align={ALIGN[align]} className={widthClass}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}
