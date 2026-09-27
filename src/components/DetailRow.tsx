import type { ReactNode } from "react";

/** One labelled fact inside a detail card's `<dl>`. */
export function Row({ label, children, testId, mono }: { label: string; children: ReactNode; testId?: string; mono?: boolean }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined} data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}
