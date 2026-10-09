import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CircleCheck, CreditCard, RotateCcw } from 'lucide-react';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState, LoadingState } from '../components/ui/feedback';
import { FormField } from '../components/ui/input';
import {
  currentBrazilianDate,
  currentMonthInputValue,
  formatBrazilianAmount,
  formatBrazilianDate,
  formatBrazilianMonth,
  parseBrazilianCents,
  parseBrazilianDate,
} from '../lib/finance';
import { isAuthenticationFailure, isNetworkFailure, useOfflineWorkspace } from '../offline/offline-context';
import type { OfflineInvoice, OfflinePaymentMethod } from '../offline/offline-store';
import { PageHeader } from './page-header';
import { MoneyValue } from '../components/ui/money-value';
import { Select, DateField, MoneyInput } from '../components/ui/form-controls';
import { AlertDialog, AlertDialogContent, Dialog, DialogContent, DialogFooter, DialogHeader } from '../components/ui/dialog';
import { Alert } from '../components/ui/alert';
import { toast } from '../components/ui/toast';
import { ActionToolbar } from '../components/finance/action-toolbar';
import { EntryAmount, EntryList, EntryRow } from '../components/finance/entry-row';
import { MonthNavigator } from '../components/finance/month-navigator';

type ApiResponse = { error?: string; invoices?: OfflineInvoice[]; paymentMethods?: OfflinePaymentMethod[] };
type InvoiceResponse = { error?: string; invoices?: OfflineInvoice[] };

function invoiceStatusLabel(invoice: OfflineInvoice) {
  if (invoice.status === 'paid') return 'Quitada';
  if (invoice.status === 'needs_review') return 'Revisar quitação';
  if (invoice.status === 'late') return 'Em atraso';
  return 'Em aberto';
}

function statusStyle(status: OfflineInvoice['status']) {
  return status === 'paid'
    ? 'bg-success-soft text-success'
    : status === 'needs_review'
      ? 'bg-warning-soft text-warning'
      : status === 'late'
        ? 'bg-destructive-soft text-destructive'
        : 'bg-muted text-muted-foreground';
}

