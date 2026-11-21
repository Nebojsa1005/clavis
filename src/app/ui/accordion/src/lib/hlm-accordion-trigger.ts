import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BrnAccordionImports } from '@spartan-ng/brain/accordion';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

@Component({
	selector: 'hlm-accordion-trigger',
	imports: [BrnAccordionImports],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<h3 brnAccordionHeader class="flex">
			<button brnAccordionTrigger data-slot="accordion-trigger" [class]="_computedTriggerClass()">
				<ng-content />
				<!-- Inline SVG instead of @ng-icons: no extra dependency (its current release needs Angular 21). -->
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
					data-slot="accordion-trigger-icon"
					class="pointer-events-none size-4 shrink-0 transition-transform group-aria-expanded/accordion-trigger:rotate-180"
				>
					<path d="m4 6 4 4 4-4" />
				</svg>
			</button>
		</h3>
	`,
})
export class HlmAccordionTrigger {
	public readonly triggerClass = input<ClassValue>('');

	protected readonly _computedTriggerClass = computed(() =>
		hlm(
			'focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:after:border-ring **:data-[slot=accordion-trigger-icon]:text-muted-foreground! rounded-md py-4 text-start text-sm font-medium hover:underline focus-visible:ring-3 **:data-[slot=accordion-trigger-icon]:ms-auto **:data-[slot=accordion-trigger-icon]:text-[calc(var(--spacing)*4)] group/accordion-trigger relative flex flex-1 items-start justify-between border border-transparent transition-all outline-none aria-disabled:pointer-events-none aria-disabled:opacity-50',
			this.triggerClass(),
		),
	);
}
