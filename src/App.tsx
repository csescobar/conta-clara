import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from './auth/auth-gate';
import { DashboardPage } from './pages/dashboard-page';
import { LoadingState } from './components/ui/feedback';

/**
 * Telas carregadas sob demanda: só o painel entra no pacote inicial. Depois da primeira visita o service
 * worker guarda todos os pacotes, então as telas também abrem sem conexão.
 */
function lazyPage<Module extends Record<string, unknown>, Props extends object = object>(load: () => Promise<Module>, name: keyof Module) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType<Props> }));
}

const TransactionsPage = lazyPage(() => import('./pages/entries-pages'), 'TransactionsPage');
const NewTransactionPage = lazyPage(() => import('./pages/entries-pages'), 'NewTransactionPage');
const CardPurchasesPage = lazyPage(() => import('./pages/card-purchases-page'), 'CardPurchasesPage');
const InvoicesPage = lazyPage(() => import('./pages/invoices-page'), 'InvoicesPage');
const ActivityPage = lazyPage(() => import('./pages/activity-page'), 'ActivityPage');
const RecurrencesPage = lazyPage(() => import('./pages/recurrence-pages'), 'RecurrencesPage');
const RecurrenceFormPage = lazyPage(() => import('./pages/recurrence-pages'), 'RecurrenceFormPage');
const OneTimeAccessPage = lazyPage<typeof import('./auth/one-time-access-page'), { purpose: 'invite' | 'password-reset' }>(
  () => import('./auth/one-time-access-page'),
  'OneTimeAccessPage',
);
const SettingsPage = lazyPage(() => import('./pages/settings-page'), 'SettingsPage');
const SpreadsheetImportPage = lazyPage(() => import('./pages/spreadsheet-import-page'), 'SpreadsheetImportPage');

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="Carregando tela" />}>{children}</Suspense>;
}

// O catálogo do design system só existe em desenvolvimento ou em builds com VITE_DESIGN_CATALOG=true
// (testes de navegador). Em produção a condição é constante e o módulo não entra no pacote.
const DesignCatalogPage =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_CATALOG === 'true' ? lazy(() => import('./pages/design-catalog')) : null;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/ativar/:token"
          element={
            <Page>
              <OneTimeAccessPage purpose="invite" />
            </Page>
          }
        />
        <Route
          path="/redefinir-senha/:token"
          element={
            <Page>
              <OneTimeAccessPage purpose="password-reset" />
            </Page>
          }
        />
        {DesignCatalogPage && (
          <Route
            path="/catalogo"
            element={
              <Suspense fallback={<LoadingState label="Carregando catálogo do design system" />}>
                <DesignCatalogPage />
              </Suspense>
            }
          />
        )}
        <Route element={<AuthGate />}>
          <Route index element={<DashboardPage />} />
          <Route
            path="lancamentos"
            element={
              <Page>
                <TransactionsPage />
              </Page>
            }
          />
          <Route
            path="compras"
            element={
              <Page>
                <CardPurchasesPage />
              </Page>
            }
          />
          <Route
            path="faturas"
            element={
              <Page>
                <InvoicesPage />
              </Page>
            }
          />
          <Route
            path="lancamentos/novo"
            element={
              <Page>
                <NewTransactionPage />
              </Page>
            }
          />
          <Route
            path="lancamentos/:id/editar"
            element={
              <Page>
                <NewTransactionPage />
              </Page>
            }
          />
          <Route
            path="importar"
            element={
              <Page>
                <SpreadsheetImportPage />
              </Page>
            }
          />
          <Route
            path="recorrencias"
            element={
              <Page>
                <RecurrencesPage />
              </Page>
            }
          />
          <Route
            path="recorrencias/novo"
            element={
              <Page>
                <RecurrenceFormPage />
              </Page>
            }
          />
          <Route
            path="recorrencias/:id/editar"
            element={
              <Page>
                <RecurrenceFormPage />
              </Page>
            }
          />
          <Route
            path="historico"
            element={
              <Page>
                <ActivityPage />
              </Page>
            }
          />
          <Route
            path="configuracoes"
            element={
              <Page>
                <SettingsPage />
              </Page>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
