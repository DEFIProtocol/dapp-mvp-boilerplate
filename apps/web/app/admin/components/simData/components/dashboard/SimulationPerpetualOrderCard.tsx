'use client';

import React from 'react';

interface Props {
  symbol: string;
  currentPrice: number;
  currentStep: number;
}

type OrderSide = 'LONG' | 'SHORT';
type OrderType = 'market' | 'limit';
type OrderStatus = 'OPEN' | 'CLOSED';

interface SimOrder {
  id: string;
  side: OrderSide;
  type: OrderType;
  leverage: number;
  marginUsd: number;
  exposureUsd: number;
  entryPrice: number;
  liquidationPrice: number;
  createdStep: number;
  status: OrderStatus;
  closeStep?: number;
  closePrice?: number;
  realizedPnlUsd?: number;
}

const MAINTENANCE_MARGIN = 0.005;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatSigned = (value: number) => `${value > 0 ? '+' : ''}${formatCurrency(value)}`;

const calculatePnl = (order: SimOrder, markPrice: number): number => {
  if (order.entryPrice <= 0) return 0;

  const priceDelta =
    order.side === 'LONG'
      ? (markPrice - order.entryPrice) / order.entryPrice
      : (order.entryPrice - markPrice) / order.entryPrice;

  return order.exposureUsd * priceDelta;
};

const calcLiqPrice = (entryPrice: number, leverage: number, side: OrderSide): number => {
  if (entryPrice <= 0 || leverage <= 0) return 0;

  if (side === 'LONG') {
    return entryPrice * (1 - 1 / leverage + MAINTENANCE_MARGIN);
  }

  return entryPrice * (1 + 1 / leverage - MAINTENANCE_MARGIN);
};

