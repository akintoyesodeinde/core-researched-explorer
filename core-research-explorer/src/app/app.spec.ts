import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { App } from './app';
import { CORE_API_CONFIG } from './core/models/core-api.config';
import { ResearchStore } from './features/research-search/research.store';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CORE_API_CONFIG,
          useValue: {
            coreBaseUrl: '/api/core/works',
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('CORE Research Explorer');
  });

  it('renders the search form and result-count choices', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect((compiled.querySelector('#query') as HTMLInputElement).value).toBe('');
    expect(compiled.querySelectorAll('#limit option').length).toBe(3);
  });

  it('renders retrieved-paper scope and aggregated years', async () => {
    const fixture = TestBed.createComponent(App);
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 20,
        results: [
          { id: 1, title: 'One', yearPublished: 2024 },
          { id: 2, title: 'Two', yearPublished: 2022 },
          { id: 3, title: 'Three', yearPublished: 2024 },
          { id: 4, title: 'Four', yearPublished: null },
        ],
      });

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.scope-note')?.textContent).toContain('4 retrieved papers');
    expect(compiled.querySelectorAll('table tbody tr').length).toBe(2);
    expect(compiled.querySelector('.exclusion-note')?.textContent).toContain('1 paper(s)');
  });

  it('filters retrieved papers by publication year and allows clearing the filter', async () => {
    const fixture = TestBed.createComponent(App);
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 3,
        results: [
          { id: 1, title: 'Paper 2024', yearPublished: 2024 },
          { id: 2, title: 'Paper 2022', yearPublished: 2022 },
          { id: 3, title: 'Undated Paper', yearPublished: null },
        ],
      });

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.paper-card')).toHaveLength(3);

    (compiled.querySelector('.table-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    const filterButtons = compiled.querySelectorAll('.year-filter-btn');
    (filterButtons[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(compiled.querySelector('.active-filter')?.textContent).toContain('2024');
    expect(compiled.querySelectorAll('.paper-card')).toHaveLength(1);
    expect(compiled.querySelector('.paper-card h3')?.textContent).toContain('Paper 2024');

    (compiled.querySelector('.clear-filter') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('.active-filter')).toBeNull();
    expect(compiled.querySelectorAll('.paper-card')).toHaveLength(3);
  });

  it('sorts retrieved papers by newest or oldest publication year', async () => {
    const fixture = TestBed.createComponent(App);
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 3,
        results: [
          { id: 1, title: 'Mid Paper', yearPublished: 2022 },
          { id: 2, title: 'No Year Paper', yearPublished: null },
          { id: 3, title: 'Latest Paper', yearPublished: 2025 },
        ],
      });

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const sortSelect = compiled.querySelector('#sort-order') as HTMLSelectElement;

    sortSelect.value = 'newest';
    sortSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    let titles = [...compiled.querySelectorAll('.paper-card h3')].map((el) =>
      el.textContent?.trim(),
    );
    expect(titles).toEqual(['Latest Paper', 'Mid Paper', 'No Year Paper']);

    sortSelect.value = 'oldest';
    sortSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    titles = [...compiled.querySelectorAll('.paper-card h3')].map((el) => el.textContent?.trim());
    expect(titles).toEqual(['Mid Paper', 'Latest Paper', 'No Year Paper']);
  });

  it('shows loading then an empty state', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('unknown topic', 20);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.status')?.textContent).toContain(
      'Searching CORE',
    );

    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({ totalHits: 0, results: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.state h3')?.textContent,
    ).toContain('No papers found');
  });

  it('omits missing metadata instead of rendering invented values', async () => {
    const fixture = TestBed.createComponent(App);
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('incomplete metadata', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 1,
        results: [{ id: null, title: null, authors: null, abstract: null }],
      });

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.paper-card')).toBeNull();
    expect(compiled.querySelector('.state h3')?.textContent).toContain('No papers found');
  });

  it('expands and collapses long abstracts on paper cards', async () => {
    const fixture = TestBed.createComponent(App);
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);
    const longAbstract = 'A'.repeat(260);

    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 1,
        results: [
          {
            id: 10,
            title: 'Long Abstract Paper',
            abstract: longAbstract,
            yearPublished: 2024,
          },
        ],
      });

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const toggle = compiled.querySelector('.abstract-toggle') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent?.trim()).toBe('Show more');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('Show less');
    expect(compiled.querySelector('.abstract--expanded')).toBeTruthy();
  });

  it('re-runs the active search when result count changes after initial search', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);

    const query = compiled.querySelector('#query') as HTMLInputElement;
    query.value = 'drone AND delivery';
    query.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const select = compiled.querySelector('#limit') as HTMLSelectElement;
    select.dispatchEvent(new Event('change'));
    http.expectNone('/api/core/works');

    const form = compiled.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const first = http.expectOne((request) => request.url === '/api/core/works');
    expect(first.request.params.get('limit')).toBe('10');
    first.flush({
      totalHits: 30,
      results: [{ id: 1, title: 'First result', yearPublished: 2024 }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const second = http.expectOne((request) => request.url === '/api/core/works');
    expect(second.request.params.get('limit')).toBe('20');
    expect(second.request.params.get('offset')).toBe('0');
    second.flush({
      totalHits: 30,
      results: [{ id: 1, title: 'First result', yearPublished: 2024 }],
    });
  });

  it('navigates between result pages using pagination controls', async () => {
    const fixture = TestBed.createComponent(App);
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 25,
        results: [{ id: 1, title: 'Page 1 Paper', yearPublished: 2024 }],
      });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.pagination .page-button');
    expect(buttons).toHaveLength(2);
    const prevButton = buttons[0] as HTMLButtonElement;
    const nextButton = buttons[1] as HTMLButtonElement;
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);

    nextButton.click();
    fixture.detectChanges();

    const nextReq = http.expectOne((request) => request.url === '/api/core/works');
    expect(nextReq.request.params.get('offset')).toBe('10');
    nextReq.flush({
      totalHits: 25,
      results: [{ id: 11, title: 'Page 2 Paper', yearPublished: 2023 }],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('.page-indicator')?.textContent).toContain('Page 2');
  });

  it('shows a clear error and retry control', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(ResearchStore);
    const http = TestBed.inject(HttpTestingController);

    store.search('drone', 10);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({ message: 'rate limited' }, { status: 429, statusText: 'Too Many Requests' });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error-state')?.textContent).toContain('rate-limiting requests');
    expect(compiled.querySelector('.error-state button')?.textContent).toContain('Retry');
  });

  it('submits through the form with Enter', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const query = compiled.querySelector('#query') as HTMLInputElement;
    query.value = 'robots AND delivery';
    query.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form = compiled.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((request) => request.url === '/api/core/works')
      .flush({
        totalHits: 1,
        results: [{ id: 1, title: 'Keyboard result', yearPublished: 2024 }],
      });
  });

  it('restores and runs a valid search from URL query parameters on initialization', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                q: 'drone AND sensor',
                limit: '20',
                offset: '10',
              }),
            },
          },
        },
        {
          provide: CORE_API_CONFIG,
          useValue: {
            coreBaseUrl: '/api/core/works',
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne((request) => request.url === '/api/core/works');
    expect(req.request.params.get('q')).toBe('drone AND sensor');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('offset')).toBe('10');
    req.flush({
      totalHits: 40,
      results: [{ id: 11, title: 'Shared URL paper', yearPublished: 2024 }],
    });

    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect((compiled.querySelector('#query') as HTMLInputElement).value).toBe('drone AND sensor');
    expect(compiled.querySelector('.paper-card h3')?.textContent).toContain('Shared URL paper');
  });
});
