import { Button } from './ui/button';
import { formatBrazilianDate, formatBrazilianMoney, formatBrazilianMonth } from '../lib/finance';
import type { OfflineWorkspace } from '../offline/offline-context';

/** Painéis de resolução de conflitos de sincronização; carregado somente quando existe algum conflito. */
export default function SyncConflicts({ offline, csrfToken }: { offline: OfflineWorkspace; csrfToken: string }) {
  const conflicts = offline.operations.filter((operation) => operation.conflict);
  const cardConflicts = offline.cardOperations.filter((operation) => operation.conflict);
  const purchaseConflicts = offline.purchaseOperations.filter((operation) => operation.conflict);
  const invoiceConflicts = offline.invoiceOperations.filter((operation) => operation.conflict);
  return (
    <>
      {offline && conflicts.length > 0 && (
        <section
          aria-labelledby="sync-conflicts-heading"
          className="mb-5 grid gap-3 rounded-2xl border border-warning-border bg-warning-surface p-4 text-sm text-warning"
        >
          <div>
            <h2 id="sync-conflicts-heading" className="font-semibold">
              Escolha como resolver {conflicts.length === 1 ? 'este conflito' : 'estes conflitos'}
            </h2>
            <p className="mt-1 text-xs leading-5">
              Uma alteração feita em outro aparelho chegou enquanto você estava offline. Compare as versões e escolha qual manter.
            </p>
          </div>
          {conflicts.map((operation) => {
            const localEntry = offline.entries.find((entry) => entry.id === operation.entryId);
            const serverEntry = operation.conflict!.serverEntry;
            const entryName = localEntry?.description ?? serverEntry?.description ?? 'Lançamento removido';
            const summarize = (entry: NonNullable<typeof serverEntry>) =>
              `${entry.description} · ${formatBrazilianMoney(entry.planned_cents)} · ${formatBrazilianMonth(entry.competence_on)}`;
            const serverDescription = serverEntry
              ? summarize(serverEntry)
              : operation.conflict!.reason === 'id_collision'
                ? 'Outro lançamento usa este identificador.'
                : 'O lançamento foi removido do servidor.';
            const localDescription =
              operation.kind === 'delete' ? 'Excluir lançamento' : localEntry ? summarize(localEntry) : 'Versão local indisponível';
            return (
              <article key={operation.operationId} className="grid gap-2 rounded-xl border border-warning-border bg-card/70 p-3">
                <h3 className="font-medium">{entryName}</h3>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <p>
                    <strong>Sua versão:</strong> {localDescription}
                  </p>
                  <p>
                    <strong>Servidor:</strong> {serverDescription}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolveConflict(operation.operationId, 'local')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {serverEntry ? 'Usar versão local' : operation.kind === 'delete' ? 'Manter exclusão local' : 'Recriar minha versão'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolveConflict(operation.operationId, 'server')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {serverEntry ? 'Usar versão do servidor' : 'Descartar versão local'}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {offline && cardConflicts.length > 0 && (
        <section
          aria-labelledby="card-sync-conflicts-heading"
          className="mb-5 grid gap-3 rounded-2xl border border-warning-border bg-warning-surface p-4 text-sm text-warning"
        >
          <div>
            <h2 id="card-sync-conflicts-heading" className="font-semibold">
              Escolha como resolver {cardConflicts.length === 1 ? 'este conflito de cartão' : 'estes conflitos de cartão'}
            </h2>
            <p className="mt-1 text-xs leading-5">
              Um cartão mudou em outro aparelho enquanto você estava offline. Compare os dados e escolha qual manter.
            </p>
          </div>
          {cardConflicts.map((operation) => {
            const localCard = offline.cards.find((card) => card.id === operation.cardId);
            const serverCard = operation.conflict!.serverCard;
            const localDescription = localCard
              ? `${localCard.name} · ${localCard.holder_name} · fecha dia ${localCard.closing_day} · vence dia ${localCard.due_day}${localCard.archived_at ? ' · arquivado' : ''}`
              : 'Versão local indisponível';
            const serverDescription = serverCard
              ? `${serverCard.name} · ${serverCard.holder_name} · fecha dia ${serverCard.closing_day} · vence dia ${serverCard.due_day}${serverCard.archived_at ? ' · arquivado' : ''}`
              : operation.conflict!.reason === 'id_collision'
                ? 'Outro cartão usa este identificador.'
                : 'O cartão foi removido do servidor.';
            return (
              <article key={operation.operationId} className="grid gap-2 rounded-xl border border-warning-border bg-card/70 p-3">
                <h3 className="font-medium">{localCard?.name ?? serverCard?.name ?? 'Cartão removido'}</h3>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <p>
                    <strong>Sua versão:</strong> {localDescription}
                  </p>
                  <p>
                    <strong>Servidor:</strong> {serverDescription}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolveCardConflict(operation.operationId, 'local')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {serverCard ? 'Usar versão local' : 'Recriar minha versão'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolveCardConflict(operation.operationId, 'server')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {serverCard ? 'Usar versão do servidor' : 'Descartar versão local'}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {offline && purchaseConflicts.length > 0 && (
        <section
          aria-labelledby="purchase-sync-conflicts-heading"
          className="mb-5 grid gap-3 rounded-2xl border border-warning-border bg-warning-surface p-4 text-sm text-warning"
        >
          <div>
            <h2 id="purchase-sync-conflicts-heading" className="font-semibold">
              Escolha como resolver {purchaseConflicts.length === 1 ? 'este conflito de compra' : 'estes conflitos de compra'}
            </h2>
            <p className="mt-1 text-xs leading-5">
              A compra mudou em outro aparelho enquanto você estava offline. Compare as versões; parcelas já pagas permanecem protegidas
              pelo servidor.
            </p>
          </div>
          {purchaseConflicts.map((operation) => {
            const localPurchase = offline.purchases.find((purchase) => purchase.id === operation.purchaseId);
            const serverPurchase = operation.conflict!.serverPurchase;
            const summarize = (purchase: NonNullable<typeof serverPurchase>) =>
              `${purchase.description} · ${formatBrazilianMoney(purchase.total_cents)} · ${purchase.installment_count} ${purchase.installment_count === 1 ? 'parcela' : 'parcelas'}`;
            const localDescription =
              operation.kind === 'delete'
                ? 'Cancelar parcelas ainda não pagas'
                : localPurchase
                  ? summarize(localPurchase)
                  : 'Versão local indisponível';
            const serverDescription = serverPurchase?.canceled_at
              ? `${summarize(serverPurchase)} · cancelada no servidor`
              : serverPurchase
                ? summarize(serverPurchase)
                : operation.conflict!.reason === 'id_collision'
                  ? 'Outra compra usa este identificador.'
                  : 'A compra foi removida do servidor.';
            return (
              <article key={operation.operationId} className="grid gap-2 rounded-xl border border-warning-border bg-card/70 p-3">
                <h3 className="font-medium">{localPurchase?.description ?? serverPurchase?.description ?? 'Compra removida'}</h3>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <p>
                    <strong>Sua versão:</strong> {localDescription}
                  </p>
                  <p>
                    <strong>Servidor:</strong> {serverDescription}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolvePurchaseConflict(operation.operationId, 'local')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {operation.kind === 'delete'
                      ? 'Manter cancelamento'
                      : !serverPurchase || operation.conflict!.reason === 'id_collision' || operation.conflict!.reason === 'server_deleted'
                        ? 'Recriar minha compra'
                        : 'Usar versão local'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolvePurchaseConflict(operation.operationId, 'server')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {serverPurchase ? 'Usar versão do servidor' : 'Descartar versão local'}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {offline && invoiceConflicts.length > 0 && (
        <section
          aria-labelledby="invoice-sync-conflicts-heading"
          className="mb-5 grid gap-3 rounded-2xl border border-warning-border bg-warning-surface p-4 text-sm text-warning"
        >
          <div>
            <h2 id="invoice-sync-conflicts-heading" className="font-semibold">
              Revise as quitações que mudaram offline
            </h2>
            <p className="mt-1 text-xs leading-5">
              A fatura ou sua quitação mudou em outro aparelho. Compare os valores antes de escolher qual versão manter.
            </p>
          </div>
          {invoiceConflicts.map((operation) => {
            const localInvoice = offline.invoices.find(
              (invoice) => invoice.card_id === operation.cardId && invoice.invoice_month.startsWith(operation.invoiceMonth),
            );
            const serverInvoice = operation.conflict!.serverInvoice;
            const summary = (invoice: NonNullable<typeof serverInvoice>) =>
              `${invoice.card_name} · ${formatBrazilianMonth(invoice.invoice_month)} · previsto ${formatBrazilianMoney(invoice.planned_cents)} · ${invoice.payment_status === 'paid' ? `quitada por ${formatBrazilianMoney(invoice.actual_cents ?? '0')} em ${formatBrazilianDate(invoice.paid_on)}` : invoice.status === 'needs_review' ? 'quitação precisa ser revisada' : 'em aberto'}`;
            return (
              <article key={operation.operationId} className="grid gap-2 rounded-xl border border-warning-border bg-card/70 p-3">
                <h3 className="font-medium">
                  {localInvoice?.card_name ?? serverInvoice?.card_name ?? 'Fatura removida'} ·{' '}
                  {formatBrazilianMonth(`${operation.invoiceMonth}-01`)}
                </h3>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  <p>
                    <strong>Sua versão:</strong>{' '}
                    {localInvoice ? summary(localInvoice) : operation.kind === 'reverse' ? 'Desfazer quitação' : 'Registrar quitação'}
                  </p>
                  <p>
                    <strong>Servidor:</strong> {serverInvoice ? summary(serverInvoice) : 'A fatura foi removida do servidor.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {serverInvoice && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={offline.syncing}
                      onClick={() =>
                        void offline
                          .resolveInvoiceConflict(operation.operationId, 'local')
                          .then(() =>
                            typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                          )
                      }
                    >
                      {operation.kind === 'pay' ? 'Confirmar minha quitação' : 'Repetir o estorno'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={offline.syncing}
                    onClick={() =>
                      void offline
                        .resolveInvoiceConflict(operation.operationId, 'server')
                        .then(() =>
                          typeof navigator !== 'undefined' && navigator.onLine && csrfToken ? offline.sync(csrfToken) : undefined,
                        )
                    }
                  >
                    {serverInvoice ? 'Manter versão do servidor' : 'Descartar alteração local'}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
