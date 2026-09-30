export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
      <p className="eyebrow">Last updated {updated}</p>
      <h1 className="mt-4 font-display text-5xl leading-tight">{title}</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{intro}</p>
      <div className="mt-10 space-y-8 text-[0.95rem] leading-relaxed text-foreground/90 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:mt-2 [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}

export function contactEmail(): string | null {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;
}
