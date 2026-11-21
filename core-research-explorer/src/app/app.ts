import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ResearchPaper } from './core/models/research-paper.model';
import { PublicationChart } from './features/analytics/components/publication-chart/publication-chart';
import { ResearchStore } from './features/research-search/research.store';
import { validateBooleanQuery } from './shared/utils/boolean-query.utils';
import { aggregatePublicationYears } from './shared/utils/publication-year.utils';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  imports: [ReactiveFormsModule, PublicationChart],
  providers: [ResearchStore],
})
export class App {
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
  protected readonly publicationAnalytics = computed(() =>
    aggregatePublicationYears(this.store.result()?.papers ?? []),
  );

  protected submitSearch(): void {
    const query = this.searchForm.controls.query.value;
    const validation = validateBooleanQuery(query);
    this.validationMessage.set(validation.message);
    if (!validation.valid) return;

    this.expandedAbstracts.set(new Set());
    this.store.search(query.trim(), this.searchForm.controls.limit.value, 0);
  }

  protected onLimitChange(): void {
    if (this.store.status() === 'idle') return;
    this.submitSearch();
  }

  protected retry(): void {
    const currentQuery = this.searchForm.controls.query.value.trim();
    const active = this.store.activeRequest();
    if (!currentQuery && active) {
      this.expandedAbstracts.set(new Set());
      this.store.search(active.query, active.limit, active.offset);
      return;
    }
    if (
      active &&
      currentQuery === active.query &&
      this.searchForm.controls.limit.value === active.limit
    ) {
      this.expandedAbstracts.set(new Set());
      this.store.search(active.query, active.limit, active.offset);
      return;
    }
    this.submitSearch();
  }

  protected goToNextPage(): void {
    this.expandedAbstracts.set(new Set());
    this.store.nextPage();
  }

  protected goToPreviousPage(): void {
    this.expandedAbstracts.set(new Set());
    this.store.previousPage();
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
}
