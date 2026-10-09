import { useCallback, useContext, useEffect, useState, type FormEvent } from 'react';
import { Archive, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';
import { Select } from '../components/ui/form-controls';
import { Alert } from '../components/ui/alert';
import { EmptyState } from '../components/ui/feedback';
import { TextSkeleton } from '../components/ui/skeleton';
import { toast } from '../components/ui/toast-store';

type CategoryKind = 'income' | 'expense' | 'investment';
type ExpenseClass = 'fixed' | 'variable';
type Category = { id: string; name: string; kind: CategoryKind; expense_class: ExpenseClass | null; archived_at: string | null };
type PaymentMethod = { id: string; name: string; archived_at: string | null };

const kindLabels: Record<CategoryKind, string> = { income: 'Receita', expense: 'Despesa', investment: 'Aporte' };
const classLabels: Record<ExpenseClass, string> = { fixed: 'Fixa', variable: 'Variável' };

async function readResponse(response: Response) {
  if (response.status === 204) return {};
  return response.json() as Promise<{
    error?: string;
    categories?: Category[];
    category?: Category;
    paymentMethods?: PaymentMethod[];
    paymentMethod?: PaymentMethod;
  }>;
}

export function CatalogSettings() {
  const auth = useContext(AuthContext);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryKind, setCategoryKind] = useState<CategoryKind>('expense');
  const [expenseClass, setExpenseClass] = useState<ExpenseClass>('fixed');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [paymentName, setPaymentName] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [categoryResponse, paymentResponse] = await Promise.all([
      fetch('/api/catalog/categories?includeArchived=true', { credentials: 'same-origin' }),
      fetch('/api/catalog/payment-methods?includeArchived=true', { credentials: 'same-origin' }),
    ]);
    if (!categoryResponse.ok || !paymentResponse.ok) throw new Error('Não foi possível carregar os cadastros compartilhados.');
    const [categoryResult, paymentResult] = await Promise.all([readResponse(categoryResponse), readResponse(paymentResponse)]);
    setCategories(categoryResult.categories ?? []);
    setPaymentMethods(paymentResult.paymentMethods ?? []);
  }, []);

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os cadastros.'));
  }, [load]);

  async function save(path: string, method: 'POST' | 'PUT', body?: Record<string, string | null>) {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': auth?.csrfToken ?? '', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await readResponse(response);
    if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar o cadastro.');
    return result;
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await save(
        editingCategoryId ? `/api/catalog/categories/${editingCategoryId}` : '/api/catalog/categories',
        editingCategoryId ? 'PUT' : 'POST',
        {
          name: categoryName,
          kind: categoryKind,
          expenseClass: categoryKind === 'expense' ? expenseClass : null,
        },
      );
      const editedCategory = editingCategoryId !== null;
      setCategoryName('');
      setCategoryKind('expense');
      setExpenseClass('fixed');
      setEditingCategoryId(null);
      await load();
      toast(editedCategory ? 'Categoria atualizada.' : 'Categoria adicionada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a categoria.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPaymentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await save(
        editingPaymentId ? `/api/catalog/payment-methods/${editingPaymentId}` : '/api/catalog/payment-methods',
        editingPaymentId ? 'PUT' : 'POST',
        { name: paymentName },
      );
      const editedMethod = editingPaymentId !== null;
      setPaymentName('');
      setEditingPaymentId(null);
      await load();
      toast(editedMethod ? 'Forma de pagamento atualizada.' : 'Forma de pagamento adicionada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a forma de pagamento.');
    } finally {
      setBusy(false);
    }
  }

  function editCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryKind(category.kind);
    setExpenseClass(category.expense_class ?? 'fixed');
  }

  function editPaymentMethod(method: PaymentMethod) {
    setEditingPaymentId(method.id);
    setPaymentName(method.name);
  }

  async function changeStatus(type: 'categories' | 'payment-methods', item: { id: string; name: string }, action: 'archive' | 'restore') {
    setError('');
    setBusy(true);
    try {
      await save(`/api/catalog/${type}/${item.id}/${action}`, 'POST');
      await load();
      const noun = type === 'categories' ? 'A categoria' : 'A forma de pagamento';
      if (action === 'restore') toast(`${noun} foi restaurada.`);
      else
        // Arquivar é reversível sem perda: o cadastro e os lançamentos antigos permanecem.
        toast(`${noun} foi arquivada.`, {
          action: { label: 'Desfazer', onClick: () => void changeStatus(type, item, 'restore') },
        });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível atualizar o cadastro.');
    } finally {
      setBusy(false);
    }
  }

  function cancelCategoryEdit() {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryKind('expense');
    setExpenseClass('fixed');
  }

  function cancelPaymentEdit() {
    setEditingPaymentId(null);
    setPaymentName('');
  }

  return (
    <section aria-label="Cadastros financeiros compartilhados" className="grid gap-4 xl:grid-cols-2">
      {error && <Alert className="xl:col-span-2">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
          <CardDescription>Receitas, despesas e aportes usados pelos dois membros do espaço.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form onSubmit={submitCategory} className="grid gap-3">
            <FormField id="category-name" label="Nome da categoria">
              <Input required maxLength={80} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="category-kind" label="Tipo">
                <Select value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as CategoryKind)}>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                  <option value="investment">Aporte</option>
                </Select>
              </FormField>
              {categoryKind === 'expense' && (
                <FormField id="expense-class" label="Classificação">
                  <Select value={expenseClass} onChange={(event) => setExpenseClass(event.target.value as ExpenseClass)}>
                    <option value="fixed">Fixa</option>
                    <option value="variable">Variável</option>
                  </Select>
                </FormField>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {editingCategoryId ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
                {editingCategoryId ? 'Salvar categoria' : 'Adicionar categoria'}
              </Button>
              {editingCategoryId && (
                <Button type="button" variant="outline" disabled={busy} onClick={cancelCategoryEdit}>
                  <X aria-hidden="true" className="size-4" />
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
          <div className="grid gap-1" aria-label="Lista de categorias">
            {categories === null ? (
              <TextSkeleton label="Carregando categorias" />
            ) : categories.length ? (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border py-3 first:border-0 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{category.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {kindLabels[category.kind]}
                      {category.expense_class ? ` · ${classLabels[category.expense_class]}` : ''}
                    </p>
                  </div>
                  {category.archived_at ? (
                    <>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Arquivada</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Restaurar categoria ${category.name}`}
                        onClick={() => void changeStatus('categories', category, 'restore')}
                      >
                        <RotateCcw aria-hidden="true" className="size-4" />
                        Restaurar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Editar categoria ${category.name}`}
                        onClick={() => editCategory(category)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Arquivar categoria ${category.name}`}
                        onClick={() => void changeStatus('categories', category, 'archive')}
                      >
                        <Archive aria-hidden="true" className="size-4" />
                        Arquivar
                      </Button>
                    </>
                  )}
                </div>
              ))
            ) : (
              <EmptyState
                compact
                title="Nenhuma categoria cadastrada"
                description="Use o formulário acima para criar a primeira categoria de receita, despesa ou aporte."
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formas de pagamento</CardTitle>
          <CardDescription>Cadastros compartilhados disponíveis para lançamentos novos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form onSubmit={submitPaymentMethod} className="grid gap-3">
            <FormField id="payment-method-name" label="Nome da forma de pagamento">
              <Input required maxLength={80} value={paymentName} onChange={(event) => setPaymentName(event.target.value)} />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {editingPaymentId ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
                {editingPaymentId ? 'Salvar forma' : 'Adicionar forma'}
              </Button>
              {editingPaymentId && (
                <Button type="button" variant="outline" disabled={busy} onClick={cancelPaymentEdit}>
                  <X aria-hidden="true" className="size-4" />
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
          <div className="grid gap-1" aria-label="Lista de formas de pagamento">
            {paymentMethods === null ? (
              <TextSkeleton label="Carregando formas de pagamento" />
            ) : paymentMethods.length ? (
              paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border py-3 first:border-0 first:pt-0"
                >
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{method.name}</p>
                  {method.archived_at ? (
                    <>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Arquivada</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Restaurar forma de pagamento ${method.name}`}
                        onClick={() => void changeStatus('payment-methods', method, 'restore')}
                      >
                        <RotateCcw aria-hidden="true" className="size-4" />
                        Restaurar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Editar forma de pagamento ${method.name}`}
                        onClick={() => editPaymentMethod(method)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Arquivar forma de pagamento ${method.name}`}
                        onClick={() => void changeStatus('payment-methods', method, 'archive')}
                      >
                        <Archive aria-hidden="true" className="size-4" />
                        Arquivar
                      </Button>
                    </>
                  )}
                </div>
              ))
            ) : (
              <EmptyState
                compact
                title="Nenhuma forma de pagamento cadastrada"
                description="Use o formulário acima para cadastrar, por exemplo, Pix ou dinheiro."
              />
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
