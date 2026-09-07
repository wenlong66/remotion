// Transformers.js owns the persistent model cache. There are no stale models
// because this is the first release of the package.
export const clearStaleVideoMattingModels = (): Promise<void> =>
	Promise.resolve();
