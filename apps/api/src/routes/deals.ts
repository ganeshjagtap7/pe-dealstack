// ─── /api/deals router (barrel) ───────────────────────────────────
// All route handlers are split into focused sub-routers:
//   - deals-team.ts      — team-member management endpoints
//   - deals-analysis.ts  — AI analysis endpoints
//   - deals-chat.ts      — chat-related deal endpoints
//   - deals-list.ts      — GET /stats/summary, GET /, GET /:id
//   - deals-mutate.ts    — POST /, POST /:id/follow-up-questions,
//                          PATCH /:id, DELETE /:id
// Mount order matches the original monolithic file: more-specific
// sub-routers first (team/analysis/chat), then top-level CRUD.

import { Router } from 'express';

import dealsTeamRouter from './deals-team.js';
import dealsAnalysisRouter from './deals-analysis.js';
import dealsChatRouter from './deals-chat.js';
import dealsListRouter from './deals-list.js';
import dealsMutateRouter from './deals-mutate.js';

const router = Router();

router.use('/', dealsTeamRouter);
router.use('/', dealsAnalysisRouter);
router.use('/', dealsChatRouter);
router.use('/', dealsListRouter);
router.use('/', dealsMutateRouter);

export default router;
