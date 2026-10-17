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
		label,
		today = false,
		past = false,
		selected = false,
		title
	}: {
		segments: BarSegment[];
		spans: Span[];
		label?: string;
		today?: boolean;
		past?: boolean;
		selected?: boolean;
		title?: string;
	} = $props();

	const pct = (m: number) => Math.max(0, Math.min(100, (m / 1440) * 100));
	const place = (s: { start: number; end: number }) =>
		`top: ${pct(s.start)}%; height: ${Math.max(0, pct(s.end) - pct(s.start))}%`;
</script>

<span class="daybar" class:today class:past class:selected role={title ? 'img' : undefined} aria-label={title}>
	<span class="daybar-cap" aria-hidden="true">
		{#each segments as seg, i (i)}
			<span class="daybar-seg daybar-{seg.type}" style={place(seg)}></span>
		{/each}
		{#each spans as span, i (i)}
			<span
				class="daybar-span"
				class:daybar-span-open={span.color == null}
				style="{place(span)}{span.color ? `; --c: ${span.color}` : ''}"
			></span>
		{/each}
	</span>
	{#if label != null}<span class="daybar-label" aria-hidden="true">{label}</span>{/if}
</span>
