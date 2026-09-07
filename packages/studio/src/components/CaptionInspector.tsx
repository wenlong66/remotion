import type {Caption} from '@remotion/captions';
import React, {useCallback, useRef, useState} from 'react';
import {CURRENT_COLOR, LIGHT_TEXT} from '../helpers/colors';
import {UploadIcon} from '../icons/upload';
import {SetSelectedModalContext} from '../state/modals';
import {Button} from './Button';
import {CaptionTextEditor} from './CaptionTextEditor';
import {CollapsibleInspectorSectionHeader} from './InspectorPanel/CollapsibleInspectorSectionHeader';
import {InspectorSectionHeader} from './InspectorPanel/common';
import {sectionHeaderEnd} from './InspectorPanel/styles';
import {showNotification} from './Notifications/NotificationCenter';
import {parseCaptionFile} from './parse-caption-file';

const importTooltip = `Import captions

Supports Remotion Caption[] JSON. Files are processed locally.`;

const readOnlyStatus: React.CSSProperties = {
	color: LIGHT_TEXT,
	fontFamily: 'sans-serif',
	fontSize: 12,
	fontWeight: 'normal',
	lineHeight: '16px',
	marginLeft: 12,
};

export const CaptionInspector: React.FC<{
	readonly captions: Caption[];
	readonly expanded: boolean;
	readonly onTextChange: (captions: Caption[]) => void;
	readonly onTextSave: ((captions: Caption[]) => void) | null;
	readonly onTextCancel: (() => void) | null;
	readonly onReplaceCaptions: ((captions: Caption[]) => void) | null;
	readonly onToggle: () => void;
	readonly readOnly: boolean;
	readonly readOnlyTitle: string | null;
}> = ({
	captions,
	expanded,
	onTextChange,
	onTextSave,
	onTextCancel,
	onReplaceCaptions,
	onToggle,
	readOnly,
	readOnlyTitle,
}) => {
	const fileInput = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const {setSelectedModal} = React.useContext(SetSelectedModalContext);

	const importCaptions = useCallback(
		async ({
			fileName,
			contents,
		}: {
			fileName: string;
			contents: Promise<string>;
		}) => {
			if (onReplaceCaptions === null) {
				return;
			}

			setIsImporting(true);
			try {
				onReplaceCaptions(
					parseCaptionFile({
						fileName,
						contents: await contents,
					}),
				);
			} catch (error) {
				showNotification(
					`Could not import ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
					5000,
				);
			} finally {
				setIsImporting(false);
			}
		},
		[onReplaceCaptions],
	);

	const onFileSelected = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.currentTarget.files?.[0];
			event.currentTarget.value = '';
			if (!file) {
				return;
			}

			importCaptions({fileName: file.name, contents: file.text()}).catch(
				() => undefined,
			);
		},
		[importCaptions],
	);

	const openCaptionSelection = useCallback(() => {
		setSelectedModal({
			type: 'quick-switcher',
			mode: 'assets',
			invocationTimestamp: Date.now(),
			assetSelection: {
				initialQuery: 'type:json',
				onSelectFile: () => fileInput.current?.click(),
				onSelected: (asset) => {
					return importCaptions({
						fileName: asset.name,
						contents: fetch(asset.src).then((response) => response.text()),
					}).catch(() => undefined);
				},
			},
			compositionSelection: null,
		});
	}, [importCaptions, setSelectedModal]);

	return (
		<>
			<InspectorSectionHeader>
				<CollapsibleInspectorSectionHeader
					action={
						<div style={sectionHeaderEnd}>
							{onReplaceCaptions === null ? null : (
								<>
									<input
										ref={fileInput}
										accept=".json"
										aria-label="Import captions file"
										hidden
										onChange={onFileSelected}
										type="file"
									/>
									<Button
										buttonContainerStyle={{
											alignItems: 'center',
											display: 'flex',
											gap: 4,
										}}
										disabled={isImporting}
										onClick={openCaptionSelection}
										size="condensed"
										title={importTooltip}
									>
										<UploadIcon
											aria-hidden="true"
											color={CURRENT_COLOR}
											focusable="false"
											style={{height: 12, width: 12}}
										/>
										{isImporting ? 'Importing…' : 'Import'}
									</Button>
								</>
							)}
							{readOnly ? (
								<div style={readOnlyStatus} title={readOnlyTitle ?? undefined}>
									Read only
								</div>
							) : null}
						</div>
					}
					expanded={expanded}
					label="Captions"
					onToggle={onToggle}
				/>
			</InspectorSectionHeader>
			{expanded ? (
				<CaptionTextEditor
					captions={captions}
					onChange={onTextChange}
					onSave={onTextSave}
					onCancel={onTextCancel}
					readOnly={readOnly}
				/>
			) : null}
		</>
	);
};
