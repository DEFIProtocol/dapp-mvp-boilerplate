// components/oracle/ChartTimeframe.tsx
"use client";
import styles from './ChartTimeframe.module.css';

const TIMEFRAMES = [
  { label: '1m', value: '1m', binance: '1m', coinbase: 60 },
  { label: '5m', value: '5m', binance: '5m', coinbase: 300 },
  { label: '15m', value: '15m', binance: '15m', coinbase: 900 },
  { label: '1h', value: '1h', binance: '1h', coinbase: 3600 },
  { label: '4h', value: '4h', binance: '4h', coinbase: 14400 },
  { label: '1D', value: '1d', binance: '1d', coinbase: 86400 },
];

interface ChartTimeframeProps {
  selected: string;
  onSelect: (timeframe: string) => void;
}

export default function ChartTimeframe({ selected, onSelect }: ChartTimeframeProps) {
  return (
    <div className={styles.timeframeSelector}>
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.value}
          className={`${styles.timeframeBtn} ${selected === tf.value ? styles.active : ''}`}
          onClick={() => onSelect(tf.value)}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}