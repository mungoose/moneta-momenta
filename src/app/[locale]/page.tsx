import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages, isLocale } from "@/lib/i18n";

/**
 * Landing page shell. The real flow (landing → summary → purchase → result)
 * replaces the placeholder on Day 1.
 */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);
  const otherLocale = locale === "en" ? "et" : "en";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold">{t.header.appName}</span>
        <Link href={`/${otherLocale}`} hrefLang={otherLocale} className="text-sm underline underline-offset-4">
          {t.header.languageSwitch}
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-4 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{t.meta.title}</h1>
        <p className="text-lg text-muted-foreground">{t.landing.tagline}</p>
        <p className="text-sm text-muted-foreground">{t.landing.comingSoon}</p>
      </main>
    </div>
  );
}
