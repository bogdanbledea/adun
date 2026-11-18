import { EllipsisVertical, Filter as FilterIcon, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { Menu } from '../../ui/Menu.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { segmentClass, segmentGroup } from '../../ui/segmented.ts'
import { budgetApi, type Category, type Entry } from './budget-api.ts'
import { BudgetSummary } from './BudgetSummary.tsx'
import { CategoryList, type Filter } from './CategoryList.tsx'
import { EntryDialog } from './EntryDialog.tsx'
import { ImportMenu } from './ImportMenu.tsx'
import { monthKeyToParam, monthLong } from './month-key.ts'
import { MonthSkeleton } from './MonthSkeleton.tsx'

/* One month with a budget: the summary, the entries by category, and the
   dialogs that change them. After every change the month is read again from
   the server, which keeps totals and order exactly as stored; a new order
   shows at once and is saved behind. Entries can be imported from the
   previous month or the template, appended to their categories; the notice
   says how many came. An entry moved to another month leaves a notice with
   a link there. */

type Open =
  | { dialog: 'add'; categoryName?: string }
  | { dialog: 'edit'; entry: Entry & { categoryName: string } }
  | { dialog: 'deleteEntry'; entry: Entry }
  | { dialog: 'deleteMonth' }
  | null

type Message =
  | { tone: 'moved'; description: string; monthKey: string }
  | { tone: 'imported'; count: number }
  | { tone: 'error'; error: unknown; lead?: string }

interface MonthViewProps {
  monthKey: string
  /** The months the strip offers. */
  months: string[]
  monthsWithBudget: ReadonlySet<string>
  /** The month before, when it has a budget to import from. */
  previousMonth: string | null
  hasTemplate: boolean
  onMonthCreated: (monthKey: string) => void
  onMonthDeleted: (monthKey: string) => void
}

export function MonthView({
  monthKey,
  months,
  monthsWithBudget,
  previousMonth,
  hasTemplate,
  onMonthCreated,
  onMonthDeleted,
}: MonthViewProps) {
  const { t, language } = useI18n()
  const [month, setMonth] = useState<Awaited<ReturnType<typeof budgetApi.month>> | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Open>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)

  // Replaces what is shown when the answer arrives.
  const load = useCallback(
    (signal?: AbortSignal) =>
      budgetApi
        .month(monthKey, signal)
        .then((loaded) => {
          setMonth(loaded)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted) setLoadError(error)
        }),
    [monthKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  if (loadError !== null && !month) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Notice tone="error">
          {t('budget.loadFailed')} {errorText(loadError, t)}
        </Notice>
        <Button variant="quiet" onClick={() => void load()}>
          {t('common.tryAgain')}
        </Button>
      </div>
    )
  }
  if (!month) return <MonthSkeleton />

  const entries = month.categories.flatMap((category) => category.entries)
  const shownCount = filter === 'all' ? entries.length : entries.filter((entry) => entry.type === filter).length
  const categoryNames = month.categories.map((category: Category) => category.name)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      setOpen(null)
    } catch (error) {
      setOpen(null)
      setMessage({ tone: 'error', error })
    }
    setBusy(false)
  }

  // A failure to save the order puts back what is stored.
  const saveOrder = async (save: () => Promise<unknown>) => {
    try {
      await save()
    } catch (error) {
      setMessage({ tone: 'error', error, lead: t('budget.reorderFailed') })
      await load()
    }
  }
  const reorderCategories = (next: Category[]) => {
    setMonth({ ...month, categories: next })
    void saveOrder(() => budgetApi.reorderCategories(next.map((category) => category.id)))
  }
  const reorderEntries = (categoryId: string, next: Entry[]) => {
    setMonth({
      ...month,
      categories: month.categories.map((category) => (category.id === categoryId ? { ...category, entries: next } : category)),
    })
    void saveOrder(() => budgetApi.reorderEntries(next.map((entry) => entry.id)))
  }

  const deleteEntry = (entry: Entry) =>
    run(async () => {
      await budgetApi.deleteEntry(entry.id)
      await load()
    })

  const deleteMonth = () =>
    run(async () => {
      await budgetApi.deleteMonth(monthKey)
      onMonthDeleted(monthKey)
    })

  const filters: { value: Filter; label: string; icon?: ReactNode }[] = [
    { value: 'all', label: t('budget.filterAll') },
    { value: 'income', label: t('budget.income'), icon: <TrendingUp /> },
    { value: 'expense', label: t('budget.expenses'), icon: <TrendingDown /> },
  ]

  return (
    <div className="pb-20">
      <BudgetSummary monthKey={monthKey} totals={month.totals} />

      {message && (
        <div className="mt-4">
          {message.tone === 'moved' ? (
            <Notice tone="success">
              {t('budget.movedNotice', { description: message.description, month: monthLong(message.monthKey, language) })}{' '}
              <Link to={`/buget/${monthKeyToParam(message.monthKey)}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                {t('budget.viewMonth')}
              </Link>
            </Notice>
          ) : message.tone === 'imported' ? (
            <Notice tone={message.count > 0 ? 'success' : 'info'}>
              {message.count > 0 ? t('budget.imported', { count: message.count }) : t('budget.importedNone')}
            </Notice>
          ) : (
            <Notice tone="error">
              {message.lead} {errorText(message.error, t)}
            </Notice>
          )}
        </div>
      )}

      <section aria-labelledby="budget-entries" className="mt-5 card">
        {/* On phones the filter gets a full-width row under the title and
            the buttons; from sm up it is one row. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <h2 id="budget-entries" className="mr-auto text-lg font-semibold">
            {t('budget.transactions')}
          </h2>
          <div role="group" aria-label={t('budget.filter')} className={cx(segmentGroup, 'order-last w-full sm:order-none sm:w-fit')}>
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => { setFilter(option.value) }}
                className={cx(segmentClass(filter === option.value), 'flex-1 justify-center sm:flex-none')}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
          <ImportMenu
            monthKey={monthKey}
            previousMonth={previousMonth}
            hasTemplate={hasTemplate}
            onImported={(count) => {
              setMessage({ tone: 'imported', count })
              void load()
            }}
            onFailed={(error) => { setMessage({ tone: 'error', error, lead: t('budget.importFailed') }) }}
          />
          <Button className="min-h-9 px-3 py-1.5" onClick={() => { setOpen({ dialog: 'add' }) }}>
            <Plus />
            {t('budget.add')}
          </Button>
          <Menu
            label={t('budget.monthActions')}
            trigger={<EllipsisVertical className="size-5" />}
            triggerClassName="grid size-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
            items={[
              { label: t('budget.deleteMonth'), icon: <Trash2 />, tone: 'danger', onSelect: () => { setOpen({ dialog: 'deleteMonth' }) } },
            ]}
          />
        </div>

        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold">{t('budget.noTransactions')}</h3>
            <p className="mx-auto mt-1 mb-5 max-w-xs text-muted">{t('budget.addFirst')}</p>
            <Button onClick={() => { setOpen({ dialog: 'add' }) }}>
              <Plus />
              {t('budget.addTransaction')}
            </Button>
          </div>
        ) : shownCount === 0 ? (
          <div className="px-6 py-12 text-center">
            <FilterIcon aria-hidden="true" className="mx-auto mb-3 size-6 text-muted" />
            <h3 className="text-lg font-semibold">{t('budget.noneFound')}</h3>
            <p className="mx-auto mt-1 max-w-xs text-muted">{t('budget.changeFilter')}</p>
          </div>
        ) : (
          <CategoryList
            categories={month.categories}
            filter={filter}
            onReorderCategories={reorderCategories}
            onReorderEntries={reorderEntries}
            onAdd={(categoryName) => { setOpen({ dialog: 'add', categoryName }) }}
            onEdit={(entry, categoryName) => { setOpen({ dialog: 'edit', entry: { ...entry, categoryName } }) }}
            onDelete={(entry) => { setOpen({ dialog: 'deleteEntry', entry }) }}
          />
        )}
      </section>

      {(open?.dialog === 'add' || open?.dialog === 'edit') && (
        <EntryDialog
          monthKey={monthKey}
          months={months}
          monthsWithBudget={monthsWithBudget}
          entry={open.dialog === 'edit' ? open.entry : undefined}
          categoryName={open.dialog === 'add' ? open.categoryName : undefined}
          categoryNames={categoryNames}
          onClose={() => { setOpen(null) }}
          onSaved={(saved) => {
            if (saved.monthKey !== null && saved.monthKey !== monthKey) {
              onMonthCreated(saved.monthKey)
              setMessage({ tone: 'moved', description: saved.description, monthKey: saved.monthKey })
            } else {
              setMessage(null)
            }
            void load()
          }}
          onDelete={(entry) => { setOpen({ dialog: 'deleteEntry', entry }) }}
        />
      )}
      <ConfirmDialog
        open={open?.dialog === 'deleteEntry'}
        title={t('budget.deleteEntry')}
        confirmLabel={t('common.delete')}
        destructive
        busy={busy}
        onConfirm={() => { if (open?.dialog === 'deleteEntry') void deleteEntry(open.entry) }}
        onCancel={() => { setOpen(null) }}
      >
        {open?.dialog === 'deleteEntry' && t('budget.deleteEntryText', { description: open.entry.description })}
      </ConfirmDialog>
      <ConfirmDialog
        open={open?.dialog === 'deleteMonth'}
        title={`${t('budget.deleteMonth')}: ${monthLong(monthKey, language)}`}
        confirmLabel={t('budget.deleteMonth')}
        destructive
        busy={busy}
        onConfirm={() => void deleteMonth()}
        onCancel={() => { setOpen(null) }}
      >
        {entries.length === 0 ? t('budget.deleteMonthEmpty') : t('budget.deleteMonthText', { count: entries.length })}
      </ConfirmDialog>
    </div>
  )
}
