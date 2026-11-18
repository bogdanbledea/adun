/* Romanian is the source language: every key starts here, and en.ts must
   provide the same keys (the type checker enforces it). `{name}` marks a value
   filled in by t(key, { name }). */

export const ro = {
  // Language and theme controls
  'language.switch': 'Switch to English',
  'language.short': 'EN',
  'theme.toDark': 'Comută pe tema închisă',
  'theme.toLight': 'Comută pe tema deschisă',

  // Shell
  'brand.home': 'adun — pagina principală',
  'brand.mottoPrefix': 'adun',
  'nav.sections': 'Secțiuni',
  'nav.budget': 'Buget',
  'nav.food': 'Mâncare',
  'nav.reminders': 'Scadențe',
  'footer.copyright': '© {year} adun',
  'footer.privacy': 'Confidențialitate',

  // Sections
  'budget.subtitle': 'Ce intră, ce iese și ce rămâne în fiecare lună.',
  'food.subtitle': 'Cât ai, cât de repede cheltui și ce ai cumpărat.',
  'reminders.subtitle': 'ITP, RCA, rovinietă și verificări, în ordinea în care vin.',

  // Pages
  'page.notFoundTitle': 'Pagina nu există',
  'page.notFoundText': 'Adresa aceasta nu duce nicăieri în aplicație.',
  'page.backToBudget': 'Înapoi la buget',

  'common.loading': 'Se încarcă...',

  // Signing in
  'auth.kicker': 'Caietul digital al casei',
  'auth.heroTitle': 'Intri. Notezi. Vezi clar ce rămâne.',
  'auth.heroText': 'Bugetul lunii, cumpărăturile și scadențele tale rămân în același loc, fără conectare la bancă.',
  'auth.featureBudget': 'Buget organizat pe lunile tale',
  'auth.featureFood': 'Mâncare urmărită săptămână cu săptămână',
  'auth.featureReminders': 'Scadențe anunțate din timp',
  'auth.signInTitle': 'Autentificare',
  'auth.email': 'Email',
  'auth.password': 'Parolă',
  'auth.showPassword': 'Arată parola',
  'auth.hidePassword': 'Ascunde parola',
  'auth.signIn': 'Intră în cont',
  'auth.signingIn': 'Se verifică...',
  'auth.noAccount': 'Nu ai cont?',
  'auth.register': 'Înregistrează-te',
  'auth.registrationsClosed': 'Înregistrările sunt închise',
  'auth.registrationsClosedText': 'Momentan nu acceptăm conturi noi. Dacă ai deja un cont, te poți autentifica.',

  // Creating an account
  'auth.signUpTitle': 'Cont nou',
  'auth.name': 'Nume',
  'auth.newPassword': 'Parolă (min. 12 caractere)',
  'auth.newPasswordHint': 'Litere mici și mari, o cifră și un simbol.',
  'auth.confirmPassword': 'Confirmă parola',
  'auth.passwordTooShort': 'Parola trebuie să aibă cel puțin 12 caractere.',
  'auth.passwordTooLong': 'Parola poate avea cel mult 200 de caractere.',
  'auth.passwordTooSimple': 'Parola trebuie să conțină litere mici și mari, o cifră și un simbol.',
  'auth.passwordsMismatch': 'Parolele nu se potrivesc.',
  'auth.createAccount': 'Creează cont',
  'auth.creatingAccount': 'Se creează contul...',
  'auth.whatIsKept': 'Vezi ce păstrează aplicația',
  'auth.haveAccount': 'Ai deja cont?',
  'auth.accountReady': 'Contul este gata. Intră cu emailul și parola alese.',

  // Privacy page
  'privacyPage.title': 'Confidențialitate',
  'privacyPage.intro': 'Ce păstrează aplicația despre tine, unde și pe cine poți întreba.',
  'privacyPage.storedTitle': 'Ce se păstrează',
  'privacyPage.storedAccount': 'Contul: adresa de email, numele afișat, parola (doar ca hash Argon2, niciodată în clar) și data la care a fost creat.',
  'privacyPage.storedSessions': 'Sesiunile de autentificare: doar un hash al cookie-ului de sesiune, cu data expirării. O sesiune expiră după 30 de zile fără folosire.',
  'privacyPage.storedNot': 'Aplicația nu se conectează la bancă și nu păstrează adresa IP sau browserul cu care te autentifici.',
  'privacyPage.whereTitle': 'Unde',
  'privacyPage.whereText': 'Toate datele stau într-o singură bază de date pe serverul care rulează aplicația. Aplicația nu le trimite nicăieri altundeva.',
  'privacyPage.browserTitle': 'În browser',
  'privacyPage.browserCookie': 'Un singur cookie, cel de sesiune, necesar ca să rămâi autentificat. Nu poate fi citit de scripturi.',
  'privacyPage.browserStorage': 'În memoria locală a browserului: limba și tema alese.',
  'privacyPage.browserNoTracking': 'Fără reclame, fără statistici de trafic, fără scripturi de la terți.',
  'privacyPage.contactTitle': 'Contact',
  'privacyPage.contactAdmin': 'Aplicația rulează pe un server administrat de o anumită persoană, care decide cum sunt folosite datele de pe el. Pentru întrebări sau cereri privind datele tale, adresează-te ei.',

  // Errors, by the server's error code
  'error.invalid_credentials': 'Email sau parolă incorecte.',
  'error.registrations_disabled': 'Înregistrările noi sunt dezactivate.',
  'error.weak_password': 'Parola trebuie să aibă 12–200 de caractere, cu litere mici și mari, o cifră și un simbol.',
  'error.network_error': 'Serverul nu răspunde. Verifică conexiunea și încearcă din nou.',
  'error.unauthorized': 'Sesiunea a expirat. Autentifică-te din nou.',
  'error.forbidden': 'Nu ai acces la această acțiune.',
  'error.not_found': 'Nu a fost găsit.',
  'error.invalid_input': 'Datele trimise nu sunt valide.',
  'error.rate_limited': 'Prea multe cereri. Încearcă din nou mai târziu.',
  'error.payload_too_large': 'Cererea este prea mare.',
  'error.internal_error': 'A apărut o eroare neașteptată.',
  'error.unknown': 'Ceva nu a mers. Încearcă din nou.',
}

export type MessageKey = keyof typeof ro

export const roMottos = ['banii familiei', 'liniștea lunară', 'ce contează', 'bani, nu griji', 'azi pentru mâine']
