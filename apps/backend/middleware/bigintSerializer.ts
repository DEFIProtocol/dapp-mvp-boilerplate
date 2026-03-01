// backend/middleware/bigintSerializer.ts
import { Request, Response, NextFunction } from 'express';

function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = serializeBigInt(obj[key]);
    }
    return result;
  }
  return obj;
}

export function bigintSerializer(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json;
  res.json = function(obj: any) {
    return originalJson.call(this, serializeBigInt(obj));
  };
  next();
}