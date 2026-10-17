<script lang="ts">
	import type { BarSegment } from '$lib/planner/types';

	interface Span {
		start: number;
		end: number;
		color: string | null;
	}
	let {
		segments,
		spans,
		nowMinutes,
		title
	}: {
		segments: BarSegment[];
		spans: Span[];
		nowMinutes?: number | null;
		title?: string;
	} = $props();

	const pct = (m: number) => Math.max(0, Math.min(100, (m / 1440) * 100));
	const place = (s: { start: number; end: number }) =>
		`left: ${pct(s.start)}%; width: ${Math.max(0, pct(s.end) - pct(s.start))}%`;
	const ticks = ['00', '06', '12', '18', '24'];
</script>

<div class="daystrip" role={title ? 'img' : undefined} aria-label={title}>
	<div class="daystrip-track" aria-hidden="true">
		{#each segments as seg, i (i)}
			<span class="daystrip-seg daybar-{seg.type}" style={place(seg)}></span>
		{/each}
		{#each spans as span, i (i)}
			<span
				class="daystrip-span"
				class:daybar-span-open={span.color == null}
				style="{place(span)}{span.color ? `; --c: ${span.color}` : ''}"
			></span>
		{/each}
		{#if nowMinutes != null}
			<span class="daystrip-now" style="left: {pct(nowMinutes)}%"></span>
		{/if}
	</div>
	<div class="daystrip-ticks" aria-hidden="true">
		{#each ticks as t (t)}<span>{t}</span>{/each}
	</div>
</div>
