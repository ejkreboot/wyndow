<script lang="ts">
	// The Wyndow mark: three light panels and one HAL-red panel forming a W.
	// Decorative; the surrounding link or heading carries the accessible name.
	let { size = 'small' }: { size?: 'small' | 'large' } = $props();
</script>

<svg class="logo logo-{size}" viewBox="20 80 716 600" aria-hidden="true" focusable="false">
	<path
		class="logo-panel"
		d="M 26 107 C 26 93.67 32.67 89.67 46 95 L 180 182 C 188 187.33 192 194 192 202 L 192 558 C 192 564 189 569 183 573 L 47 659 C 33 667 26 663.67 26 649 Z"
	/>
	<path
		class="logo-panel"
		d="M 213 428 C 213 420 216.33 413.67 223 409 L 351 326 C 363.67 318 370 320.67 370 334 L 370 455 C 370 462.33 366.67 468 360 472 L 219 562 C 215 564.67 213 563 213 557 Z"
	/>
	<path
		class="logo-panel"
		d="M 730 107 C 730 93.67 723.33 89.67 710 95 L 576 182 C 568 187.33 564 194 564 202 L 564 558 C 564 564 567 569 573 573 L 709 659 C 723 667 730 663.67 730 649 Z"
	/>
	<path
		class="logo-eye"
		d="M 386 334 C 386 320.67 392.33 318 405 326 L 533 409 C 540.33 413.67 544 420 544 428 L 544 557 C 544 563 542 564.67 538 562 L 397 472 C 389.67 468 386 462.33 386 455 Z"
	/>
</svg>
