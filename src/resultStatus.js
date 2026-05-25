function normalizeResultStatus(result = {}) {
  if (result.captchaDetected || result.pageState === 'blocked_or_captcha') return 'captcha';
  if (result.pageState === 'weak_context_manual_required') return 'weak_context';
  if (result.pageState === 'manual_required_no_web_results') return 'manual_required';
  if (result.pageState === 'manual_required') return 'manual_required';
  if (result.pageState === 'no_collected_text') return 'no_results';
  if (result.pageState === 'no_queries') return 'skipped_generic';
  if (result.pageState === 'query_skipped') return 'skipped_generic';
  if (result.pageState === 'provider_cooldown') return 'captcha';
  if (result.pageState === 'results_found') {
    const matches = result.aiAnalysis?.matches || [];
    return matches.length > 0 ? 'found' : 'no_results';
  }
  if (result.error) return 'error';
  return result.ok ? 'found' : 'no_results';
}

function queueFlagsForStatus(status) {
  if (status === 'captcha') return { shouldContinueQueue: false, shouldStopRun: true };
  if (status === 'error') return { shouldContinueQueue: true, shouldStopRun: false };
  return { shouldContinueQueue: true, shouldStopRun: false };
}

function retryDaysForStatus(status) {
  if (status === 'weak_context') return 7;
  if (status === 'manual_required') return 7;
  if (status === 'no_results') return 3;
  if (status === 'found') return 30;
  if (status === 'captcha') return 0;
  if (status === 'error') return 1;
  if (status === 'skipped_generic') return 7;
  return 3;
}

module.exports = {
  normalizeResultStatus,
  queueFlagsForStatus,
  retryDaysForStatus
};
