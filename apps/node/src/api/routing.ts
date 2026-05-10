/**
 * Routing API: submit intents, query status
 * POST /api/routing/intents       — submit a new order intent
 * GET  /api/routing/intents       — list all queued intents
 * GET  /api/routing/intents/:id   — get intent + settlement proof
 */

import { Router, Request, Response } from 'express';
import { routingEngine } from '@/routing/engine.js';
import { settlementService } from '@/settlement/service.js';
import { PAPER_TRADING_CHAIN_ID, HTTP_STATUS, ERROR_CODES } from '@/core/constants.js';
import type { RoutingIntent } from '@/core/types.js';

const router = Router();

type SubmitBody = {
  creator: string;
  instrument: string;
  orderType?: string;
  side: string;
  size: string;
  collateral: string;
  price?: string;
  chainId: number;
  expiresAt: number;
};

function validateSubmit(body: SubmitBody): string | null {
  if (!body.creator || typeof body.creator !== 'string') return 'creator is required';
  if (!['perps', 'options'].includes(body.instrument)) return 'instrument must be perps or options';
  if (!['long', 'short', 'buy', 'sell'].includes(body.side)) return 'side must be long|short|buy|sell';
  if (!body.size || isNaN(Number(body.size))) return 'size must be a numeric string';
  if (!body.collateral || isNaN(Number(body.collateral))) return 'collateral must be a numeric string';
  if (body.chainId !== PAPER_TRADING_CHAIN_ID) return `chainId must be ${PAPER_TRADING_CHAIN_ID} (Base Sepolia)`;
  if (!body.expiresAt || body.expiresAt < Date.now()) return 'expiresAt must be a future Unix timestamp (ms)';
  return null;
}

router.post('/intents', (req: Request, res: Response) => {
  const body = req.body as SubmitBody;
  const error = validateSubmit(body);
  if (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error, code: ERROR_CODES.INVALID_CHAIN });
    return;
  }

  try {
    const params: Omit<RoutingIntent, 'id' | 'createdAt' | 'status'> = {
      creator: body.creator,
      instrument: body.instrument as RoutingIntent['instrument'],
      orderType: (body.orderType as RoutingIntent['orderType']) ?? 'market',
      side: body.side as RoutingIntent['side'],
      size: BigInt(body.size),
      collateral: BigInt(body.collateral),
      price: body.price !== undefined ? BigInt(body.price) : undefined,
      chainId: body.chainId,
      expiresAt: body.expiresAt,
    };

    const intent = routingEngine.queueIntent(params);
    res.status(HTTP_STATUS.CREATED).json(serializeIntent(intent));
  } catch (err: any) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: err.message });
  }
});

router.get('/intents', (_req: Request, res: Response) => {
  const intents = routingEngine.getAllIntents().map(serializeIntent);
  res.json({ intents, count: intents.length });
});

router.get('/intents/:id', (req: Request, res: Response) => {
  const intent = routingEngine.getIntent(req.params.id);
  if (!intent) {
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Intent not found' });
    return;
  }
  const proof = settlementService.getProof(req.params.id);
  res.json({ intent: serializeIntent(intent), proof: proof ?? null });
});

// bigint → string for JSON serialization
function serializeIntent(intent: RoutingIntent): Record<string, unknown> {
  return {
    ...intent,
    size: intent.size.toString(),
    collateral: intent.collateral.toString(),
    price: intent.price?.toString() ?? null,
  };
}

export default router;
