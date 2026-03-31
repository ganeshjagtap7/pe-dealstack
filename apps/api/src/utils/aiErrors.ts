// ─── AI Error Classification ────────────────────────────────────────
// Maps raw LLM errors to specific, user-friendly messages.
// Used by all AI agents for consistent error reporting.

/** Classify an AI/LLM error into a specific user-facing message */
export function classifyAIError(errorMsg: string): string {
  const msg = errorMsg.toLowerCase();

  if (msg.includes('exceeded your current quota') || msg.includes('insufficient_quota')) {
    return 'AI quota exceeded — please check your API billing and plan at platform.openai.com/account/billing';
  }

  if (msg.includes('api key') || msg.includes('invalid_api_key') || msg.includes('incorrect api key')) {
    return 'AI API key is invalid or missing. Please check your configuration.';
  }

  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('authentication')) {
    return 'AI service authentication failed. Please verify your API key.';
  }

  if (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('429')) {
    return 'AI rate limit reached — too many requests. Please wait a moment and try again.';
  }

  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnaborted')) {
    return 'AI request timed out. Try a shorter question or try again shortly.';
  }

  if (msg.includes('model_not_found') || msg.includes('does not exist') || msg.includes('model not found')) {
    return 'AI model not available. Please contact your administrator.';
  }

  if (msg.includes('context_length') || msg.includes('maximum context') || msg.includes('too many tokens')) {
    return 'Message too long for AI to process. Please shorten your question.';
  }

  if (msg.includes('content_filter') || msg.includes('content management policy')) {
    return 'AI content filter triggered. Please rephrase your question.';
  }

  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network')) {
    return 'Cannot reach AI service — network error. Please check your connection.';
  }

  // Default: include the actual error for transparency
  const truncated = errorMsg.length > 150 ? errorMsg.slice(0, 150) + '...' : errorMsg;
  return `AI error: ${truncated}`;
}
