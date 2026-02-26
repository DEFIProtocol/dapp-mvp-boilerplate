import express, { Request, Response } from 'express';
import { fetchOneInchTokens } from '../oneinch/tokens';

const router = express.Router();

// Get tokens for a specific chain - THE ONLY ENDPOINT YOU NEED
router.get('/tokens', async (req: Request, res: Response) => {
  try {
    const { chainId = '1', provider = '1inch' } = req.query;
    
    const data = await fetchOneInchTokens(Number(chainId), provider as string);
    
    res.json({
      success: true,
      data,
      source: '1inch',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[1inch] error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch tokens'
    });
  }
});

export default router;