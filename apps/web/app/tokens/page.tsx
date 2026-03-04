"use client";

// App.jsx - Main Dashboard Component
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { 
  BarChart3, 
  Activity, 
  AlertTriangle, 
  Shield, 
  Clock,
  DollarSign,
  TrendingUp,
  Users,
  Play,
  Pause,
  RotateCcw,
  Send
} from 'lucide-react';
import "./page.module.css";

declare global {
  interface Window {
    ethereum?: any;
  }
}

// Contract ABIs (simplified versions - you'll need to replace with your actual ABIs)
const PERP_SETTLEMENT_ABI = [
  "function openPosition(tuple(address trader, uint8 side, uint256 exposure, uint256 leverage, uint256 limitPrice, uint256 expiry, uint256 nonce) order, bytes signature) external",
  "function getPosition(uint256 positionId) external view returns (tuple(address trader, uint8 side, uint256 exposure, uint256 leverage, uint256 entryPrice, uint256 timestamp, bool active))",
  "function getCollateralBalance(address trader) external view returns (uint256)",
  "function positions(uint256) external view returns (address trader, uint8 side, uint256 exposure, uint256 leverage, uint256 entryPrice, uint256 timestamp, bool active)",
  "function positionCount() external view returns (uint256)",
  "function accumulatedFees() external view returns (uint256)"
];

const LIQUIDATION_ENGINE_ABI = [
  "function liquidatePosition(uint256 positionId) external",
  "function checkLiquidation(uint256 positionId) external view returns (bool)"
];

const FEE_BATCHER_ABI = [
  "function recordFee(uint256 amount) external",
  "function distribute(address recipient) external",
  "function accumulatedFees() external view returns (uint256)",
  "function lastDistribution() external view returns (uint256)"
];

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

type SettlementParams = {
  makerFeeBps: string;
  takerFeeBps: string;
  insuranceBps: string;
  maintenanceMarginBps: string;
  liquidationRewardBps: string;
  liquidationPenaltyBps: string;
};

