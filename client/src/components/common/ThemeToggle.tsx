import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/themeContext';

export default function ThemeToggle() {
  const { theme, preference, setPreference } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <div className="ss-theme-toggle no-print" role="group" aria-label="Appearance">
      <button type="button" className="ss-icon-button" onClick={() => setPreference(next)}
        aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} aria-pressed={theme === 'dark'}>
        {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>
      <button type="button" className="ss-icon-button" onClick={() => setPreference('system')}
        aria-label="Use device theme" title="Use device theme" aria-pressed={preference === 'system'}>
        <Monitor size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
