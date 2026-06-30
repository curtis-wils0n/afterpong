import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge Tailwind class lists, resolving conflicts (later class wins). Used by
// the shadcn-style components under components/ui.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
