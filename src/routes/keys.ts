import express, { Router } from "express";

import { requestParamsSchema, validateParamsMiddleware } from "./contract_data";

import { getAllKeysForContract } from "../controllers/keys";

const router: Router = express.Router();

router.get(
  "/:network/contract/:contract_id/keys",
  validateParamsMiddleware(requestParamsSchema, "path"),
  getAllKeysForContract,
);

export default router;
