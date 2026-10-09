import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from './auth/auth-gate';
import { OneTimeAccessPage } from './auth/one-time-access-page';
import { DashboardPage, SettingsPage } from './pages/pages';
import { NewTransactionPage, TransactionsPage } from './pages/entries-pages';
import { CardPurchasesPage } from './pages/card-purchases-page';
import { InvoicesPage } from './pages/invoices-page';
import { ActivityPage } from './pages/activity-page';
import { RecurrenceFormPage, RecurrencesPage } from './pages/recurrence-pages';
import { LoadingState } from './components/ui/feedback';

const SpreadsheetImportPage = lazy(() =>
  import('./pages/spreadsheet-import-page').then(({ SpreadsheetImportPage: page }) => ({ default: page })),
);

// O catálogo do design system só existe em desenvolvimento ou em builds com VITE_DESIGN_CATALOG=true
// (testes de navegador). Em produção a condição é constante e o módulo não entra no pacote.
const DesignCatalogPage =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_CATALOG === 'true' ? lazy(() => import('./pages/design-catalog')) : null;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/ativar/:token" element={<OneTimeAccessPage purpose="invite" />} />
        <Route path="/redefinir-senha/:token" element={<OneTimeAccessPage purpose="password-reset" />} />
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
          <Route path="lancamentos" element={<TransactionsPage />} />
          <Route path="compras" element={<CardPurchasesPage />} />
          <Route path="faturas" element={<InvoicesPage />} />
          <Route path="lancamentos/novo" element={<NewTransactionPage />} />
          <Route path="lancamentos/:id/editar" element={<NewTransactionPage />} />
          <Route
            path="importar"
            element={
              <Suspense fallback={<LoadingState label="Carregando importador de planilha" />}>
                <SpreadsheetImportPage />
              </Suspense>
            }
          />
          <Route path="recorrencias" element={<RecurrencesPage />} />
          <Route path="recorrencias/novo" element={<RecurrenceFormPage />} />
          <Route path="recorrencias/:id/editar" element={<RecurrenceFormPage />} />
          <Route path="historico" element={<ActivityPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
