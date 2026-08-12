import { searchSittersQuerySchema, type SearchSittersQuery } from "@fido/shared";
import { Router } from "express";
import { validateQuery } from "../../middleware/validate";
import * as searchService from "./search.service";

export const searchRoutes = Router();

searchRoutes.get("/sitters", validateQuery(searchSittersQuerySchema), async (req, res, next) => {
  try {
    const results = await searchService.searchSitters(req.validatedQuery as SearchSittersQuery);
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});
