// backend/routes/oracle.ts
import express from 'express';
import { OracleService } from '../../pricing/oracle/oracleService';

const router = express.Router();

// Lazily construct OracleService - it spins up an Infura provider per
// mainnet chain (ethereum/polygon/bsc) on instantiation, and none of these
// routes are currently used by the app's UI. Constructing it eagerly at
// module load meant every backend boot burned Infura connections for a
// feature nobody was calling.
let oracleServiceInstance: OracleService | null = null;
function getOracleService(): OracleService {
  if (!oracleServiceInstance) {
    oracleServiceInstance = new OracleService();
  }
  return oracleServiceInstance;
}

// Get latest round data for funding/liquidation
router.get('/latest/:chain/:token', async (req, res) => {
  try {
    const { chain, token } = req.params;
    
    const roundData = await getOracleService().getLatestRound(chain, token);
    
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
    
    const roundData = await getOracleService().getRoundData(chain, token, roundId);
    
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