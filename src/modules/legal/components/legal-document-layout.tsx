import Link from "next/link";

import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";
import { BRAND_ACCENT } from "@/modules/brand/lib/brand";
import { LEGAL_ROUTES } from "@/modules/legal/lib/legal-site";
import { LEGAL_LAST_UPDATED } from "@/modules/legal/content/legal-copy";

type Section = { title: string; body: string };

export function LegalDocumentLayout({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro: string;
  sections: readonly Section[];
  children?: React.ReactNode;
}) {
  return (
    <div className="h-dvh min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <BuyHubLogo size={36} showWordmark wordmarkSuffix="Trading" />
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm font-medium text-slate-600">
            <Link href={LEGAL_ROUTES.privacy} className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href={LEGAL_ROUTES.terms} className="hover:text-slate-900">
              Terms
            </Link>
            <Link
              href={LEGAL_ROUTES.deleteAccount}
              className="hover:text-slate-900"
            >
              Delete account
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <p className="text-sm font-medium text-slate-500">
          Last updated: {LEGAL_LAST_UPDATED}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-600">{intro}</p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-slate-900">
                {section.title}
              </h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        {children ? <div className="mt-12 border-t border-slate-200 pt-10">{children}</div> : null}
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <p className="text-center text-sm text-slate-500">
          © {new Date().getFullYear()} DHOOM Trading ·{" "}
          <Link href={LEGAL_ROUTES.privacy} style={{ color: BRAND_ACCENT }}>
            Privacy
          </Link>
          {" · "}
          <Link href={LEGAL_ROUTES.terms} style={{ color: BRAND_ACCENT }}>
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}
