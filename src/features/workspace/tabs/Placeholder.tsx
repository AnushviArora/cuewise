import type { ReactNode } from "react";

/** Shared empty/coming-soon layout for tabs whose features aren't built yet. */
export function Placeholder({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
