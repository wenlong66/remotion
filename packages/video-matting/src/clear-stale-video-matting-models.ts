import {getVideoMattingModelInfo, VIDEO_MATTING_MODELS} from './models';

const legacyModelUrlPrefixes = VIDEO_MATTING_MODELS.map((model) => {
	const {modelId, revision} = getVideoMattingModelInfo(model);
	return `https://huggingface.co/${modelId}/resolve/${revision}/`;
});

export const clearStaleVideoMattingModels = async (): Promise<void> => {
	if (typeof caches === 'undefined') {
		return;
	}

	const {env} = await import('@huggingface/transformers');
	let cache: Cache;
	let requests: readonly Request[];
	try {
		cache = await caches.open(env.cacheKey);
		requests = await cache.keys();
	} catch {
		return;
	}

	await Promise.all(
		requests.map((request) => {
			if (
				legacyModelUrlPrefixes.some((prefix) => request.url.startsWith(prefix))
			) {
				return cache.delete(request);
			}

			return Promise.resolve(false);
		}),
	);
};
