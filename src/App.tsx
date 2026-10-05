import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/app-layout';
import { DashboardPage, NewTransactionPage, RecurrencesPage, SettingsPage, TransactionsPage } from './pages/pages';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
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