const App = () => {
  const [provider, setProvider] = useState<any>(null);
  const [signer, setSigner] = useState<any>(null);
  const [account, setAccount] = useState('');
  const [contracts, setContracts] = useState<any>({});
  const [simulationSpeed, setSimulationSpeed] = useState(30); // 30 seconds = 1 week
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [positions, setPositions] = useState<any[]>([]);
  const [fees, setFees] = useState({ accumulated: 0, distributed: 0 });
  const [liquidationEvents, setLiquidationEvents] = useState<any[]>([]);
  const [marketPrice, setMarketPrice] = useState(100);
  const [orderForm, setOrderForm] = useState({
    side: 0,
    exposure: '1000',
    leverage: '10',
    limitPrice: '100',
    expiry: '3600'
  });
  const [paramsForm, setParamsForm] = useState<SettlementParams>({
    makerFeeBps: '5',
    takerFeeBps: '10',
    insuranceBps: '200',
    maintenanceMarginBps: '1000',
    liquidationRewardBps: '500',
    liquidationPenaltyBps: '1000',
  });
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [paramsStatus, setParamsStatus] = useState('');

  const loadSettlementParams = async () => {
    setParamsLoading(true);
    setParamsStatus('');
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/smart-contracts/params`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load params');
      }

      setParamsForm({
        makerFeeBps: String(result.params.makerFeeBps),
        takerFeeBps: String(result.params.takerFeeBps),
        insuranceBps: String(result.params.insuranceBps),
        maintenanceMarginBps: String(result.params.maintenanceMarginBps),
        liquidationRewardBps: String(result.params.liquidationRewardBps),
        liquidationPenaltyBps: String(result.params.liquidationPenaltyBps),
      });
    } catch (error) {
      setParamsStatus(error instanceof Error ? error.message : 'Failed to load params');
    } finally {
      setParamsLoading(false);
    }
  };

  const saveSettlementParams = async () => {
    setParamsSaving(true);
    setParamsStatus('');

    try {
      const payload = {
        makerFeeBps: Number(paramsForm.makerFeeBps),
        takerFeeBps: Number(paramsForm.takerFeeBps),
        insuranceBps: Number(paramsForm.insuranceBps),
        maintenanceMarginBps: Number(paramsForm.maintenanceMarginBps),
        liquidationRewardBps: Number(paramsForm.liquidationRewardBps),
        liquidationPenaltyBps: Number(paramsForm.liquidationPenaltyBps),
      };

      const response = await fetch(`${BACKEND_BASE_URL}/api/smart-contracts/params`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update params');
      }

      setParamsStatus('Updated on-chain parameters successfully.');
      await loadSettlementParams();
    } catch (error) {
      setParamsStatus(error instanceof Error ? error.message : 'Failed to update params');
    } finally {
      setParamsSaving(false);
    }
  };

  useEffect(() => {
    loadSettlementParams();
  }, []);

  // Initialize connection
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const accounts = await provider.send('eth_requestAccounts', []);
        
        setProvider(provider);
        setSigner(signer);
        setAccount(accounts[0]);

        // Initialize contract instances (replace with your deployed addresses)
        const settlement = new ethers.Contract(
          'YOUR_SETTLEMENT_ADDRESS',
          PERP_SETTLEMENT_ABI,
          signer
        );
        
        const liquidation = new ethers.Contract(
          'YOUR_LIQUIDATION_ADDRESS',
          LIQUIDATION_ENGINE_ABI,
          signer
        );
        
        const feeBatcher = new ethers.Contract(
          'YOUR_FEE_BATCHER_ADDRESS',
          FEE_BATCHER_ABI,
          signer
        );

        setContracts({ settlement, liquidation, feeBatcher });
      } catch (error) {
        console.error('Connection error:', error);
      }
    }
  };

  // Simulation time control
  const startSimulation = () => {
    setIsSimulating(true);
    setCurrentTime(0);
  };

  const pauseSimulation = () => setIsSimulating(false);
  
  const resetSimulation = () => {
    setCurrentTime(0);
    setPositions([]);
    setLiquidationEvents([]);
    setFees({ accumulated: 0, distributed: 0 });
  };

  // Time progression effect
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const newTime = prev + 1;
        if (newTime >= simulationSpeed) {
          // Week completed
          distributeWeeklyFees();
          return 0;
        }
        return newTime;
      });
    }, 1000); // 1 real second = simulationSpeed seconds of contract time

    return () => clearInterval(interval);
  }, [isSimulating, simulationSpeed]);

  // Fetch positions periodically
  useEffect(() => {
    if (!contracts.settlement) return;

    const fetchPositions = async () => {
      try {
        const count = await contracts.settlement.positionCount();
        const positionsData = [];
        
        for (let i = 0; i < count; i++) {
          const pos = await contracts.settlement.positions(i);
          if (pos.active) {
            // Calculate PnL based on current market price
            const pnl = pos.side === 0 
              ? (marketPrice - pos.entryPrice) * pos.exposure / pos.entryPrice
              : (pos.entryPrice - marketPrice) * pos.exposure / pos.entryPrice;
            
            positionsData.push({
              id: i,
              trader: pos.trader,
              side: pos.side === 0 ? 'LONG' : 'SHORT',
              exposure: ethers.formatEther(pos.exposure),
              leverage: pos.leverage.toString(),
              entryPrice: ethers.formatEther(pos.entryPrice),
              pnl: pnl.toFixed(2),
              liquidationRisk: Math.abs(pnl) > 50 // Simple risk metric
            });
          }
        }
        
        setPositions(positionsData);
      } catch (error) {
        console.error('Error fetching positions:', error);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, 2000);
    return () => clearInterval(interval);
  }, [contracts.settlement, marketPrice]);

  // Distribute weekly fees
  const distributeWeeklyFees = async () => {
    if (!contracts.feeBatcher) return;
    
    try {
      const accumulated = await contracts.feeBatcher.accumulatedFees();
      setFees(prev => ({ 
        ...prev, 
        distributed: prev.distributed + Number(ethers.formatEther(accumulated))
      }));
      
      // Simulate distribution
      setFees(prev => ({ ...prev, accumulated: 0 }));
    } catch (error) {
      console.error('Error distributing fees:', error);
    }
  };

  // Create order
  const createOrder = async () => {
    if (!contracts.settlement || !signer) return;

    try {
      const order = {
        trader: account,
        side: orderForm.side,
        exposure: ethers.parseEther(orderForm.exposure),
        leverage: orderForm.leverage,
        limitPrice: ethers.parseEther(orderForm.limitPrice),
        expiry: Math.floor(Date.now() / 1000) + parseInt(orderForm.expiry),
        nonce: Date.now()
      };

      // Sign the order (simplified - you'll need proper EIP-712 signing)
      const signature = await signer.signMessage(
        JSON.stringify(order)
      );

      // Send transaction
      const tx = await contracts.settlement.openPosition(order, signature);
      await tx.wait();
      
      alert('Order placed successfully!');
    } catch (error) {
      console.error('Error creating order:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert('Error creating order: ' + message);
    }
  };

  // Liquidate position
  const liquidatePosition = async (positionId: number) => {
    if (!contracts.liquidation) return;

    try {
      const tx = await contracts.liquidation.liquidatePosition(positionId);
      await tx.wait();
      
      setLiquidationEvents(prev => [...prev, {
        positionId,
        timestamp: Date.now(),
        price: marketPrice
      }]);
      
      alert('Position liquidated successfully!');
    } catch (error) {
      console.error('Error liquidating position:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert('Error liquidating position: ' + message);
    }
  };

  // Update market price
  const updateMarketPrice = (newPrice: number) => {
    setMarketPrice(newPrice);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="w-8 h-8 text-blue-400" />
          Perp Settlement Simulator
        </h1>
        <button
          onClick={connectWallet}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2"
        >
          {account ? `${account.slice(0,6)}...${account.slice(-4)}` : 'Connect Wallet'}
        </button>
      </div>

      {/* Simulation Controls */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Time Simulation (1 sec = {simulationSpeed} sec contract time)
        </h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="60"
            value={simulationSpeed}
            onChange={(e) => setSimulationSpeed(parseInt(e.target.value))}
            className="w-64"
          />
          <span className="text-blue-400">{simulationSpeed}x speed</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={startSimulation}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> Start
            </button>
            <button
              onClick={pauseSimulation}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
            <button
              onClick={resetSimulation}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>
        <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-1000"
            style={{ width: `${(currentTime / simulationSpeed) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Fee and Liquidation Controls</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { key: 'makerFeeBps', label: 'Maker Fee (bps)' },
            { key: 'takerFeeBps', label: 'Taker Fee (bps)' },
            { key: 'insuranceBps', label: 'Insurance Cut (bps)' },
            { key: 'maintenanceMarginBps', label: 'Maintenance Margin (bps)' },
            { key: 'liquidationRewardBps', label: 'Liquidation Reward (bps)' },
            { key: 'liquidationPenaltyBps', label: 'Liquidation Penalty (bps)' },
          ].map((item) => (
            <div key={item.key}>
              <label className="block text-sm text-gray-400 mb-1">{item.label}</label>
              <input
                type="number"
                value={paramsForm[item.key as keyof SettlementParams]}
                onChange={(e) =>
                  setParamsForm((prev) => ({
                    ...prev,
                    [item.key]: e.target.value,
                  }))
                }
                className="w-full bg-gray-700 rounded-lg p-2"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={loadSettlementParams}
            disabled={paramsLoading}
            className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {paramsLoading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={saveSettlementParams}
            disabled={paramsSaving}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {paramsSaving ? 'Saving...' : 'Apply On-Chain'}
          </button>
        </div>

        {paramsStatus && <p className="mt-3 text-sm text-blue-300">{paramsStatus}</p>}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <DollarSign className="w-4 h-4" />
            <span>Market Price</span>
          </div>
          <div className="text-2xl font-bold">${marketPrice}</div>
          <input
            type="range"
            min="50"
            max="150"
            value={marketPrice}
            onChange={(e) => updateMarketPrice(parseInt(e.target.value))}
            className="w-full mt-2"
          />
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span>Active Positions</span>
          </div>
          <div className="text-2xl font-bold">{positions.length}</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Shield className="w-4 h-4" />
            <span>Accumulated Fees</span>
          </div>
          <div className="text-2xl font-bold">{fees.accumulated.toFixed(2)}</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Liquidations</span>
          </div>
          <div className="text-2xl font-bold">{liquidationEvents.length}</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Order Creation Panel */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Send className="w-5 h-5" />
            Create Test Order
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Side</label>
              <select
                value={orderForm.side}
                onChange={(e) => setOrderForm({...orderForm, side: parseInt(e.target.value)})}
                className="w-full bg-gray-700 rounded-lg p-2"
              >
                <option value={0}>LONG</option>
                <option value={1}>SHORT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Exposure (tokens)</label>
              <input
                type="text"
                value={orderForm.exposure}
                onChange={(e) => setOrderForm({...orderForm, exposure: e.target.value})}
                className="w-full bg-gray-700 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Leverage</label>
              <input
                type="text"
                value={orderForm.leverage}
                onChange={(e) => setOrderForm({...orderForm, leverage: e.target.value})}
                className="w-full bg-gray-700 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Limit Price</label>
              <input
                type="text"
                value={orderForm.limitPrice}
                onChange={(e) => setOrderForm({...orderForm, limitPrice: e.target.value})}
                className="w-full bg-gray-700 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Expiry (seconds)</label>
              <input
                type="text"
                value={orderForm.expiry}
                onChange={(e) => setOrderForm({...orderForm, expiry: e.target.value})}
                className="w-full bg-gray-700 rounded-lg p-2"
              />
            </div>

            <button
              onClick={createOrder}
              className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-semibold"
            >
              Place Order
            </button>
          </div>
        </div>

        {/* Active Positions */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Active Positions
          </h2>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {positions.map((pos) => (
              <div 
                key={pos.id} 
                className={`p-3 rounded-lg ${
                  pos.liquidationRisk ? 'bg-red-900/30 border border-red-500' : 'bg-gray-700'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold">Position #{pos.id}</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded ${
                      pos.side === 'LONG' ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                      {pos.side}
                    </span>
                  </div>
                  <span className={parseFloat(pos.pnl) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    PnL: {pos.pnl}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                  <div>Exposure: {pos.exposure}</div>
                  <div>Leverage: {pos.leverage}x</div>
                  <div>Entry: ${pos.entryPrice}</div>
                  <div>Trader: {pos.trader.slice(0,6)}...</div>
                </div>
                {pos.liquidationRisk && (
                  <button
                    onClick={() => liquidatePosition(pos.id)}
                    className="mt-2 w-full bg-red-600 hover:bg-red-700 py-1 rounded text-sm"
                  >
                    Liquidate Position
                  </button>
                )}
              </div>
            ))}
            {positions.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No active positions
              </div>
            )}
          </div>
        </div>

        {/* Liquidation Events */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Liquidation Events
          </h2>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {liquidationEvents.slice().reverse().map((event, idx) => (
              <div key={idx} className="bg-gray-700 p-2 rounded text-sm">
                Position #{event.positionId} liquidated at ${event.price} - 
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
            ))}
            {liquidationEvents.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No liquidations yet
              </div>
            )}
          </div>
        </div>

        {/* Fee Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Fee Batcher Status
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Accumulated Fees</span>
                <span>{fees.accumulated.toFixed(2)} tokens</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500"
                  style={{ width: `${Math.min(fees.accumulated / 1000 * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Total Distributed</span>
                <span>{fees.distributed.toFixed(2)} tokens</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.min(fees.distributed / 10000 * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="text-sm text-gray-400">
              Next distribution in: {simulationSpeed - currentTime} seconds
            </div>
          </div>
        </div>
      </div>

      {/* Network Status */}
      <div className="mt-6 bg-gray-800 rounded-lg p-4 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Connected to Hardhat Network (Chain ID: 31337)
        </div>
      </div>
    </div>
  );
};

export default App;