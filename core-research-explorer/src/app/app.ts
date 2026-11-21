import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MAX_SEARCH_OFFSET } from './core/api/core-api.service';
import { ResearchPaper } from './core/models/research-paper.model';
import { PublicationChart } from './features/analytics/components/publication-chart/publication-chart';
import { ResearchStore } from './features/research-search/research.store';
import { validateBooleanQuery } from './shared/utils/boolean-query.utils';
import { aggregatePublicationYears } from './shared/utils/publication-year.utils';

export type PaperSortOrder = 'relevance' | 'newest' | 'oldest';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  imports: [ReactiveFormsModule, PublicationChart],
  providers: [ResearchStore],
})
export class App implements OnInit {
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly location = inject(Location, { optional: true });

  protected readonly title = signal('CORE Research Explorer');
  protected readonly store = inject(ResearchStore);
  protected readonly resultCounts = [10, 20, 50];
  protected readonly abstractPreviewLength = 220;
  protected readonly searchForm = new FormGroup({
    query: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    limit: new FormControl(10, { nonNullable: true, validators: [Validators.required] }),
  });
  protected validationMessage = signal<string | null>(null);
  protected readonly expandedAbstracts = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedYear = signal<number | null>(null);
  protected readonly sortOrder = signal<PaperSortOrder>('relevance');
  protected readonly publicationAnalytics = computed(() =>
    aggregatePublicationYears(this.store.result()?.papers ?? []),
  );
  protected readonly displayedPapers = computed(() => {
    const papers = this.store.result()?.papers ?? [];
    const yearFilter = this.selectedYear();
    const filtered =
      yearFilter === null ? papers : papers.filter((paper) => paper.publishedYear === yearFilter);
    const sort = this.sortOrder();
    if (sort === 'relevance') return filtered;

    return [...filtered].sort((left, right) => {
      const leftYear = left.publishedYear;
      const rightYear = right.publishedYear;
      if (leftYear === rightYear) return 0;
      if (leftYear === null) return 1;
      if (rightYear === null) return -1;
      return sort === 'newest' ? rightYear - leftYear : leftYear - rightYear;
    });
  });

  ngOnInit(): void {
    const snapshotParams = this.route?.snapshot.queryParamMap;
    const params = snapshotParams?.has('q')
      ? snapshotParams
      : this.router && this.location
        ? this.router.parseUrl(this.location.path(true)).queryParamMap
        : snapshotParams;
    if (!params) return;

    const queryParam = params.get('q')?.trim() ?? '';
    if (!queryParam) return;

    const parsedLimit = Number(params.get('limit'));
    const limit = this.resultCounts.includes(parsedLimit) ? parsedLimit : 10;
    const parsedOffset = Number(params.get('offset'));
    const offset =
      Number.isInteger(parsedOffset) && parsedOffset >= 0 && parsedOffset <= MAX_SEARCH_OFFSET
        ? parsedOffset
        : 0;

    this.searchForm.setValue({ query: queryParam, limit });
    const validation = validateBooleanQuery(queryParam);
    this.validationMessage.set(validation.message);
    if (!validation.valid) return;

    this.store.search(queryParam, limit, offset);
  }

  protected submitSearch(): void {
    const query = this.searchForm.controls.query.value;
    const validation = validateBooleanQuery(query);
    this.validationMessage.set(validation.message);
    if (!validation.valid) return;

    const trimmedQuery = query.trim();
    const limit = this.searchForm.controls.limit.value;
    this.resetResultViewState();
    this.store.search(trimmedQuery, limit, 0);
    this.syncSearchUrl(trimmedQuery, limit, 0);
  }

  protected onLimitChange(): void {
    if (this.store.status() === 'idle') return;
    this.submitSearch();
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'relevance' || value === 'newest' || value === 'oldest') {
      this.sortOrder.set(value);
    }
  }

  protected onYearSelected(year: number | null): void {
    this.selectedYear.set(year);
  }

  protected clearYearFilter(): void {
    this.selectedYear.set(null);
  }

  protected retry(): void {
    const currentQuery = this.searchForm.controls.query.value.trim();
    const active = this.store.activeRequest();
    if (!currentQuery && active) {
      this.resetResultViewState();
      this.store.search(active.query, active.limit, active.offset);
      return;
    }
    if (
      active &&
      currentQuery === active.query &&
      this.searchForm.controls.limit.value === active.limit
    ) {
      this.resetResultViewState();
      this.store.search(active.query, active.limit, active.offset);
      return;
    }
    this.submitSearch();
  }

  protected goToNextPage(): void {
    const active = this.store.activeRequest();
    if (!active || !this.store.canGoNext()) return;
    this.resetResultViewState();
    const nextOffset = active.offset + active.limit;
    this.store.nextPage();
    this.syncSearchUrl(active.query, active.limit, nextOffset);
  }

  protected goToPreviousPage(): void {
    const active = this.store.activeRequest();
    if (!active || !this.store.canGoPrevious()) return;
    this.resetResultViewState();
    const prevOffset = Math.max(0, active.offset - active.limit);
    this.store.previousPage();
    this.syncSearchUrl(active.query, active.limit, prevOffset);
  }

  protected paperKey(paper: ResearchPaper, index: number): string {
    return paper.id ?? String(index);
  }

  protected isAbstractExpandable(abstract: string | null): boolean {
    return Boolean(abstract && abstract.length > this.abstractPreviewLength);
  }

  protected isAbstractExpanded(key: string): boolean {
    return this.expandedAbstracts().has(key);
  }

  protected toggleAbstract(key: string): void {
    const next = new Set(this.expandedAbstracts());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.expandedAbstracts.set(next);
  }

  protected formatDoiUrl(doi: string | null): string | null {
    if (!doi) return null;
    const trimmed = doi.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
      } catch {
        return null;
      }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return null;
    }
    return `https://doi.org/${encodeURIComponent(trimmed).replace(/%2F/gi, '/')}`;
  }

  private resetResultViewState(): void {
    this.expandedAbstracts.set(new Set());
    this.selectedYear.set(null);
  }

  private syncSearchUrl(query: string, limit: number, offset: number): void {
    if (!this.router) return;
    void this.router.navigate([], {
      queryParams: {
        q: query,
        limit,
        offset: offset > 0 ? offset : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
