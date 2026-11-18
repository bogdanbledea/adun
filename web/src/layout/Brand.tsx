import { useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../lib/i18n.tsx'

/* The logo mark and wordmark. The mark keeps its own colours in both themes;
   the letters follow the brand token. The motto is picked at random when the
   brand appears and again when the language changes. */

const framedMark = {
  radius: 5.4,
  stroke: 1.81,
  axisStroke: 1.05,
  axes: 'M4.6 3.2V19.4H20.8',
  curve: 'M6.73 17.7C8.19 17.7 8.75 11.67 10.21 11.67C11.11 11.67 11.46 15.4 12.36 15.4C13.82 15.4 14.38 11.9 15.84 9.37',
  plus: 'M18.07 4.11V6.89M16.68 5.5H19.46',
} as const

const wordmark = {
  stroke: 2.6,
  viewBox: '-1.3 -15.9 51 17.2',
  ratio: 2.97,
  adun: [
    'M8.7 -8.7V-1.3M8.7 -5A3.7 3.7 0 0 1 1.3 -5A3.7 3.7 0 0 1 8.7 -5',
    'M21.6 -13.3V-1.3M21.6 -5A3.7 3.7 0 0 1 14.2 -5A3.7 3.7 0 0 1 21.6 -5',
    'M27.1 -8.7V-5A3.7 3.7 0 0 0 34.5 -5M34.5 -8.7V-1.3',
    'M40 -1.3V-5A3.7 3.7 0 0 1 47.4 -5V-1.3',
  ],
} as const

function BrandMark() {
  return (
    <svg aria-hidden="true" className="size-8 shrink-0" viewBox="0 0 24 24">
      <rect width="24" height="24" rx={framedMark.radius} className="fill-logo" />
      <g fill="none" className="stroke-logo-ink" strokeLinecap="round" strokeLinejoin="round">
        <path d={framedMark.axes} strokeWidth={framedMark.axisStroke} />
        <path d={framedMark.curve} strokeWidth={framedMark.stroke} />
        <path d={framedMark.plus} strokeWidth={framedMark.stroke} />
      </g>
    </svg>
  )
}

function WordmarkLetters() {
  return (
    <svg aria-hidden="true" className="h-5 shrink-0" viewBox={wordmark.viewBox} width={20 * wordmark.ratio} fill="none">
      <g strokeWidth={wordmark.stroke} strokeLinecap="round" strokeLinejoin="round" className="stroke-brand">
        {wordmark.adun.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
    </svg>
  )
}

const randomIndex = (length: number) => Math.floor(Math.random() * length)

export function Brand({ withMotto = false, to = '/' }: { withMotto?: boolean; to?: string }) {
  const { language, mottos, t } = useI18n()
  const [motto, setMotto] = useState(() => ({ language, index: randomIndex(mottos.length) }))

  // A new language means a new pick, made during render rather than in an effect.
  if (motto.language !== language) setMotto({ language, index: randomIndex(mottos.length) })

  return (
    <Link to={to} aria-label={t('brand.home')} className="block w-fit rounded-lg transition-opacity duration-150 hover:opacity-80">
      <span className="flex items-center gap-2.5">
        <BrandMark />
        <WordmarkLetters />
      </span>
      {withMotto && (
        <span className="mt-1 hidden text-xs text-muted sm:block">
          {t('brand.mottoPrefix')} {mottos[motto.index]}.
        </span>
      )}
    </Link>
  )
}
