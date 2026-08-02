/**
 * API Proxy Middleware
 * Proxies requests to production API when in development mode with IRON_RELAY_API_KEY
 */

import { Request, Response, NextFunction } from 'express';
import { ENV, getServerMode } from '../config/environment';

interface ProxyOptions {
  enabled?: boolean;
}

/**
 * Creates a proxy middleware that forwards requests to production API
 */
export function createApiProxy(options: ProxyOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const mode = getServerMode();
    
    // Only proxy if in proxy mode and enabled
    if (mode !== 'proxy' || options.enabled === false) {
      return next();
    }
    
    try {
      const targetUrl = `${ENV.PRODUCTION_API_URL}${req.path}`;
      const queryString = new URLSearchParams(req.query as any).toString();
      const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;
      
      console.log(`🔗 Proxying: ${req.method} ${req.path} → ${fullUrl}`);
      
      // Forward the request to production API
      const response = await fetch(fullUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ENV.IRON_RELAY_API_KEY,
          // Forward original headers if needed
          ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] as string }),
        },
        ...(req.method !== 'GET' && req.method !== 'HEAD' && { body: JSON.stringify(req.body) }),
      });
      
      // Get response data
      const data = await response.json();
      
      // Forward status code and response
      res.status(response.status).json(data);
    } catch (error) {
      console.error('❌ Proxy error:', error);
      
      // If proxy fails, fall through to local handler
      next();
    }
  };
}

/**
 * Proxy helper for individual route handlers
 */
export async function proxyRequest(path: string, options: RequestInit = {}): Promise<any> {
  const mode = getServerMode();
  
  if (mode !== 'proxy') {
    throw new Error('Not in proxy mode');
  }
  
  const targetUrl = `${ENV.PRODUCTION_API_URL}${path}`;
  
  const response = await fetch(targetUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ENV.IRON_RELAY_API_KEY,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Proxy request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check if should use proxy for this request
 */
export function shouldUseProxy(): boolean {
  return getServerMode() === 'proxy';
}
