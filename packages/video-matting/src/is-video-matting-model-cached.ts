import {getVideoMattingModelInfo, type VideoMattingModel} from './models';

export type IsVideoMattingModelCachedOptions = {
	model: VideoMattingModel;
};

export const isVideoMattingModelCached = async ({
	model,
}: IsVideoMattingModelCachedOptions): Promise<boolean> => {
	const {ModelRegistry} = await import('@huggingface/transformers');
	const modelInfo = getVideoMattingModelInfo(model);

	return ModelRegistry.is_pipeline_cached(
		'background-removal',
		modelInfo.modelId,
		{
			device: 'webgpu',
			dtype: modelInfo.dtype,
			revision: modelInfo.revision,
		},
	);
};
