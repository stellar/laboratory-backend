import express, { Request, Response, Router } from "express";
import { z } from "zod";

import { getContractDataByContractId } from "../controllers/contract_data";

const router: Router = express.Router();

const storageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(10),
  order: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().optional(),
  sort_by: z.string().optional(),
});

// we don't sort by key
// ?key={key}&cursor={cursor}&limit={limit}&sort_by={field}&order={asc|desc}
function parseStorageQuery(req: Request, res: Response, next: () => void): void {
  try {
    storageQuery.parse(req.query);
    next();
  } catch (e) {
    res.status(400).json({ error: "Invalid query params" });
  }
}

// Route supports query parameters: ?cursor=xxx&limit=10&order=desc
router.get(
  "/:network/contract/:contract_id/storage",
  (req, res, next) => {
    parseStorageQuery(req, res, next);
  },
  (req, res) => {
    getContractDataByContractId(req, res);
  }
);

export default router;
