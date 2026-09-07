import {
	canUseVideoMatting,
	getAvailableVideoMattingModels,
	separateVideoLayers,
	type VideoMattingModel,
} from '@remotion/video-matting';
import {useCallback, useEffect, useMemo, useState} from 'react';

type OutputUrls = {
	base: string;
	foreground: string;
};

const formatMegabytes = (bytes: number) => {
	return `${Math.round(bytes / 1_000_000)} MB`;
};

export const VideoMatting = () => {
	const models = useMemo(() => getAvailableVideoMattingModels(), []);
	const [file, setFile] = useState<File | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [selectedModel, setSelectedModel] =
		useState<VideoMattingModel>('modnet');
	const [status, setStatus] = useState('Choose a video to separate.');
	const [progress, setProgress] = useState<number | null>(null);
	const [outputUrls, setOutputUrls] = useState<OutputUrls | null>(null);

	useEffect(() => {
		return () => {
			if (outputUrls) {
				URL.revokeObjectURL(outputUrls.base);
				URL.revokeObjectURL(outputUrls.foreground);
			}
		};
	}, [outputUrls]);

	const onSeparate = useCallback(async () => {
		if (file === null) {
			return;
		}

		setIsProcessing(true);
		setOutputUrls(null);
		setProgress(0);

		try {
			const support = await canUseVideoMatting({model: selectedModel});
			if (!support.supported) {
				throw new Error(support.detailedReason);
			}

			setStatus(`Loading ${selectedModel}…`);
			const result = await separateVideoLayers({
				src: file,
				model: selectedModel,
				onModelLoadProgress: (modelProgress) => {
					if (modelProgress.progress !== null) {
						setStatus(
							`Loading ${selectedModel}… ${Math.round(modelProgress.progress * 100)}%`,
						);
					}
				},
				onProgress: (videoProgress) => {
					if (videoProgress.progress === null) {
						setProgress(null);
						setStatus(`Finalizing ${videoProgress.processedFrames} frames…`);
						return;
					}

					setProgress(videoProgress.progress);
					setStatus(
						`Separating frame ${videoProgress.processedFrames}… ${Math.round(videoProgress.progress * 100)}%`,
					);
				},
			});

			setStatus('Preparing previews…');
			try {
				const [baseBlob, foregroundBlob] = await Promise.all([
					result.base.getBlob(),
					result.foreground.getBlob(),
				]);
				setOutputUrls({
					base: URL.createObjectURL(baseBlob),
					foreground: URL.createObjectURL(foregroundBlob),
				});
			} finally {
				await Promise.allSettled([
					result.base.dispose(),
					result.foreground.dispose(),
				]);
			}
			setProgress(1);
			setStatus(
				`Done: ${result.processedFrames} frames, ${result.width}×${result.height}, ${result.durationInSeconds.toFixed(2)}s.`,
			);
		} catch (error) {
			setProgress(null);
			setStatus(error instanceof Error ? error.message : String(error));
		} finally {
			setIsProcessing(false);
		}
	}, [file, selectedModel]);

	const downloadPrefix = file?.name.replace(/\.[^.]+$/, '') ?? 'video';

	return (
		<div className="min-h-screen bg-slate-950 p-8 text-slate-900">
			<div className="mx-auto w-full max-w-5xl space-y-5 rounded-xl bg-white p-7 shadow-2xl">
				<div>
					<h1 className="text-2xl font-semibold">Video matting</h1>
					<p className="mt-1 text-sm text-slate-600">
						Separate an opaque base video from a transparent foreground in the
						browser.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block text-sm font-medium" htmlFor="matting-file">
						Video
						<input
							accept="video/*"
							className="mt-2 block w-full rounded-md border border-slate-300 p-2"
							disabled={isProcessing}
							id="matting-file"
							onChange={(event) => {
								setFile(event.target.files?.[0] ?? null);
								setOutputUrls(null);
								setProgress(null);
								setStatus('Ready to separate.');
							}}
							type="file"
						/>
					</label>

					<label className="block text-sm font-medium" htmlFor="matting-model">
						Model
						<select
							className="mt-2 block w-full rounded-md border border-slate-300 p-2"
							disabled={isProcessing}
							id="matting-model"
							onChange={(event) => {
								setSelectedModel(event.target.value as VideoMattingModel);
							}}
							value={selectedModel}
						>
							{models.map((model) => (
								<option key={model.name} value={model.name}>
									{model.name} · {model.purpose} ·{' '}
									{formatMegabytes(model.webGpuDownloadSize)}
								</option>
							))}
						</select>
					</label>
				</div>

				{selectedModel === 'ben2-base' ? (
					<p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
						This model is experimental and requires WebGPU shader-f16 support.
					</p>
				) : null}

				<button
					className="w-full rounded-md bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
					disabled={file === null || isProcessing}
					onClick={onSeparate}
					type="button"
				>
					{isProcessing ? 'Separating…' : 'Separate video'}
				</button>

				<div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
					{status}
					{progress !== null ? (
						<progress className="mt-2 block w-full" max={1} value={progress} />
					) : null}
				</div>

				{outputUrls ? (
					<div className="grid gap-5 md:grid-cols-2">
						{(
							[
								['Base', outputUrls.base, `${downloadPrefix}-base.webm`],
								[
									'Foreground',
									outputUrls.foreground,
									`${downloadPrefix}-foreground.webm`,
								],
							] as const
						).map(([label, url, download]) => (
							<div className="space-y-2" key={label}>
								<h2 className="font-semibold">{label}</h2>
								{/* eslint-disable-next-line @remotion/warn-native-media-tag */}
								<video
									className="aspect-video w-full rounded-md bg-[repeating-conic-gradient(#e2e8f0_0_25%,#fff_0_50%)] bg-[length:24px_24px]"
									controls
									src={url}
								/>
								<a
									className="inline-block text-sm font-medium text-indigo-700 underline"
									download={download}
									href={url}
								>
									Download {label.toLowerCase()}
								</a>
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
};
