import type { LeverageCategory, Severity } from '../types';

export const CATEGORY_KEYWORDS: Record<string, LeverageCategory[]> = {
  photo: ['Photo'],
  photos: ['Photo'],
  picture: ['Photo'],
  pictures: ['Photo'],
  image: ['Photo'],
  secret: ['Secret'],
  secrets: ['Secret'],
  crush: ['Crush'],
  feelings: ['Crush'],
  quote: ['Quote'],
  quotes: ['Quote'],
  said: ['Quote'],
  recording: ['Quote'],
  financial: ['Financial'],
  money: ['Financial'],
  embezzlement: ['Financial'],
  funds: ['Financial'],
  relationship: ['Relationship'],
  affair: ['Relationship'],
  dating: ['Relationship'],
  career: ['Career'],
  job: ['Career'],
  resume: ['Career'],
  nda: ['Career'],
  reputation: ['Reputation'],
  embarrassing: ['Reputation'],
  disgrace: ['Reputation'],
  past: ['Past Experience'],
  history: ['Past Experience'],
};

export function parseCategories(text: string): LeverageCategory[] {
  const categories: LeverageCategory[] = [];
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    const cats = CATEGORY_KEYWORDS[clean];
    if (cats) {
      for (const cat of cats) {
        if (!categories.includes(cat)) categories.push(cat);
      }
    }
  }
  if (categories.length === 0) categories.push('Secret');
  return categories;
}

export function parseSeverity(text: string): Severity {
  const lower = text.toLowerCase();
  if (lower.includes('severe') || lower.includes('extreme') || lower.includes('devastating') || lower.includes('career-ending')) return 5;
  if (lower.includes('serious') || lower.includes('significant') || lower.includes('damaging')) return 4;
  if (lower.includes('moderate') || lower.includes('notable')) return 3;
  if (lower.includes('mild') || lower.includes('minor') || lower.includes('slight')) return 2;
  if (lower.includes('trivial') || lower.includes('petty')) return 1;
  return 3;
}
