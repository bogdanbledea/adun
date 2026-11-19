import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useI18n, type Language } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Select } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { segmentClass, segmentGroup } from '../../ui/segmented.ts'
import { WorkCalendarDialog } from '../food/WorkCalendarDialog.tsx'
import { SettingRow, SettingsSection } from './SettingsSection.tsx'

/* When a food month's money starts: on the 1st, or on payday as the N-th
   working day. Saved on change; it decides the start of months whose budget
   is set up from now on. The working calendar it counts on opens from here. */

type Rule = AuthUser['foodPeriodRule']

const WORKING_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function englishOrdinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
  return `${String(n)}${suffix}`
}

const ordinalParam = (n: number, language: Language) => (language === 'en' ? englishOrdinal(n) : String(n))

export function FoodPeriodSection({ user }: { user: AuthUser }) {
  const { t, language } = useI18n()
  const { signedIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const save = async (changes: { foodPeriodRule?: Rule; foodPaydayWorkingDay?: number }) => {
    setBusy(true)
    setFailure(null)
    try {
      signedIn(await api<AuthUser>('/api/user/me', { method: 'PATCH', body: changes }))
    } catch (error) {
      setFailure(error)
    }
    setBusy(false)
  }

  const rules: { value: Rule; label: string }[] = [
    { value: 'calendar', label: t('foodPeriod.calendar') },
    { value: 'working_day', label: t('foodPeriod.payday') },
  ]

  return (
    <SettingsSection title={t('foodPeriod.section')}>
      <SettingRow title={t('foodPeriod.title')} description={t('foodPeriod.text')}>
        <fieldset className={segmentGroup} disabled={busy}>
          <legend className="sr-only">{t('foodPeriod.title')}</legend>
          {rules.map((rule) => (
            <label key={rule.value} className={segmentClass(user.foodPeriodRule === rule.value)}>
              <input
                type="radio"
                name="food-period-rule"
                value={rule.value}
                checked={user.foodPeriodRule === rule.value}
                onChange={() => void save({ foodPeriodRule: rule.value })}
                className="sr-only"
              />
              {rule.label}
            </label>
          ))}
        </fieldset>
      </SettingRow>

      {user.foodPeriodRule === 'working_day' && (
        <div className="mb-3 rounded-lg bg-track px-4 py-3">
          <div className="max-w-xs">
            <Select
              label={t('foodPeriod.workingDay')}
              value={String(user.foodPaydayWorkingDay)}
              disabled={busy}
              onChange={(event) => void save({ foodPaydayWorkingDay: Number(event.target.value) })}
            >
              {WORKING_DAYS.map((n) => (
                <option key={n} value={String(n)}>
                  {n === 1 ? t('foodPeriod.ordinalFirst') : t('foodPeriod.ordinal', { n: ordinalParam(n, language) })}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-2 text-sm text-muted">{t('foodPeriod.help')}</p>
          <Button variant="secondary" className="mt-3" onClick={() => { setCalendarOpen(true) }}>
            <CalendarDays />
            {t('foodPeriod.openCalendar')}
          </Button>
        </div>
      )}

      {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      {calendarOpen && <WorkCalendarDialog onClose={() => { setCalendarOpen(false) }} />}
    </SettingsSection>
  )
}
