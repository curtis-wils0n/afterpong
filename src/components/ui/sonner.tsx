import { Toaster as SonnerToaster } from 'sonner';
import { cn } from '@/lib/utils';

// shadcn-style wrapper around sonner's Toaster, themed dark to match the app's
// slate-800 surface with an emerald focus accent. Bottom-right.
export function Toaster({
  className,
  ...props
}: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        className: cn(
          'rounded-lg border border-slate-700 bg-slate-800 text-slate-200 shadow-lg',
          className,
        ),
      }}
      {...props}
    />
  );
}
