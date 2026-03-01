// backend/routes/oracle.ts
import express from 'express';
import { OracleService } from '../oracle/oracleService';

const router = express.Router();
const oracleService = new OracleService();

// Get latest round data for funding/liquidation
router.get('/latest/:chain/:token', async (req, res) => {
  try {
    const { chain, token } = req.params;
    
    const roundData = await oracleService.getLatestRound(chain, token);
    
    if (!roundData) {
      return res.status(404).json({
        success: false,
        error: `No data for ${token} on ${chain}`
      });
    }

    // Serialize BigInts
    const serialized = JSON.parse(JSON.stringify(roundData, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));

    res.json({
      success: true,
      chain,
      token,
      ...serialized
    });
  } catch (error) {
    console.error('Error fetching latest round:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get specific round data (for settlement/liquidation checks)
router.get('/round/:chain/:token/:roundId', async (req, res) => {
  try {
    const { chain, token, roundId } = req.params;
    
    const roundData = await oracleService.getRoundData(chain, token, roundId);
    
    if (!roundData) {
      return res.status(404).json({
        success: false,
        error: `No data for ${token} round ${roundId} on ${chain}`
      });
    }

    const serialized = JSON.parse(JSON.stringify(roundData, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));

    res.json({
      success: true,
      chain,
      token,
      roundId,
      ...serialized
    });
  } catch (error) {
    console.error('Error fetching round data:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'operational' });
});

export default router;