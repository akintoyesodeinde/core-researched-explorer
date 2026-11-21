import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { ECharts } from 'echarts/core';
import { PublicationYearAnalytics } from '../../../../shared/utils/publication-year.utils';

@Component({
  selector: 'app-publication-chart',
  templateUrl: './publication-chart.html',
  styleUrl: './publication-chart.scss',
})
export class PublicationChart implements OnDestroy {
  readonly analytics = input.required<PublicationYearAnalytics>();
  readonly retrievedCount = input.required<number>();
  readonly query = input.required<string>();
  readonly selectedYear = input<number | null>(null);
  readonly yearSelected = output<number | null>();

  protected readonly chartReady = signal(false);
  protected readonly showDataTable = signal(false);
  protected readonly yearSpanLabel = computed(() => {
    const range = this.analytics().yearRange;
    if (!range) return null;
    return range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
  });

  @ViewChild('chart')
  private set chartElement(value: ElementRef<HTMLDivElement> | undefined) {
    this.attachChartHost(value?.nativeElement);
  }

  private chart?: ECharts;
  private chartHost?: HTMLDivElement;
  private initializingHost?: HTMLDivElement;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;
  private readonly updateChart = effect(() => {
    const analytics = this.analytics();
    const selectedYear = this.selectedYear();
    this.renderChart(analytics, selectedYear);
  });

  ngOnDestroy(): void {
    this.destroyed = true;
    this.updateChart.destroy();
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  protected toggleDataTable(): void {
    this.showDataTable.update((visible) => !visible);
  }

  protected toggleYearSelection(year: number): void {
    this.yearSelected.emit(this.selectedYear() === year ? null : year);
  }

  private async initializeChart(element: HTMLDivElement): Promise<void> {
    if (this.initializingHost === element || this.chart) return;
    this.initializingHost = element;

    const [echarts, components, charts, renderers] = await Promise.all([
      import('echarts/core'),
      import('echarts/components'),
      import('echarts/charts'),
      import('echarts/renderers'),
    ]);
    if (this.destroyed || this.chartHost !== element) {
      this.initializingHost = undefined;
      return;
    }

    echarts.use([
      components.AriaComponent,
      charts.BarChart,
      components.GridComponent,
      renderers.SVGRenderer,
      components.TooltipComponent,
    ]);
    this.chart = echarts.init(element, undefined, { renderer: 'svg' });
    this.chart.on('click', (params: { name?: string }) => {
      const year = Number(params.name);
      if (Number.isInteger(year)) {
        this.toggleYearSelection(year);
      }
    });
    this.initializingHost = undefined;
    this.renderChart(this.analytics(), this.selectedYear());
  }

  private renderChart(analytics: PublicationYearAnalytics, selectedYear: number | null): void {
    if (!this.chart || analytics.counts.length === 0) return;

    this.chart.setOption(
      {
        animationDuration: 350,
        aria: {
          enabled: true,
          decal: { show: true },
          description: this.chartDescription(analytics),
        },
        grid: { top: 24, right: 12, bottom: 48, left: 48 },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          valueFormatter: (value: unknown) => `${String(value)} paper(s)`,
        },
        xAxis: {
          type: 'category',
          data: analytics.counts.map(({ year }) => String(year)),
          name: 'Publication year',
          nameLocation: 'middle',
          nameGap: 30,
          axisLabel: { color: '#405669', fontSize: 12 },
          axisLine: { lineStyle: { color: '#7a919f' } },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          name: 'Papers',
          nameTextStyle: { color: '#405669' },
          axisLabel: { color: '#405669', formatter: '{value}' },
          splitLine: { lineStyle: { color: '#dce5ea' } },
        },
        series: [
          {
            type: 'bar',
            cursor: 'pointer',
            data: analytics.counts.map(({ year, count }) => ({
              value: count,
              itemStyle: {
                color:
                  selectedYear === null ? '#176b87' : year === selectedYear ? '#0b3954' : '#9ab7c4',
                borderRadius: [5, 5, 0, 0],
              },
            })),
            barMaxWidth: 44,
            emphasis: { itemStyle: { color: '#0f526b' } },
          },
        ],
      },
      true,
    );
    this.chartReady.set(true);
  }

  private attachChartHost(element: HTMLDivElement | undefined): void {
    if (this.chartHost === element) return;

    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
    this.chartHost = element;
    this.initializingHost = undefined;
    this.chartReady.set(false);
    if (!element) return;

    const updateChartSize = (): void => {
      if (this.chartHost !== element) return;
      if (this.chart) {
        this.chart.resize();
      } else if (element.clientWidth > 0 && element.clientHeight > 0) {
        void this.initializeChart(element);
      }
    };

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(updateChartSize);
      this.resizeObserver.observe(element);
    }

    updateChartSize();
  }

  private chartDescription(analytics: PublicationYearAnalytics): string {
    const values = analytics.counts.map(({ year, count }) => `${year}: ${count}`).join(', ');
    return `Publication year counts among retrieved papers. ${values}.`;
  }
}
