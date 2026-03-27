import express, { Request, Response } from "express";
import axios from "axios";

const router = express.Router();

const LIFI_BASE_URL = "https://li.quest/v1";
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

interface TransferQuoteRequest {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippage?: number;
}

function isPositiveNumericString(value: string): boolean {
  if (!value) return false;
  if (!/^\d+$/.test(value)) return false;
  return BigInt(value) > 0n;
}

function validateQuoteInput(input: Partial<TransferQuoteRequest>): string | null {
  if (!input.fromChainId || !input.toChainId) return "fromChainId and toChainId are required";
  if (!input.fromTokenAddress || !EVM_ADDRESS_REGEX.test(input.fromTokenAddress)) {
    return "fromTokenAddress must be a valid EVM address";
  }
  if (!input.toTokenAddress || !EVM_ADDRESS_REGEX.test(input.toTokenAddress)) {
    return "toTokenAddress must be a valid EVM address";
  }
  if (!input.fromAddress || !EVM_ADDRESS_REGEX.test(input.fromAddress)) {
    return "fromAddress must be a valid EVM address";
  }
  if (input.toAddress && !EVM_ADDRESS_REGEX.test(input.toAddress)) {
    return "toAddress must be a valid EVM address";
  }
  if (!input.fromAmount || !isPositiveNumericString(input.fromAmount)) {
    return "fromAmount must be a positive integer string in base units";
  }
  return null;
}

router.post("/quote", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<TransferQuoteRequest>;
    const error = validateQuoteInput(body);

    if (error) {
      res.status(400).json({ success: false, error });
      return;
    }

    const params = {
      fromChain: body.fromChainId,
      toChain: body.toChainId,
      fromToken: body.fromTokenAddress,
      toToken: body.toTokenAddress,
      fromAmount: body.fromAmount,
      fromAddress: body.fromAddress,
      toAddress: body.toAddress || body.fromAddress,
      order: "RECOMMENDED",
      allowSwitchChain: true,
      slippage: body.slippage ?? 0.01,
    };

    const response = await axios.get(`${LIFI_BASE_URL}/quote`, {
      params,
      timeout: 15000,
      headers: {
        accept: "application/json",
      },
    });

    const quote = response.data;

    res.json({
      success: true,
      quote: {
        id: quote?.id,
        tool: quote?.tool || quote?.estimate?.tool,
        action: quote?.action,
        estimate: quote?.estimate,
        transactionRequest: quote?.transactionRequest,
        includedSteps: quote?.includedSteps,
      },
      raw: quote,
    });
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? (error.response?.data as any)?.message || error.message
      : error instanceof Error
        ? error.message
        : "Failed to fetch transfer quote";

    res.status(500).json({ success: false, error: message });
  }
});

router.post("/execute", async (req: Request, res: Response) => {
  try {
    const { quote } = req.body as { quote?: any };

    if (!quote) {
      res.status(400).json({ success: false, error: "quote payload is required" });
      return;
    }

    const txRequest = quote.transactionRequest || quote?.raw?.transactionRequest;
    const action = quote.action || quote?.raw?.action;

    if (!txRequest || !txRequest.to) {
      res.status(400).json({
        success: false,
        error: "Quote does not contain an executable transactionRequest",
      });
      return;
    }

    const jumperUrl = action
      ? `https://jumper.exchange/?fromChain=${action.fromChainId}&toChain=${action.toChainId}&fromToken=${action.fromToken?.address || ""}&toToken=${action.toToken?.address || ""}&fromAmount=${action.fromAmount || ""}`
      : "https://jumper.exchange/";

    res.json({
      success: true,
      executionType: "wallet-transaction",
      transactionRequest: {
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value || "0",
        gasLimit: txRequest.gasLimit,
        gasPrice: txRequest.gasPrice,
      },
      fallbackUrl: jumperUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare transfer execution";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
