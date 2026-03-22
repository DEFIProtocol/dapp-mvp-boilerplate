// components/simulation/TimelineController.tsx
import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Zap,
  Clock,
} from 'lucide-react';

interface Props {
  totalSteps: number;
  currentStep: number;
  onStepChange: (step: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  bookmarks: number[];
  stepOutcomes?: Array<{
    step: number;
    filled: number;
    cancelled: number;
    failed: number;
  }>;
}

export const TimelineController: React.FC<Props> = ({
  totalSteps,
  currentStep,
  onStepChange,
  isPlaying,
  onPlayPause,
  speed,
  onSpeedChange,
  bookmarks,
  stepOutcomes = [],
}) => {
  const maxStep = Math.max(0, totalSteps - 1);
  const progress = maxStep > 0 ? (currentStep / maxStep) * 100 : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(e.target.value);
    if (!Number.isFinite(parsed)) return;
    onStepChange(Math.min(Math.max(Math.trunc(parsed), 0), maxStep));
  };

  const speedOptions = [0.5, 1, 2, 5, 10];

  const maxOutcomeValue = stepOutcomes.reduce((max, outcome) => {
    const total = outcome.filled + outcome.cancelled + outcome.failed;
    return Math.max(max, total);
  }, 0);

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl p-4 border border-gray-700 sticky bottom-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        {/* Playback Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onStepChange(0)}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="First step"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => onStepChange(Math.max(0, currentStep - 1))}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="Previous step"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onPlayPause}
            className={`p-3 rounded-lg transition ${
              isPlaying 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={() => onStepChange(Math.min(totalSteps - 1, currentStep + 1))}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="Next step"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => onStepChange(maxStep)}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
            title="Last step"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-gray-400" />
          <div className="flex bg-gray-700 rounded-lg p-1">
            {speedOptions.map((option) => (
              <button
                key={option}
                onClick={() => onSpeedChange(option)}
                className={`px-3 py-1 text-sm rounded-md transition ${
                  speed === option
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {option}x
              </button>
            ))}
          </div>
        </div>

        {/* Time Display */}
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>
            Step {currentStep} of {maxStep}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 relative">
          <input
            type="range"
            min="0"
            max={maxStep}
            value={currentStep}
            onChange={handleSliderChange}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress}%, #374151 ${progress}%, #374151 100%)`,
            }}
          />
          
          {/* Bookmark Indicators */}
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {bookmarks.map((step) => (
              <div
                key={step}
                className="absolute w-1 h-4 bg-yellow-400 -mt-1"
                style={{
                  left: `${maxStep > 0 ? (step / maxStep) * 100 : 0}%`,
                  transform: 'translateX(-50%)',
                }}
                title={`Liquidation event at step ${step}`}
              />
            ))}
          </div>
        </div>
      </div>

      {stepOutcomes.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-gray-400 mb-1">Step outcomes (filled/cancelled/failed)</div>
          <div className="h-10 bg-gray-900/60 border border-gray-700 rounded p-1 flex items-end gap-[2px] overflow-hidden">
            {stepOutcomes.map((outcome) => {
              const total = outcome.filled + outcome.cancelled + outcome.failed;
              const normalizedHeight = maxOutcomeValue > 0 ? Math.max((total / maxOutcomeValue) * 100, 8) : 8;
              const filledPct = total > 0 ? (outcome.filled / total) * 100 : 0;
              const cancelledPct = total > 0 ? (outcome.cancelled / total) * 100 : 0;
              const failedPct = Math.max(0, 100 - filledPct - cancelledPct);
              const isCurrent = outcome.step === currentStep;

              return (
                <div
                  key={outcome.step}
                  title={`Step ${outcome.step}: ${outcome.filled} filled, ${outcome.cancelled} cancelled, ${outcome.failed} failed`}
                  className={`flex-1 min-w-[2px] rounded-sm overflow-hidden ${isCurrent ? 'ring-1 ring-blue-400' : ''}`}
                  style={{ height: `${normalizedHeight}%` }}
                >
                  <div className="w-full bg-green-500/80" style={{ height: `${filledPct}%` }} />
                  <div className="w-full bg-yellow-500/80" style={{ height: `${cancelledPct}%` }} />
                  <div className="w-full bg-red-500/80" style={{ height: `${failedPct}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};