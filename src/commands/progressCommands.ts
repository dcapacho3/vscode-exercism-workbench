import * as vscode from 'vscode';
import { slugToName } from '../models';
import { mergeWebProgressPayload, parseWebProgress, WebProgressSnapshot } from '../progress/webProgress';
import { errorMessage, Workbench } from '../workbench';

export function registerProgressCommands(workbench: Workbench): void {
  workbench.register('exercismWorkbench.syncWebProgress', () => syncWebProgress(workbench));
  workbench.register('exercismWorkbench.syncWebProgressClipboard', () => syncWebProgressClipboard(workbench));
  workbench.register('exercismWorkbench.importWebProgressClipboard', () => importWebProgressClipboard(workbench));
  workbench.register('exercismWorkbench.importWebProgress', () => importWebProgress(workbench));
}

function countCompleted(progress: WebProgressSnapshot | undefined): number {
  return progress?.solutions.filter(s => s.status === 'completed' || s.status === 'published').length ?? 0;
}

async function syncWebProgress(workbench: Workbench): Promise<void> {
  let progress: WebProgressSnapshot | undefined;
  let syncError = '';
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Syncing your Exercism progress...' },
    async () => {
      try {
        progress = await workbench.syncProgress();
      } catch (error) {
        syncError = errorMessage(error);
      }
    },
  );

  if (syncError || !progress) {
    const action = await vscode.window.showErrorMessage(
      `Could not sync progress: ${syncError || 'no reason given'}`,
      'Use Clipboard Sync',
    );
    if (action === 'Use Clipboard Sync') {
      vscode.commands.executeCommand('exercismWorkbench.syncWebProgressClipboard');
    }
    return;
  }

  vscode.window.showInformationMessage(
    `Synced ${progress.tracks.length} track(s) and ${countCompleted(progress)} completed exercise(s).`,
  );
}

/** Fallback when the API is blocked: the learner copies each JSON page from the browser. */
async function syncWebProgressClipboard(workbench: Workbench): Promise<void> {
  let progress = workbench.webProgress;
  const importStep = async (url: string, title: string, instructions: string, trackSlug?: string) => {
    const step = await copyApiResponse(url, title, instructions, value => mergeWebProgressPayload(progress, value, trackSlug));
    if (step.result) {
      progress = step.result.progress;
      await workbench.saveWebProgress(progress);
    }
    return step;
  };

  const tracksStep = await importStep(
    'https://exercism.org/api/v2/tracks?status=joined',
    'Joined tracks',
    'Copy the entire JSON page in your browser, then return here.',
  );
  if (tracksStep.cancelled) { return; }

  const joinedTracks = progress?.tracks.filter(track => track.is_joined) ?? [];
  if (joinedTracks.length === 0) {
    vscode.window.showWarningMessage('No joined tracks found. Copy the joined-tracks page first.');
    return;
  }

  for (const track of joinedTracks) {
    const slug = encodeURIComponent(track.slug);
    const exercisesStep = await importStep(
      `https://exercism.org/api/v2/tracks/${slug}/exercises`,
      `${track.title} exercises`,
      'Copy the entire JSON page to update unlocks and the recommended next exercise.',
      track.slug,
    );
    if (exercisesStep.cancelled) { return; }

    const solutionsStep = await importStep(
      `https://exercism.org/api/v2/solutions?track_slug=${slug}&per_page=100`,
      `${track.title} solutions`,
      'Copy the entire JSON page to update completed and submitted exercises.',
      track.slug,
    );
    if (solutionsStep.cancelled) { return; }
    if ((solutionsStep.result?.totalPages ?? 1) > 1) {
      vscode.window.showWarningMessage(`${track.title} has more than 100 solutions. Only the first 100 were synced.`);
    }
  }

  vscode.window.showInformationMessage(
    `Synced ${joinedTracks.length} track(s) and ${countCompleted(progress)} completed exercise(s).`,
  );
}

async function importWebProgressClipboard(workbench: Workbench): Promise<void> {
  try {
    const value = JSON.parse(await vscode.env.clipboard.readText());
    let trackSlug: string | undefined;
    // An exercises payload does not say which track it belongs to.
    if (value && typeof value === 'object' && Array.isArray((value as { exercises?: unknown }).exercises)) {
      trackSlug = await chooseTrackSlug(workbench);
      if (!trackSlug) { return; }
    }
    const merged = mergeWebProgressPayload(workbench.webProgress, value, trackSlug);
    await workbench.saveWebProgress(merged.progress);
    vscode.window.showInformationMessage(`Imported ${merged.imported} ${merged.kind} item(s) from the clipboard.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Could not import clipboard progress: ${errorMessage(error)}`);
  }
}

async function importWebProgress(workbench: Workbench): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Import Exercism Progress',
    filters: { 'JSON files': ['json'] },
  });
  if (!selected?.[0]) { return; }
  try {
    const raw = await vscode.workspace.fs.readFile(selected[0]);
    const progress = parseWebProgress(JSON.parse(Buffer.from(raw).toString('utf8')));
    await workbench.saveWebProgress(progress);
    const completed = progress.tracks.reduce((sum, track) => sum + track.num_completed_exercises, 0);
    vscode.window.showInformationMessage(
      `Imported ${progress.tracks.length} track(s) and ${completed} completed exercise(s).`,
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Could not import Exercism progress: ${errorMessage(error)}`);
  }
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
      const retry = await vscode.window.showErrorMessage(
        `The clipboard could not be imported: ${errorMessage(error)}`,
        { modal: true },
        'Try Again',
        'Skip',
      );
      if (retry === 'Skip') { return { cancelled: false }; }
      if (retry !== 'Try Again') { return { cancelled: true }; }
    }
  }
}

async function chooseTrackSlug(workbench: Workbench): Promise<string | undefined> {
  const tracks = workbench.webProgress?.tracks
    .filter(track => track.is_joined)
    .map(track => ({ label: track.title, detail: track.slug })) ?? [];
  if (tracks.length === 0) {
    const local = await workbench.scanner.scan();
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
