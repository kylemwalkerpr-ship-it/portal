import type { ManifestSection } from '@/lib/pdfGenerator'

/**
 * Gives every field in a reusable worksheet section a stable PDF-form prefix.
 *
 * Composite products often include multiple worksheets that ask for the same
 * business fact (for example application type or destination country). pdf-lib
 * requires every AcroForm field name to be unique, even when the visible labels
 * intentionally repeat. Prefixing the internal IDs preserves the buyer-facing
 * worksheet while preventing form collisions.
 */
export function namespaceSectionFields(
  section: ManifestSection,
  prefix: string,
): ManifestSection {
  const normalizedPrefix = prefix.replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '')
  if (!normalizedPrefix) throw new Error('Manifest field namespace prefix is required.')

  return {
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      id: `${normalizedPrefix}_${field.id}`,
    })),
  }
}
