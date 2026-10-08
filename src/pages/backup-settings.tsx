import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { formatBrazilianDateTime } from '../lib/finance';
import { Alert } from '../components/ui/alert';

type BackupStatus = {
  runState: 'never' | 'running' | 'success' | 'warning' | 'failed';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastSuccessDate: string | null;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  lastFailureMessage: string | null;
};

function displayDate(value: string | null) {
  return formatBrazilianDateTime(value);
}

export function BackupSettings() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/backups/status', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json() as BackupStatus & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível consultar os backups.');
      setStatus(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível consultar os backups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <Card>
    <CardHeader>
      <CardTitle id="backup-status-heading"><span className="flex items-center gap-2"><CloudDownload aria-hidden="true" className="size-5 text-primary" />Backups</span></CardTitle>
      <CardDescription>Google Drive · todos os dias às 03:00, horário de Brasília · retenção de 7 diários, 4 semanais e 6 mensais.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3">
      {error && <Alert>{error}</Alert>}
      {loading && !status && <p role="status" className="text-sm text-muted-foreground">Carregando status do backup…</p>}
      {status && <div aria-busy={loading}>
        <p className="text-sm font-medium">{status.lastSuccessAt
          ? `Último backup validado: ${displayDate(status.lastSuccessAt) ?? 'data indisponível'}`
          : 'Ainda não há um backup validado.'}</p>
        {status.runState === 'running' && <p role="status" className="mt-1 text-sm text-muted-foreground">Backup em andamento.</p>}
        {status.lastFailureAt && status.lastFailureMessage && <p className="mt-1 text-sm text-destructive">Última falha (${displayDate(status.lastFailureAt) ?? 'data indisponível'}): {status.lastFailureMessage}</p>}
        {!status.lastSuccessAt && !status.lastFailureAt && <p className="mt-1 text-sm text-muted-foreground">A primeira execução acontece após configurar a conexão criptografada no servidor.</p>}
        {status.runState === 'warning' && <p role="status" className="mt-1 text-sm text-warning">O backup foi salvo e verificado; uma etapa de retenção será repetida automaticamente.</p>}
      </div>}
      <div><Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw aria-hidden="true" className="size-4" />Atualizar status</Button></div>
    </CardContent>
  </Card>;
}
