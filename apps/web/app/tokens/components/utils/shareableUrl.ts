// utils/shareableUrl.ts
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface ShareParams {
  runs?: string[];
  metric?: string;
  step?: number;
  scenario?: string;
}

export const useShareableUrl = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const updateUrl = (params: ShareParams) => {
    const searchParams = new URLSearchParams();
    
    if (params.runs?.length) {
      searchParams.set('runs', params.runs.join(','));
    }
    if (params.metric) {
      searchParams.set('metric', params.metric);
    }
    if (params.step !== undefined) {
      searchParams.set('step', params.step.toString());
    }
    if (params.scenario) {
      searchParams.set('scenario', params.scenario);
    }

    navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true });
  };

  const getParams = (): ShareParams => {
    const params = new URLSearchParams(location.search);
    const runs = params.get('runs')?.split(',').filter(Boolean);
    
    return {
      runs: runs?.length ? runs : undefined,
      metric: params.get('metric') || undefined,
      step: params.get('step') ? parseInt(params.get('step')!) : undefined,
      scenario: params.get('scenario') || undefined,
    };
  };

  return { updateUrl, getParams };
};