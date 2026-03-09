import type { ProtocolMetrics } from './metrics.ts';
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

// Note: You'll need to install: npm install canvas chart.js chartjs-node-canvas
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

export class ChartGenerator {
  private chartJSNodeCanvas: ChartJSNodeCanvas;
  
  private outputDir: string;
  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width: 1200, 
      height: 600,
      backgroundColour: 'white'
    });
    
    this.ensureDirectoryExists();
  }
  
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  async generateAllCharts(metrics: ProtocolMetrics[]): Promise<string[]> {
    const charts: string[] = [];
    
    charts.push(await this.generatePriceChart(metrics));
    charts.push(await this.generateOpenInterestChart(metrics));
    charts.push(await this.generateInsuranceFundChart(metrics));
    charts.push(await this.generateLiquidationsChart(metrics));
    charts.push(await this.generateLeverageChart(metrics));
    charts.push(await this.generateVolumeChart(metrics));
    charts.push(await this.generateLongevityChart(metrics));
    charts.push(await this.generateDashboard(metrics));
    
    console.log(`\nGenerated ${charts.length} charts in ${this.outputDir}`);
    return charts;
  }
  
  private async generatePriceChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const prices = metrics.map(m => m.price);
    
    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [{
          label: 'Price (USD)',
          data: prices,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Price Evolution'
          },
          annotation: this.getPriceAnnotations(metrics)
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Price (USD)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Step'
            }
          }
        }
      }
    };
    
    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '01_price_chart.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private async generateOpenInterestChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const openInterest = metrics.map(m => Number(m.openInterest) / 1e6);
    const longOI = metrics.map(m => Number(m.longOpenInterest) / 1e6);
    const shortOI = metrics.map(m => Number(m.shortOpenInterest) / 1e6);
    
    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [
          {
            label: 'Total Open Interest',
            data: openInterest,
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            fill: false,
            borderWidth: 2
          },
          {
            label: 'Long OI',
            data: longOI,
            borderColor: 'rgb(75, 192, 192)',
            borderDash: [5, 5],
            fill: false
          },
          {
            label: 'Short OI',
            data: shortOI,
            borderColor: 'rgb(255, 99, 132)',
            borderDash: [5, 5],
            fill: false
          }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Open Interest (Millions USD)'
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'USD (Millions)'
            }
          }
        }
      }
    };
    
    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '02_open_interest.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private async generateInsuranceFundChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const insuranceBalance = metrics.map(m => Number(m.insuranceBalance) / 1e6);
    
    // Find drawdowns
    let peak = 0;
    const drawdowns = insuranceBalance.map(b => {
      if (b > peak) peak = b;
      return peak > 0 ? ((peak - b) / peak * 100) : 0;
    });
    
    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [
          {
            label: 'Insurance Fund Balance',
            data: insuranceBalance,
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.1)',
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Drawdown %',
            data: drawdowns,
            borderColor: 'rgb(255, 99, 132)',
            borderDash: [5, 5],
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Insurance Fund Health'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Balance (USD Millions)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Drawdown %'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    };
    
    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '03_insurance_fund.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private async generateLiquidationsChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const liquidations = metrics.map(m => m.liquidationCount);
    const positionsAtRisk = metrics.map(m => m.positionsAtRisk);
    
    // Calculate cumulative liquidations
    const cumulativeLiquidations = [];
    let sum = 0;
    for (const liq of liquidations) {
      sum += liq;
      cumulativeLiquidations.push(sum);
    }
    
    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [
          {
            label: 'Liquidations per Step',
            data: liquidations,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            type: 'bar',
            yAxisID: 'y'
          },
          {
            label: 'Positions at Risk',
            data: positionsAtRisk,
            borderColor: 'rgb(255, 205, 86)',
            borderDash: [5, 5],
            fill: false,
            yAxisID: 'y'
          },
          {
            label: 'Cumulative Liquidations',
            data: cumulativeLiquidations,
            borderColor: 'rgb(153, 102, 255)',
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Liquidation Analysis'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Count per Step'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Cumulative Count'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    };
    
    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '04_liquidations.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private async generateLeverageChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const avgLeverage = metrics.map(m => m.averageLeverage);
    
    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [{
          label: 'Average Leverage',
          data: avgLeverage,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Average Leverage Over Time'
          },
          annotation: {
            annotations: {
              line5x: {
                type: 'line',
                yMin: 5,
                yMax: 5,
                borderColor: 'rgb(255, 99, 132)',
                borderWidth: 2,
                borderDash: [10, 5],
                label: {
                  content: 'High Risk Threshold',
                  enabled: true
                }
              }
            }
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Leverage (x)'
            },
            min: 0
          }
        }
      }
    };
    
    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '05_leverage.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private async generateVolumeChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const volume = metrics.map(m => Number(m.volume24h) / 1e6);
    const trades = metrics.map(m => m.tradeCount);
    
    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [
          {
            label: '24h Volume (Millions USD)',
            data: volume,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Trade Count',
            data: trades,
            borderColor: 'rgb(153, 102, 255)',
            borderDash: [5, 5],
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Trading Activity'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Volume (USD Millions)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Number of Trades'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    };
    
    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '06_volume.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private async generateDashboard(metrics: ProtocolMetrics[]): Promise<string> {
    // Create a multi-panel dashboard
    const canvas = createCanvas(1600, 1200);
    const ctx = canvas.getContext('2d');
    
    // This would be a more complex layout combining multiple charts
    // For now, we'll generate a simple summary dashboard
    
    const latest = metrics[metrics.length - 1];
    const first = metrics[0];
    
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1600, 1200);
    
    ctx.fillStyle = 'black';
    ctx.font = 'bold 32px Arial';
    ctx.fillText('Simulation Dashboard', 50, 50);
    
    ctx.font = '24px Arial';
    ctx.fillText(`Steps: ${metrics.length}`, 50, 100);
    ctx.fillText(`Final Price: $${latest.price.toFixed(2)}`, 50, 140);
    ctx.fillText(`Price Change: ${((latest.price - first.price) / first.price * 100).toFixed(2)}%`, 50, 180);
    
    ctx.fillStyle = 'green';
    ctx.fillText(`Insurance Fund: $${(Number(latest.insuranceBalance) / 1e6).toFixed(2)}M`, 50, 240);
    
    ctx.fillStyle = 'red';
    ctx.fillText(`Total Liquidations: ${metrics.reduce((sum, m) => sum + m.liquidationCount, 0)}`, 50, 280);
    
    ctx.fillStyle = 'blue';
    ctx.fillText(`Open Interest: $${(Number(latest.openInterest) / 1e6).toFixed(2)}M`, 50, 320);
    
    // Add mini sparklines for key metrics
    this.drawSparkline(ctx, metrics.map(m => m.price), 50, 400, 400, 60, 'Price');
    this.drawSparkline(ctx, metrics.map(m => Number(m.insuranceBalance) / 1e6), 50, 500, 400, 60, 'Insurance Fund');
    this.drawSparkline(ctx, metrics.map(m => m.liquidationCount), 50, 600, 400, 60, 'Liquidations');
    
    const buffer = canvas.toBuffer('image/png');
    const filename = '00_dashboard.png';
    fs.writeFileSync(path.join(this.outputDir, filename), buffer);
    return filename;
  }

  private async generateLongevityChart(metrics: ProtocolMetrics[]): Promise<string> {
    const steps = metrics.map((_, i) => i);
    const protocolRevenue = metrics.map((m) => Number(m.protocolRevenue) / 1e6);
    const badDebt = metrics.map((m) => Number(m.badDebt) / 1e6);
    const insolvency = metrics.map((m) => (m.isInsolvent ? 1 : 0));

    const configuration = {
      type: 'line' as any,
      data: {
        labels: steps,
        datasets: [
          {
            label: 'Protocol Revenue (USD Millions)',
            data: protocolRevenue,
            borderColor: 'rgb(34, 139, 34)',
            backgroundColor: 'rgba(34, 139, 34, 0.12)',
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Bad Debt (USD Millions)',
            data: badDebt,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.12)',
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Insolvent Flag',
            data: insolvency,
            borderColor: 'rgb(0, 0, 0)',
            borderDash: [6, 4],
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Longevity Risk: Revenue vs Bad Debt'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'USD (Millions)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0,
            max: 1,
            title: {
              display: true,
              text: 'Insolvent (0/1)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    };

    const image = await this.chartJSNodeCanvas.renderToBuffer(configuration as any);
    const filename = '07_longevity_risk.png';
    fs.writeFileSync(path.join(this.outputDir, filename), image);
    return filename;
  }
  
  private drawSparkline(
    ctx: any, 
    data: number[], 
    x: number, 
    y: number, 
    width: number, 
    height: number,
    label: string
  ): void {
    if (data.length === 0) return;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = 'black';
    ctx.fillText(label, x, y - 5);
    
    ctx.beginPath();
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    
    const stepX = width / (data.length - 1);
    
    for (let i = 0; i < data.length; i++) {
      const normalized = range === 0 ? 0.5 : (data[i] - min) / range;
      const plotX = x + i * stepX;
      const plotY = y + height - (normalized * height);
      
      if (i === 0) {
        ctx.moveTo(plotX, plotY);
      } else {
        ctx.lineTo(plotX, plotY);
      }
    }
    
    ctx.stroke();
    
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.fillText(min.toFixed(2), x, y + height + 15);
    ctx.fillText(max.toFixed(2), x + width - 50, y + height + 15);
  }
  
  private getPriceAnnotations(metrics: ProtocolMetrics[]): any {
    // Find significant price events
    const events: any = {};
    
    // Find 10%+ drops
    for (let i = 1; i < metrics.length; i++) {
      const drop = (metrics[i].price - metrics[i-1].price) / metrics[i-1].price;
      if (drop < -0.1) {
        events[`drop_${i}`] = {
          type: 'point',
          xValue: i,
          yValue: metrics[i].price,
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          label: {
            content: `${(drop * 100).toFixed(1)}% drop`,
            enabled: true
          }
        };
      }
    }
    
    return { annotations: events };
  }
}