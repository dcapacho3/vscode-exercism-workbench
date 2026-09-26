import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExercismCli, SubmitResult, TestResult } from './cli/exercismCli';
import { WorkspaceScanner } from './workspace/workspaceScanner';
import { ExercismTreeProvider } from './views/exercismTreeProvider';
import { ExerciseItem } from './views/exerciseItem';
import { ExercisePreviewPanel } from './webview/exercisePreview';
import { Exercise, ExerciseStatus, slugToName } from './models';
import {
	mergeWebProgressPayload,
	parseWebProgress,
	WebProgressSnapshot,
	WEB_PROGRESS_STORAGE_KEY,
} from './progress/webProgress';
import { BackgroundSyncMode, shouldRunBackgroundSync } from './sync/syncPolicy';
import { inspectSolutionFiles } from './workspace/solutionFiles';

let logChannel: vscode.OutputChannel | undefined;
function log(msg: string): void {
	logChannel?.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export function activate(context: vscode.ExtensionContext): void {
	const outputChannel = vscode.window.createOutputChannel('Exercism Workbench');
	logChannel = vscode.window.createOutputChannel('Exercism Workbench Log');
	context.subscriptions.push(outputChannel, logChannel);
	log('=== Exercism Workbench activating ===');

	const cli = new ExercismCli();
	const scanner = new WorkspaceScanner(() => cli.getConfig());

	// Set context for welcome view conditional display
	async function updateConfiguredContext() {
		let configured = false;
		try {
			const config = await cli.getConfig();
			configured = !!config.token;
		} catch { /* not configured */ }
		vscode.commands.executeCommand('setContext', 'exercismWorkbench.configured', configured);
		log(`Context exercismWorkbench.configured = ${configured}`);
	}
	updateConfiguredContext();

	// Log startup diagnostics
	cli.checkInstalled().then(result => {
		log(`CLI check: installed=${result.installed}, version=${result.version ?? 'N/A'}`);
	}).catch(err => {
		log(`CLI check error: ${err}`);
	});
	scanner.getWorkspacePath().then(wp => {
		log(`Workspace path resolved: ${wp ?? 'NONE'}`);
	}).catch(err => {
		log(`Workspace path error: ${err}`);
	});
	scanner.scan().then(tracks => {
		log(`Scan result: ${tracks.length} tracks found`);
		for (const t of tracks) {
			log(`  Track: ${t.slug} (${t.exercises.length} exercises)`);
			for (const e of t.exercises) {
				log(`    Exercise: ${e.slug} [readme=${e.hasReadme}, hints=${e.hasHints}]`);
			}
		}
	}).catch(err => {
		log(`Scan error: ${err}`);
	});
	const savedProgress = context.globalState.get<WebProgressSnapshot>(WEB_PROGRESS_STORAGE_KEY);
	let webProgress = savedProgress;
	const treeProvider = new ExercismTreeProvider(scanner, cli, savedProgress);

	async function saveWebProgress(progress: WebProgressSnapshot): Promise<void> {
		webProgress = progress;
		await context.globalState.update(WEB_PROGRESS_STORAGE_KEY, progress);
		treeProvider.setWebProgress(progress);
	}

	let syncInFlight: Promise<WebProgressSnapshot> | undefined;
	async function fetchAndSaveWebProgress(): Promise<WebProgressSnapshot> {
		if (syncInFlight) { return syncInFlight; }
		const activeSync = (async () => {
			const config = await cli.getConfig();
			const progress = await cli.fetchWebProgress(config.token);
			await saveWebProgress(progress);
			return progress;
		})();
		syncInFlight = activeSync;
		try {
			return await activeSync;
		} finally {
			if (syncInFlight === activeSync) { syncInFlight = undefined; }
		}
	}

	// Register Tree View
	const treeView = vscode.window.createTreeView('exercismWorkbench.explorer', {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	});
	context.subscriptions.push(treeView);

	let lastBackgroundSync = 0;
	async function backgroundSync(): Promise<void> {
		const now = Date.now();
		const syncConfig = vscode.workspace.getConfiguration('exercismWorkbench');
		const mode = syncConfig.get<BackgroundSyncMode>('syncMode', 'onFocus');
		const intervalMinutes = syncConfig.get<number>('syncIntervalMinutes', 5);
		if (!shouldRunBackgroundSync(mode, lastBackgroundSync, now, intervalMinutes)) { return; }
		lastBackgroundSync = now;
		try {
			await fetchAndSaveWebProgress();
			log('Background progress sync completed');
		} catch (error) {
			// Background sync is best-effort. Manual sync reports actionable errors.
			log(`Background progress sync skipped: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	context.subscriptions.push(
		treeView.onDidChangeVisibility(event => {
			if (event.visible) { void backgroundSync(); }
		}),
		vscode.window.onDidChangeWindowState(event => {
			if (event.focused) { void backgroundSync(); }
		}),
	);
	if (treeView.visible) { void backgroundSync(); }

	async function ensureCompleteDownload(exercise: Exercise): Promise<Exercise | undefined> {
		let currentExercise = exercise;
		let inspection = inspectSolutionFiles(currentExercise.path);

		if (inspection.isIncomplete) {
			const missingList = inspection.missing.join(', ');
			const action = await vscode.window.showWarningMessage(
				`The local download for ${exercise.slug} is incomplete. Missing: ${missingList}`,
				'Repair Download',
			);
			if (action !== 'Repair Download') { return undefined; }

			let repairedPath = '';
			let repairError = '';
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Repairing ${exercise.track}/${exercise.slug}...`,
					cancellable: true,
				},
				async (_progress, token) => {
					try {
						repairedPath = await cli.download(exercise.track, exercise.slug, token, true);
					} catch (error) {
						if (!token.isCancellationRequested) {
							repairError = error instanceof Error ? error.message : String(error);
						}
					}
				},
			);

			if (repairError) {
				vscode.window.showErrorMessage(`Could not repair ${exercise.slug}: ${repairError}`);
				return undefined;
			}
			if (!repairedPath) { return undefined; }

			currentExercise = buildExerciseFromPath(repairedPath, exercise.track, exercise.slug);
			inspection = inspectSolutionFiles(repairedPath);
			cli.clearCache();
			treeProvider.refresh();
		}

		if (inspection.files.length === 0) {
			vscode.window.showWarningMessage(`No solution file was found for ${exercise.slug}.`);
			return undefined;
		}
		return currentExercise;
	}

	async function openExerciseWorkspace(exercise: Exercise): Promise<void> {
		const currentExercise = await ensureCompleteDownload(exercise);
		if (!currentExercise) { return; }
		const inspection = inspectSolutionFiles(currentExercise.path);

		const readerPosition = vscode.workspace.getConfiguration('exercismWorkbench').get<string>('readerPosition', 'left');
		const editorColumn = readerPosition === 'left' ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
		const mainFile = inspection.files[0];
		log(`Opening solution file: ${mainFile}`);
		const doc = await vscode.workspace.openTextDocument(mainFile);
		await vscode.window.showTextDocument(doc, editorColumn);
		ExercisePreviewPanel.show(currentExercise, context.extensionUri);
	}

	// File watcher for auto-refresh
	const watcher = scanner.createWatcher(() => treeProvider.refresh());
	if (watcher) {
		context.subscriptions.push(watcher);
	}

	// Settings change listener
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('exercismWorkbench')) {
				treeProvider.refresh();
			}
		})
	);

	// --- Commands ---

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.syncWebProgress', async () => {
			let progress: WebProgressSnapshot | undefined;
			let syncError = '';
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Synchronizing Exercism progress...',
				},
				async () => {
					try {
						progress = await fetchAndSaveWebProgress();
					} catch (error) {
						syncError = error instanceof Error ? error.message : String(error);
					}
				}
			);

			if (syncError || !progress) {
				const action = await vscode.window.showErrorMessage(
					`Automatic Exercism sync failed: ${syncError || 'Unknown error'}`,
					'Use Clipboard Sync',
				);
				if (action === 'Use Clipboard Sync') {
					vscode.commands.executeCommand('exercismWorkbench.syncWebProgressClipboard');
				}
				return;
			}

			const completed = progress.solutions.filter(
				solution => solution.status === 'completed' || solution.status === 'published'
			).length;
			vscode.window.showInformationMessage(
				`Exercism progress synchronized: ${progress.tracks.length} track(s), ${completed} completed exercise(s).`
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.syncWebProgressClipboard', async () => {
			let progress = webProgress;
			const tracksStep = await copyApiResponse(
				'https://exercism.org/api/v2/tracks?status=joined',
				'Joined tracks',
				'Copy the entire JSON page in your browser, then return here.',
				value => mergeWebProgressPayload(progress, value),
			);
			if (tracksStep.cancelled) { return; }
			if (tracksStep.result) {
				progress = tracksStep.result.progress;
				await saveWebProgress(progress);
			}

			const joinedTracks = progress?.tracks.filter(track => track.is_joined) ?? [];
			if (joinedTracks.length === 0) {
				vscode.window.showWarningMessage('No joined tracks were found. Copy the joined-tracks JSON before continuing.');
				return;
			}

			for (const track of joinedTracks) {
				const exercisesStep = await copyApiResponse(
					`https://exercism.org/api/v2/tracks/${encodeURIComponent(track.slug)}/exercises`,
					`${track.title} exercises`,
					'Copy the entire JSON page to update unlocks and the recommended next exercise.',
					value => mergeWebProgressPayload(progress, value, track.slug),
				);
				if (exercisesStep.cancelled) { return; }
				if (exercisesStep.result) {
					progress = exercisesStep.result.progress;
					await saveWebProgress(progress);
				}

				const solutionsStep = await copyApiResponse(
					`https://exercism.org/api/v2/solutions?track_slug=${encodeURIComponent(track.slug)}&per_page=100`,
					`${track.title} solutions`,
					'Copy the entire JSON page to update completed and submitted exercises.',
					value => mergeWebProgressPayload(progress, value, track.slug),
				);
				if (solutionsStep.cancelled) { return; }
				if (solutionsStep.result) {
					progress = solutionsStep.result.progress;
					await saveWebProgress(progress);
					if ((solutionsStep.result.totalPages ?? 1) > 1) {
						vscode.window.showWarningMessage(
							`${track.title} has more than 100 solutions. Only the first page was synchronized.`
						);
					}
				}
			}

			const completed = progress?.solutions.filter(solution => solution.status === 'completed' || solution.status === 'published').length ?? 0;
			vscode.window.showInformationMessage(
				`Exercism progress synchronized: ${joinedTracks.length} track(s), ${completed} completed exercise(s).`
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.importWebProgressClipboard', async () => {
			try {
				const raw = await vscode.env.clipboard.readText();
				const value = JSON.parse(raw);
				let trackSlug: string | undefined;
				if (value && typeof value === 'object' && Array.isArray((value as { exercises?: unknown }).exercises)) {
					trackSlug = await chooseTrackSlug(webProgress, scanner);
					if (!trackSlug) { return; }
				}
				const merged = mergeWebProgressPayload(webProgress, value, trackSlug);
				await saveWebProgress(merged.progress);
				vscode.window.showInformationMessage(`Imported ${merged.imported} ${merged.kind} item(s) from the clipboard.`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Could not import clipboard progress: ${message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.importWebProgress', async () => {
			const selected = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: 'Import Exercism Progress',
				filters: { 'JSON files': ['json'] },
			});
			if (!selected?.[0]) { return; }
			try {
				const raw = await vscode.workspace.fs.readFile(selected[0]);
				const progress = parseWebProgress(JSON.parse(Buffer.from(raw).toString('utf8')));
				await saveWebProgress(progress);
				const completed = progress.tracks.reduce((sum, track) => sum + track.num_completed_exercises, 0);
				vscode.window.showInformationMessage(
					`Exercism progress imported: ${progress.tracks.length} joined track(s), ${completed} completed exercise(s).`
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Could not import Exercism progress: ${message}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.configure', async () => {
			log('Command: exercismWorkbench.configure triggered');
			// Step 1: Check CLI is installed
			const { installed } = await cli.checkInstalled();
			log(`CLI installed: ${installed}`);
			if (!installed) {
				const action = await vscode.window.showErrorMessage(
					'Exercism CLI is not installed. Please install it first.',
					'Install CLI',
					'How to Install'
				);
				if (action === 'Install CLI' || action === 'How to Install') {
					vscode.env.openExternal(vscode.Uri.parse(
						'https://exercism.org/docs/using/solving-exercises/working-locally'
					));
				}
				return;
			}

			// Step 2: Check if already configured
			let existingToken = '';
			try {
				const config = await cli.getConfig();
				existingToken = config.token;
			} catch { /* not configured */ }

			if (existingToken) {
				const masked = '****' + existingToken.slice(-4);
				const action = await vscode.window.showInformationMessage(
					`Exercism is already configured (token: ${masked}).`,
					'Reconfigure',
					'Cancel'
				);
				if (action !== 'Reconfigure') {
					return;
				}
			}

			// Step 3: Guide user to get API token
			const action = await vscode.window.showInformationMessage(
				'To configure Exercism, you need your API token from exercism.org.',
				'Get API Token',
				'I Have a Token'
			);

			if (!action) {
				return;
			}

			if (action === 'Get API Token') {
				vscode.env.openExternal(vscode.Uri.parse('https://exercism.org/settings/api_cli'));
			}

			const token = await vscode.window.showInputBox({
				prompt: action === 'Get API Token'
					? 'Paste your API token from exercism.org/settings/api_cli'
					: 'Enter your Exercism API token',
				placeHolder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
				password: true,
				ignoreFocusOut: true,
			});
			if (!token) { return; }
			let configureError = '';

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Configuring Exercism...',
				},
				async () => {
					try {
						await cli.configure(token);
						cli.clearCache();
						await updateConfiguredContext();
						treeProvider.refresh();
					} catch (err: unknown) {
						configureError = err instanceof Error ? err.message : String(err);
					}
				}
			);

			if (configureError) {
				vscode.window.showErrorMessage(`Failed to configure: ${configureError}`);
			} else {
				vscode.window.showInformationMessage('Exercism configured successfully! Use "Download Exercise" to get started.');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.download', async () => {
			log('Command: exercismWorkbench.download triggered');
			const { installed } = await cli.checkInstalled();
			if (!installed) {
				showCliNotInstalledError();
				return;
			}

			// Step 1: Fetch and show track list from Exercism API
			let trackItems: vscode.QuickPickItem[];
			try {
				const tracks = await cli.fetchTracks();
				trackItems = tracks.map(t => ({
					label: t.title,
					description: `${t.numExercises} exercises`,
					detail: t.slug,
				}));
			} catch {
				// Fallback to local tracks if API fails
				const scannedTracks = await scanner.scan();
				trackItems = scannedTracks.map(t => ({
					label: slugToName(t.slug),
					description: `${t.exercises.length} exercises (local)`,
					detail: t.slug,
				}));
				trackItems.push({
					label: '$(edit) Enter another track slug…',
					description: 'For example: javascript, rust, go',
					detail: '__manual__',
				});
			}
			log(`Fetched ${trackItems.length} tracks for download picker`);

			const trackPick = await vscode.window.showQuickPick(trackItems, {
				placeHolder: 'Select a language track',
				matchOnDescription: true,
				matchOnDetail: true,
			});
			if (!trackPick) { return; }
			let track = trackPick.detail!;
			if (track === '__manual__') {
				const input = await vscode.window.showInputBox({
					prompt: 'Enter an Exercism track slug',
					placeHolder: 'python',
					validateInput: value => /^[a-z0-9-]+$/.test(value.trim())
						? undefined
						: 'Use the lowercase track slug, such as python or c-sharp',
				});
				if (!input) { return; }
				track = input.trim();
			}

			// Step 2: Fetch and show exercise list for selected track
			let exerciseItems: vscode.QuickPickItem[];
			try {
				let token = '';
				try {
					const config = await cli.getConfig();
					token = config.token;
				} catch { /* no token */ }

				const exercises = await cli.fetchExercises(track, token || undefined);
				// Get local + solution data for status icons
				const scannedTracks = await scanner.scan();
				const localTrack = scannedTracks.find(t => t.slug === track);
				const localSlugs = new Set(localTrack?.exercises.map(e => e.slug) ?? []);

				let solutionMap = new Map<string, string>();
				if (token) {
					try { solutionMap = await cli.fetchUserSolutions(track, token); } catch { /* ignore */ }
				}

				// Sort: recommended first, then rest in original order
				const sorted = [...exercises].sort((a, b) => {
					if (a.isRecommended && !b.isRecommended) { return -1; }
					if (!a.isRecommended && b.isRecommended) { return 1; }
					return 0;
				});

				exerciseItems = sorted.map(e => {
					const solutionStatus = solutionMap.get(e.slug);
					const isLocal = localSlugs.has(e.slug);

					// Match tree view icons
					let icon: string;
					if (e.isRecommended) {
						icon = '$(star-full)';
					} else if (solutionStatus === 'published' || solutionStatus === 'completed') {
						icon = '$(check)';
					} else if (solutionStatus === 'started' || solutionStatus === 'iterated' || isLocal) {
						icon = '$(tools)';
					} else if (e.isUnlocked) {
						icon = '$(circle-outline)';
					} else {
						icon = '$(lock)';
					}

					return {
						label: `${icon} ${e.title}`,
						description: [
							e.difficulty,
							e.isRecommended ? 'recommended' : '',
							isLocal ? 'downloaded' : '',
						].filter(Boolean).join(' · '),
						detail: e.slug,
					};
				});
			} catch {
				// Fallback to manual input
				const input = await vscode.window.showInputBox({
					prompt: `Enter the exercise slug for ${track}`,
					placeHolder: 'hello-world',
				});
				if (!input) { return; }
				exerciseItems = [{ label: input, detail: input }];
			}
			log(`Fetched ${exerciseItems.length} exercises for track ${track}`);

			const exercisePick = await vscode.window.showQuickPick(exerciseItems, {
				placeHolder: `Select an exercise from ${trackPick.label}`,
				matchOnDescription: true,
				matchOnDetail: true,
			});
			if (!exercisePick) { return; }
			const exercise = exercisePick.detail!;

			let downloadPath = '';
			let downloadError = '';
			let cancelled = false;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Downloading ${track}/${exercise}...`,
					cancellable: true,
				},
				async (_progress, token) => {
					try {
						downloadPath = await cli.download(track, exercise, token);
						cli.clearCache();
						treeProvider.refresh();
					} catch (err: unknown) {
						if (token.isCancellationRequested) {
							cancelled = true;
							return;
						}
						downloadError = err instanceof Error ? err.message : String(err);
					}
				}
			);

			if (cancelled) { return; }
			if (downloadError) {
				vscode.window.showErrorMessage(`Download failed: ${downloadError}`);
				return;
			}

			const action = await vscode.window.showInformationMessage(
				`Downloaded ${track}/${exercise}`,
				'Open Folder',
				'View Instructions'
			);
			if (action === 'Open Folder') {
				const uri = vscode.Uri.file(downloadPath);
				vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
			} else if (action === 'View Instructions') {
				const ex = buildExerciseFromPath(downloadPath, track, exercise);
				await openExerciseWorkspace(ex);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.test', async (arg?: Exercise | ExerciseItem) => {
			// Context menu passes ExerciseItem, command palette passes Exercise
			const exerciseArg = arg instanceof ExerciseItem ? arg.exercise : arg;
			log(`Command: exercismWorkbench.test triggered, arg=${exerciseArg?.slug ?? 'none'}`);
			const { installed } = await cli.checkInstalled();
			if (!installed) { showCliNotInstalledError(); return; }

			const exercise = exerciseArg ?? (await detectExercise(scanner));
			if (!exercise) {
				vscode.window.showWarningMessage('No exercise detected. Open an exercise file first.');
				return;
			}
			const completeExercise = await ensureCompleteDownload(exercise);
			if (!completeExercise) { return; }

			outputChannel.clear();
			outputChannel.show(true);
			outputChannel.appendLine(`Running tests for ${completeExercise.track}/${completeExercise.slug}...\n`);
			let testResult: TestResult | undefined;
			let cancelled = false;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Testing ${completeExercise.slug}...`,
					cancellable: true,
				},
				async (_progress, token) => {
					testResult = await cli.test(completeExercise.path, token);
					cancelled = token.isCancellationRequested;
					outputChannel.appendLine(testResult.output);
				}
			);

			if (cancelled || !testResult) { return; }
			if (testResult.passed) {
				vscode.window.showInformationMessage(`All tests passed for ${completeExercise.slug}!`);
			} else {
				const diagnostic = testResult.diagnostic;
				const message = diagnostic
					? `Tests could not complete for ${completeExercise.slug}. ${diagnostic.message}`
					: `Tests did not pass for ${completeExercise.slug}.`;
				const helpUrl = diagnostic?.helpUrl;
				const helpLabel = diagnostic?.helpLabel;
				const actions = ['Show Output'];
				if (helpUrl && helpLabel) {
					actions.push(helpLabel);
				} else {
					actions.push('Track Test Guide');
				}
				if (completeExercise.hasHelp) { actions.push('Exercise Help'); }
				const action = await vscode.window.showErrorMessage(
					message,
					...actions,
				);
				if (action === 'Show Output') { outputChannel.show(true); }
				else if (action === helpLabel && helpUrl) {
					vscode.env.openExternal(vscode.Uri.parse(helpUrl));
				} else if (action === 'Track Test Guide') {
					vscode.env.openExternal(vscode.Uri.parse(
						`https://exercism.org/docs/tracks/${encodeURIComponent(completeExercise.track)}/tests`
					));
				} else if (action === 'Exercise Help') {
					const helpDocument = await vscode.workspace.openTextDocument(
						path.join(completeExercise.path, 'HELP.md')
					);
					await vscode.window.showTextDocument(helpDocument, vscode.ViewColumn.Active);
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.submit', async (arg?: Exercise | ExerciseItem) => {
			const exerciseArg = arg instanceof ExerciseItem ? arg.exercise : arg;
			const { installed } = await cli.checkInstalled();
			if (!installed) { showCliNotInstalledError(); return; }

			const exercise = exerciseArg ?? (await detectExercise(scanner));
			if (!exercise) {
				vscode.window.showWarningMessage('No exercise detected. Open an exercise file first.');
				return;
			}

			// Find solution files (non-test, non-config files)
			const solutionFiles = inspectSolutionFiles(exercise.path).files;
			if (solutionFiles.length === 0) {
				vscode.window.showWarningMessage('No solution files found to submit.');
				return;
			}
			let submitResult: SubmitResult | undefined;
			let cancelled = false;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Submitting ${exercise.slug}...`,
					cancellable: true,
				},
				async (_progress, token) => {
					submitResult = await cli.submit(solutionFiles, token);
					cancelled = token.isCancellationRequested;
					outputChannel.appendLine(submitResult.output);
				}
			);

			if (cancelled || !submitResult) { return; }
			if (submitResult.success) {
				cli.clearCache();
				try {
					await fetchAndSaveWebProgress();
				} catch (error) {
					log(`Post-submit progress sync skipped: ${error instanceof Error ? error.message : String(error)}`);
					treeProvider.refresh();
				}
				const buttons = submitResult.url ? ['Open in Browser'] : [];
				const action = await vscode.window.showInformationMessage(
					`Solution submitted for ${exercise.slug}!`,
					...buttons
				);
				if (action === 'Open in Browser' && submitResult.url) {
					lastBackgroundSync = 0;
					vscode.env.openExternal(vscode.Uri.parse(submitResult.url));
				}
			} else {
				vscode.window.showErrorMessage(`Submit failed: ${submitResult.output}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.submitIteration', (arg?: Exercise | ExerciseItem) => {
			return vscode.commands.executeCommand('exercismWorkbench.submit', arg);
		})
	);

	// Download a specific exercise (from tree view click or inline button)
	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.downloadExercise', async (arg?: Exercise | ExerciseItem) => {
			const exerciseArg = arg instanceof ExerciseItem ? arg.exercise : arg;
			if (!exerciseArg) { return; }
			log(`Command: exercismWorkbench.downloadExercise triggered for ${exerciseArg.track}/${exerciseArg.slug}`);
			let downloadPath = '';
			let downloadError = '';
			let cancelled = false;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Downloading ${exerciseArg.track}/${exerciseArg.slug}...`,
					cancellable: true,
				},
				async (_progress, token) => {
					try {
						downloadPath = await cli.download(exerciseArg.track, exerciseArg.slug, token);
						cli.clearCache();
						treeProvider.refresh();
					} catch (err: unknown) {
						if (token.isCancellationRequested) {
							cancelled = true;
							return;
						}
						downloadError = err instanceof Error ? err.message : String(err);
					}
				}
			);

			// The progress notification must finish before showing another prompt.
			if (cancelled) { return; }
			if (downloadError) {
				vscode.window.showErrorMessage(`Download failed: ${downloadError}`);
				return;
			}

			const action = await vscode.window.showInformationMessage(
				`Downloaded ${exerciseArg.slug}`,
				'Open Exercise'
			);
			if (action === 'Open Exercise') {
				const ex = buildExerciseFromPath(downloadPath, exerciseArg.track, exerciseArg.slug);
				await openExerciseWorkspace(ex);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.openInstructions', async (arg?: Exercise | ExerciseItem) => {
			const exerciseArg = arg instanceof ExerciseItem ? arg.exercise : arg;
			log(`Command: exercismWorkbench.openInstructions triggered, arg=${JSON.stringify(exerciseArg?.slug ?? 'none')}`);
			const exercise = exerciseArg ?? (await detectExercise(scanner));
			if (!exercise) {
				vscode.window.showWarningMessage('No exercise detected. Open an exercise file first.');
				return;
			}

			await openExerciseWorkspace(exercise);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.toggleLayout', async () => {
			const config = vscode.workspace.getConfiguration('exercismWorkbench');
			const current = config.get<string>('readerPosition', 'left');
			const newValue = current === 'left' ? 'right' : 'left';
			await config.update('readerPosition', newValue, vscode.ConfigurationTarget.Global);

			// Collect state before closing anything
			const currentExercise = ExercisePreviewPanel.getCurrentExercise();
			// Collect all open text editor file URIs (not webview)
			const openFileUris = vscode.window.tabGroups.all
				.flatMap(g => g.tabs)
				.filter(tab => tab.input instanceof vscode.TabInputText)
				.map(tab => (tab.input as vscode.TabInputText).uri);

			if (currentExercise) {
				// Close everything
				ExercisePreviewPanel.dispose();
				await vscode.commands.executeCommand('workbench.action.closeAllEditors');

				if (newValue === 'left') {
					// Reader left (Column 1), code right (Column 2)
					ExercisePreviewPanel.show(currentExercise, context.extensionUri);
					for (const uri of openFileUris) {
						const doc = await vscode.workspace.openTextDocument(uri);
						await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, true);
					}
				} else {
					// Code left (Column 1), reader right (Column 2)
					for (const uri of openFileUris) {
						const doc = await vscode.workspace.openTextDocument(uri);
						await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, true);
					}
					ExercisePreviewPanel.show(currentExercise, context.extensionUri);
				}
			}

			vscode.window.showInformationMessage(`Layout: ${newValue === 'left' ? 'Reader | Code' : 'Code | Reader'}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.openInBrowser', async (arg?: Exercise | ExerciseItem) => {
			const exerciseArg = arg instanceof ExerciseItem ? arg.exercise : arg;
			const exercise = exerciseArg ?? (await detectExercise(scanner));
			if (!exercise) {
				vscode.window.showWarningMessage('No exercise detected. Open an exercise file first.');
				return;
			}
			// Try to read URL from .exercism/metadata.json first
			let url = `https://exercism.org/tracks/${exercise.track}/exercises/${exercise.slug}`;
			try {
				const metadataPath = path.join(exercise.path, '.exercism', 'metadata.json');
				if (fs.existsSync(metadataPath)) {
					const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
					if (metadata.url) {
						url = metadata.url;
					}
				}
			} catch { /* use fallback URL */ }
			log(`Opening in browser: ${url}`);
			lastBackgroundSync = 0;
			vscode.env.openExternal(vscode.Uri.parse(url));
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.refreshTree', () => {
			cli.clearCache();
			treeProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.toggleSort', () => {
			treeProvider.toggleSort();
			const order = treeProvider.sortOrder;
			const labels: Record<string, string> = {
				'default': 'Learning Path (official order)',
				'reverse': 'Learning Path (reversed)',
				'easy-first': 'Easy → Hard',
				'hard-first': 'Hard → Easy',
			};
			vscode.window.showInformationMessage(`Sort: ${labels[order]}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('exercismWorkbench.expandAll', () => {
			treeProvider.toggleCollapse();
		})
	);

	outputChannel.appendLine('Exercism Workbench extension activated');
	log('=== Exercism Workbench activated successfully ===');
	log(`Extension URI: ${context.extensionUri.fsPath}`);
}

export function deactivate(): void {
	// Cleanup handled by disposables
}

// --- Helper functions ---

function showCliNotInstalledError(): void {
	vscode.window.showErrorMessage(
		'Exercism CLI is not installed.',
		'Install Instructions'
	).then(action => {
		if (action) {
			vscode.env.openExternal(vscode.Uri.parse(
				'https://exercism.org/docs/using/solving-exercises/working-locally'
			));
		}
	});
}

async function detectExercise(_scanner: WorkspaceScanner): Promise<Exercise | undefined> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}

	const filePath = editor.document.uri.fsPath;

	// Walk up from file to find .exercism/metadata.json
	let dir = path.dirname(filePath);
	while (dir !== path.dirname(dir)) {
		const metadataPath = path.join(dir, '.exercism', 'metadata.json');
		if (fs.existsSync(metadataPath)) {
			const exerciseSlug = path.basename(dir);
			const trackSlug = path.basename(path.dirname(dir));
			return buildExerciseFromPath(dir, trackSlug, exerciseSlug);
		}
		dir = path.dirname(dir);
	}

	return undefined;
}

function buildExerciseFromPath(exercisePath: string, track: string, slug: string): Exercise {
	return {
		slug,
		name: slugToName(slug),
		track,
		path: exercisePath,
		status: ExerciseStatus.Downloaded,
		hasReadme: fs.existsSync(path.join(exercisePath, 'README.md')),
		hasHints: fs.existsSync(path.join(exercisePath, 'HINTS.md')),
		hasHelp: fs.existsSync(path.join(exercisePath, 'HELP.md')),
		isDownloaded: true,
		isIncomplete: inspectSolutionFiles(exercisePath).isIncomplete,
	};
}

interface CopyApiStep<T> {
	result?: T;
	cancelled: boolean;
}

async function copyApiResponse<T>(
	url: string,
	title: string,
	instructions: string,
	parse: (value: unknown) => T,
): Promise<CopyApiStep<T>> {
	await vscode.env.openExternal(vscode.Uri.parse(url));

	while (true) {
		const action = await vscode.window.showInformationMessage(
			`${title}: ${instructions}`,
			{ modal: true },
			'Import Clipboard',
			'Reopen Page',
			'Skip',
		);
		if (!action) { return { cancelled: true }; }
		if (action === 'Skip') { return { cancelled: false }; }
		if (action === 'Reopen Page') {
			await vscode.env.openExternal(vscode.Uri.parse(url));
			continue;
		}

		try {
			const raw = await vscode.env.clipboard.readText();
			return { result: parse(JSON.parse(raw)), cancelled: false };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const retry = await vscode.window.showErrorMessage(
				`The clipboard could not be imported: ${message}`,
				{ modal: true },
				'Try Again',
				'Skip',
			);
			if (retry === 'Skip') { return { cancelled: false }; }
			if (retry !== 'Try Again') { return { cancelled: true }; }
		}
	}
}

async function chooseTrackSlug(
	progress: WebProgressSnapshot | undefined,
	scanner: WorkspaceScanner,
): Promise<string | undefined> {
	const tracks = progress?.tracks.filter(track => track.is_joined).map(track => ({
		label: track.title,
		detail: track.slug,
	})) ?? [];
	if (tracks.length === 0) {
		const local = await scanner.scan();
		tracks.push(...local.map(track => ({ label: slugToName(track.slug), detail: track.slug })));
	}
	tracks.push({ label: '$(edit) Enter track slug…', detail: '__manual__' });
	const selected = await vscode.window.showQuickPick(tracks, { placeHolder: 'Which track are these exercises from?' });
	if (!selected) { return undefined; }
	if (selected.detail !== '__manual__') { return selected.detail; }
	return vscode.window.showInputBox({
		prompt: 'Enter the Exercism track slug',
		placeHolder: 'python',
		validateInput: value => /^[a-z0-9-]+$/.test(value.trim()) ? undefined : 'Use a slug such as python or c-sharp',
	});
}
