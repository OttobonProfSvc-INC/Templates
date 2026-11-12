/**
 * Utility for recording meaningful asset usage telemetry (Phase 5A)
 * Tracks: PREVIEW, DOWNLOAD, REMIX (Customize), and EXPORT.
 * Non-blocking: failures never impede user actions.
 */
export async function trackAssetUsage(
  assetId: string,
  action: 'PREVIEW' | 'DOWNLOAD' | 'REMIX' | 'EXPORT',
  revisionId?: string
): Promise<void> {
  if (!assetId) return;
  try {
    await fetch(`/api/bff/templates/${encodeURIComponent(assetId)}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, revisionId }),
    });
  } catch (err) {
    console.warn(`[UsageTracker] Notice: Could not record ${action} for ${assetId}`, err);
  }
}
