import path from 'path';
import {build} from 'bun';

if (process.env.NODE_ENV !== 'production') {
	throw new Error('This script must be run using NODE_ENV=production');
}

console.time('Generated.');
const privateTransformersPackage =
	'@remotion/whisper-webgpu/private-transformers';
const sharedExternals = [
	'@remotion/captions',
	'onnxruntime-web/webgpu',
	'remotion',
	'remotion/no-react',
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
];
const output = await build({
	entrypoints: ['src/index.ts'],
	naming: '[name].mjs',
	external: ['@huggingface/transformers', ...sharedExternals],
});

if (!output.success) {
	console.log(output.logs.join('\n'));
	process.exit(1);
}

const privateTransformersOutput = await build({
	entrypoints: ['src/private-transformers.ts'],
	define: {__dirname: 'undefined'},
	naming: '[name].mjs',
	target: 'browser',
	external: sharedExternals,
});

if (!privateTransformersOutput.success) {
	console.log(privateTransformersOutput.logs.join('\n'));
	process.exit(1);
}

for (const file of [...output.outputs, ...privateTransformersOutput.outputs]) {
	// This equivalent expression avoids a critical-dependency warning when a
	// downstream bundler processes the generated Transformers.js browser chunk.
	let str = (await file.text()).replaceAll(
		'Object(import.meta).url',
		'import.meta.url',
	);
	if (path.basename(file.path) === 'index.mjs') {
		str = str.replaceAll(
			'import("@huggingface/transformers")',
			`import(${JSON.stringify(privateTransformersPackage)})`,
		);
		if (
			!str.includes(`import(${JSON.stringify(privateTransformersPackage)})`)
		) {
			throw new Error(
				'Transformers.js must be loaded through the private package entry.',
			);
		}

		if (str.includes('import("@huggingface/transformers")')) {
			throw new Error(
				'The public entry must not share the consumer Transformers.js environment.',
			);
		}
	}

	const out = path.join('dist', 'esm', file.path);

	await Bun.write(out, str);
}

console.timeEnd('Generated.');
