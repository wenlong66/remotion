import {
	formatAverageAudioVolume,
	getAverageAudioVolume,
} from '@remotion/timeline-utils';
import type {InputAudioTrack} from 'mediabunny';
import {useEffect, useState} from 'react';
import {TableCell, TableRow} from './ui/table';

export const AudioVolumeRow: React.FC<{readonly track: InputAudioTrack}> = ({
	track,
}) => {
	const [value, setValue] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		setValue('Calculating…');
		getAverageAudioVolume({track, signal: controller.signal})
			.then((volume) => {
				if (!controller.signal.aborted) {
					setValue(formatAverageAudioVolume(volume));
				}
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					setValue('Unavailable');
				}
			});
		return () => controller.abort();
	}, [track]);

	return (
		<TableRow>
			<TableCell
				className="font-brand"
				title="RMS level across all channels over the full audio track, including silence."
			>
				Average volume
			</TableCell>
			<TableCell className="text-right">{value ?? 'Calculating…'}</TableCell>
		</TableRow>
	);
};
