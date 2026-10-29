import type { EvidenceGrade, Point } from './types';
export function worstGrade(grades: (EvidenceGrade | undefined)[]): EvidenceGrade {
  return !grades.length || grades.some(g => !g || g === 'C') ? 'C' : grades.includes('B') ? 'B' : 'A';
}
export function panelGrade(points: Point[]): EvidenceGrade { return worstGrade(points.map(p => p.evidence_grade)); }
export function requireEvidence(points: Point[]) {
  const grade = panelGrade(points);
  if (grade === 'C') throw new Error('GRADE_C_BLOCKED: unverified input');
  return grade;
}
