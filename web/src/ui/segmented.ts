import { cx } from './cx.ts'

/* A segmented control: a few options on a shared track, the chosen one
   raised. The group is a fieldset of radios or a role="group" of pressed
   buttons; each option takes segmentClass. */

export const segmentGroup = 'inline-flex w-fit gap-0.5 rounded-lg bg-track p-0.5'

export function segmentClass(selected: boolean): string {
  return cx(
    'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm pointer-fine:min-h-8',
    'transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-gold [&_svg]:size-4 [&_svg]:shrink-0',
    selected ? 'bg-paper font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink',
  )
}
