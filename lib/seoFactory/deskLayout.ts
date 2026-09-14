/**
 * Practitioner-blog layout (Alma-grade language, tone, layout, formatting).
 *
 * Reference: tryalma.com/blog visa guides — Key Takeaways first, reader-question
 * H2s, comparison tables, numbered process, FAQ that does not restate H2s,
 * author + reviewer byline. YouSafe stays educational: no approval-rate sales
 * claims, no outcome promises, no cloned Alma brand voice.
 */

import { isBlogFamily, usesGuideApparatus } from './writingShape'

export function deskLayoutPromptBlock(contentType?: string | null): string[] {
  const blog = isBlogFamily(contentType)
  const guide = usesGuideApparatus(contentType)
  return [
    'LAYOUT · TONE · FORMATTING (one linear article, practitioner blog grade):',
    '- BYLINE: when the brief names an author, emit Author + Reviewer on the first screen. Never invent a person.',
    blog
      ? '- KEY TAKEAWAYS first: 3–5 complete claims (subject + verb + consequence). Not keyword fragments. Then a 2–3 paragraph lede that answers the question.'
      : '- IN 60 SECONDS is the takeaways slot: 3–5 complete claims (subject + verb + consequence). Not keyword fragments. Then a 2–3 paragraph lede that answers the question before the first content H2.',
    '- LEDE VOICE: second person. Mix an 8–12 word sentence with a 22–32 word one. Pattern: answer, then the constraint ("At first glance… But the standard is high."). Named forms and agencies. Hedge outcomes ("USCIS may", "check the official tool").',
    '- H2s are reader questions or decision frames ("Which to choose", "Who is eligible", "What changes when you switch") — never the primary keyword pasted as a heading, never a standalone mini-guide.',
    '- One comparison table OR a numbered process when the query is vs / cost / timeline / steps. Tables earn a scan; they are not decoration.',
    '- Each later H2 continues the previous H2. The first sentence is a consequence, constraint, or next decision — not a restated thesis.',
    guide
      ? '- Soft next-step before FAQ only when the brief supplies a marketplace CTA. Educational, not a guarantee. Then FAQ (questions the H2s did not already settle), Sources, disclaimer.'
      : '- Close once. A short educational disclaimer if YMYL-adjacent. Do not force FAQ, TOC, or In 60 seconds on blogs.',
    '- FAQ questions are genuine reader worries (missing document, filing while current permission is valid, what an RFE means). Never paste an H2 into the question.',
    '- Do not write mill openers ("In today\'s fast-paced…", "This section covers…", "Everything you need to know").',
  ]
}
