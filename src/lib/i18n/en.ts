/**
 * English UI copy. This is the reference dictionary: every other locale must
 * provide exactly the same keys (enforced with `satisfies Messages`).
 */
export const en = {
  meta: {
    title: "Moneta Momenta",
    description: "See month by month whether an instalment plan fits your real spending, before you commit.",
  },
  header: {
    appName: "Moneta",
    languageSwitch: "Eesti keeles",
  },
  landing: {
    tagline: "See month by month whether an instalment plan fits what you really spend, before you commit.",
    comingSoon: "Under construction. The affordability check is being built.",
  },
};

/** Shape every locale dictionary must match. */
export type Messages = typeof en;
