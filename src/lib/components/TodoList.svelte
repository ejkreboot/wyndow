<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { act } from '#lib/act.js';
	import type { Todo } from '#lib/types.js';

	let { todos: incoming }: { todos: Todo[] } = $props();

	// Local copy for optimistic updates; replaced whenever the server data changes.
	let todos = $derived(incoming.map((t) => ({ ...t })));
	const open = $derived(todos.filter((t) => !t.done));
	const done = $derived(todos.filter((t) => t.done));

	let draft = $state('');
	let highWater = 0;
	let error = $state<string | null>(null);
	let showDone = $state(false);
	let editing = $state<string | null>(null);

	async function call(action: string, fields: Record<string, string | boolean | null>) {
		error = null;
		try {
			await act(action, fields);
		} catch (e) {
			error = (e as Error).message;
		}
		await refreshAll();
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const title = draft.trim();
		if (!title) return;
		draft = '';
		// High-water mark survives refreshes that land before an earlier add has committed.
		const last = todos.reduce((max, t) => Math.max(max, t.position), highWater);
		const position = last + 1024;
		highWater = position;
		todos = [...todos, { id: `tmp-${crypto.randomUUID()}`, title, done: false, position }];
		await call('addTodo', { title, position: String(position) });
	}

	const pending = (todo: Todo) => todo.id.startsWith('tmp-');
	const patch = (id: string, changes: Partial<Todo>) =>
		(todos = todos.map((t) => (t.id === id ? { ...t, ...changes } : t)));

	function toggle(todo: Todo) {
		if (pending(todo)) return;
		patch(todo.id, { done: !todo.done });
		call('updateTodo', { id: todo.id, done: !todo.done });
	}

	function remove(todo: Todo) {
		if (pending(todo)) return;
		todos = todos.filter((t) => t.id !== todo.id);
		call('deleteTodo', { id: todo.id });
	}

	async function startEdit(todo: Todo) {
		if (pending(todo)) return;
		editing = todo.id;
		await tick();
		const input = document.getElementById(`todo-edit-${todo.id}`) as HTMLInputElement | null;
		input?.focus();
		input?.select();
	}

	function commitEdit(todo: Todo, value: string) {
		editing = null;
		const title = value.trim();
		if (!title || title === todo.title) return;
		patch(todo.id, { title });
		call('updateTodo', { id: todo.id, title });
	}

	/** Moves an open item to `to` (index within the open list) and persists it. */
	function moveTo(id: string, to: number) {
		const list = open.slice();
		const from = list.findIndex((t) => t.id === id);
		if (pending(list[from] ?? { id: 'tmp-' })) return;
		if (from < 0 || to === from || to < 0 || to >= list.length) return;
		const item = { ...list.splice(from, 1)[0] };
		list.splice(to, 0, item);
		const before = list[to - 1];
		const after = list[to + 1];
		// Optimistic position so the order holds until the server answers.
		item.position =
			before && after
				? (before.position + after.position) / 2
				: before
					? before.position + 1024
					: after.position - 1024;
		todos = [...list, ...done];
		call('moveTodo', { id, before: before?.id ?? null, after: after?.id ?? null });
	}

	// --- Pointer dragging -----------------------------------------------------
	let listEl: HTMLOListElement | undefined = $state();
	let drag = $state<{ id: string; from: number; to: number; dy: number; height: number } | null>(null);
	let startY = 0;
	let rects: DOMRect[] = [];

	function onPointerDown(e: PointerEvent, id: string, index: number) {
		if (e.button !== 0 || !listEl) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		rects = [...listEl.querySelectorAll<HTMLElement>(':scope > li')].map((li) => li.getBoundingClientRect());
		startY = e.clientY;
		drag = { id, from: index, to: index, dy: 0, height: rects[index].height };
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		const dy = e.clientY - startY;
		const center = rects[drag.from].top + rects[drag.from].height / 2 + dy;
		let to = 0;
		for (let i = 0; i < rects.length; i++) {
			if (center > rects[i].top + rects[i].height / 2) to = i;
		}
		if (center < rects[0].top + rects[0].height / 2) to = 0;
		drag = { ...drag, dy, to };
	}

	function onPointerUp() {
		if (!drag) return;
		const { id, to, from } = drag;
		drag = null;
		if (to !== from) moveTo(id, to);
	}

	function shift(index: number): number {
		if (!drag || index === drag.from) return 0;
		if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.height;
		if (drag.from > drag.to && index < drag.from && index >= drag.to) return drag.height;
		return 0;
	}

	async function onHandleKey(e: KeyboardEvent, id: string, index: number) {
		const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
		if (!delta) return;
		e.preventDefault();
		moveTo(id, index + delta);
		await tick();
		document.getElementById(`todo-handle-${id}`)?.focus();
	}
