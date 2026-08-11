// Quick debug: count internal links in test draft
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const padSentences = [
  'Immigration officers assess each application against the legislative criteria established under the Migration Regulations 1994.',
  'Applicants should review the most recent legislative instrument published on the Federal Register of Legislation before submitting any supporting documentation.',
  'Processing timeframes published by the Department of Home Affairs reflect the median number of calendar days required to finalise applications in each reporting period.',
  'The Minister has the discretion to request additional information under section 56 of the Migration Act 1958 when a delegate forms the view that further evidence is required.',
  'Consular processing fees are non-refundable under the Consular Services Regulations regardless of the outcome of the visa determination.',
  'Professional migration advice can help applicants navigate complex eligibility pathways and prepare evidence that satisfies the decision-maker at first instance.',
  'Administrative Appeals Tribunal review rights attach to most visa refusal decisions subject to strict time limits that commence from the date of notification.',
  'Legislative amendments to the skilled occupation lists take effect on the date specified in the amending instrument published by the Department of Employment and Workplace Relations.',
  'Bridging visas maintain lawful status during processing — applicants must comply with the conditions attached to their bridging visa at all times.',
  'Evidence of English language proficiency must be less than three years old at the time of invitation unless the applicant holds a passport from an exempt country.',
]

let pad = ''
for (let i = 0; i < 120; i++) {
  pad += padSentences[i % padSentences.length] + ' '
  if (i % 4 === 3) pad += '\n\n'
}

const draft = `# International Student Visa — Australia

## Eligibility
You must hold a valid passport and meet the character requirement. All applicants must demonstrate genuine temporary entrant status and provide biometric information when requested. Police certificates from every country you have lived in for more than twelve months are mandatory and must be dated within the last year before you submit your application.

## Required Documents
Passport, birth certificate, proof of financial capacity, health insurance evidence, and academic transcripts or professional registration certificates must all be translated into English by a NAATI-certified translator before lodgement.

## Costs and Fees
The visa application charge depends on the stream you select and whether you include dependent family members. Additional costs include the immigration health examination (IHE), police certificates, and document translation services which can vary considerably.

## The Application Timeline
International students who wish to study in Australia must first obtain a Confirmation of Enrolment from a CRICOS-registered education provider before they can apply for a subclass 500 student visa through the Department of Home Affairs online portal.

${pad}

## Common Refusal Reasons
Insufficient financial evidence remains the leading cause of refusal — applicants must demonstrate genuine access to funds rather than merely showing a bank balance snapshot on a single day.

## Post-Study Work Rights
Graduates of Australian institutions may qualify for the Temporary Graduate visa (subclass 485) which provides full work rights — the duration depends on your qualification level and regional study location.`

// Count internal links manually
const mdLinks = (draft.match(/\]\(\//g) || []).length
const ysMentions = (draft.match(/yousafeconsultancy\.com/g) || []).length
console.log('Markdown links:', mdLinks)
console.log('YouSafe mentions:', ysMentions)
console.log('Total count:', mdLinks + ysMentions)

// Also check for http(s) links of any kind
const httpLinks = (draft.match(/\]\(http/g) || []).length
console.log('Any http links:', httpLinks)

// Check the // pattern specifically
const doubleSlash = (draft.match(/\]\(\/\//g) || []).length
console.log('](// pattern:', doubleSlash)

// Check for ](/ pattern
const singleSlash = (draft.match(/\]\(\//g) || []).length
console.log(']( / pattern:', singleSlash)

// What about any yousafeconsultancy
const ysAny = (draft.match(/yousafeconsultancy/ig) || []).length
console.log('yousafeconsultancy (any case):', ysAny)
