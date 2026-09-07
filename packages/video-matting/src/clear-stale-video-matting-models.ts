// Transformers.js owns the persistent model cache. Model revisions are pinned,
// so there is currently no package-owned cache entry that can become stale.
export const clearStaleVideoMattingModels = (): Promise<void> =>
	Promise.resolve();
