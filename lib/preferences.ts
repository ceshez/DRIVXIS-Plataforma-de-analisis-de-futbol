export const LOCALE_COOKIE = "drivxis_locale";
export const THEME_COOKIE = "drivxis_theme";

export type AppLocale = "es" | "en";
export type AppTheme = "dark" | "light";

export function normalizeLocale(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "es";
}

export function normalizeTheme(value: string | null | undefined): AppTheme {
  return value === "light" ? "light" : "dark";
}

export const uiCopy = {
  es: {
    dashboard: "Panel", history: "Historial", analyses: "Análisis", usage: "Uso",
    settings: "Configuración", chatbot: "Chatbot", logout: "Cerrar sesión",
    loggingOut: "Cerrando sesión...", openUserMenu: "Abrir menú de usuario", userMenu: "Menú de usuario",
    language: "Idioma", spanish: "Español", english: "English", appearance: "Apariencia",
    dark: "Oscuro", light: "Claro", loginEyebrow: "Acceso al sistema",
    loginTitle: "Entra a tu sala de análisis",
    loginDescription: "Usa tus credenciales para abrir el laboratorio táctico, revisar videos y preparar reportes.",
    registerEyebrow: "Registro público", registerTitle: "Crea tu base de trabajo",
    registerDescription: "La cuenta guarda tu biblioteca de videos, cola de análisis y resultados futuros por usuario.",
    name: "Nombre", email: "Correo electrónico", password: "Contraseña",
    showPassword: "Mostrar contraseña", hidePassword: "Ocultar contraseña",
    forgotPassword: "¿Olvidaste tu contraseña?", enterSystem: "Entrar al sistema",
    createAccount: "Crear cuenta", processing: "Procesando", noAccount: "¿No tienes cuenta?",
    alreadyAccount: "¿Ya tienes cuenta?", enter: "Entrar", forgotEyebrow: "Recuperación de acceso",
    forgotTitle: "Recupera tu contraseña",
    forgotDescription: "Escribe el correo registrado y te enviaremos un código de verificación.",
    sendCode: "Enviar código", sendingCode: "Enviando código...", resetEyebrow: "Código de seguridad",
    resetTitle: "Crea una nueva contraseña",
    resetDescription: "Ingresa el código recibido por correo y define tu nueva contraseña.",
    verificationCode: "Código de 6 dígitos", newPassword: "Nueva contraseña",
    confirmPassword: "Confirmar contraseña", changePassword: "Cambiar contraseña",
    changingPassword: "Cambiando contraseña...", backToLogin: "Volver al inicio de sesión",
    codeSentTitle: "Revisa tu correo",
    codeSentMessage: "Hemos enviado un código a tu dirección registrada. Úsalo para cambiar tu contraseña.",
    settingsTitle: "Configuración",
    settingsDescription: "Administra tu perfil, preferencias visuales y seguridad de acceso.",
    profileSection: "Perfil", profileHelp: "Actualiza el nombre visible y el correo asociado a tu cuenta.",
    currentPasswordForEmail: "Contraseña actual (solo si cambias el correo)", saveProfile: "Guardar perfil",
    saving: "Guardando...", preferencesSection: "Preferencias",
    preferencesHelp: "El idioma y el tema se guardan en tu cuenta y se aplican al iniciar sesión.",
    securitySection: "Seguridad", securityHelp: "Define una contraseña nueva y confirma el cambio con el código enviado a tu correo.",
    currentPassword: "Contraseña actual", searchVideos: "Buscar por nombre de archivo", search: "Buscar",
    advancedFilters: "Filtros avanzados", status: "Estado", allStatuses: "Todos los estados",
    dateFrom: "Desde", dateTo: "Hasta", minSize: "Tamaño mín. (MB)", maxSize: "Tamaño máx. (MB)",
    sortBy: "Ordenar", newest: "Más recientes", oldest: "Más antiguos", nameAsc: "Nombre A–Z",
    nameDesc: "Nombre Z–A", resultsPerPage: "Resultados por página", applyFilters: "Aplicar filtros",
    clearFilters: "Limpiar", previousPage: "Anterior", nextPage: "Siguiente", page: "Página", of: "de",
    noFilterResults: "No encontramos videos con esos filtros.", uploaded: "Subido",
    pending: "Pendiente", processingStatus: "Procesando", completed: "Completado", failed: "Fallido",
  },
  en: {
    dashboard: "Dashboard", history: "History", analyses: "Analyses", usage: "Usage",
    settings: "Settings", chatbot: "Chatbot", logout: "Log out", loggingOut: "Logging out...",
    openUserMenu: "Open user menu", userMenu: "User menu", language: "Language", spanish: "Español",
    english: "English", appearance: "Appearance", dark: "Dark", light: "Light", loginEyebrow: "System access",
    loginTitle: "Enter your analysis room",
    loginDescription: "Use your credentials to open the tactical lab, review videos, and prepare reports.",
    registerEyebrow: "Public registration", registerTitle: "Create your workspace",
    registerDescription: "Your account stores your video library, analysis queue, and future results.",
    name: "Name", email: "Email address", password: "Password", showPassword: "Show password",
    hidePassword: "Hide password", forgotPassword: "Forgot your password?", enterSystem: "Enter system",
    createAccount: "Create account", processing: "Processing", noAccount: "Don't have an account?",
    alreadyAccount: "Already have an account?", enter: "Log in", forgotEyebrow: "Account recovery",
    forgotTitle: "Recover your password",
    forgotDescription: "Enter your registered email and we'll send you a verification code.",
    sendCode: "Send code", sendingCode: "Sending code...", resetEyebrow: "Security code",
    resetTitle: "Create a new password",
    resetDescription: "Enter the code from your email and choose a new password.",
    verificationCode: "6-digit code", newPassword: "New password", confirmPassword: "Confirm password",
    changePassword: "Change password", changingPassword: "Changing password...", backToLogin: "Back to login",
    codeSentTitle: "Check your email",
    codeSentMessage: "We sent a code to your registered address. Use it to change your password.",
    settingsTitle: "Settings", settingsDescription: "Manage your profile, visual preferences, and account security.",
    profileSection: "Profile", profileHelp: "Update your display name and the email linked to your account.",
    currentPasswordForEmail: "Current password (only when changing email)", saveProfile: "Save profile",
    saving: "Saving...", preferencesSection: "Preferences",
    preferencesHelp: "Language and theme are saved to your account and applied when you sign in.",
    securitySection: "Security", securityHelp: "Choose a new password and confirm the change with the code sent to your email.",
    currentPassword: "Current password", searchVideos: "Search by filename", search: "Search",
    advancedFilters: "Advanced filters", status: "Status", allStatuses: "All statuses", dateFrom: "From",
    dateTo: "To", minSize: "Min. size (MB)", maxSize: "Max. size (MB)", sortBy: "Sort by",
    newest: "Newest", oldest: "Oldest", nameAsc: "Name A–Z", nameDesc: "Name Z–A",
    resultsPerPage: "Results per page", applyFilters: "Apply filters", clearFilters: "Clear",
    previousPage: "Previous", nextPage: "Next", page: "Page", of: "of",
    noFilterResults: "No videos matched these filters.", uploaded: "Uploaded", pending: "Pending",
    processingStatus: "Processing", completed: "Completed", failed: "Failed",
  },
} as const;

export type UiCopyKey = keyof typeof uiCopy.es;

export function translate(locale: AppLocale, key: UiCopyKey) {
  return uiCopy[locale][key];
}
