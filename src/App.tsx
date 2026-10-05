import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from './auth/auth-gate';
import { DashboardPage, NewTransactionPage, RecurrencesPage, SettingsPage, TransactionsPage } from './pages/pages';

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="lancamentos" element={<TransactionsPage />} />
          <Route path="lancamentos/novo" element={<NewTransactionPage />} />
          <Route path="recorrencias" element={<RecurrencesPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
