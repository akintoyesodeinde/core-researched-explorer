import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subject, Subscription, TimeoutError, catchError, map, of, switchMap } from 'rxjs';
import { CoreApiService, MAX_SEARCH_OFFSET } from '../../core/api/core-api.service';
import { ResearchSearchResult } from '../../core/models/research-paper.model';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

interface SearchRequest {
  query: string;
  limit: number;
  offset: number;
}

@Injectable()
export class ResearchStore implements OnDestroy {
  readonly status = signal<SearchStatus>('idle');
  readonly result = signal<ResearchSearchResult | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly activeRequest = signal<SearchRequest | null>(null);
  readonly isLoading = computed(() => this.status() === 'loading');
  readonly isEmpty = computed(() => this.status() === 'empty');
  readonly isError = computed(() => this.status() === 'error');
  readonly currentPage = computed(() => {
    const active = this.activeRequest();
    if (!active || active.limit <= 0) return 1;
    return Math.floor(active.offset / active.limit) + 1;
  });
  readonly canGoPrevious = computed(() => {
    const active = this.activeRequest();
    return Boolean(active && active.offset > 0 && !this.isLoading());
  });
  readonly canGoNext = computed(() => {
    const result = this.result();
    const active = this.activeRequest();
    if (!result || !active || this.isLoading()) return false;
    const nextOffset = active.offset + active.limit;
    if (nextOffset > MAX_SEARCH_OFFSET) return false;
    if (result.totalHits !== null) {
      return nextOffset < result.totalHits && result.retrievedCount > 0;
    }
    return result.retrievedCount >= active.limit;
  });

  private readonly searches = new Subject<SearchRequest>();
  private readonly coreApi = inject(CoreApiService);
  private readonly searchSubscription: Subscription = this.searches
    .pipe(
      switchMap(({ query, limit, offset }) =>
        this.coreApi.search(query, limit, offset).pipe(
          map((result) => ({ kind: 'success' as const, result })),
          catchError((error: unknown) =>
            of({ kind: 'error' as const, error: this.toErrorMessage(error) }),
          ),
        ),
      ),
    )
    .subscribe((outcome) => {
      if (outcome.kind === 'error') {
        this.result.set(null);
        this.errorMessage.set(outcome.error);
        this.status.set('error');
      } else {
        this.errorMessage.set(null);
        this.result.set(outcome.result);
        this.status.set(outcome.result.papers.length ? 'success' : 'empty');
      }
    });

  search(query: string, limit: number, offset = 0): void {
    const safeOffset = Math.min(MAX_SEARCH_OFFSET, Math.max(0, Math.floor(offset)));
    this.errorMessage.set(null);
    this.status.set('loading');
    const request: SearchRequest = { query, limit, offset: safeOffset };
    this.activeRequest.set(request);
    this.searches.next(request);
  }

  nextPage(): void {
    const active = this.activeRequest();
    if (!active || !this.canGoNext()) return;
    this.search(active.query, active.limit, active.offset + active.limit);
  }

  previousPage(): void {
    const active = this.activeRequest();
    if (!active || !this.canGoPrevious()) return;
    this.search(active.query, active.limit, Math.max(0, active.offset - active.limit));
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof TimeoutError) {
      return 'CORE search timed out. Please retry.';
    }
    if (!(error instanceof HttpErrorResponse)) {
      return 'CORE search could not be completed. Please try again.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'CORE rejected the request. Live search credentials or authorization are not available.';
    }
    if (error.status === 429) {
      const retryAfter = error.headers?.get('Retry-After')?.trim();
      if (retryAfter && /^\d+$/.test(retryAfter)) {
        return `CORE is rate-limiting requests. Wait ${retryAfter} seconds, then retry.`;
      }
      return 'CORE is rate-limiting requests. Wait briefly, then retry.';
    }
    if (error.status === 504) {
      return 'CORE did not respond in time. Please retry.';
    }
    if (
      error.status === 503 &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'code' in error.error &&
      error.error.code === 'CORE_API_KEY_MISSING'
    ) {
      return 'Live CORE search is not configured. Add CORE_API_KEY to the server environment.';
    }
    if (error.status >= 500) {
      return 'CORE is temporarily unavailable. Please retry.';
    }
    if (error.status === 0) {
      return 'The network or CORE CORS policy prevented this request.';
    }
    return 'CORE search failed. Please check the query and retry.';
  }
}
