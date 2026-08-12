"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Languages, Loader2, LockKeyhole, Moon, Sun, UserRound, XCircle } from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { ProfileAvatarUploader } from "@/components/profile-avatar-uploader";
import { type AppLocale, type AppTheme } from "@/lib/preferences";

type Feedback = { tone: "success" | "error"; message: string } | null;

type ProfileSettingsProps = {
  name: string;
  email: string;
  hasAvatar: boolean;
  avatarVersion: string;
};

export function ProfileSettings(props: ProfileSettingsProps) {
  const router = useRouter();
  const { locale, theme, savingPreferences, savePreferences, t } = useAppPreferences();
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStep, setPasswordStep] = useState<"password" | "code">("password");
  const [showPassword, setShowPassword] = useState(false);
  const pendingPassword = useRef("");
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [preferenceFeedback, setPreferenceFeedback] = useState<Feedback>(null);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileFeedback(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
    setProfileBusy(false);
    if (!response?.ok) {
      setProfileFeedback({ tone: "error", message: data?.error || (locale === "en" ? "We could not update your profile." : "No pudimos actualizar el perfil.") });
      return;
    }
    setProfileFeedback({ tone: "success", message: locale === "en" ? "Profile updated." : "Perfil actualizado." });
    router.refresh();
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const english = locale === "en";
    const newPassword = passwordStep === "password" ? String(form.get("newPassword") || "") : pendingPassword.current;
    if (passwordStep === "password" && newPassword !== String(form.get("confirmPassword") || "")) {
      setPasswordFeedback({ tone: "error", message: english ? "The new passwords do not match." : "Las contraseñas nuevas no coinciden." });
      return;
    }
    if (!newPassword) return;

    setPasswordBusy(true);
    const response = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(passwordStep === "password"
        ? { action: "request", newPassword }
        : { action: "confirm", newPassword, code: String(form.get("code") || "") }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { error?: string; developmentCode?: string } | undefined;
    setPasswordBusy(false);
    if (!response?.ok) {
      setPasswordFeedback({ tone: "error", message: data?.error || (english ? "We could not change your password." : "No pudimos cambiar la contraseña.") });
      return;
    }

    if (passwordStep === "password") {
      pendingPassword.current = newPassword;
      setPasswordStep("code");
      setPasswordFeedback({
        tone: "success",
        message: data?.developmentCode
          ? `${english ? "Development code" : "Código de desarrollo"}: ${data.developmentCode}`
          : (english ? `We sent a confirmation code to ${props.email}.` : `Enviamos un código de confirmación a ${props.email}.`),
      });
      return;
    }

    formElement.reset();
    pendingPassword.current = "";
    setShowPassword(false);
    setPasswordStep("password");
    setPasswordFeedback({ tone: "success", message: english ? "Password updated and previous sessions invalidated." : "Contraseña actualizada y sesiones anteriores invalidadas." });
  }

  async function updatePreference(next: { locale?: AppLocale; theme?: AppTheme }) {
    setPreferenceFeedback(null);
    const saved = await savePreferences(next);
    setPreferenceFeedback(saved
      ? { tone: "success", message: locale === "en" || next.locale === "en" ? "Preferences saved." : "Preferencias guardadas." }
      : { tone: "error", message: locale === "en" ? "We could not save the preference." : "No pudimos guardar la preferencia." });
  }

  return (
    <section className="profile-page profile-page--settings">
      <header className="profile-page__header">
        <h1>{t("settingsTitle")}</h1>
        <p>{t("settingsDescription")}</p>
      </header>

      <div className="settings-layout">
        <div className="settings-column settings-column--left">
        <section className="settings-section lab-panel settings-section--avatar" aria-labelledby="settings-avatar-title">
          <div className="settings-section__heading">
            <UserRound size={18} />
            <div><h2 id="settings-avatar-title">Avatar</h2><p>{locale === "en" ? "JPG, PNG, or WEBP up to 2 MB." : "JPG, PNG o WEBP hasta 2 MB."}</p></div>
          </div>
          <ProfileAvatarUploader
            name={props.name}
            email={props.email}
            hasAvatar={props.hasAvatar}
            avatarVersion={props.avatarVersion}
          />
        </section>

        <section className="settings-section lab-panel settings-section--security" aria-labelledby="settings-security-title">
          <div className="settings-section__heading"><LockKeyhole size={18} /><div><h2 id="settings-security-title">{t("securitySection")}</h2><p>{t("securityHelp")}</p></div></div>
          <form className="settings-form" onSubmit={changePassword} aria-busy={passwordBusy}>
            {passwordStep === "password" ? (
              <>
                <div className="settings-password-field">
                  <label htmlFor="newPassword"><span>{t("newPassword")}</span></label>
                  <div className="password-field">
                    <input id="newPassword" name="newPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required />
                    <button type="button" disabled={passwordBusy} aria-label={showPassword ? (locale === "en" ? "Hide password" : "Ocultar contraseña") : (locale === "en" ? "Show password" : "Mostrar contraseña")} onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="settings-password-field">
                  <label htmlFor="confirmPassword"><span>{t("confirmPassword")}</span></label>
                  <div className="password-field">
                    <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required />
                    <button type="button" disabled={passwordBusy} aria-label={showPassword ? (locale === "en" ? "Hide password" : "Ocultar contraseña") : (locale === "en" ? "Show password" : "Mostrar contraseña")} onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="settings-form__code-help">{locale === "en" ? "Enter the 6-digit code sent to your registered email." : "Ingresa el código de 6 dígitos enviado a tu correo registrado."}</p>
                <label><span>{t("verificationCode")}</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label>
              </>
            )}
            <div className="settings-form__actions">
              {passwordStep === "code" ? (
                <button className="button ghost" type="button" disabled={passwordBusy} onClick={() => { setPasswordStep("password"); pendingPassword.current = ""; setPasswordFeedback(null); }}>
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </button>
              ) : null}
              <button className="button primary" type="submit" disabled={passwordBusy}>{passwordBusy ? <Loader2 className="spin" size={14} /> : null}{passwordBusy ? (passwordStep === "code" ? (locale === "en" ? "Confirming..." : "Confirmando...") : (locale === "en" ? "Sending code..." : "Enviando código...")) : (passwordStep === "code" ? (locale === "en" ? "Confirm change" : "Confirmar cambio") : t("changePassword"))}</button>
            </div>
          </form>
          <SettingsFeedback feedback={passwordFeedback} />
        </section>
        </div>

        <div className="settings-column settings-column--right">
        <section className="settings-section lab-panel settings-section--profile" aria-labelledby="settings-profile-title">
          <div className="settings-section__heading"><UserRound size={18} /><div><h2 id="settings-profile-title">{t("profileSection")}</h2><p>{t("profileHelp")}</p></div></div>
          <form className="settings-form" onSubmit={saveProfile} aria-busy={profileBusy}>
            <label><span>{t("name")}</span><input name="name" defaultValue={props.name} minLength={2} maxLength={80} required /></label>
            <label><span>{t("email")}</span><input name="email" type="email" defaultValue={props.email} required /></label>
            <button className="button primary" type="submit" disabled={profileBusy}>{profileBusy ? <Loader2 className="spin" size={14} /> : null}{profileBusy ? t("saving") : t("saveProfile")}</button>
          </form>
          <SettingsFeedback feedback={profileFeedback} />
        </section>

        <section className="settings-section lab-panel settings-section--preferences" aria-labelledby="settings-preferences-title">
          <div className="settings-section__heading"><Languages size={18} /><div><h2 id="settings-preferences-title">{t("preferencesSection")}</h2><p>{t("preferencesHelp")}</p></div></div>
          <div className="settings-preferences">
            <fieldset><legend>{t("language")}</legend><div className="settings-segmented"><button type="button" aria-pressed={locale === "es"} disabled={savingPreferences} onClick={() => void updatePreference({ locale: "es" })}>{t("spanish")}</button><button type="button" aria-pressed={locale === "en"} disabled={savingPreferences} onClick={() => void updatePreference({ locale: "en" })}>{t("english")}</button></div></fieldset>
            <fieldset><legend>{t("appearance")}</legend><div className="settings-segmented"><button type="button" aria-pressed={theme === "dark"} disabled={savingPreferences} onClick={() => void updatePreference({ theme: "dark" })}><Moon size={15} />{t("dark")}</button><button type="button" aria-pressed={theme === "light"} disabled={savingPreferences} onClick={() => void updatePreference({ theme: "light" })}><Sun size={15} />{t("light")}</button></div></fieldset>
          </div>
          <SettingsFeedback feedback={preferenceFeedback} />
        </section>
        </div>

      </div>
    </section>
  );
}

function SettingsFeedback({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={`settings-feedback settings-feedback--${feedback.tone}`} role="status">
      {feedback.tone === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{feedback.message}
    </p>
  );
}
