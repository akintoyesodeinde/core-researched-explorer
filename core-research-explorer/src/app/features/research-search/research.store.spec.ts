import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CORE_API_CONFIG } from '../../core/models/core-api.config';
import { ResearchStore } from './research.store';

describe('ResearchStore', () => {
  let store: ResearchStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ResearchStore,
        {
          provide: CORE_API_CONFIG,
          useValue: {
            coreBaseUrl: '/api/core/works',
          },
        },
      ],
    });
    store = TestBed.inject(ResearchStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('cancels the stale HTTP search when a newer search starts', () => {
    store.search('first query', 10);
    const first = http.expectOne((request) => request.url === '/api/core/works');
    store.search('newest query', 20);
    const second = http.expectOne((request) => request.url === '/api/core/works');

    expect(first.cancelled).toBe(true);
    second.flush({
      totalHits: 1,
      results: [{ id: 1, title: 'Newest result', yearPublished: 2025 }],
    });

    expect(store.result()?.query).toBe('newest query');
    expect(store.result()?.retrievedCount).toBe(1);
  });

  it('supports bounded pagination with nextPage and previousPage', () => {
    store.search('drone', 10);
    const firstPage = http.expectOne((request) => request.url === '/api/core/works');
    expect(firstPage.request.params.get('offset')).toBe('0');
    firstPage.flush({
      totalHits: 25,
      results: [{ id: 1, title: 'Page 1 Paper', yearPublished: 2024 }],
    });

    expect(store.currentPage()).toBe(1);
    expect(store.canGoPrevious()).toBe(false);
    expect(store.canGoNext()).toBe(true);

    store.nextPage();
    const secondPage = http.expectOne((request) => request.url === '/api/core/works');
    expect(secondPage.request.params.get('offset')).toBe('10');
    secondPage.flush({
      totalHits: 25,
      results: [{ id: 11, title: 'Page 2 Paper', yearPublished: 2023 }],
    });

    expect(store.currentPage()).toBe(2);
    expect(store.canGoPrevious()).toBe(true);
    expect(store.canGoNext()).toBe(true);

    store.previousPage();
    const backToFirst = http.expectOne((request) => request.url === '/api/core/works');
    expect(backToFirst.request.params.get('offset')).toBe('0');
    backToFirst.flush({
      totalHits: 25,
      results: [{ id: 1, title: 'Page 1 Paper', yearPublished: 2024 }],
    });
    expect(store.currentPage()).toBe(1);
  });

  it.each([
    [401, 'credentials or authorization'],
    [403, 'credentials or authorization'],
    [429, 'rate-limiting'],
    [500, 'temporarily unavailable'],
    [504, 'did not respond in time'],
    [0, 'network or CORE CORS'],
  ])('maps HTTP %i to a clear error', (status, messagePart) => {
    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({}, { status: status as number, statusText: 'Error' });

    expect(store.isError()).toBe(true);
    expect(store.errorMessage()).toContain(messagePart);
  });

  it('includes Retry-After guidance when HTTP 429 provides Retry-After seconds', () => {
    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush(
        {},
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: new HttpHeaders({ 'Retry-After': '30' }),
        },
      );

    expect(store.isError()).toBe(true);
    expect(store.errorMessage()).toContain('30 seconds');
  });

  it('ignores cancellation as stale work rather than displaying an error', () => {
    store.search('old', 10);
    const oldRequest = http.expectOne((request) => request.url === '/api/core/works');
    store.search('new', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({ totalHits: 0, results: [] });

    expect(oldRequest.cancelled).toBe(true);
    expect(store.isEmpty()).toBe(true);
  });

  it('explains when the server-side CORE key is not configured', () => {
    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({ code: 'CORE_API_KEY_MISSING' }, { status: 503, statusText: 'Service Unavailable' });

    expect(store.errorMessage()).toContain('CORE_API_KEY');
  });
});
