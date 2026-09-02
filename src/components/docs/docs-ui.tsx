import type { ReactNode } from "react";

/** Primitif tampilan halaman /docs — dipakai semua seksi dokumentasi. */

export function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10">
      <h2 className="font-display text-[22px] font-bold tracking-tight sm:text-[27px]">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i} className="list-disc marker:text-accent">
          {it}
        </li>
      ))}
    </ul>
  );
}

export function OL({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2 pl-5">
      {items.map((it, i) => (
        <li key={i} className="list-decimal marker:font-semibold marker:text-accent">
          {it}
        </li>
      ))}
    </ol>
  );
}

/** Tabel sederhana (dua/tiga kolom) — responsif, tanpa scroll horizontal paksa. */
export function Rows({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div
        className="grid gap-2 border-b border-border bg-surface px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-foreground"
        style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0,1fr))` }}
      >
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid gap-2 border-b border-border px-3 py-2 text-[13.5px] last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0,1fr))` }}
        >
          {r.map((c, j) => (
            <span key={j} className={j === 0 ? "font-medium text-foreground" : undefined}>
              {c}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
      : "border-accent/40 bg-accent/10 text-foreground";
  return <div className={`rounded-xl border px-4 py-3 text-[14px] leading-relaxed ${cls}`}>{children}</div>;
}

export function K({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
      {children}
    </code>
  );
}
