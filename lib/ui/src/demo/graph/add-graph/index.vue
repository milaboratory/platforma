<script setup lang="ts">
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import AddGraph from '@/lib/components/AddGraph.vue';

import AreaChart from '@/lib/assets/graph-images/AreaChart.svg';
import BarChart from '@/lib/assets/graph-images/BarChart.svg';
import BinnedDots from '@/lib/assets/graph-images/BinnedDots.svg';
import BoxPlot from '@/lib/assets/graph-images/BoxPlot.svg';
import BoxPlotConnectedDots from '@/lib/assets/graph-images/BoxPlotConnectedDots.svg';
import BoxPlotJitteredDots from '@/lib/assets/graph-images/BoxPlotJitteredDots.svg';
import BubbleChart from '@/lib/assets/graph-images/BubbleChart.svg';
import CircularDendrogram from '@/lib/assets/graph-images/CircularDendrogram.svg';
import ClusterAnalysis from '@/lib/assets/graph-images/ClusterAnalysis.svg';
import Dendrogram from '@/lib/assets/graph-images/Dendrogram.svg';
import DotPlot from '@/lib/assets/graph-images/DotPlot.svg';
import Heatmap from '@/lib/assets/graph-images/Heatmap.svg';
import HeatmapDendrogram from '@/lib/assets/graph-images/HeatmapDendrogram.svg';
import HeatmapHistogram from '@/lib/assets/graph-images/HeatmapHistogram.svg';
import Histogram from '@/lib/assets/graph-images/Histogram.svg';
import LineChart from '@/lib/assets/graph-images/LineChart.svg';
import LineChartBinnedDots from '@/lib/assets/graph-images/LineChartBinnedDots.svg';
import LineChartErrorBars from '@/lib/assets/graph-images/LineChartErrorBars.svg';
import LineChartJitteredDots from '@/lib/assets/graph-images/LineChartJitteredDots.svg';
import PairedPoints from '@/lib/assets/graph-images/PairedPoints.svg';
import SinaPlot from '@/lib/assets/graph-images/SinaPlot.svg';
import SkatterPlot from '@/lib/assets/graph-images/SkatterPlot.svg';
import StackedBarChart from '@/lib/assets/graph-images/StackedBarChart.svg';
import Trendline from '@/lib/assets/graph-images/Trendline.svg';
import ViolinPlot from '@/lib/assets/graph-images/ViolinPlot.svg';
import ViolinPlotBinnedDots from '@/lib/assets/graph-images/ViolinPlotBinnedDots.svg';
import ViolinPlotJitteredDots from '@/lib/assets/graph-images/ViolinPlotJitteredDots.svg';
import { reactive } from 'vue';

type AvailableImagesKeys = keyof typeof images;
type AvailableGroups = (typeof groups)[number];

const images = {
  AreaChart: { image: AreaChart, title: 'Area Chart', id: '1' },
  BarChart: { image: BarChart, title: 'Bar Chart', id: '2' },
  BinnedDots: { image: BinnedDots, title: 'Binned Dots', id: '3' },
  BoxPlot: { image: BoxPlot, title: 'Box Plot', id: '4' },
  BoxPlotConnectedDots: { image: BoxPlotConnectedDots, title: 'Box plot + Connected Dots', id: '5' },
  BoxPlotJitteredDots: { image: BoxPlotJitteredDots, title: 'Box plot + Jittered Dots', id: '6' },
  BubbleChart: { image: BubbleChart, title: 'Bubble Chart', id: '7' },
  CircularDendrogram: { image: CircularDendrogram, title: 'Circular Dendrogram', id: '8' },
  ClusterAnalysis: { image: ClusterAnalysis, title: 'Cluster Analysis', id: '9' },
  Dendrogram: { image: Dendrogram, title: 'Dendrogram', id: '10' },
  DotPlot: { image: DotPlot, title: 'Dot Plot', id: '11' },
  Heatmap: { image: Heatmap, title: 'Heatmap', id: '12' },
  HeatmapDendrogram: { image: HeatmapDendrogram, title: 'Heatmap + Dendrogram', id: '13' },
  HeatmapHistogram: { image: HeatmapHistogram, title: 'Heatmap + Histogram', id: '14' },
  Histogram: { image: Histogram, title: 'Histogram', id: '15' },
  LineChart: { image: LineChart, title: 'Line Chart', id: '16' },
  LineChartBinnedDots: { image: LineChartBinnedDots, title: 'Line Chart + Binned Dots', id: '17' },
  LineChartErrorBars: { image: LineChartErrorBars, title: 'Line Chart + Error Bars', id: '18' },
  LineChartJitteredDots: { image: LineChartJitteredDots, title: 'Line Chart + Jittered Dots', id: '19' },
  PairedPoints: { image: PairedPoints, title: 'Paired Points', id: '20' },
  SinaPlot: { image: SinaPlot, title: 'Sina Plot', id: '21' },
  SkatterPlot: { image: SkatterPlot, title: 'Skatter Plot', id: '22' },
  StackedBarChart: { image: StackedBarChart, title: 'Stacked Bar Chart', id: '23' },
  Trendline: { image: Trendline, title: 'Trendline', id: '24' },
  ViolinPlot: { image: ViolinPlot, title: 'Violin Plot', id: '25' },
  ViolinPlotBinnedDots: { image: ViolinPlotBinnedDots, title: 'Violin Plot + Binned Dots', id: '26' },
  ViolinPlotJitteredDots: { image: ViolinPlotJitteredDots, title: 'Violin Plot + Jittered Dots', id: '27' },
};
const groups = ['Box & Violin', 'Bars', 'Lines', 'Skatter', 'Heatmap', 'Area'] as const;

const items = reactive<{ data: { group: AvailableGroups; items: (typeof images)[AvailableImagesKeys][] }[] }>({
  data: [
    {
      group: 'Box & Violin',
      items: [
        images['BoxPlot'],
        images['BoxPlotJitteredDots'],
        images['BoxPlotConnectedDots'],
        images['ViolinPlot'],
        images['ViolinPlotJitteredDots'],
        images['ViolinPlotBinnedDots'],
      ],
    },
    {
      group: 'Bars',
      items: [images['BarChart'], images['StackedBarChart'], images['Histogram']],
    },
    {
      group: 'Lines',
      items: [
        images['LineChart'],
        images['PairedPoints'],
        images['LineChartErrorBars'],
        images['LineChartBinnedDots'],
        images['LineChartJitteredDots'],
      ],
    },
    {
      group: 'Skatter',
      items: [images['SkatterPlot'], images['Trendline'], images['BubbleChart'], images['BinnedDots'], images['DotPlot'], images['SinaPlot']],
    },
    {
      group: 'Heatmap',
      items: [images['Heatmap'], images['HeatmapDendrogram'], images['HeatmapHistogram'], images['Dendrogram'], images['CircularDendrogram']],
    },
    {
      group: 'Area',
      items: [images['AreaChart'], images['ClusterAnalysis']],
    },
  ],
});

function selectedItem(id: string) {
  console.log('selected item', id);
}

function closeDialog() {
  console.log('close event called');
}
</script>

<template>
  <Layout>
    <Split name="DropdownListItem" :hide-second="true">
      <div style="padding: 20px; background-color: red">
        <AddGraph :items="items.data" @selected="selectedItem" @close="closeDialog" />
      </div>
    </Split>
  </Layout>
</template>
