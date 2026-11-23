# TF-51 incident-specific needs

1. Add regression tests for all incident registries, Thai and English option labels, and validated legacy and new need codes.
2. Add explicit incident-appropriate need codes and additive database enum migration; retain existing values for historical cases and drafts.
3. Map each incident to relevant needs, keep flood's legacy options explicit, and render matching translated labels and icons.
4. Test storage and retrieval of new codes, wizard selection and changing incidents, 375px and both languages; run unit, typecheck, lint, database and Playwright checks.
