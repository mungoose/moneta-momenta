import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import { LOCALES, getMessages, isLocale } from "@/lib/i18n";
import "../globals.css";

/** The design's typeface; `latin-ext` covers Estonian (õ, ä, ö, ü, š, ž). Self-hosted by Next at build time. */
const inter = Inter({ variable: "--font-sans", subsets: ["latin", "latin-ext"] });

/** Prerenders one static page per supported locale. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/** Localised page title and description. */
export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return {};
  }
  const t = getMessages(locale);
  return { title: t.meta.title, description: t.meta.description };
}

/** Root layout: sets `<html lang>` from the route locale. Unknown locales 404. */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
