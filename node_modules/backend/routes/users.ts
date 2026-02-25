import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as userHelpers from "../postgres/users";

export default function usersRouter(pool: Pool) {
  const router = Router();

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
      const user = await userHelpers.getUserById(pool, req.params.id);
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
      const user = await userHelpers.getUserByWallet(pool, req.params.address);
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
      const user = await userHelpers.createUser(pool, req.body);
      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // PUT update user
  router.put("/db/:id", async (req: Request, res: Response) => {
    try {
      const user = await userHelpers.updateUser(pool, req.params.id, req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // DELETE user
  router.delete("/db/:id", async (req: Request, res: Response) => {
    try {
      const user = await userHelpers.deleteUser(pool, req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ message: "User deleted", deleted: user });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  return router;
}