export function InvoicesPage() {
  const auth = useContext(AuthContext);
  const offline = useOfflineWorkspace();
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const [month, setMonth] = useState(currentMonthInputValue());
  const [invoices, setInvoices] = useState<OfflineInvoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<OfflinePaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<OfflineInvoice | null>(null);
  const [reversalInvoice, setReversalInvoice] = useState<OfflineInvoice | null>(null);
  const triggerFocusRef = useRef<HTMLElement | null>(null);
  function restoreTriggerFocus(event: Event) {
    if (!triggerFocusRef.current) return;
    event.preventDefault();
    triggerFocusRef.current.focus();
    triggerFocusRef.current = null;
  }
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(currentBrazilianDate());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedMonthRef = useRef(month);
  selectedMonthRef.current = month;
  const loadInvoices = useCallback(async () => {
    // Uma resposta lenta de outro mês não pode substituir as faturas do mês atual.
    const superseded = () => selectedMonthRef.current !== month;
    const currentOffline = offlineRef.current;
    setLoading(true);
    setError('');
    if (currentOffline && !currentOffline.ready) return;
    if (currentOffline && !currentOffline.online) {
      const snapshot = await currentOffline.refresh();
      if (superseded()) return;
      setInvoices(snapshot.invoices.filter((invoice) => invoice.invoice_month.startsWith(month)));
      setPaymentMethods(snapshot.paymentMethods);
      if (!snapshot.invoices.some((invoice) => invoice.invoice_month.startsWith(month))) {
        setError('Este mês de faturas ainda não foi carregado neste aparelho. Conecte-se uma vez para consultar os dados.');
      }
      setLoading(false);
      return;
    }
    try {
      const [invoiceResponse, methodsResponse] = await Promise.all([
        fetch('/api/invoices', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/catalog/payment-methods', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      const [invoiceResult, methodsResult] = await Promise.all([
        invoiceResponse.json() as Promise<InvoiceResponse>,
        methodsResponse.json() as Promise<ApiResponse>,
      ]);
      if (superseded()) return;
      if (!invoiceResponse.ok || !methodsResponse.ok) {
        if (currentOffline && (isAuthenticationFailure(invoiceResponse) || isAuthenticationFailure(methodsResponse)))
          currentOffline.invalidateSession();
        throw new Error(invoiceResult.error ?? methodsResult.error ?? 'Não foi possível carregar as faturas.');
      }
      const loadedInvoices = invoiceResult.invoices ?? [];
      const loadedMethods = methodsResult.paymentMethods ?? [];
      await currentOffline?.cacheInvoices(loadedInvoices);
      await currentOffline?.cacheCatalogs(currentOffline.categories, loadedMethods);
      if (superseded()) return;
      if (currentOffline) {
        currentOffline.setOnline(true);
        const snapshot = await currentOffline.refresh();
        if (superseded()) return;
        setInvoices(snapshot.invoices.filter((invoice) => invoice.invoice_month.startsWith(month)));
        setPaymentMethods(loadedMethods);
      } else {
        setInvoices(loadedInvoices.filter((invoice) => invoice.invoice_month.startsWith(month)));
        setPaymentMethods(loadedMethods);
      }
    } catch (loadError) {
      if (currentOffline && isNetworkFailure(loadError, currentOffline.online)) {
        currentOffline.setOnline(false);
        const snapshot = await currentOffline.refresh();
        if (superseded()) return;
        setInvoices(snapshot.invoices.filter((invoice) => invoice.invoice_month.startsWith(month)));
        setPaymentMethods(snapshot.paymentMethods);
        if (!snapshot.invoices.some((invoice) => invoice.invoice_month.startsWith(month)))
          setError('Este mês de faturas ainda não foi carregado neste aparelho. Conecte-se uma vez para consultar os dados.');
      } else setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as faturas.');
    } finally {
      if (!superseded()) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices, offline?.online, offline?.pendingCount, offline?.ready]);

  const grouped = useMemo(() => {
    const result = new Map<string, OfflineInvoice[]>();
    for (const invoice of invoices) {
      const rows = result.get(invoice.card_id) ?? [];
      rows.push(invoice);
      result.set(invoice.card_id, rows);
    }
    return [...result.entries()].map(([cardId, rows]) => ({ cardId, cardName: rows[0]?.card_name ?? 'Cartão', invoices: rows }));
  }, [invoices]);

  function openPayment(invoice: OfflineInvoice) {
    setSelectedInvoice(invoice);
    setAmount(formatBrazilianAmount(invoice.planned_cents));
    setPaidOn(currentBrazilianDate());
    setPaymentMethodId('');
    setError('');
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice || !offline) return;
    const actualCents = parseBrazilianCents(amount);
    const isoPaidOn = parseBrazilianDate(paidOn);
    if (!actualCents || !isoPaidOn) {
      setError('Informe um valor positivo e uma data válida para a quitação integral.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const method = paymentMethods.find((item) => item.id === paymentMethodId);
      await offline.queueInvoiceChange(selectedInvoice, 'pay', {
        actualCents,
        paidOn: isoPaidOn,
        paymentMethodId: paymentMethodId || null,
        paymentMethodName: method?.name ?? null,
      });
      setSelectedInvoice(null);
      const snapshot = await offline.refresh();
      setInvoices(snapshot.invoices.filter((invoice) => invoice.invoice_month.startsWith(month)));
      if (offline.online && typeof navigator !== 'undefined' && navigator.onLine && auth?.csrfToken) {
        await offline.sync(auth.csrfToken);
        await loadInvoices();
        if (offline.syncError) setError(offline.syncError);
      } else toast('Quitação salva neste aparelho. Ela será sincronizada quando a conexão voltar.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a quitação.');
    } finally {
      setSaving(false);
    }
  }

  async function reversePayment(invoice: OfflineInvoice) {
    if (!offline) return;
    setSaving(true);
    setError('');
    try {
      await offline.queueInvoiceChange(invoice, 'reverse', null);
      setReversalInvoice(null);
      const snapshot = await offline.refresh();
      setInvoices(snapshot.invoices.filter((item) => item.invoice_month.startsWith(month)));
      if (offline.online && typeof navigator !== 'undefined' && navigator.onLine && auth?.csrfToken) {
        await offline.sync(auth.csrfToken);
        await loadInvoices();
        if (offline.syncError) setError(offline.syncError);
      } else toast('Estorno salvo neste aparelho. Ele será sincronizado quando a conexão voltar.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível desfazer a quitação.');
    } finally {
      setSaving(false);
    }
  }

  const heading = formatBrazilianMonth(`${month}-01`);
  return (
    <>
      <PageHeader
        eyebrow="Cartões"
        title="Faturas"
        description="Confira as parcelas previstas e registre a quitação integral de cada fatura."
        action={<MonthNavigator label="Mês de vencimento" value={month} onChange={setMonth} />}
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      {loading ? (
        <LoadingState label="Carregando faturas" />
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title={`Nenhuma fatura em ${heading}`}
              description="As faturas aparecem aqui quando houver parcelas de compras de cartão com vencimento neste mês."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5">
          {grouped.map(({ cardId, cardName, invoices: cardInvoices }) => (
            <section key={cardId} aria-labelledby={`invoice-card-${cardId}`} className="grid gap-3">
              <h2 id={`invoice-card-${cardId}`} className="flex items-center gap-2 text-lg font-semibold">
                <CreditCard aria-hidden="true" className="size-5 text-primary" />
                {cardName}
              </h2>
              {cardInvoices.map((invoice) => {
                const pendingOperation = offline?.invoiceOperations.find(
                  (item) => item.cardId === invoice.card_id && item.invoiceMonth === invoice.invoice_month.slice(0, 7),
                );
                const canPay = invoice.status !== 'paid';
                return (
                  <Card key={invoice.id}>
                    <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle>Fatura de {formatBrazilianMonth(invoice.invoice_month)}</CardTitle>
                        <CardDescription>
                          Fecha dia {invoice.closing_day} · vence em {formatBrazilianDate(invoice.due_on)} · {invoice.installment_count}{' '}
                          {invoice.installment_count === 1 ? 'parcela' : 'parcelas'}
                        </CardDescription>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(invoice.status)}`}>
                        {invoiceStatusLabel(invoice)}
                      </span>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <EntryList className="rounded-xl border border-border px-3.5">
                        {invoice.entries.map((entry) => (
                          <EntryRow
                            key={entry.id}
                            density="compact"
                            wrapTitle
                            className="first:pt-3 last:pb-3"
                            title={entry.purchase_description}
                            meta={`Parcela ${entry.installment_number}/${entry.installment_count} · ${entry.category_name ?? 'Sem categoria'}`}
                            aside={<EntryAmount cents={entry.planned_cents} />}
                          />
                        ))}
                      </EntryList>
                      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Total previsto</p>
                          <p className="text-xl font-semibold tabular-nums">
                            <MoneyValue cents={invoice.planned_cents} />
                          </p>
                          {invoice.status === 'paid' && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Quitada por <MoneyValue cents={invoice.actual_cents ?? '0'} /> em {formatBrazilianDate(invoice.paid_on)}
                            </p>
                          )}
                        </div>
                        <ActionToolbar>
                          {canPay && (
                            <Button
                              type="button"
                              disabled={saving || Boolean(pendingOperation)}
                              onClick={(event) => {
                                triggerFocusRef.current = event.currentTarget;
                                openPayment(invoice);
                              }}
                            >
                              <CircleCheck aria-hidden="true" className="size-4" />
                              {invoice.status === 'needs_review' ? 'Confirmar novamente' : 'Quitar fatura'}
                            </Button>
                          )}
                          {invoice.status === 'paid' && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={saving || Boolean(pendingOperation)}
                              onClick={(event) => {
                                triggerFocusRef.current = event.currentTarget;
                                setReversalInvoice(invoice);
                              }}
                            >
                              <RotateCcw aria-hidden="true" className="size-4" />
                              Desfazer quitação
                            </Button>
                          )}
                          {pendingOperation && (
                            <span className="self-center text-xs font-medium text-warning">
                              {pendingOperation.conflict ? 'Conflito de sincronização' : 'Pendente neste aparelho'}
                            </span>
                          )}
                        </ActionToolbar>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={Boolean(selectedInvoice)}
        onOpenChange={(open) => {
          if (!open && !saving) setSelectedInvoice(null);
        }}
      >
        {selectedInvoice && (
          <DialogContent
            onCloseAutoFocus={restoreTriggerFocus}
            onEscapeKeyDown={(event) => {
              if (saving) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (saving) event.preventDefault();
            }}
          >
            <DialogHeader
              title="Quitar fatura"
              description={
                <>
                  {selectedInvoice.card_name} · {formatBrazilianMonth(selectedInvoice.invoice_month)} · previsto{' '}
                  <MoneyValue cents={selectedInvoice.planned_cents} />.
                </>
              }
            />
            <form className="grid gap-4" onSubmit={(event) => void savePayment(event)}>
              <FormField id="invoice-actual-amount" label="Valor efetivamente pago" hint="Registre o total da quitação integral, em reais.">
                <MoneyInput required value={amount} onChange={setAmount} />
              </FormField>
              <FormField id="invoice-paid-on" label="Data do pagamento">
                <DateField required value={paidOn} onChange={setPaidOn} />
              </FormField>
              <FormField id="invoice-payment-method" label="Forma de pagamento (opcional)">
                <Select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
                  <option value="">Não definida</option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <DialogFooter className="pt-1">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setSelectedInvoice(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando…' : 'Confirmar quitação'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <AlertDialog
        open={Boolean(reversalInvoice)}
        onOpenChange={(open) => {
          if (!open && !saving) setReversalInvoice(null);
        }}
      >
        {reversalInvoice && (
          <AlertDialogContent
            title="Desfazer quitação?"
            description={
              `A fatura de ${reversalInvoice.card_name} de ${formatBrazilianMonth(reversalInvoice.invoice_month)} ` +
              'voltará a ficar em aberto. Você poderá quitar novamente depois.'
            }
            cancelLabel="Manter quitação"
            confirmLabel={saving ? 'Salvando…' : 'Confirmar estorno'}
            destructive
            busy={saving}
            onConfirm={() => void reversePayment(reversalInvoice)}
            onCloseAutoFocus={restoreTriggerFocus}
          />
        )}
      </AlertDialog>
    </>
  );
}
