import { useI18n } from "../i18n/context";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "../i18n/locale";

/**
 * Language switch, always reachable from the top bar. The names are written in their own language,
 * so the current interface language can never hide the way back.
 *
 * Switching changes the interface and the stored preference only: no review, project or Git state
 * is read or written, and nothing is refreshed.
 */
export function LanguageSelector({ disabled }: { disabled?: boolean }) {
  const { locale, t, setLocale } = useI18n();
  return (
    <label className="language-selector">
      <span className="visually-hidden">{t("app.language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t("app.language.ariaLabel")}
        disabled={disabled}
        data-testid="language-selector"
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {LOCALE_NATIVE_NAMES[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
