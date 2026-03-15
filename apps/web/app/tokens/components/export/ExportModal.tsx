// components/export/ExportModal.tsx
import React, { useState } from 'react';
import {
  Download,
  FileText,
  Image,
  FileJson,
  FileSpreadsheet,
  Settings,
  X,
  CheckCircle,
} from 'lucide-react';
import type { SimulationData } from '../../types/simulation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: SimulationData;
  chartRefs: Record<string, React.RefObject<any>>;
}

type ExportFormat = 'csv' | 'json' | 'png' | 'pdf';
type ExportScope = 'all' | 'metrics' | 'liquidations' | 'positions' | 'charts';

export const ExportModal: React.FC<Props> = ({ isOpen, onClose, data, chartRefs }) => {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [scope, setScope] = useState<ExportScope>('all');
  const [includeRawData, setIncludeRawData] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [resolution, setResolution] = useState<'1x' | '2x' | '3x'>('2x');
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      switch (format) {
        case 'csv':
          await exportToCSV();
          break;
        case 'json':
          await exportToJSON();
          break;
        case 'png':
          await exportToPNG();
          break;
        case 'pdf':
          await exportToPDF();
          break;
      }
      
      setExportComplete(true);
      setTimeout(() => {
        setExportComplete(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = async () => {
    // Implementation for CSV export
    const metricsData = data.metrics;
    const headers = Object.keys(metricsData[0]).join(',');
    const rows = metricsData.map(m => Object.values(m).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    
    downloadFile(csv, 'simulation-data.csv', 'text/csv');
  };

  const exportToJSON = async () => {
    const exportData = scope === 'all' ? data : {
      ...(scope === 'metrics' && { metrics: data.metrics }),
      ...(scope === 'liquidations' && { liquidations: data.liquidations }),
      ...(scope === 'positions' && { positions: data.positions }),
    };
    
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, 'simulation-data.json', 'application/json');
  };

  const exportToPNG = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Implementation for chart PNG export
    // This would use html2canvas or similar
    alert('PNG export would capture all visible charts');
  };

  const exportToPDF = async () => {
    // Implementation for PDF export
    alert('PDF export would generate a report with all charts and data');
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <Download className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Export Simulation Data</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Options */}
        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">
              Export Format
            </label>
            <div className="grid grid-cols-4 gap-3">
              {[
                { id: 'csv', icon: FileSpreadsheet, label: 'CSV' },
                { id: 'json', icon: FileJson, label: 'JSON' },
                { id: 'png', icon: Image, label: 'PNG' },
                { id: 'pdf', icon: FileText, label: 'PDF' },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setFormat(id as ExportFormat)}
                  className={`p-4 rounded-lg border transition ${
                    format === id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <Icon className={`w-6 h-6 mx-auto mb-2 ${
                    format === id ? 'text-blue-400' : 'text-gray-400'
                  }`} />
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scope Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">
              Export Scope
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'Everything' },
                { id: 'metrics', label: 'Metrics Only' },
                { id: 'liquidations', label: 'Liquidations Only' },
                { id: 'positions', label: 'Positions Only' },
                { id: 'charts', label: 'Charts Only' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setScope(id as ExportScope)}
                  className={`px-4 py-2 rounded-lg text-sm transition ${
                    scope === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Options */}
          <div className="border-t border-gray-700 pt-4">
            <div className="flex items-center space-x-2 mb-3">
              <Settings className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-400">Advanced Options</span>
            </div>
            
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={includeRawData}
                  onChange={(e) => setIncludeRawData(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-sm">Include raw data in export</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={includeCharts}
                  onChange={(e) => setIncludeCharts(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-sm">Include chart images</span>
              </label>

              {format === 'png' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Resolution</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="bg-gray-700 rounded-lg px-3 py-2 text-sm w-full"
                  >
                    <option value="1x">Standard (1x)</option>
                    <option value="2x">Retina (2x)</option>
                    <option value="3x">Ultra HD (3x)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full bg-blue-600 py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : exportComplete ? (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Export Complete!</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Export Now</span>
              </>
            )}
          </button>

          {/* File Info */}
          <div className="text-xs text-gray-500 text-center">
            Estimated file size: {(Math.random() * 5 + 1).toFixed(1)} MB
          </div>
        </div>
      </div>
    </div>
  );
};