import express, { Request, Response, Router } from 'express';
import { getAssets, createPaySession, getExchangeRate, PaySessionRequest } from '../fiatOnRamp/coinbasePay';

const router: Router = express.Router();

/**
 * Get supported assets from Coinbase
 * GET /api/coinbase-onramp/assets
 */
router.get('/assets', async (req: Request, res: Response): Promise<void> => {
  try {
    const assets = await getAssets();
    
    res.json({
      success: true,
      assets
    });
  } catch (error) {
    console.error('Critical error in /assets:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch assets',
      message: (error as Error).message 
    });
  }
});

/**
 * Create a Coinbase Pay session (for buying with fiat)
 * POST /api/coinbase-onramp/create-pay-session
 */
router.post('/create-pay-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      amount, 
      asset, 
      walletAddress,
      chain
    } = req.body as PaySessionRequest;

    const { session, paymentUrl } = await createPaySession({
      amount,
      asset,
      walletAddress,
      chain
    });

    res.json({
      success: true,
      session,
      paymentUrl
    });

  } catch (error) {
    console.error('Error creating Pay session:', error);
    
    // Handle validation errors
    if ((error as Error).message === 'Amount is required' || 
        (error as Error).message === 'Wallet address is required') {
      res.status(400).json({ 
        success: false, 
        error: (error as Error).message 
      });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create payment session',
      message: (error as Error).message 
    });
  }
});

/**
 * Get exchange rate from Coinbase
 * GET /api/coinbase-onramp/rate/:asset
 */
router.get('/rate/:asset', async (req: Request, res: Response): Promise<void> => {
  try {
    const { asset } = req.params;
    const { amount } = req.query;

    const rateData = await getExchangeRate(asset, amount as string);

    res.json({
      success: true,
      ...rateData
    });

  } catch (error) {
    console.error('Error in /rate:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch rate',
      message: (error as Error).message 
    });
  }
});

export default router;