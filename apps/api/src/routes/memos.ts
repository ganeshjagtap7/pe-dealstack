// ─── /api/memos router (barrel) ───────────────────────────────────
// All route handlers are split into focused sub-routers:
//   - memos-sections.ts — section-level CRUD + content generation
//   - memos-chat.ts     — memo chat agent endpoints
//   - memos-list.ts     — GET /, GET /:id, GET /debug
//   - memos-mutate.ts   — POST /, PATCH /:id, DELETE /:id
//   - memos-generate.ts — POST /:id/generate-all
// Mount order matches the original monolithic file: section/chat
// sub-routers first (most specific paths), then top-level CRUD.

import { Router } from 'express';

import memoSectionsRouter from './memos-sections.js';
import memoChatRouter from './memos-chat.js';
import memosListRouter from './memos-list.js';
import memosMutateRouter from './memos-mutate.js';
import memosGenerateRouter from './memos-generate.js';
import memosSuggestRouter from './memos-suggest.js';

const router = Router();

router.use('/', memosSuggestRouter);
router.use('/', memoSectionsRouter);
router.use('/', memoChatRouter);
router.use('/', memosListRouter);
router.use('/', memosMutateRouter);
router.use('/', memosGenerateRouter);

export default router;
