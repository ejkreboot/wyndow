/** Svelte action: focus (and optionally select) an element once it's in the DOM. */
export function focusOnMount(node: HTMLInputElement | HTMLTextAreaElement, select = false) {
	queueMicrotask(() => {
		node.focus();
		if (select) node.select();
	});
}
