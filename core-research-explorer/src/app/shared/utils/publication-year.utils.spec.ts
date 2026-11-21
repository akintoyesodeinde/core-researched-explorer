import { ResearchPaper } from '../../core/models/research-paper.model';
import { aggregatePublicationYears } from './publication-year.utils';

function paper(id: string, publishedYear: number | null, doi: string | null = null): ResearchPaper {
  return {
    id,
    title: id,
    authors: [],
    abstract: null,
    publishedYear,
    doi,
    sourceUrl: null,
    downloadUrl: null,
    publisher: null,
  };
}

describe('aggregatePublicationYears', () => {
  it('groups and sorts valid retrieved-paper years with summary metrics', () => {
    const result = aggregatePublicationYears([
      paper('1', 2024, '10.1000/a'),
      paper('2', 2022, null),
      paper('3', 2024, '10.1000/b'),
    ]);

    expect(result.counts).toEqual([
      { year: 2022, count: 1 },
      { year: 2024, count: 2 },
    ]);
    expect(result.missingCount).toBe(0);
    expect(result.yearRange).toEqual({ min: 2022, max: 2024 });
    expect(result.peakYear).toEqual({ year: 2024, count: 2 });
    expect(result.doiCoverageCount).toBe(2);
  });

  it('prefers the most recent year when peak counts are tied', () => {
    const result = aggregatePublicationYears([paper('1', 2021), paper('2', 2024)]);
    expect(result.peakYear).toEqual({ year: 2024, count: 1 });
    expect(result.yearRange).toEqual({ min: 2021, max: 2024 });
  });

  it('excludes null and implausible years', () => {
    const result = aggregatePublicationYears(
      [paper('1', null), paper('2', 1700), paper('3', 2020), paper('4', 2030)],
      2026,
    );

    expect(result.counts).toEqual([{ year: 2020, count: 1 }]);
    expect(result.includedCount).toBe(1);
    expect(result.missingCount).toBe(3);
    expect(result.yearRange).toEqual({ min: 2020, max: 2020 });
  });

  it('excludes non-integer and non-finite years defensively', () => {
    const result = aggregatePublicationYears([
      paper('1', 2024.5),
      paper('2', Number.NaN),
      paper('3', Number.POSITIVE_INFINITY),
    ]);

    expect(result.counts).toEqual([]);
    expect(result.includedCount).toBe(0);
    expect(result.missingCount).toBe(3);
    expect(result.yearRange).toBeNull();
    expect(result.peakYear).toBeNull();
  });

  it('returns empty analytics for no papers', () => {
    expect(aggregatePublicationYears([])).toEqual({
      counts: [],
      includedCount: 0,
      missingCount: 0,
      yearRange: null,
      peakYear: null,
      doiCoverageCount: 0,
    });
  });
});
