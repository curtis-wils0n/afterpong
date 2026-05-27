import type { ReactNode } from 'react';

interface Props {
  content: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  widthClass?: string;
}

export default function Tooltip({
  content,
  children,
  align = 'right',
  widthClass = 'w-56',
}: Props) {
  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'right-0';

  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 absolute bottom-full mb-1.5 ${alignClass} ${widthClass} px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-xs font-normal text-slate-300 shadow-lg z-50 transition-opacity duration-100 normal-case tracking-normal`}
      >
        {content}
      </span>
    </span>
  );
}
