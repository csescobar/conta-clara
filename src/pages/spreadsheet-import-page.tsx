import { useContext, useEffect, useState } from 'react';
import { FileUp, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';
import { brazilianMonthName, currentMonthInputValue, formatBrazilianDate } from '../lib/finance';
import {
  parseSpreadsheetImport,
  type ImportKind,
  type ImportLocale,
  type SpreadsheetImportEntry,
  type SpreadsheetImportPreview,
} from '../lib/spreadsheet-import';
import { PageHeader } from './page-header';
import { MoneyValue } from '../components/ui/money-value';
import { Select, Checkbox } from '../components/ui/form-controls';
import { Alert } from '../components/ui/alert';
import { AlertDialog, AlertDialogContent } from '../components/ui/dialog';

type Category = { id: string; name: string; kind: ImportKind; archived_at: string | null };
type PaymentMethod = { id: string; name: string; archived_at: string | null };
type CategoryMapping = { kind: 'expense' | 'investment'; categoryId: string };
type ApiResponse = { error?: string; categories?: Category[]; paymentMethods?: PaymentMethod[]; batch?: { item_count: number } };

const maxFileBytes = 10 * 1024 * 1024;
const kindLabels: Record<ImportKind, string> = { income: 'Receita', expense: 'Despesa', investment: 'Aporte' };

function normalize(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function responseJson(response: Response) {
  return response.json() as Promise<ApiResponse>;
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: brazilianMonthName(index + 1) }));
}

function defaultCategoryMapping(name: string, categories: Category[]): CategoryMapping {
  const match = categories.find(
    (category) => normalize(category.name) === normalize(name) && (category.kind === 'expense' || category.kind === 'investment'),
  );
  return { kind: match?.kind === 'investment' ? 'investment' : 'expense', categoryId: match?.id ?? '' };
}

function effectiveMapping(name: string, mappings: Record<string, CategoryMapping>, categories: Category[]) {
  return mappings[name] ?? defaultCategoryMapping(name, categories);
}

function preparePayload(
  entries: SpreadsheetImportEntry[],
  mappings: Record<string, CategoryMapping>,
  paymentMappings: Record<string, string>,
  incomeCategoryId: string,
  categories: Category[],
) {
  return entries.map((entry) => {
    const mapping = entry.sourceCategory ? effectiveMapping(entry.sourceCategory, mappings, categories) : null;
    const matchedPaymentId = entry.sourcePaymentMethod ? (paymentMappings[entry.sourcePaymentMethod] ?? '') : '';
    return {
      kind: mapping?.kind ?? entry.kind,
      description: entry.description,
      categoryId: mapping?.categoryId || (entry.kind === 'income' ? incomeCategoryId || null : null),
      competenceOn: entry.competenceOn,
      dueOn: entry.dueOn,
      plannedCents: entry.plannedCents,
      actualCents: entry.actualCents,
      realizedOn: entry.realizedOn,
      paymentMethodId: matchedPaymentId || null,
      notes: entry.notes,
    };
  });
}

