import { useCallback, useContext, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, CreditCard, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { AuthContext } from '../auth/auth-gate';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FormField, Input } from '../components/ui/input';
import { isNetworkFailure, useOfflineWorkspace } from '../offline/offline-context';
import type { OfflineCard, OfflineCardMember } from '../offline/offline-store';

type MemberResponse = { members?: Array<{ id: string; name: string; is_active: boolean }> };
type CardResponse = { error?: string; cards?: OfflineCard[]; card?: OfflineCard; conflict?: boolean; serverCard?: OfflineCard };

async function readResponse(response: Response): Promise<CardResponse> {
  if (response.status === 204) return {};
  return response.json() as Promise<CardResponse>;
}

export function CardSettings() {
  const auth = useContext(AuthContext);
  const offline = useOfflineWorkspace();
  const online = offline?.online ?? (typeof navigator === 'undefined' || navigator.onLine);
  const hasOfflineWorkspace = Boolean(offline);
  const offlineSupported = offline?.supported ?? false;
  const offlineStorageError = offline?.storageError ?? '';
  const refreshOffline = offline?.refresh;
  const cacheCards = offline?.cacheCards;
  const setOfflineOnline = offline?.setOnline;
  const invalidateSession = offline?.invalidateSession;
  const [cards, setCards] = useState<OfflineCard[] | null>(null);
  const [members, setMembers] = useState<OfflineCardMember[]>([]);
  const [name, setName] = useState('');
  const [holderUserId, setHolderUserId] = useState('');
  const [closingDay, setClosingDay] = useState('25');
  const [dueDay, setDueDay] = useState('5');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    if (hasOfflineWorkspace && (!online || (typeof navigator !== 'undefined' && !navigator.onLine))) {
      const snapshot = await refreshOffline?.();
      if (snapshot) {
        setCards(snapshot.cards);
        setMembers(snapshot.cardMembers);
      }
      return;
    }
    try {
      const [cardResponse, memberResponse] = await Promise.all([
        fetch('/api/cards?includeArchived=true', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/members', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      const [cardResult, memberResult] = await Promise.all([readResponse(cardResponse), memberResponse.json() as Promise<MemberResponse>]);
      if (!cardResponse.ok || !memberResponse.ok) {
        if (cardResponse.status === 401 || memberResponse.status === 401) invalidateSession?.();
        throw new Error(cardResult.error ?? 'Não foi possível carregar os cartões e titulares deste espaço.');
      }
      const loadedCards = cardResult.cards ?? [];
      const loadedMembers = (memberResult.members ?? []).map(({ id, name: memberName, is_active }) => ({ id, name: memberName, is_active }));
      setCards(loadedCards);
      setMembers(loadedMembers);
      setHolderUserId((current) => current || auth?.user.id || loadedMembers.find((member) => member.is_active)?.id || '');
      await cacheCards?.(loadedCards, loadedMembers);
      setOfflineOnline?.(true);
    } catch (loadError) {
      if (hasOfflineWorkspace && isNetworkFailure(loadError, online)) {
        setOfflineOnline?.(false);
        const snapshot = await refreshOffline?.();
        if (snapshot) {
          setCards(snapshot.cards);
          setMembers(snapshot.cardMembers);
          return;
        }
      }
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os cartões.');
    }
  }, [auth?.user.id, cacheCards, hasOfflineWorkspace, invalidateSession, online, refreshOffline, setOfflineOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!offline) return;
    setCards(offline.cards);
    setMembers(offline.cardMembers);
  }, [offline?.cards, offline?.cardMembers]);

  const holderOptions = useMemo(() => {
    const options = new Map(members.filter((member) => member.is_active).map((member) => [member.id, member]));
    for (const card of cards ?? []) {
      if (!options.has(card.holder_user_id)) options.set(card.holder_user_id, { id: card.holder_user_id, name: card.holder_name, is_active: false });
    }
    return [...options.values()].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [cards, members]);

  async function writeCard(path: string, method: 'POST' | 'PUT', body: Record<string, string | number>) {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': auth?.csrfToken ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await readResponse(response);
    if (response.status === 401) invalidateSession?.();
    if (!response.ok || !result.card) throw new Error(result.error ?? 'Não foi possível salvar o cartão.');
    return result.card;
  }

  function clearForm() {
    setEditingCardId(null);
    setName('');
    setHolderUserId(auth?.user.id ?? '');
    setClosingDay('25');
    setDueDay('5');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const selectedHolder = holderOptions.find((member) => member.id === holderUserId);
    if (!auth?.user.id || !selectedHolder || (!selectedHolder.is_active && selectedHolder.id !== (cards ?? []).find((card) => card.id === editingCardId)?.holder_user_id)) {
      setError('Selecione uma pessoa ativa deste espaço como titular.');
      return;
    }
    const selectedClosingDay = Number(closingDay);
    const selectedDueDay = Number(dueDay);
    if (!Number.isInteger(selectedClosingDay) || selectedClosingDay < 1 || selectedClosingDay > 31 || !Number.isInteger(selectedDueDay) || selectedDueDay < 1 || selectedDueDay > 31) {
      setError('Os dias de fechamento e vencimento devem ficar entre 1 e 31.');
      return;
    }
    setBusy(true);
    try {
      const existing = (cards ?? []).find((card) => card.id === editingCardId);
      const nextCard: OfflineCard = {
        id: existing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        holder_user_id: holderUserId,
        holder_name: selectedHolder.name,
        closing_day: selectedClosingDay,
        due_day: selectedDueDay,
        archived_at: existing?.archived_at ?? null,
        created_by_user_id: existing?.created_by_user_id ?? auth.user.id,
        updated_by_user_id: auth.user.id,
        version: existing?.version ?? 1,
      };
      if (hasOfflineWorkspace && (!online || (typeof navigator !== 'undefined' && !navigator.onLine))) {
        if (!offlineSupported) throw new Error(offlineStorageError || 'O armazenamento offline não está disponível neste aparelho.');
        if (!offline) throw new Error('Não foi possível acessar o espaço offline.');
        await offline.queueCardChange(nextCard, existing ? 'update' : 'create');
        setCards((current) => existing
          ? (current ?? []).map((card) => card.id === nextCard.id ? nextCard : card)
          : [...(current ?? []), nextCard]);
      } else if (existing) {
        const updated = await writeCard(`/api/cards/${existing.id}`, 'PUT', {
          name: nextCard.name, holderUserId, closingDay: selectedClosingDay, dueDay: selectedDueDay, baseVersion: existing.version,
        });
        await load();
        setCards((current) => (current ?? []).map((card) => card.id === updated.id ? updated : card));
      } else {
        const created = await writeCard('/api/cards', 'POST', {
          name: nextCard.name, holderUserId, closingDay: selectedClosingDay, dueDay: selectedDueDay,
        });
        await load();
        setCards((current) => [...(current ?? []).filter((card) => card.id !== created.id), created]);
      }
      clearForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o cartão.');
    } finally {
      setBusy(false);
    }
  }

  function edit(card: OfflineCard) {
    setEditingCardId(card.id);
    setName(card.name);
    setHolderUserId(card.holder_user_id);
    setClosingDay(String(card.closing_day));
    setDueDay(String(card.due_day));
  }

  async function changeStatus(card: OfflineCard, action: 'archive' | 'restore') {
    setError('');
    setBusy(true);
    try {
      if (hasOfflineWorkspace && (!online || (typeof navigator !== 'undefined' && !navigator.onLine))) {
        if (!offlineSupported) throw new Error(offlineStorageError || 'O armazenamento offline não está disponível neste aparelho.');
        if (!offline) throw new Error('Não foi possível acessar o espaço offline.');
        const changed: OfflineCard = {
          ...card,
          archived_at: action === 'archive' ? new Date().toISOString() : null,
          updated_by_user_id: auth?.user.id ?? card.updated_by_user_id,
        };
        await offline.queueCardChange(changed, 'update');
        setCards((current) => (current ?? []).map((item) => item.id === card.id ? changed : item));
      } else {
        await writeCard(`/api/cards/${card.id}/${action}`, 'POST', { baseVersion: card.version });
        await load();
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível atualizar o cartão.');
    } finally {
      setBusy(false);
    }
  }

  const selectableMembers = holderOptions.filter((member) => member.is_active || member.id === holderUserId);
  return <Card>
    <CardHeader>
      <CardTitle><span className="flex items-center gap-2"><CreditCard aria-hidden="true" className="size-5 text-primary" />Cartões</span></CardTitle>
      <CardDescription>Cadastre o apelido, titular e ciclo da fatura. O Conta Clara não guarda número, validade, CVV ou limite do cartão.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-5">
      {error && <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
      {offline?.storageError && !offline.supported && <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive">{offline.storageError}</p>}
      <form onSubmit={(event) => void submit(event)} className="grid gap-3">
        <FormField id="credit-card-name" label="Apelido do cartão"><Input required maxLength={80} autoComplete="off" placeholder="Ex.: Cartão principal" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2"><label htmlFor="credit-card-holder" className="text-sm font-medium">Titular</label><select id="credit-card-holder" required value={holderUserId} onChange={(event) => setHolderUserId(event.target.value)} className="min-h-11 rounded-xl border border-input bg-card px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"><option value="">Selecione uma pessoa</option>{selectableMembers.map((member) => <option key={member.id} value={member.id}>{member.name}{member.is_active ? '' : ' (titular atual)'}</option>)}</select></div>
          <FormField id="credit-card-closing-day" label="Dia de fechamento"><Input type="number" min={1} max={31} step={1} inputMode="numeric" required value={closingDay} onChange={(event) => setClosingDay(event.target.value)} /></FormField>
        </div>
        <FormField id="credit-card-due-day" label="Dia de vencimento"><Input type="number" min={1} max={31} step={1} inputMode="numeric" required value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></FormField>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !holderOptions.length}>{editingCardId ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}{editingCardId ? 'Salvar cartão' : 'Adicionar cartão'}</Button>{editingCardId && <Button type="button" variant="outline" disabled={busy} onClick={clearForm}><X aria-hidden="true" className="size-4" />Cancelar edição</Button>}</div>
      </form>
      <div className="grid gap-1" aria-label="Lista de cartões">
        {cards === null ? <p className="text-sm text-muted-foreground">Carregando cartões…</p> : cards.length ? cards.map((card) => <div key={card.id} className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border py-3 first:border-0 first:pt-0">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{card.name}</p><p className="text-xs text-muted-foreground">{card.holder_name} · fecha dia {card.closing_day} · vence dia {card.due_day}</p></div>
          {card.archived_at ? <><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Arquivado</span><Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Restaurar cartão ${card.name}`} onClick={() => void changeStatus(card, 'restore')}><RotateCcw aria-hidden="true" className="size-4" />Restaurar</Button></> : <><Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Editar cartão ${card.name}`} onClick={() => edit(card)}><Pencil aria-hidden="true" className="size-4" />Editar</Button><Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Arquivar cartão ${card.name}`} onClick={() => void changeStatus(card, 'archive')}><Archive aria-hidden="true" className="size-4" />Arquivar</Button></>}
        </div>) : <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p>}
      </div>
      {offline?.cardOperations.length ? <p role="status" className="text-xs text-muted-foreground">{offline.cardOperations.length} alteração(ões) de cartão aguardam sincronização.</p> : null}
    </CardContent>
  </Card>;
}
