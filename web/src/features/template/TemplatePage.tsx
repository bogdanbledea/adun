import { LayoutTemplate, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { budgetApi, type Category, type Entry } from '../budget/budget-api.ts'
import { CategoryList } from '../budget/CategoryList.tsx'
import { EntryDialog } from '../budget/EntryDialog.tsx'
import { MonthSkeleton } from '../budget/MonthSkeleton.tsx'

/* /sablon: the recurring entries a new month can start from. Entries are
   added, edited, deleted and dragged like a month's, but have no month.
   After every change the template is read again from the server. */

type Open =
  | { dialog: 'add'; categoryName?: string }
  | { dialog: 'edit'; entry: Entry & { categoryName: string } }
  | { dialog: 'delete'; entry: Entry }
  | null

export function TemplatePage() {
  const t = useT()
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [open, setOpen] = useState<Open>(null)
  const [failure, setFailure] = useState<{ error: unknown; lead?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    (signal?: AbortSignal) =>
      budgetApi
        .template(signal)
        .then((template) => {
          setCategories(template.categories)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted) setLoadError(error)
        }),
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const header = (
    <PageHeader
      title={t('template.title')}
      subtitle={t('template.subtitle')}
      // An empty template has its own button in the empty state.
      action={
        categories !== null &&
        categories.length > 0 && (
          <Button className="self-start sm:self-auto" onClick={() => { setOpen({ dialog: 'add' }) }}>
            <Plus />
            {t('template.add')}
          </Button>
        )
      }
    />
  )

  if (loadError !== null && !categories) {
    return (
      <>
        {header}
        <Notice tone="error">
          {t('template.loadFailed')} {errorText(loadError, t)}
        </Notice>
        <Button variant="quiet" className="mt-2" onClick={() => void load()}>
          {t('common.tryAgain')}
        </Button>
      </>
    )
  }
  if (!categories) {
    return (
      <>
        {header}
        <MonthSkeleton />
      </>
    )
  }

  const entries = categories.flatMap((category) => category.entries)

  // A failure to save the order puts back what is stored.
  const saveOrder = async (save: () => Promise<unknown>) => {
    try {
      await save()
    } catch (error) {
      setFailure({ error, lead: t('budget.reorderFailed') })
      await load()
    }
  }
  const reorderCategories = (next: Category[]) => {
    setCategories(next)
    void saveOrder(() => budgetApi.reorderCategories(next.map((category) => category.id)))
  }
  const reorderEntries = (categoryId: string, next: Entry[]) => {
    setCategories(categories.map((category) => (category.id === categoryId ? { ...category, entries: next } : category)))
    void saveOrder(() => budgetApi.reorderEntries(next.map((entry) => entry.id)))
  }

  const deleteEntry = async (entry: Entry) => {
    setBusy(true)
    try {
      await budgetApi.deleteEntry(entry.id)
      await load()
    } catch (error) {
      setFailure({ error })
    }
    setBusy(false)
    setOpen(null)
  }

  return (
    <>
      {header}

      {failure && (
        <div className="mb-4">
          <Notice tone="error">
            {failure.lead} {errorText(failure.error, t)}
          </Notice>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title={t('template.empty')}
          action={
            <Button onClick={() => { setOpen({ dialog: 'add' }) }}>
              <Plus />
              {t('template.addFirst')}
            </Button>
          }
        >
          {t('template.emptyText')}
        </EmptyState>
      ) : (
        <section aria-labelledby="template-entries" className="card">
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-4">
            <h2 id="template-entries" className="text-lg font-semibold">
              {t('template.entries')}
            </h2>
            <span className="text-sm text-muted tabular-nums">{entries.length}</span>
          </div>
          <CategoryList
            categories={categories}
            filter="all"
            onReorderCategories={reorderCategories}
            onReorderEntries={reorderEntries}
            onAdd={(categoryName) => { setOpen({ dialog: 'add', categoryName }) }}
            onEdit={(entry, categoryName) => { setOpen({ dialog: 'edit', entry: { ...entry, categoryName } }) }}
            onDelete={(entry) => { setOpen({ dialog: 'delete', entry }) }}
          />
        </section>
      )}

      {(open?.dialog === 'add' || open?.dialog === 'edit') && (
        <EntryDialog
          monthKey={null}
          entry={open.dialog === 'edit' ? open.entry : undefined}
          categoryName={open.dialog === 'add' ? open.categoryName : undefined}
          categoryNames={categories.map((category) => category.name)}
          onClose={() => { setOpen(null) }}
          onSaved={() => {
            setFailure(null)
            void load()
          }}
          onDelete={(entry) => { setOpen({ dialog: 'delete', entry }) }}
        />
      )}
      <ConfirmDialog
        open={open?.dialog === 'delete'}
        title={t('template.deleteEntry')}
        confirmLabel={t('common.delete')}
        destructive
        busy={busy}
        onConfirm={() => { if (open?.dialog === 'delete') void deleteEntry(open.entry) }}
        onCancel={() => { setOpen(null) }}
      >
        {open?.dialog === 'delete' && t('template.deleteEntryText', { description: open.entry.description })}
      </ConfirmDialog>
    </>
  )
}
