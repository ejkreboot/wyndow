<script lang="ts">
	let { color = null }: { color: string | null } = $props();
</script>

<span class="swatch" class:swatch-open={color == null} style={color ? `--c: ${color}` : undefined} aria-hidden="true"></span>
