import { useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CreditCard, Pencil, Plus, X } from 'lucide-react';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';
import { LoadingState } from '../components/ui/feedback';
import { currentSaoPauloDate, formatBrazilianDate, formatBrazilianMonth, parseBrazilianCents } from '../lib/finance';
import { creditCardCycleDate } from '../lib/credit-card-cycle';
import { installmentAmounts, invoiceMonthForInstallment, nextInvoiceMonth } from '../lib/card-purchase-cycle';
import { isNetworkFailure, useOfflineWorkspace } from '../offline/offline-context';
import type { OfflineCard, OfflineCategory, OfflinePurchase, OfflinePurchaseInstallment } from '../offline/offline-store';
import { PageHeader } from './page-header';
import { MoneyValue } from '../components/ui/money-value';

type CategoriesResponse = { categories?: OfflineCategory[] };
type CardsResponse = { cards?: OfflineCard[]; error?: string };
type PurchasesResponse = { purchases?: OfflinePurchase[]; error?: string };

function statusLabel(status: OfflinePurchaseInstallment['status']) {
  return status === 'paid' ? 'Paga' : status === 'late' ? 'Atrasada' : 'Em aberto';
}

function makeInstallment(number: number, count: number, plannedCents: number, invoiceOn: string, dueDay: number, categoryId: string, categoryName: string, userId: string): OfflinePurchaseInstallment {
  const dueOn = creditCardCycleDate(invoiceOn.slice(0, 7), dueDay);
  const today = currentSaoPauloDate();
  return {
    id: crypto.randomUUID(), description: `${categoryName || 'Compra'} ${number}/${count}`,
    category_id: categoryId, category_name: categoryName, invoice_on: invoiceOn, due_on: dueOn,
    planned_cents: String(plannedCents), actual_cents: null, realized_on: null,
    created_by_user_id: userId, updated_by_user_id: userId, version: 1,
    installment_number: number, installment_count: count, status: dueOn < today ? 'late' : 'pending',
  };
}

function toPayload(purchase: OfflinePurchase) {
  return {
    purchase: {
      cardId: purchase.card_id, categoryId: purchase.category_id, description: purchase.description,
      purchaseOn: purchase.purchase_on, firstInvoiceOn: purchase.first_invoice_on,
      totalCents: Number(purchase.total_cents), installmentCount: purchase.installment_count,
    },
    installments: purchase.installments.map((installment) => ({
      id: installment.id, installmentNumber: installment.installment_number,
      plannedCents: Number(installment.planned_cents), invoiceOn: installment.invoice_on,
    })),
  };
}