export const SimulationPerpetualOrderCard: React.FC<Props> = ({ symbol, currentPrice, currentStep }) => {
  const [leverage, setLeverage] = React.useState(10);
  const [marginUsd, setMarginUsd] = React.useState<number | null>(1000);
  const [orderType, setOrderType] = React.useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = React.useState<number | null>(null);
  const [orders, setOrders] = React.useState<SimOrder[]>([]);

  const effectiveEntryPrice = orderType === 'limit' && limitPrice ? limitPrice : currentPrice;

  const submitOrder = (side: OrderSide) => {
    const validMargin = Number(marginUsd);
    const validEntry = Number(effectiveEntryPrice);

    if (!Number.isFinite(validMargin) || validMargin <= 0) return;
    if (!Number.isFinite(validEntry) || validEntry <= 0) return;

    const exposureUsd = validMargin * leverage;

    const newOrder: SimOrder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      side,
      type: orderType,
      leverage,
      marginUsd: validMargin,
      exposureUsd,
      entryPrice: validEntry,
      liquidationPrice: calcLiqPrice(validEntry, leverage, side),
      createdStep: currentStep,
      status: 'OPEN',
    };

    setOrders((previous) => [newOrder, ...previous]);
  };

  const closeOrder = (orderId: string) => {
    setOrders((previous) =>
      previous.map((order) => {
        if (order.id !== orderId || order.status === 'CLOSED') return order;
        return {
          ...order,
          status: 'CLOSED',
          closeStep: currentStep,
          closePrice: currentPrice,
          realizedPnlUsd: calculatePnl(order, currentPrice),
        };
      })
    );
  };

  const openOrders = orders.filter((order) => order.status === 'OPEN');
  const closedOrders = orders.filter((order) => order.status === 'CLOSED');

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold">Simulation Orders ({symbol})</h3>
          <p className="text-xs text-gray-400">Playback-synced fake order entry (USDC 6-decimal normalized display)</p>
        </div>
        <div className="text-sm font-mono text-blue-300">Mark {formatCurrency(currentPrice)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <label className="text-xs text-gray-400">Order Type</label>
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => setOrderType('market')}
              className={`px-3 py-1 text-sm rounded-md ${orderType === 'market' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
            >
              Market
            </button>
            <button
              onClick={() => setOrderType('limit')}
              className={`px-3 py-1 text-sm rounded-md ${orderType === 'limit' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}
            >
              Limit
            </button>
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <label className="text-xs text-gray-400">Leverage ({leverage}x)</label>
          <input
            type="range"
            min="1"
            max="50"
            value={leverage}
            onChange={(event) => setLeverage(Number(event.target.value))}
            className="w-full mt-3"
          />
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <label className="text-xs text-gray-400">Margin (USDC)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={marginUsd ?? ''}
            onChange={(event) => {
              const next = event.target.value;
              setMarginUsd(next === '' ? null : Number(next));
            }}
            className="w-full mt-2 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
          />
          <div className="text-xs text-gray-500 mt-1">Exposure: {formatCurrency((marginUsd || 0) * leverage)}</div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <label className="text-xs text-gray-400">Limit Price (optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={orderType !== 'limit'}
            value={limitPrice ?? ''}
            onChange={(event) => {
              const next = event.target.value;
              setLimitPrice(next === '' ? null : Number(next));
            }}
            placeholder={currentPrice.toFixed(2)}
            className="w-full mt-2 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm disabled:opacity-50"
          />
          <div className="text-xs text-gray-500 mt-1">Entry: {formatCurrency(effectiveEntryPrice || 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <button
          onClick={() => submitOrder('LONG')}
          className="bg-green-600 hover:bg-green-700 transition rounded-lg py-2 text-sm font-semibold"
        >
          Place LONG {symbol}
        </button>
        <button
          onClick={() => submitOrder('SHORT')}
          className="bg-red-600 hover:bg-red-700 transition rounded-lg py-2 text-sm font-semibold"
        >
          Place SHORT {symbol}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <h4 className="text-sm font-semibold mb-3">Open Orders ({openOrders.length})</h4>
          <div className="space-y-2 max-h-64 overflow-auto">
            {openOrders.length === 0 && <div className="text-xs text-gray-400">No open simulation orders.</div>}
            {openOrders.map((order) => {
              const unrealizedPnl = calculatePnl(order, currentPrice);
              return (
                <div key={order.id} className="border border-gray-700 rounded-md p-2 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className={order.side === 'LONG' ? 'text-green-300' : 'text-red-300'}>
                      {order.side} · {order.type.toUpperCase()}
                    </span>
                    <span>Step {order.createdStep}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-gray-300">
                    <span>Entry: {formatCurrency(order.entryPrice)}</span>
                    <span>Lev: {order.leverage}x</span>
                    <span>Margin: {formatCurrency(order.marginUsd)}</span>
                    <span>Exposure: {formatCurrency(order.exposureUsd)}</span>
                    <span>Liq: {formatCurrency(order.liquidationPrice)}</span>
                    <span className={unrealizedPnl >= 0 ? 'text-green-300' : 'text-red-300'}>
                      PnL: {formatSigned(unrealizedPnl)}
                    </span>
                  </div>
                  <button
                    onClick={() => closeOrder(order.id)}
                    className="mt-2 w-full bg-gray-700 hover:bg-gray-600 rounded py-1"
                  >
                    Close at current step
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
          <h4 className="text-sm font-semibold mb-3">Closed Orders ({closedOrders.length})</h4>
          <div className="space-y-2 max-h-64 overflow-auto">
            {closedOrders.length === 0 && <div className="text-xs text-gray-400">No closed simulation orders yet.</div>}
            {closedOrders.map((order) => (
              <div key={order.id} className="border border-gray-700 rounded-md p-2 text-xs">
                <div className="flex justify-between mb-1">
                  <span className={order.side === 'LONG' ? 'text-green-300' : 'text-red-300'}>{order.side}</span>
                  <span>
                    Step {order.createdStep} → {order.closeStep}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <span>Entry: {formatCurrency(order.entryPrice)}</span>
                  <span>Exit: {formatCurrency(order.closePrice || 0)}</span>
                  <span>Exposure: {formatCurrency(order.exposureUsd)}</span>
                  <span className={(order.realizedPnlUsd || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>
                    Realized: {formatSigned(order.realizedPnlUsd || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
