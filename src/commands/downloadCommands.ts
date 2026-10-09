import * as vscode from 'vscode';
import { Exercise, slugToName } from '../models';
import { ExerciseItem } from '../views/exerciseItem';
import { buildExerciseFromPath } from '../exercises/exerciseLocator';
import { downloadWithProgress, openExerciseWorkspace } from '../exercises/exerciseWorkspace';
import { showCliNotInstalledError, Workbench } from '../workbench';

const MANUAL_ENTRY = '__manual__';

export function registerDownloadCommands(workbench: Workbench): void {
  workbench.register('exercismWorkbench.download', () => downloadFromPicker(workbench));
  workbench.register('exercismWorkbench.downloadExercise', (arg?: Exercise | ExerciseItem) => downloadExercise(workbench, arg));
}

/** Download from the tree: the exercise is already known. */
async function downloadExercise(workbench: Workbench, arg?: Exercise | ExerciseItem): Promise<void> {
  const exercise = arg instanceof ExerciseItem ? arg.exercise : arg;
  if (!exercise) { return; }
  workbench.log(`Command: exercismWorkbench.downloadExercise triggered for ${exercise.track}/${exercise.slug}`);

  const downloadPath = await downloadWithProgress(workbench, exercise.track, exercise.slug);
  if (!downloadPath) { return; }

  const action = await vscode.window.showInformationMessage(`Downloaded ${exercise.slug}`, 'Open Exercise');
  if (action === 'Open Exercise') {
    await openExerciseWorkspace(workbench, buildExerciseFromPath(downloadPath, exercise.track, exercise.slug));
  }
}

/** Download from the title bar: pick a track, then an exercise. */
async function downloadFromPicker(workbench: Workbench): Promise<void> {
  workbench.log('Command: exercismWorkbench.download triggered');
  if (!(await workbench.cli.checkInstalled()).installed) {
    showCliNotInstalledError();
    return;
  }

  const trackPick = await vscode.window.showQuickPick(await trackItems(workbench), {
    placeHolder: 'Pick a track',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!trackPick) { return; }
  let track = trackPick.detail!;
  if (track === MANUAL_ENTRY) {
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

  const items = await exerciseItems(workbench, track);
  if (!items) { return; }
  const exercisePick = await vscode.window.showQuickPick(items, {
    placeHolder: `Pick an exercise from ${trackPick.label}`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!exercisePick) { return; }
  const slug = exercisePick.detail!;

  const downloadPath = await downloadWithProgress(workbench, track, slug);
  if (!downloadPath) { return; }

  const action = await vscode.window.showInformationMessage(`Downloaded ${track}/${slug}`, 'Open Folder', 'View Instructions');
  if (action === 'Open Folder') {
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(downloadPath), { forceNewWindow: false });
  } else if (action === 'View Instructions') {
    await openExerciseWorkspace(workbench, buildExerciseFromPath(downloadPath, track, slug));
  }
}

async function trackItems(workbench: Workbench): Promise<vscode.QuickPickItem[]> {
  let items: vscode.QuickPickItem[];
  try {
    const tracks = await workbench.api.tracks();
    items = tracks.map(t => ({ label: t.title, description: `${t.numExercises} exercises`, detail: t.slug }));
  } catch {
    // Fall back to local tracks if the API fails.
    const scanned = await workbench.scanner.scan();
    items = scanned.map(t => ({
      label: slugToName(t.slug),
      description: `${t.exercises.length} downloaded`,
      detail: t.slug,
    }));
    items.push({ label: '$(edit) Enter another track slug…', description: 'For example: javascript, rust, go', detail: MANUAL_ENTRY });
  }
  workbench.log(`Fetched ${items.length} tracks for download picker`);
  return items;
}

/** Returns undefined if the learner cancels the manual-entry fallback. */
async function exerciseItems(workbench: Workbench, track: string): Promise<vscode.QuickPickItem[] | undefined> {
  const { api, scanner } = workbench;
  let items: vscode.QuickPickItem[];
  try {
    const exercises = await api.exercises(track);
    const localTrack = (await scanner.scan()).find(t => t.slug === track);
    const localSlugs = new Set(localTrack?.exercises.map(e => e.slug) ?? []);
    // Statuses need a token; without one the picker just shows no progress.
    const solutionMap = await api.solutionStatuses(track).catch(() => new Map<string, string>());

    // Recommended first, then the rest in learning-path order.
    const sorted = [...exercises].sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended));
    items = sorted.map(e => {
      const status = solutionMap.get(e.slug);
      const isLocal = localSlugs.has(e.slug);
      // Match the tree view icons.
      let icon: string;
      if (e.isRecommended) { icon = '$(star-full)'; }
      else if (status === 'published' || status === 'completed') { icon = '$(check)'; }
      else if (status === 'started' || status === 'iterated' || isLocal) { icon = '$(tools)'; }
      else if (e.isUnlocked) { icon = '$(circle-outline)'; }
      else { icon = '$(lock)'; }

      return {
        label: `${icon} ${e.title}`,
        description: [e.difficulty, e.isRecommended ? 'recommended' : '', isLocal ? 'downloaded' : '']
          .filter(Boolean).join(' · '),
        detail: e.slug,
      };
    });
  } catch {
    const input = await vscode.window.showInputBox({
      prompt: `Could not list ${track} exercises. Type the exercise slug instead`,
      placeHolder: 'for example hello-world',
    });
    if (!input) { return undefined; }
    items = [{ label: input, detail: input }];
  }
  workbench.log(`Fetched ${items.length} exercises for track ${track}`);
  return items;
}
