import { Palette } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { RadioGroup } from '../components/ui/form-controls';
import { applyThemePreference, readThemePreference, saveThemePreference, themePreferences, type ThemePreference } from '../lib/theme';

/** Escolha de tema deste aparelho: segue o sistema por padrão. */
export function AppearanceSettings() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);

  function choose(next: ThemePreference) {
    setPreference(next);
    saveThemePreference(next);
    applyThemePreference(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle id="appearance-heading">
          <span className="flex items-center gap-2">
            <Palette aria-hidden="true" className="size-5 text-primary" />
            Aparência
          </span>
        </CardTitle>
        <CardDescription>A escolha vale somente neste aparelho. Por padrão, o tema acompanha o sistema.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup legend="Tema" name="theme" value={preference} options={themePreferences} onChange={choose} />
      </CardContent>
    </Card>
  );
}