export function CardPurchasesPage() {
  const auth = useContext(AuthContext);
  const offline = useOfflineWorkspace();
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const [purchases, setPurchases] = useState<OfflinePurchase[]>([]);
  const [cards, setCards] = useState<OfflineCard[]>([]);
  const [categories, setCategories] = useState<OfflineCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingPurchaseId, setEditingPurchaseId] = useState('');
  const [editingInstallmentId, setEditingInstallmentId] = useState('');
  const [cardId, setCardId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [purchaseOn, setPurchaseOn] = useState(() => currentSaoPauloDate());
  const [amount, setAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [firstInvoiceMonth, setFirstInvoiceMonth] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const current = offlineRef.current;
    if (current && (!current.online || (typeof navigator !== 'undefined' && !navigator.onLine))) {
      const snapshot = await current.refresh();
      setPurchases(snapshot.purchases);
      setCards(snapshot.cards);
      setCategories(snapshot.categories.filter((category) => category.kind === 'expense' && !category.archived_at));
      setLoading(false);
      if (!snapshot.purchases.length && !snapshot.cards.length) setNotice('Conecte-se uma vez para carregar cartões, categorias e compras neste aparelho.');
      return;
    }
    try {
      const [purchaseResponse, cardResponse, categoryResponse] = await Promise.all([
        fetch('/api/purchases', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/cards?includeArchived=true', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/catalog/categories', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      const [purchaseResult, cardResult, categoryResult] = await Promise.all([
        purchaseResponse.json() as Promise<PurchasesResponse>,
        cardResponse.json() as Promise<CardsResponse>,
        categoryResponse.json() as Promise<CategoriesResponse>,
      ]);
      if (!purchaseResponse.ok || !cardResponse.ok || !categoryResponse.ok) throw new Error(purchaseResult.error ?? cardResult.error ?? 'Não foi possível carregar as compras de cartão.');
      const loadedPurchases = purchaseResult.purchases ?? [];
      const loadedCards = cardResult.cards ?? [];
      const loadedCategories = categoryResult.categories ?? [];
      setPurchases(loadedPurchases);
      setCards(loadedCards);
      setCategories(loadedCategories.filter((category) => category.kind === 'expense'));
      await current?.cachePurchases(loadedPurchases);
      await current?.cacheCards(loadedCards, current.cardMembers);
      await current?.cacheCatalogs(loadedCategories, current.paymentMethods);
      current?.setOnline(true);
      setNotice('');
    } catch (loadError) {
      if (current?.supported && isNetworkFailure(loadError, current.online)) {
        current.setOnline(false);
        const snapshot = await current.refresh();
        setPurchases(snapshot.purchases);
        setCards(snapshot.cards);
        setCategories(snapshot.categories.filter((category) => category.kind === 'expense' && !category.archived_at));
        if (!snapshot.purchases.length && !snapshot.cards.length) setNotice('Ainda não há compras salvas neste aparelho. Conecte-se para carregá-las.');
      } else setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as compras de cartão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, offline?.online, offline?.ready, offline?.pendingCount]);
  useEffect(() => {
    if (!offline) return;
    setPurchases(offline.purchases);
    if (offline.cards.length) setCards(offline.cards);
    if (offline.categories.length) setCategories(offline.categories.filter((category) => category.kind === 'expense' && !category.archived_at));
  }, [offline?.purchases, offline?.cards, offline?.categories]);

  const activeCards = useMemo(() => cards.filter((card) => !card.archived_at), [cards]);
  const activeCategories = useMemo(() => categories.filter((category) => !category.archived_at), [categories]);
  const purchaseBeingEdited = purchases.find((purchase) => purchase.id === editingPurchaseId) ?? null;
  const installmentBeingEdited = purchaseBeingEdited?.installments.find((installment) => installment.id === editingInstallmentId) ?? null;
  const selectedCard = cards.find((card) => card.id === cardId);
  const suggestedFirstInvoice = selectedCard && purchaseOn ? nextInvoiceMonth(purchaseOn, selectedCard.closing_day, selectedCard.due_day) : '';
  const resolvedFirstInvoice = firstInvoiceMonth ? `${firstInvoiceMonth}-01` : suggestedFirstInvoice;

  function clearForm() {
    setEditingPurchaseId('');
    setEditingInstallmentId('');
    setCardId('');
    setCategoryId('');
    setDescription('');
    setPurchaseOn(currentSaoPauloDate());
    setAmount('');
    setInstallmentCount('1');
    setFirstInvoiceMonth('');
  }

  function editSeries(purchase: OfflinePurchase) {
    setEditingPurchaseId(purchase.id);
    setEditingInstallmentId('');
    setCardId(purchase.card_id);
    setCategoryId(purchase.category_id);
    setDescription(purchase.description);
    setPurchaseOn(purchase.purchase_on);
    setAmount((Number(purchase.total_cents) / 100).toFixed(2).replace('.', ','));
    setInstallmentCount(String(purchase.installment_count));
    setFirstInvoiceMonth((purchase.installments.find((item) => item.installment_number === 1)?.invoice_on ?? purchase.first_invoice_on).slice(0, 7));
    setError('');
    setNotice('Edite a série: parcelas já pagas serão preservadas.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editInstallment(purchase: OfflinePurchase, installment: OfflinePurchaseInstallment) {
    setEditingPurchaseId(purchase.id);
    setEditingInstallmentId(installment.id);
    setCardId(purchase.card_id);
    setCategoryId(purchase.category_id);
    setDescription(purchase.description);
    setPurchaseOn(purchase.purchase_on);
    setAmount((Number(installment.planned_cents) / 100).toFixed(2).replace('.', ','));
    setInstallmentCount(String(purchase.installment_count));
    setFirstInvoiceMonth(installment.invoice_on.slice(0, 7));
    setError('');
    setNotice(`Ajuste a parcela ${installment.installment_number}; parcelas pagas não podem ser alteradas.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function persistPurchase(purchase: OfflinePurchase, kind: 'create' | 'update', payload: Record<string, unknown>) {
    if (!offline?.supported) throw new Error(offline?.storageError || 'O armazenamento offline não está disponível neste navegador.');
    await offline.queuePurchaseChange(purchase, kind, payload);
    setPurchases((current) => current.some((item) => item.id === purchase.id)
      ? current.map((item) => item.id === purchase.id ? purchase : item)
      : [purchase, ...current]);
    if (offline.online && (typeof navigator === 'undefined' || navigator.onLine) && auth?.csrfToken) {
      await offline.sync(auth.csrfToken);
      await load();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!auth?.user.id) { setError('Não foi possível identificar o usuário autenticado.'); return; }
    const existingPurchase = purchaseBeingEdited;
    if (!cardId || (!activeCards.some((card) => card.id === cardId) && existingPurchase?.card_id !== cardId)) { setError('Selecione um cartão ativo deste espaço.'); return; }
    if (!categoryId || (!activeCategories.some((category) => category.id === categoryId) && existingPurchase?.category_id !== categoryId)) { setError('Selecione uma categoria de despesa ativa.'); return; }
    const totalCents = parseBrazilianCents(amount);
    if (totalCents === null) { setError('Informe um valor em reais com até duas casas decimais.'); return; }
    const card = cards.find((item) => item.id === cardId)!;
    const category = categories.find((item) => item.id === categoryId) ?? (existingPurchase?.category_id === categoryId ? { id: existingPurchase.category_id, name: existingPurchase.category_name, kind: 'expense' as const, expense_class: null, archived_at: 'archived' } : undefined);
    if (!card || !category) { setError('O cartão ou a categoria desta compra não está disponível neste aparelho.'); return; }
    const count = Number(installmentCount);
    const purchase = purchaseBeingEdited;

    if (editingInstallmentId && purchase && installmentBeingEdited) {
      const invoiceOn = `${firstInvoiceMonth}-01`;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstInvoiceMonth) || invoiceOn.slice(0, 7) < purchase.purchase_on.slice(0, 7)) {
        setError('A fatura da parcela deve ser igual ou posterior ao mês da compra.'); return;
      }
      const installments = purchase.installments.map((item) => item.id === installmentBeingEdited.id
        ? { ...item, planned_cents: String(totalCents), invoice_on: invoiceOn, due_on: creditCardCycleDate(firstInvoiceMonth, card.due_day), updated_by_user_id: auth.user.id, version: item.version + 1 }
        : item);
      const updated: OfflinePurchase = { ...purchase, first_invoice_on: installmentBeingEdited.installment_number === 1 ? invoiceOn : purchase.first_invoice_on, total_cents: installments.reduce((sum, item) => sum + BigInt(item.planned_cents), 0n).toString(), updated_by_user_id: auth.user.id, version: purchase.version + 1, installments };
      setBusy(true);
      try { await persistPurchase(updated, 'update', toPayload(updated)); clearForm(); setNotice('A parcela foi salva e sincronizada quando houver conexão.'); }
      catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a parcela.'); }
      finally { setBusy(false); }
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseOn) || Number.isNaN(Date.parse(`${purchaseOn}T00:00:00Z`))) { setError('Informe uma data de compra válida.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 120 || totalCents < count) { setError('Informe de 1 a 120 parcelas e um valor com ao menos R$ 0,01 por parcela.'); return; }
    const firstInvoiceOn = resolvedFirstInvoice;
    if (!firstInvoiceOn || firstInvoiceOn.slice(0, 7) < purchaseOn.slice(0, 7)) { setError('A primeira fatura deve ser igual ou posterior ao mês da compra.'); return; }
    const installments = installmentAmounts(totalCents, count);
    if (!installments) { setError('O valor não pode ser dividido na quantidade informada.'); return; }

    let saved: OfflinePurchase;
    let kind: 'create' | 'update';
    if (purchase) {
      const paid = purchase.installments.filter((item) => item.actual_cents !== null);
      const highestPaidNumber = Math.max(0, ...paid.map((item) => item.installment_number));
      const paidTotal = paid.reduce((sum, item) => sum + BigInt(item.planned_cents), 0n);
      if (count < highestPaidNumber || BigInt(totalCents) < paidTotal) { setError('A edição não pode remover parcelas pagas nem reduzir o total abaixo do que já foi pago.'); return; }
      const futureNumbers = Array.from({ length: count }, (_value, index) => index + 1).filter((number) => !paid.some((item) => item.installment_number === number));
      const futureAmounts = futureNumbers.length === 0 && BigInt(totalCents) === paidTotal
        ? []
        : installmentAmounts(totalCents - Number(paidTotal), futureNumbers.length);
      if (!futureAmounts) { setError('O valor restante precisa cobrir todas as parcelas ainda não pagas.'); return; }
      const updatedInstallments = Array.from({ length: count }, (_value, index) => {
        const number = index + 1;
        const paidInstallment = paid.find((item) => item.installment_number === number);
        if (paidInstallment) return paidInstallment;
        const previous = purchase.installments.find((item) => item.installment_number === number);
        const invoiceOn = invoiceMonthForInstallment(firstInvoiceOn, number);
        const cents = futureAmounts[futureNumbers.indexOf(number)]!;
        const created = makeInstallment(number, count, cents, invoiceOn, card.due_day, categoryId, category.name, auth.user.id);
        return {
          ...created,
          id: previous?.id ?? created.id,
          description: `${description.trim()} (${number}/${count})`,
          category_id: categoryId,
          category_name: category.name,
          created_by_user_id: previous?.created_by_user_id ?? auth.user.id,
          version: (previous?.version ?? 0) + 1,
        };
      });
      saved = {
        ...purchase, card_id: card.id, card_name: card.name, category_id: category.id, category_name: category.name,
        description: description.trim(), purchase_on: purchaseOn, first_invoice_on: firstInvoiceOn,
        total_cents: String(totalCents), installment_count: count, updated_by_user_id: auth.user.id,
        version: purchase.version + 1, installments: updatedInstallments,
      };
      kind = 'update';
    } else {
      const id = crypto.randomUUID();
      const createdInstallments = installments.map((cents, index) => ({
        ...makeInstallment(index + 1, count, cents, invoiceMonthForInstallment(firstInvoiceOn, index + 1), card.due_day, categoryId, category.name, auth.user.id),
        description: `${description.trim()} (${index + 1}/${count})`,
      }));
      saved = {
        id, card_id: card.id, card_name: card.name, category_id: category.id, category_name: category.name,
        description: description.trim(), purchase_on: purchaseOn, first_invoice_on: firstInvoiceOn,
        total_cents: String(totalCents), installment_count: count, canceled_at: null,
        created_by_user_id: auth.user.id, updated_by_user_id: auth.user.id, version: 1,
        installments: createdInstallments,
      };
      kind = 'create';
    }
    setBusy(true);
    try {
      await persistPurchase(saved, kind, toPayload(saved));
      clearForm();
      setNotice('Compra salva. As parcelas já aparecem nos lançamentos e serão sincronizadas quando houver conexão.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a compra.'); }
    finally { setBusy(false); }
  }

  async function cancelPurchase(purchase: OfflinePurchase) {
    if (!window.confirm(`Cancelar “${purchase.description}”? Apenas parcelas ainda não pagas serão removidas.`)) return;
    if (!offline?.supported) { setError(offline?.storageError || 'O armazenamento offline não está disponível.'); return; }
    setBusy(true);
    setError('');
    try {
      await offline.queuePurchaseDelete(purchase);
      await offline.refresh();
      if (offline.online && (typeof navigator === 'undefined' || navigator.onLine) && auth?.csrfToken) {
        await offline.sync(auth.csrfToken);
        await load();
      }
      setNotice('Compra cancelada; as parcelas pagas foram mantidas.');
    } catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : 'Não foi possível cancelar a compra.'); }
    finally { setBusy(false); }
  }

  const editingInstallment = Boolean(editingInstallmentId);
  return <>
    <PageHeader eyebrow="Cartões" title="Compras parceladas" description="Planeje as parcelas nas faturas e acompanhe as despesas no espaço compartilhado." action={!editingPurchaseId ? <Button type="button" onClick={() => { setEditingPurchaseId('new'); setNotice(''); setError(''); }}><Plus aria-hidden="true" className="size-4" />Nova compra</Button> : undefined} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{notice}</p>}
    {offline?.storageError && !offline.supported && <p role="alert" className="mb-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{offline.storageError}</p>}

    {editingPurchaseId && <Card className="mb-5">
      <CardHeader><CardTitle>{editingInstallment ? `Editar parcela ${installmentBeingEdited?.installment_number ?? ''}` : purchaseBeingEdited ? 'Editar série da compra' : 'Nova compra'}</CardTitle><CardDescription>{editingInstallment ? 'Altere o valor ou a fatura desta parcela futura.' : 'As parcelas são criadas como despesas; o valor total será dividido exatamente em centavos.'}</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
          {!editingInstallment && <>
            <div className="grid gap-2"><label htmlFor="purchase-card" className="text-sm font-medium">Cartão</label><select id="purchase-card" className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm" required value={cardId} onChange={(event) => { setCardId(event.target.value); setFirstInvoiceMonth(''); }}><option value="">Selecione o cartão</option>{cards.filter((item) => !item.archived_at || purchaseBeingEdited?.card_id === item.id).map((item) => <option key={item.id} value={item.id}>{item.name} · vence dia {item.due_day}{item.archived_at ? ' (arquivado)' : ''}</option>)}</select></div>
            <div className="grid gap-2"><label htmlFor="purchase-category" className="text-sm font-medium">Categoria de despesa</label><select id="purchase-category" className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Selecione a categoria</option>{categories.filter((item) => !item.archived_at || purchaseBeingEdited?.category_id === item.id).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived_at ? ' (arquivada)' : ''}</option>)}{purchaseBeingEdited && !categories.some((item) => item.id === purchaseBeingEdited.category_id) && <option value={purchaseBeingEdited.category_id}>{purchaseBeingEdited.category_name} (arquivada)</option>}</select></div>
            <FormField id="purchase-description" label="Descrição"><Input required maxLength={200} autoComplete="off" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Eletrodoméstico" /></FormField>
            <FormField id="purchase-date" label="Data da compra"><Input required type="date" value={purchaseOn} onChange={(event) => { setPurchaseOn(event.target.value); setFirstInvoiceMonth(''); }} /></FormField>
          </>}
          <FormField id="purchase-amount" label={editingInstallment ? 'Valor da parcela (R$)' : 'Valor total (R$)'}><Input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></FormField>
          {!editingInstallment && <FormField id="purchase-count" label="Quantidade de parcelas"><Input required type="number" min={1} max={120} step={1} value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} /></FormField>}
          <FormField id="purchase-invoice-month" label={editingInstallment ? 'Fatura da parcela' : 'Primeira fatura'} hint={!editingInstallment && suggestedFirstInvoice ? `Sugestão pelo fechamento: ${formatBrazilianMonth(suggestedFirstInvoice)}. Você pode corrigir.` : undefined}><Input required type="month" value={firstInvoiceMonth || (editingInstallment ? '' : suggestedFirstInvoice.slice(0, 7))} onChange={(event) => setFirstInvoiceMonth(event.target.value)} /></FormField>
          {!editingInstallment && resolvedFirstInvoice && <p className="text-sm text-muted-foreground sm:col-span-2">{Number(installmentCount) > 1 ? `As parcelas serão distribuídas de ${formatBrazilianMonth(resolvedFirstInvoice)} em diante.` : `A despesa será prevista para ${formatBrazilianMonth(resolvedFirstInvoice)}.`}</p>}
          {purchaseBeingEdited && !editingInstallment && <p className="text-xs text-muted-foreground sm:col-span-2">Parcelas pagas: {purchaseBeingEdited.installments.filter((item) => item.actual_cents !== null).length}. Elas manterão valor, fatura e categoria atuais.</p>}
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy || !offline?.ready}>{busy ? 'Salvando…' : 'Salvar compra'}</Button><Button type="button" variant="outline" onClick={clearForm}>Cancelar</Button></div>
        </form>
      </CardContent>
    </Card>}

    <Card>
      <CardHeader><CardTitle>Compras</CardTitle><CardDescription>{loading ? 'Carregando compras…' : `${purchases.filter((purchase) => !purchase.canceled_at).length} compras ativas`}</CardDescription></CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Carregando compras de cartão" /> : purchases.length === 0 ? <div className="grid justify-items-center gap-3 py-8 text-center"><CreditCard aria-hidden="true" className="size-8 text-muted-foreground" /><p className="font-medium">Nenhuma compra de cartão registrada</p><p className="max-w-md text-sm text-muted-foreground">Cadastre uma compra à vista ou parcelada. Cada parcela será incluída uma única vez nos lançamentos.</p><Button type="button" onClick={() => { setEditingPurchaseId('new'); setNotice(''); }}><Plus aria-hidden="true" className="size-4" />Nova compra</Button></div> : <ul className="divide-y divide-border">{purchases.map((purchase) => {
          const paidCount = purchase.installments.filter((item) => item.actual_cents !== null).length;
          const pendingOperation = offline?.purchaseOperations.find((operation) => operation.purchaseId === purchase.id);
          return <li key={purchase.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><CreditCard aria-hidden="true" className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{purchase.description}{purchase.canceled_at ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Cancelada</span> : null}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{purchase.card_name} · {purchase.category_name} · Compra em {formatBrazilianDate(purchase.purchase_on)}{pendingOperation ? ' · Pendente neste aparelho' : ''}</p></div><div className="grid justify-items-end gap-1"><p className="font-semibold tabular-nums"><MoneyValue cents={purchase.total_cents} /></p><p className="text-xs text-muted-foreground">{purchase.installment_count} {purchase.installment_count === 1 ? 'parcela' : 'parcelas'} · {paidCount} pagas</p></div></div>
            <div className="mt-3 flex flex-wrap justify-end gap-1">{!purchase.canceled_at && <><Button type="button" size="sm" variant="ghost" disabled={busy || Boolean(pendingOperation?.conflict)} onClick={() => editSeries(purchase)}><Pencil aria-hidden="true" className="size-4" />Editar série</Button>{purchase.installments.some((item) => item.actual_cents === null) && <Button type="button" size="sm" variant="ghost" disabled={busy || Boolean(pendingOperation?.conflict)} onClick={() => void cancelPurchase(purchase)}><X aria-hidden="true" className="size-4" />Cancelar compra</Button>}</>}</div>
            <details className="mt-2 rounded-xl bg-muted/40 px-3.5 py-2.5"><summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Ver parcelas</summary><ul className="mt-2 grid gap-2">{purchase.installments.map((installment) => <li key={installment.id} className="flex flex-wrap items-center gap-2 border-t border-border/70 py-2 first:border-0"><span className="min-w-0 flex-1 text-sm">Parcela {installment.installment_number}/{installment.installment_count} · fatura {formatBrazilianMonth(installment.invoice_on)} · vence {formatBrazilianDate(installment.due_on)}</span><span className="text-sm font-medium tabular-nums"><MoneyValue cents={installment.planned_cents} /></span><span className="rounded-full bg-card px-2 py-1 text-xs">{statusLabel(installment.status)}</span>{!purchase.canceled_at && installment.actual_cents === null && <Button type="button" size="sm" variant="ghost" disabled={busy || Boolean(pendingOperation?.conflict)} aria-label={`Editar parcela ${installment.installment_number} de ${purchase.description}`} onClick={() => editInstallment(purchase, installment)}><Pencil aria-hidden="true" className="size-4" />Editar</Button>}</li>)}</ul></details>
          </li>;
        })}</ul>}
      </CardContent>
    </Card>
  </>;
}
