import { notFound } from "next/navigation";
import { Flow } from "@/components/flow";
import { isLocale } from "@/lib/i18n";

/**
 * The app: one static page per locale. Everything after the first paint
 * happens in the browser, so transactions never reach a server.
 */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <Flow locale={locale} />;
}
