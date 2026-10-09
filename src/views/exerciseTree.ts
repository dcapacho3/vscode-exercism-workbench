import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExercismApi } from '../api/exercismApi';
import { slugToName, Track } from '../models';
import { WebProgressSnapshot } from '../progress/webProgress';
import { CatalogExercise } from '../api/exercismApi';
import { ScannedTrack, WorkspaceScanner } from '../workspace/workspaceScanner';
import { ExerciseItem } from './exerciseItem';
import { TrackItem } from './trackItem';
import { buildTrackExercises } from './trackExercises';
import { EXERCISE_ORDERS, ExerciseOrder, orderExercises, orderTracks } from './treeOrder';

type Node = TrackItem | ExerciseItem;

/** Sidebar tree: joined and downloaded tracks, each holding its exercises. */
export class ExerciseTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.changed.event;

  private local = new Map<string, ScannedTrack>();
  private order: ExerciseOrder = 'path';
  private collapsed = false;
  private generation = 0;
  private firstTrack: string | undefined;

  constructor(
    private readonly scanner: WorkspaceScanner,
    private readonly api: ExercismApi,
    private progress: WebProgressSnapshot | undefined,
  ) {}

  /** The track shown at the top, i.e. the most recently active one. */
  get topTrack(): string | undefined {
    return this.firstTrack;
  }

  get exerciseOrder(): ExerciseOrder {
    return this.order;
  }

  setWebProgress(progress: WebProgressSnapshot | undefined): void {
    this.progress = progress;
    this.refresh();
  }

  refresh(): void {
    this.changed.fire();
  }

  cycleExerciseOrder(): void {
    this.order = EXERCISE_ORDERS[(EXERCISE_ORDERS.indexOf(this.order) + 1) % EXERCISE_ORDERS.length];
    this.refresh();
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.generation++;
    this.refresh();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) {
      const tracks = orderTracks(await this.loadTracks());
      this.firstTrack = tracks[0]?.slug;
      return tracks.map(track => new TrackItem(track, this.collapsed, this.generation));
    }
    if (node instanceof TrackItem) {
      // Rebuilt on every expand so statuses follow the latest sync.
      const exercises = await this.loadExercises(node.track.slug);
      return orderExercises(exercises, this.order).map(exercise => new ExerciseItem(exercise));
    }
    return [];
  }

  private async loadTracks(): Promise<Track[]> {
    const scanned = await this.scanner.scan();
    this.local = new Map(scanned.map(track => [track.slug, track]));

    const lastLocalEdit = (slug: string) =>
      Math.max(0, ...(this.local.get(slug)?.exercises.map(e => e.lastModified) ?? []));

    // Joined tracks from Exercism progress first, then tracks that only exist on disk.
    const tracks: Track[] = (this.progress?.tracks ?? [])
      .filter(track => track.is_joined)
      .map(track => ({
        slug: track.slug,
        name: track.title || slugToName(track.slug),
        path: this.local.get(track.slug)?.path ?? '',
        exercises: [],
        totalExercises: track.num_exercises,
        completedExercises: track.num_completed_exercises,
        learnedConcepts: track.num_learnt_concepts,
        totalConcepts: track.num_concepts,
        lastActivity: Math.max(Date.parse(track.last_touched_at ?? '') || 0, lastLocalEdit(track.slug)),
      }));

    const localOnly = scanned.filter(track => !tracks.some(t => t.slug === track.slug));
    if (localOnly.length > 0) {
      const catalog = await this.api.tracks().catch(() => []);
      for (const track of localOnly) {
        tracks.push({
          slug: track.slug,
          name: slugToName(track.slug),
          path: track.path,
          exercises: [],
          totalExercises: catalog.find(t => t.slug === track.slug)?.numExercises,
          lastActivity: lastLocalEdit(track.slug),
        });
      }
    }
    return tracks;
  }

  private async loadExercises(trackSlug: string) {
    // A synced snapshot avoids API calls; without one, ask Exercism directly.
    const snapshot = this.progress?.exercises[trackSlug];
    const catalog: CatalogExercise[] = snapshot
      ? snapshot.map(e => ({
        slug: e.slug,
        title: e.title,
        difficulty: e.difficulty,
        isUnlocked: e.is_unlocked,
        isRecommended: e.is_recommended,
      }))
      : await this.api.exercises(trackSlug).catch(() => []);

    const statuses = this.progress
      ? new Map(this.progress.solutions
        .filter(solution => solution.track.slug === trackSlug)
        .map(solution => [solution.exercise.slug, solution.status]))
      : await this.api.solutionStatuses(trackSlug).catch(() => new Map<string, string>());

    return buildTrackExercises(
      trackSlug,
      catalog,
      this.local.get(trackSlug)?.exercises ?? [],
      statuses,
      exercisePath => fs.existsSync(path.join(exercisePath, 'HELP.md')),
    );
  }
}
