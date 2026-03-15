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
}) => {
  const progress = (currentStep / (totalSteps - 1)) * 100;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onStepChange(parseInt(e.target.value));
  };

  const speedOptions = [0.5, 1, 2, 5, 10];

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
            onClick={() => onStepChange(totalSteps - 1)}
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
            Step {currentStep} of {totalSteps - 1}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 relative">
          <input
            type="range"
            min="0"
            max={totalSteps - 1}
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
                  left: `${(step / (totalSteps - 1)) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
                title={`Liquidation event at step ${step}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};