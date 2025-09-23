export type RowView = {
  first?: string | null;
  short_address?: string | null;
  fullAddress?: string | null;
};

type Template = {
  subject: (rv: RowView) => string;
  paragraphs: (rv: RowView) => string[];
};

const hi = (name?: string | null) => `Hi ${name?.trim()},`;
const short_address  = (rv: RowView) => rv.short_address?.trim();
// const addr= (rv: RowView) => rv.fullAddress?.trim();

export const TEMPLATES: Template[] = [
  // Stage 0 — initial
  {
    subject: (_rv) => `Quick question about your property`,
    paragraphs: (rv) => [
      hi(rv.first),
      `I came across public records showing there may be unpaid property taxes for ${short_address(rv)}.`,
      `I help owners explore options to resolve this—selling, partnering, or other solutions—depending on your goals and timeline.`,
      `Would you be open to a quick 10-minute chat?`,
      `Best,\nAdam\n 317-572-7840`
    ]
  },
  // Stage 1 — check in
  {
    subject: (rv) => `Checking in about ${short_address(rv)}`,
    paragraphs: (rv) => [
      hi(rv.first),
      `Following up on my note about ${short_address(rv)}.`,
      `The earlier you review options on tax issues, the more flexibility you typically have.`,
      `Could we find 10 minutes this week?`
    ]
  },
  // Stage 2 — educate (timeline)
  {
    subject: (rv) => `Tax timeline on ${short_address(rv)}`,
    paragraphs: (rv) => [
      hi(rv.first),
      `Quick heads-up: properties with unpaid taxes can move toward tax sale. That can put equity at risk if not addressed.`,
      `I can walk through a few paths owners use to avoid that outcome—no pressure.`,
      `Want me to send a quick outline?`
    ]
  },
  // Stage 3 — offer resources
  {
    subject: (rv) => `Helpful options for ${short_address(rv)}`,
    paragraphs: (rv) => [
      hi(rv.first),
      `I can send you a short checklist owners use to get ahead of tax deadlines and preserve options.`,
      `Would that be helpful?`
    ]
  },
  // Stage 4
  {
    subject: (rv) => `Still here to help with ${short_address(rv)}`,
    paragraphs: (rv) => [
      hi(rv.first),
      `Just checking in—happy to be a resource even if you’re not ready to decide yet.`,
      `If you want, I can draft a few scenario estimates to review together.`
    ]
  },
  // Stage 5
  {
    subject: (rv) => `Quick nudge on ${short_address(rv)}`,
    paragraphs: (rv) => [
      hi(rv.first),
      `If timing isn’t great, no worries. If a quick call next week is better, I’ll make it easy.`
    ]
  },
  // Stage 6
  {
    subject: (_rv) => `Do you want me to send a simple plan?`,
    paragraphs: (rv) => [
      hi(rv.first),
      `I can send a one-page plan with next steps owners often take in similar situations.`,
      `Interested?`
    ]
  },
  // Stage 7
  {
    subject: (_rv) => `Seventh follow-up — still available`,
    paragraphs: (rv) => [
      hi(rv.first),
      `I don’t want to pester you; just keeping the door open if support would be useful.`,
      `Happy to pause if you’d prefer.`
    ]
  },
  // Stage 8
  {
    subject: (_rv) => `Should I check back later?`,
    paragraphs: (rv) => [
      hi(rv.first),
      `If now isn’t the right time, I can check back in 3–6 months.`,
      `What works best for you?`
    ]
  },
  // Stage 9 — last message
  {
    subject: (_rv) => `Last note unless you want me to stay in touch`,
    paragraphs: (rv) => [
      hi(rv.first),
      `This will be my last email unless you’d like me to keep following up.`,
      `Reply “stop” to opt out, or tell me if a later check-in works.`
    ]
  }
];

export function getTemplate(stage: number) {
  const idx = Math.max(0, Math.min(stage, TEMPLATES.length - 1));
  return TEMPLATES[idx];
}