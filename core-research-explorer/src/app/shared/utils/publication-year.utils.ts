import { ResearchPaper } from '../../core/models/research-paper.model';

export interface PublicationYearCount {
  year: number;
  count: number;
}

export interface PublicationYearRange {
  min: number;
  max: number;
}

export interface PublicationYearAnalytics {
  counts: PublicationYearCount[];
  includedCount: number;
  missingCount: number;
  yearRange?: PublicationYearRange | null;
  peakYear?: PublicationYearCount | null;
  doiCoverageCount?: number;
}

const EARLIEST_PLAUSIBLE_PUBLICATION_YEAR = 1800;

export function aggregatePublicationYears(
  papers: readonly ResearchPaper[],
  maximumYear = new Date().getUTCFullYear() + 1,
): PublicationYearAnalytics {
  const counts = new Map<number, number>();
  let missingCount = 0;
  let doiCoverageCount = 0;

  for (const paper of papers) {
    if (typeof paper.doi === 'string' && paper.doi.trim()) {
      doiCoverageCount++;
    }

    const year = paper.publishedYear;
    if (
      typeof year !== 'number' ||
      !Number.isInteger(year) ||
      year < EARLIEST_PLAUSIBLE_PUBLICATION_YEAR ||
      year > maximumYear
    ) {
      missingCount++;
      continue;
    }
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }

  const sortedCounts = [...counts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((left, right) => left.year - right.year);

  const yearRange = sortedCounts.length
    ? { min: sortedCounts[0].year, max: sortedCounts[sortedCounts.length - 1].year }
    : null;

  let peakYear: PublicationYearCount | null = null;
  for (const entry of sortedCounts) {
    if (!peakYear || entry.count >= peakYear.count) {
      peakYear = entry;
    }
  }

  return {
    counts: sortedCounts,
    includedCount: papers.length - missingCount,
    missingCount,
    yearRange,
    peakYear,
    doiCoverageCount,
  };
}
