<script lang="ts">
	import { diffDays } from '$lib/planner/dates';
	import type { LocalDate } from '$lib/planner/types';
	import type { Burndown, BurnPoint } from '$lib/projects/burndown';
	import { formatDay, formatShort } from '$lib/projects/issues';

	let { b, color, title }: { b: Burndown; color: string; title: string } = $props();

	let width = $state(640);
	const HEIGHT = 220;
	const PAD = { top: 12, right: 16, bottom: 26, left: 34 };

	const span = $derived(Math.max(1, diffDays(b.start, b.end)));
	const plotW = $derived(Math.max(120, width - PAD.left - PAD.right));
	const plotH = HEIGHT - PAD.top - PAD.bottom;
	const yMax = $derived(niceMax(b.max));
	const yTicks = $derived(Array.from({ length: 5 }, (_, i) => (yMax / 4) * i).filter((v) => Number.isInteger(v)));
	// About one date label per 56px, so labels never run together on a phone.
	const xTicks = $derived.by(() => {
		const step = Math.max(1, Math.ceil(b.ticks.length / Math.max(2, Math.floor(plotW / 56))));
		return b.ticks.filter((_, i) => i % step === 0);
	});

	const x = (d: LocalDate) => PAD.left + (diffDays(b.start, d) / span) * plotW;
	const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
	const path = (pts: BurnPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('');

	function niceMax(v: number): number {
		if (v <= 4) return 4;
		const step = Math.pow(10, Math.floor(Math.log10(v)));
		for (const m of [1, 2, 2.5, 4, 5, 10]) if (m * step >= v && (m * step) % 4 === 0) return m * step;
		return Math.ceil(v / 4) * 4;
	}

	// ---------- hover ----------
	let hover = $state<LocalDate | null>(null);
	const valueOn = (pts: BurnPoint[], d: LocalDate) => {
		let v: number | null = null;
		for (const p of pts) if (p.date <= d) v = p.value;
		return pts.length && d >= pts[0].date && d <= pts[pts.length - 1].date ? v : null;
	};
	const hoverInfo = $derived.by(() => {
		if (!hover) return null;
		const past = hover <= b.today;
		return {
			date: hover,
			left: past ? valueOn(b.actual, hover) : valueOn(b.projected, hover),
			scope: past ? valueOn(b.scope, hover) : null,
			past
		};
	});

	function onMove(e: PointerEvent) {
		const svg = e.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const px = e.clientX - rect.left;
		if (px < PAD.left - 8 || px > PAD.left + plotW + 8) {
			hover = null;
			return;
		}
		const days = Math.round(((px - PAD.left) / plotW) * span);
		const [yy, mm, dd] = b.start.split('-').map(Number);
		hover = new Date(Date.UTC(yy, mm - 1, dd + Math.max(0, Math.min(span, days)))).toISOString().slice(0, 10);
	}

	// ---------- table view: one row per Sunday tick ----------
	const rows = $derived(
		b.ticks.map((d) => ({
			date: d,
			left: d <= b.today ? valueOn(b.actual, d) : valueOn(b.projected, d),
			scope: d <= b.today ? valueOn(b.scope, d) : null,
			planned: d > b.today
		}))
	);
	const lastActual = $derived(b.actual[b.actual.length - 1]);
</script>

<figure class="burn" style="--c: {color}">
	<figcaption class="burn-legend">
		<span class="burn-key"><i class="burn-key-line"></i>Blocks left</span>
		<span class="burn-key"><i class="burn-key-line burn-key-projected"></i>Planned on the calendar</span>
		<span class="burn-key"><i class="burn-key-line burn-key-scope"></i>Scope</span>
		{#if b.due}<span class="burn-key"><i class="burn-key-due"></i>Due {formatShort(b.due)}</span>{/if}
	</figcaption>

	<div class="burn-plot" bind:clientWidth={width}>
		<svg
			width={width}
			height={HEIGHT}
			viewBox="0 0 {width} {HEIGHT}"
			role="img"
			aria-label={title}
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
		>
			{#each yTicks as t (t)}
				<line class="burn-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
				<text class="burn-tick" x={PAD.left - 6} y={y(t) + 3} text-anchor="end">{t}</text>
			{/each}
			{#each xTicks as t (t)}
				{@const tx = x(t)}
				{@const nearEnd = tx > width - PAD.right - 18}
				<text class="burn-tick" x={nearEnd ? width - 2 : tx} y={HEIGHT - 8} text-anchor={nearEnd ? 'end' : 'middle'}>{formatShort(t)}</text>
			{/each}

			<line class="burn-today" x1={x(b.today)} x2={x(b.today)} y1={PAD.top} y2={PAD.top + plotH} />
			{#if b.due && b.due <= b.end}
				<line class="burn-due" x1={x(b.due)} x2={x(b.due)} y1={PAD.top} y2={PAD.top + plotH} />
			{/if}

			<path class="burn-scope" d={path(b.scope)} />
			<path class="burn-area" d="{path(b.actual)}L{x(b.today).toFixed(1)},{y(0)}L{x(b.start).toFixed(1)},{y(0)}Z" />
			<path class="burn-projected" d={path(b.projected)} />
			<path class="burn-actual" d={path(b.actual)} />
			{#if lastActual}
				<circle class="burn-dot" cx={x(lastActual.date)} cy={y(lastActual.value)} r="4" />
			{/if}

			{#if hoverInfo}
				<line class="burn-cross" x1={x(hoverInfo.date)} x2={x(hoverInfo.date)} y1={PAD.top} y2={PAD.top + plotH} />
				{#if hoverInfo.left !== null}
					<circle class="burn-dot" cx={x(hoverInfo.date)} cy={y(hoverInfo.left)} r="4" />
				{/if}
			{/if}
		</svg>
		{#if hoverInfo}
			<div
				class="burn-tip"
				class:burn-tip-flip={x(hoverInfo.date) > width / 2}
				style="left: {x(hoverInfo.date)}px"
				aria-hidden="true"
			>
				<strong>{formatDay(hoverInfo.date)}</strong>
				{#if hoverInfo.left !== null}
					<span>{hoverInfo.left} block{hoverInfo.left === 1 ? '' : 's'} {hoverInfo.past ? 'left' : 'left if planned blocks are done'}</span>
				{/if}
				{#if hoverInfo.scope !== null}<span class="dim">Scope {hoverInfo.scope}</span>{/if}
			</div>
		{/if}
	</div>

	<details class="burn-table">
		<summary class="label">Show as table</summary>
		<table>
			<thead><tr><th scope="col">Week of</th><th scope="col">Blocks left</th><th scope="col">Scope</th></tr></thead>
			<tbody>
				{#each rows as r (r.date)}
					<tr>
						<td>{formatDay(r.date)}</td>
						<td class="mono">{r.left ?? '—'}{r.planned && r.left !== null ? ' (planned)' : ''}</td>
						<td class="mono">{r.scope ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>
