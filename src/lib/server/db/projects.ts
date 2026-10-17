import type { Project } from '$lib/planner/types';
import { toProject } from './mappers';
import { fail, type Db, type Update } from './types';

export type ProjectInput = Omit<Project, 'id' | 'blocksDone' | 'archived' | 'sort'> &
	Partial<Pick<Project, 'blocksDone' | 'archived' | 'sort'>>;

function toRow(p: Partial<ProjectInput>) {
	const row: Update<'projects'> = {};
	if (p.name !== undefined) row.name = p.name;
	if (p.color !== undefined) row.color = p.color;
	if (p.area !== undefined) row.area = p.area;
	if (p.githubRepo !== undefined) row.github_repo = p.githubRepo;
	if (p.milestone !== undefined) row.milestone = p.milestone;
	if (p.blocksDone !== undefined) row.blocks_done = p.blocksDone;
	if (p.archived !== undefined) row.archived = p.archived;
	if (p.sort !== undefined) row.sort = p.sort;
	return row;
}

export async function listProjects(db: Db, opts: { includeArchived?: boolean } = {}): Promise<Project[]> {
	let q = db.from('projects').select('*').order('sort').order('name');
	if (!opts.includeArchived) q = q.eq('archived', false);
	const { data, error } = await q;
	if (error) fail('Could not load projects', error);
	return data.map(toProject);
}

export async function createProject(db: Db, input: ProjectInput): Promise<Project> {
	const { data, error } = await db
		.from('projects')
		.insert({ ...toRow(input), name: input.name, color: input.color, area: input.area })
		.select('*')
		.single();
	if (error) fail('Could not create project', error);
	return toProject(data);
}

export async function updateProject(db: Db, id: string, patch: Partial<ProjectInput>): Promise<Project> {
	const { data, error } = await db.from('projects').update(toRow(patch)).eq('id', id).select('*').single();
	if (error) fail('Could not update project', error);
	return toProject(data);
}

export async function deleteProject(db: Db, id: string): Promise<void> {
	const { error } = await db.from('projects').delete().eq('id', id);
	if (error) fail('Could not delete project', error);
}