export function SpreadsheetImportPage() {
  const auth = useContext(AuthContext);
  const currentMonth = currentMonthInputValue().split('-');
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(currentMonth[0]);
  const [expenseMonth, setExpenseMonth] = useState(currentMonth[1]);
  const [locale, setLocale] = useState<ImportLocale>('en_US');
  const [preview, setPreview] = useState<SpreadsheetImportPreview | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, CategoryMapping>>({});
  const [paymentMappings, setPaymentMappings] = useState<Record<string, string>>({});
  const [incomeCategoryId, setIncomeCategoryId] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmedDateReview, setConfirmedDateReview] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    void Promise.all([
      fetch('/api/catalog/categories', { credentials: 'same-origin' }).then(async (response) => {
        const result = await responseJson(response);
        if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar as categorias.');
        return result;
      }),
      fetch('/api/catalog/payment-methods', { credentials: 'same-origin' }).then(async (response) => {
        const result = await responseJson(response);
        if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar as formas de pagamento.');
        return result;
      }),
    ])
      .then(([categoryResult, methodResult]) => {
        setCategories(categoryResult.categories ?? []);
        setPaymentMethods(methodResult.paymentMethods ?? []);
        setError(categoryResult.error ?? methodResult.error ?? '');
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as categorias e formas de pagamento.'),
      )
      .finally(() => setLoadingCatalog(false));
  }, []);

  function invalidatePreview() {
    setPreview(null);
    setConfirmedDateReview(false);
    setSuccessCount(null);
  }

  function selectFile(selected: File | undefined) {
    setError('');
    setSuccessCount(null);
    invalidatePreview();
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
      setFile(null);
      setError('Selecione um arquivo .xlsx exportado do modelo.');
      return;
    }
    if (selected.size > maxFileBytes) {
      setFile(null);
      setError('O arquivo excede o limite de 10 MB.');
      return;
    }
    setFile(selected);
  }

  async function createPreview() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = parseSpreadsheetImport(await file.arrayBuffer(), { year: Number(year), expenseMonth: Number(expenseMonth), locale });
      setPreview(result);
      const categoryDefaults: Record<string, CategoryMapping> = {};
      const paymentDefaults: Record<string, string> = {};
      for (const entry of result.entries) {
        if (entry.sourceCategory && !categoryDefaults[entry.sourceCategory])
          categoryDefaults[entry.sourceCategory] = defaultCategoryMapping(entry.sourceCategory, categories);
        if (entry.sourcePaymentMethod && !paymentDefaults[entry.sourcePaymentMethod]) {
          paymentDefaults[entry.sourcePaymentMethod] =
            paymentMethods.find((method) => normalize(method.name) === normalize(entry.sourcePaymentMethod ?? ''))?.id ?? '';
        }
      }
      setCategoryMappings(categoryDefaults);
      setPaymentMappings(paymentDefaults);
      setIncomeCategoryId('');
      setConfirmedDateReview(false);
    } catch (parseError) {
      setPreview(null);
      setError(parseError instanceof Error ? parseError.message : 'Não foi possível ler a planilha.');
    } finally {
      setBusy(false);
    }
  }

  async function submitImport() {
    if (!preview || !auth?.csrfToken) return;
    const payload = preparePayload(preview.entries, categoryMappings, paymentMappings, incomeCategoryId, categories);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify({ entries: payload }),
      });
      const result = await responseJson(response);
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível importar o lote.');
      setSuccessCount(result.batch?.item_count ?? payload.length);
      setPreview(null);
      setFile(null);
      setConfirming(false);
      setFileInputKey((current) => current + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível importar o lote.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const sourceCategories = [
    ...new Set((preview?.entries ?? []).map((entry) => entry.sourceCategory).filter((name): name is string => Boolean(name))),
  ];
  const sourcePaymentMethods = [
    ...new Set((preview?.entries ?? []).map((entry) => entry.sourcePaymentMethod).filter((name): name is string => Boolean(name))),
  ];
  const dateWarnings = (preview?.entries ?? []).filter((entry) => entry.warning);
  const activeIncomeCategories = categories.filter((category) => category.kind === 'income' && !category.archived_at);
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= 2200;

  return (
    <>
      <PageHeader
        eyebrow="Migração"
        title="Importar planilha"
        description="Revise as contas e receitas previstas antes de adicionar lançamentos ao espaço compartilhado."
        action={
          <Button asChild variant="outline">
            <Link to="/lancamentos">Voltar aos lançamentos</Link>
          </Button>
        }
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      {successCount !== null && (
        <Card className="mb-5 border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p role="status" className="text-sm font-medium">
              {successCount} lançamentos foram importados. A planilha original não foi alterada.
            </p>
            <Button asChild variant="outline">
              <Link to="/lancamentos">Ver lançamentos</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>1. Escolha a planilha e a competência</CardTitle>
            <CardDescription>
              O arquivo é lido neste navegador e nunca é enviado ou alterado. Só os lançamentos confirmados seguem para a API local.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="spreadsheet-file" className="text-sm font-medium">
                Arquivo XLSX
              </label>
              <Input
                key={fileInputKey}
                id="spreadsheet-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => selectFile(event.currentTarget.files?.[0])}
                aria-describedby="spreadsheet-file-hint"
              />
              <p id="spreadsheet-file-hint" className="text-xs leading-5 text-muted-foreground">
                Até 10 MB. Esperadas as abas “Contas e Vencimentos” e “Fluxo de Caixa Mensal”.{file ? ` Selecionado: ${file.name}.` : ''}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField id="import-year" label="Ano para datas sem ano">
                <Input
                  id="import-year"
                  type="number"
                  min={1900}
                  max={2200}
                  value={year}
                  onChange={(event) => {
                    setYear(event.target.value);
                    invalidatePreview();
                  }}
                />
              </FormField>
              <div className="grid gap-2">
                <label htmlFor="import-expense-month" className="text-sm font-medium">
                  Competência das contas
                </label>
                <Select
                  id="import-expense-month"
                  value={expenseMonth}
                  onChange={(event) => {
                    setExpenseMonth(event.target.value);
                    invalidatePreview();
                  }}
                  className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {monthOptions().map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="import-locale" className="text-sm font-medium">
                  Formato de datas e valores
                </label>
                <Select
                  id="import-locale"
                  value={locale}
                  onChange={(event) => {
                    setLocale(event.target.value as ImportLocale);
                    invalidatePreview();
                  }}
                  className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="en_US">Estados Unidos · MM/DD · 1,234.56</option>
                  <option value="pt_BR">Brasil · DD/MM · 1.234,56</option>
                </Select>
                <span className="text-xs text-muted-foreground">A planilha informa o formato en_US.</span>
              </div>
            </div>
            <div>
              <Button type="button" disabled={!file || !validYear || loadingCatalog || busy} onClick={() => void createPreview()}>
                <FileUp aria-hidden="true" className="size-4" />
                {busy ? 'Lendo planilha…' : 'Gerar prévia'}
              </Button>
              {loadingCatalog && <span className="ml-3 text-xs text-muted-foreground">Carregando categorias compartilhadas…</span>}
            </div>
          </CardContent>
        </Card>

        {preview && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>2. Revise o que será importado</CardTitle>
                <CardDescription>
                  {preview.entries.length} lançamentos válidos · {preview.skipped.length} linhas ignoradas. Totais e células calculadas por
                  fórmula ficam de fora.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                {sourceCategories.length > 0 && (
                  <section className="grid gap-3" aria-labelledby="category-mapping-title">
                    <h3 id="category-mapping-title" className="text-sm font-semibold">
                      Categorias e aportes
                    </h3>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Associe cada categoria da planilha a um cadastro existente. Escolher “Aporte” classifica esses itens como
                      investimentos.
                    </p>
                    <div className="grid gap-3">
                      {sourceCategories.map((name, index) => {
                        const mapping = effectiveMapping(name, categoryMappings, categories);
                        const options = categories.filter((category) => category.kind === mapping.kind && !category.archived_at);
                        return (
                          <div
                            key={name}
                            className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-end"
                          >
                            <p className="min-w-0 truncate text-sm font-medium" title={name}>
                              {name}
                            </p>
                            <div className="grid gap-2">
                              <label className="text-xs font-medium" htmlFor={`import-category-kind-${index}`}>
                                Tipo
                              </label>
                              <Select
                                id={`import-category-kind-${index}`}
                                value={mapping.kind}
                                onChange={(event) =>
                                  setCategoryMappings((current) => ({
                                    ...current,
                                    [name]: { kind: event.target.value as CategoryMapping['kind'], categoryId: '' },
                                  }))
                                }
                                className="min-h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                              >
                                <option value="expense">Despesa</option>
                                <option value="investment">Aporte</option>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <label className="text-xs font-medium" htmlFor={`import-category-${index}`}>
                                Categoria compartilhada
                              </label>
                              <Select
                                id={`import-category-${index}`}
                                value={mapping.categoryId}
                                onChange={(event) =>
                                  setCategoryMappings((current) => ({ ...current, [name]: { ...mapping, categoryId: event.target.value } }))
                                }
                                className="min-h-10 rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                              >
                                <option value="">Sem categoria</option>
                                {options.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {activeIncomeCategories.length > 0 && (
                  <div className="grid gap-2 sm:max-w-md">
                    <label htmlFor="import-income-category" className="text-sm font-medium">
                      Categoria das receitas previstas
                    </label>
                    <Select
                      id="import-income-category"
                      value={incomeCategoryId}
                      onChange={(event) => setIncomeCategoryId(event.target.value)}
                      className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <option value="">Sem categoria</option>
                      {activeIncomeCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {sourcePaymentMethods.length > 0 && (
                  <section className="grid gap-3" aria-labelledby="payment-mapping-title">
                    <h3 id="payment-mapping-title" className="text-sm font-semibold">
                      Formas de pagamento
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {sourcePaymentMethods.map((name, index) => (
                        <div key={name} className="grid gap-2">
                          <label htmlFor={`import-payment-${index}`} className="text-sm">
                            {name}
                          </label>
                          <Select
                            id={`import-payment-${index}`}
                            value={paymentMappings[name] ?? ''}
                            onChange={(event) => setPaymentMappings((current) => ({ ...current, [name]: event.target.value }))}
                            className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <option value="">Não associar</option>
                            {paymentMethods
                              .filter((method) => !method.archived_at)
                              .map((method) => (
                                <option key={method.id} value={method.id}>
                                  {method.name}
                                </option>
                              ))}
                          </Select>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <caption className="sr-only">Prévia dos lançamentos importáveis</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2.5">
                          Descrição
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Tipo
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Competência
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Vencimento
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right">
                          Previsto
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.entries.map((entry) => (
                        <tr key={entry.id} className="border-t border-border align-top">
                          <th scope="row" className="px-3 py-3 font-medium">
                            {entry.description}
                            {entry.warning && (
                              <span className="mt-1 block max-w-xs text-xs font-normal text-warning" role="note">
                                {entry.warning}
                              </span>
                            )}
                          </th>
                          <td className="whitespace-nowrap px-3 py-3">
                            {
                              kindLabels[
                                entry.sourceCategory
                                  ? effectiveMapping(entry.sourceCategory, categoryMappings, categories).kind
                                  : entry.kind
                              ]
                            }
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">{formatBrazilianDate(entry.competenceOn)}</td>
                          <td className="whitespace-nowrap px-3 py-3">{formatBrazilianDate(entry.dueOn)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            <MoneyValue cents={entry.plannedCents} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {preview.skipped.length > 0 && (
                  <details className="rounded-xl border border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Linhas ignoradas ({preview.skipped.length})</summary>
                    <ul className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      {preview.skipped.map((row) => (
                        <li key={`${row.sourceSheet}:${row.sourceRow}`}>
                          <span className="font-medium text-foreground">
                            {row.sourceSheet}, linha {row.sourceRow}
                            {row.description ? ` — ${row.description}` : ''}:
                          </span>{' '}
                          {row.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {dateWarnings.length > 0 && (
                  <Checkbox
                    className="rounded-xl border border-warning-border bg-warning-surface p-3 text-warning"
                    checked={confirmedDateReview}
                    onChange={(event) => setConfirmedDateReview(event.target.checked)}
                  >
                    Revisei as {dateWarnings.length} datas sinalizadas e confirmo o ano e a interpretação mostrados na prévia.
                  </Checkbox>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    disabled={!preview.entries.length || busy || (dateWarnings.length > 0 && !confirmedDateReview)}
                    onClick={() => setConfirming(true)}
                  >
                    Revisar e confirmar {preview.entries.length} lançamentos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPreview(null);
                      setConfirmedDateReview(false);
                    }}
                  >
                    Cancelar prévia
                  </Button>
                </div>
              </CardContent>
            </Card>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Nenhuma linha é gravada nesta etapa. A confirmação envia somente os lançamentos mostrados e válidos.
            </p>
          </>
        )}

        <AlertDialog
          open={Boolean(confirming && preview)}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirming(false);
          }}
        >
          {confirming && preview && (
            <AlertDialogContent
              title="Confirmar importação"
              description={`Serão criados ${preview.entries.length} lançamentos neste espaço. O banco verifica referências e registra o lote em uma única transação. Um lote idêntico não pode ser importado duas vezes.`}
              cancelLabel="Voltar à revisão"
              confirmLabel={busy ? 'Importando…' : 'Confirmar e importar'}
              busy={busy}
              focusConfirm
              onConfirm={() => void submitImport()}
            />
          )}
        </AlertDialog>
      </div>
    </>
  );
}