</script>

<section class="panel todos" aria-label="To-do list">
	<header class="panel__head">
		<span class="label">To do</span>
		<span class="readout-count">{String(open.length).padStart(2, '0')}</span>
		<span class="grille grille--wide" aria-hidden="true"></span>
	</header>

	<form class="todo-add" onsubmit={add}>
		<input class="field field--bare" placeholder="Add a to-do" bind:value={draft} aria-label="New to-do" autocomplete="off" />
		<button class="icon-button" type="submit" aria-label="Add" disabled={!draft.trim()}>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
		</button>
	</form>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="todos__scroll">
		{#if open.length}
			<ol class="todo-list" class:todo-list--dragging={!!drag} bind:this={listEl}>
				{#each open as todo, i (todo.id)}
					<li
						class="todo"
						class:todo--lifted={drag?.id === todo.id}
						style:transform={drag?.id === todo.id
							? `translateY(${drag.dy}px)`
							: drag
								? `translateY(${shift(i)}px)`
								: null}
					>
						<button
							id={`todo-handle-${todo.id}`}
							class="todo__handle"
							aria-label={`Reorder “${todo.title}”. Use up and down arrow keys.`}
							onpointerdown={(e) => onPointerDown(e, todo.id, i)}
							onpointermove={onPointerMove}
							onpointerup={onPointerUp}
							onpointercancel={onPointerUp}
							onkeydown={(e) => onHandleKey(e, todo.id, i)}
						>
							<span class="grille grille--handle" aria-hidden="true"></span>
						</button>
						<label class="check">
							<input type="checkbox" checked={todo.done} onchange={() => toggle(todo)} />
							<span class="check__box" aria-hidden="true"></span>
							<span class="visually-hidden">Mark “{todo.title}” done</span>
						</label>
						{#if editing === todo.id}
							<input
								id={`todo-edit-${todo.id}`}
								class="field field--inline todo__edit"
								value={todo.title}
								aria-label="Edit to-do"
								onblur={(e) => commitEdit(todo, e.currentTarget.value)}
								onkeydown={(e) => {
									if (e.key === 'Enter') e.currentTarget.blur();
									if (e.key === 'Escape') editing = null;
								}}
							/>
						{:else}
							<button class="todo__title" onclick={() => startEdit(todo)} title="Edit">{todo.title}</button>
						{/if}
						<button class="icon-button icon-button--small todo__delete" aria-label={`Delete “${todo.title}”`} onclick={() => remove(todo)}>
							<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
						</button>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="empty">All clear.</p>
		{/if}

		{#if done.length}
			<div class="todos__done-head">
				<button class="button button--quiet button--small" onclick={() => (showDone = !showDone)} aria-expanded={showDone}>
					Completed · {done.length}
				</button>
				{#if showDone}
					<button class="button button--quiet button--small" onclick={() => { todos = open.slice(); call('clearDone', {}); }}>
						Clear
					</button>
				{/if}
			</div>
			{#if showDone}
				<ul class="todo-list todo-list--done">
					{#each done as todo (todo.id)}
						<li class="todo todo--done">
							<span class="todo__handle todo__handle--blank" aria-hidden="true"></span>
							<label class="check">
								<input type="checkbox" checked={todo.done} onchange={() => toggle(todo)} />
								<span class="check__box" aria-hidden="true"></span>
								<span class="visually-hidden">Mark “{todo.title}” not done</span>
							</label>
							<span class="todo__title">{todo.title}</span>
							<button class="icon-button icon-button--small todo__delete" aria-label={`Delete “${todo.title}”`} onclick={() => remove(todo)}>
								<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</section>
