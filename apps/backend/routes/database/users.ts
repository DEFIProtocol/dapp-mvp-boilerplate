import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as userHelpers from "../../postgres/users";

export default function usersRouter(pool: Pool) {
  const router = Router();
  const getParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const ALLOWED_PREFERENCES_KEYS = new Set([
    "theme",
    "themeMode",
    "themeDesign",
    "defaultView",
    "notifications",
    "trading",
    "privacy",
    "enabledChains",
    "chart"
  ]);

  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const deepMergeObjects = (
    base: Record<string, unknown>,
    patch: Record<string, unknown>
  ): Record<string, unknown> => {
    const output: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(patch)) {
      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = deepMergeObjects(
          output[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        output[key] = value;
      }
    }

    return output;
  };

  const validateWalletAddress = (value: unknown, res: Response): string | null => {
    const walletAddress = String(value || "").trim().toLowerCase();
    if (!userHelpers.isValidAddress(walletAddress)) {
      res.status(400).json({ success: false, error: "wallet_address must be a valid address" });
      return null;
    }
    return walletAddress;
  };

  const getUserByWalletOr404 = async (walletAddress: string, res: Response) => {
    const user = await userHelpers.getUserByWallet(pool, walletAddress);
    if (!user || !user.id) {
      res.status(404).json({ success: false, error: "User not found" });
      return null;
    }
    return user;
  };

  // GET all users
  router.get("/db", async (_req: Request, res: Response) => {
    try {
      const users = await userHelpers.getAllUsers(pool);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users from database" });
    }
  });

  // GET user by id
  router.get("/db/:id", async (req: Request, res: Response) => {
    try {
      const user = await userHelpers.getUserById(pool, getParam(req.params.id));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user from database" });
    }
  });

  // GET user by wallet address
  router.get("/db/wallet/:address", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.params.address, res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user from database" });
    }
  });

  // POST create user
  router.post("/db", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      const user = await userHelpers.createUser(pool, { ...req.body, wallet_address: walletAddress });
      res.status(201).json(user);
    } catch (error: any) {
      if (error?.message === "User already exists") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // PUT update user by ID
  router.put("/db/:id", async (req: Request, res: Response) => {
    try {
      const user = await userHelpers.updateUser(pool, getParam(req.params.id), req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // PUT update user by wallet address
  router.put("/db/wallet/:address", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.params.address, res);
      if (!walletAddress) return;

      const user = await userHelpers.updateUserByWallet(pool, walletAddress, req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user by wallet address" });
    }
  });

  // DELETE user
  router.delete("/db/:id", async (req: Request, res: Response) => {
    try {
      const user = await userHelpers.deleteUser(pool, getParam(req.params.id));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ message: "User deleted", deleted: user });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Public non-db routes (frontend-facing)
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const users = await userHelpers.getAllUsers(pool);
      res.json({ success: true, data: users });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch users" });
    }
  });

  router.get("/wallet/:address", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.params.address, res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch user" });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      const user = await userHelpers.createUser(pool, { ...req.body, wallet_address: walletAddress });
      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      if (error?.message === "User already exists") {
        return res.status(409).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: "Failed to create user" });
    }
  });

  router.put("/wallet/:address", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.params.address, res);
      if (!walletAddress) return;

      const user = await userHelpers.updateUserByWallet(pool, walletAddress, req.body);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to update user" });
    }
  });

  router.patch("/wallet/:address/preferences", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.params.address, res);
      if (!walletAddress) return;

      const incoming = req.body?.preferences ?? req.body;

      if (!isPlainObject(incoming)) {
        return res.status(400).json({
          success: false,
          error: "Preferences patch must be a JSON object"
        });
      }

      const patchKeys = Object.keys(incoming);
      const invalidKeys = patchKeys.filter((key) => !ALLOWED_PREFERENCES_KEYS.has(key));
      if (invalidKeys.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Unsupported preference keys: ${invalidKeys.join(", ")}`
        });
      }

      const existingUser = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!existingUser) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const basePreferences = isPlainObject(existingUser.preferences)
        ? (existingUser.preferences as Record<string, unknown>)
        : {};

      const mergedPreferences = deepMergeObjects(
        basePreferences,
        incoming as Record<string, unknown>
      );

      const user = await userHelpers.updateUserByWallet(pool, getParam(req.params.address), {
        preferences: mergedPreferences
      });

      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to patch user preferences" });
    }
  });

  router.post("/watchlist/add", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      const tokenSymbol = String(req.body?.tokenSymbol || "").trim().toUpperCase();

      if (!tokenSymbol) {
        return res.status(400).json({ success: false, error: "tokenSymbol is required" });
      }

      const user = await getUserByWalletOr404(walletAddress, res);
      if (!user) return;

      const updated = await userHelpers.addToWatchlist(pool, user.id!, tokenSymbol);
      if (!updated) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to add to watchlist" });
    }
  });

  router.post("/watchlist/remove", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      const tokenSymbol = String(req.body?.tokenSymbol || "").trim().toUpperCase();

      if (!tokenSymbol) {
        return res.status(400).json({ success: false, error: "tokenSymbol is required" });
      }

      const user = await getUserByWalletOr404(walletAddress, res);
      if (!user) return;

      const updated = await userHelpers.removeFromWatchlist(pool, user.id!, tokenSymbol);
      if (!updated) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to remove from watchlist" });
    }
  });

  return router;
}
