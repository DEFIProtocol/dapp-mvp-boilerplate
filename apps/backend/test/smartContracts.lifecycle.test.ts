import express from "express";
import request from "supertest";
import test from "node:test";
import assert from "node:assert/strict";
import smartContractsRouter from "../routes/SmartContracts/smartContracts";

type IntentStatus = "queued" | "open" | "filled" | "cancelled" | "expired" | "rejected";

type PerpIntent = {
  id: string;
  createdAt: string;
  symbol: string;
  marketId: string;
  subAccountId?: string;
  perpAddress: string;
  trader: string;
  side: "LONG" | "SHORT";
  orderType: "market" | "limit";
  exposureUsd: number;
  leverage: number;
  limitPrice?: number;
  status: IntentStatus;
};

type SpotIntent = {
  id: string;
  createdAt: string;
  symbol: string;
  trader: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  status: IntentStatus;
};

const TRADER_A = "0x000000000000000000000000000000000000dEaD";
const TRADER_B = "0x000000000000000000000000000000000000bEEF";

function toPerpDbRow(row: PerpIntent) {
  return {
    id: row.id,
    created_at: row.createdAt,
    symbol: row.symbol,
    market_id: row.marketId,
    sub_account_id: row.subAccountId ?? null,
    perp_address: row.perpAddress,
    trader: row.trader,
    side: row.side,
    order_type: row.orderType,
    exposure_usd: row.exposureUsd,
    leverage: row.leverage,
    limit_price: row.limitPrice ?? null,
    status: row.status,
  };
}

function toSpotDbRow(row: SpotIntent) {
  return {
    id: row.id,
    created_at: row.createdAt,
    symbol: row.symbol,
    trader: row.trader,
    side: row.side,
    order_type: row.orderType,
    quantity: row.quantity,
    limit_price: row.limitPrice ?? null,
    status: row.status,
  };
}

function createTestServer() {
  const perps = new Map<string, PerpIntent>();
  const spots = new Map<string, SpotIntent>();

  perps.set("perp-1", {
    id: "perp-1",
    createdAt: new Date().toISOString(),
    symbol: "ETH",
    marketId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    perpAddress: "0x0000000000000000000000000000000000000001",
    trader: TRADER_A.toLowerCase(),
    side: "LONG",
    orderType: "limit",
    exposureUsd: 1000,
    leverage: 5,
    limitPrice: 2000,
    status: "open",
  });

  spots.set("spot-1", {
    id: "spot-1",
    createdAt: new Date().toISOString(),
    symbol: "ETH",
    trader: TRADER_A.toLowerCase(),
    side: "buy",
    orderType: "limit",
    quantity: 0.5,
    limitPrice: 2000,
    status: "queued",
  });

  const pool = {
    query: async (text: string, values?: any[]) => {
      if (/CREATE TABLE|CREATE INDEX/i.test(text)) return { rows: [] };

      if (/UPDATE\s+perps_order_intents/i.test(text)) {
        const [id, trader, status] = values ?? [];
        const current = perps.get(id as string);
        if (!current || current.trader !== String(trader).toLowerCase()) return { rows: [] };
        current.status = status as IntentStatus;
        return { rows: [toPerpDbRow(current)] };
      }

      if (/UPDATE\s+spot_order_intents/i.test(text)) {
        const [id, trader, status] = values ?? [];
        const current = spots.get(id as string);
        if (!current || current.trader !== String(trader).toLowerCase()) return { rows: [] };
        current.status = status as IntentStatus;
        return { rows: [toSpotDbRow(current)] };
      }

      throw new Error(`Unexpected SQL in test pool: ${text}`);
    },
  };

  const app = express();
  app.use(express.json());
  app.use("/api/smart-contracts", smartContractsRouter(pool as any));

  return { app, perps, spots };
}

test("PATCH /orders/:id/status updates perp order status", async () => {
  const { app, perps } = createTestServer();

  const response = await request(app)
    .patch("/api/smart-contracts/orders/perp-1/status")
    .send({ trader: TRADER_A, status: "filled" });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.order.status, "filled");
  assert.equal(perps.get("perp-1")?.status, "filled");
});

test("POST /orders/:id/cancel sets perp order to cancelled", async () => {
  const { app, perps } = createTestServer();

  const response = await request(app)
    .post("/api/smart-contracts/orders/perp-1/cancel")
    .send({ trader: TRADER_A });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.order.status, "cancelled");
  assert.equal(perps.get("perp-1")?.status, "cancelled");
});

test("PATCH /orders/:id/status rejects invalid status", async () => {
  const { app } = createTestServer();

  const response = await request(app)
    .patch("/api/smart-contracts/orders/perp-1/status")
    .send({ trader: TRADER_A, status: "invalid-status" });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /orders/:id/cancel returns 404 for wrong trader", async () => {
  const { app } = createTestServer();

  const response = await request(app)
    .post("/api/smart-contracts/orders/perp-1/cancel")
    .send({ trader: TRADER_B });

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
});

test("PATCH /spot/orders/:id/status updates spot order status", async () => {
  const { app, spots } = createTestServer();

  const response = await request(app)
    .patch("/api/smart-contracts/spot/orders/spot-1/status")
    .send({ trader: TRADER_A, status: "open" });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.order.status, "open");
  assert.equal(spots.get("spot-1")?.status, "open");
});

test("POST /spot/orders/:id/cancel sets spot order to cancelled", async () => {
  const { app, spots } = createTestServer();

  const response = await request(app)
    .post("/api/smart-contracts/spot/orders/spot-1/cancel")
    .send({ trader: TRADER_A });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.order.status, "cancelled");
  assert.equal(spots.get("spot-1")?.status, "cancelled");
});
