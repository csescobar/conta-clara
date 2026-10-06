import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from './auth/auth-gate';
import { OneTimeAccessPage } from './auth/one-time-access-page';
import { DashboardPage, NewTransactionPage, RecurrencesPage, SettingsPage, TransactionsPage } from './pages/pages';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/ativar/:token" element={<OneTimeAccessPage purpose="invite" />} />
        <Route path="/redefinir-senha/:token" element={<OneTimeAccessPage purpose="password-reset" />} />
        <Route element={<AuthGate />}>
          <Route index element={<DashboardPage />} />
          <Route path="lancamentos" element={<TransactionsPage />} />
          <Route path="lancamentos/novo" element={<NewTransactionPage />} />
          <Route path="recorrencias" element={<RecurrencesPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
