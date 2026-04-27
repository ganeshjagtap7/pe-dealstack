import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger.js';

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  log.warn('ANTHROPIC_API_KEY not set — Claude cross-verification disabled');
}

export const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export const isClaudeEnabled = () => !!anthropic;
