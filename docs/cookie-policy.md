# Cookie Policy

**Tally** (trading as Tally Reading)

**Effective date:** 05-03-2026
**Last updated:** 05-03-2026

> **DRAFT — NOT YET LEGALLY REVIEWED**
>
> This document is an internal draft. It must be reviewed by a qualified
> solicitor before publication.

---

## 1. About this policy

This Cookie Policy explains how Tally Reading ("Tally", "we", "us"),
operated by Scratch IT LTD (company number 08151576), uses cookies and
similar technologies when you use our platform at https://tallyreading.uk.

---

## 2. What are cookies?

Cookies are small text files placed on your device by a website. They are
widely used to make websites work, to remember your preferences, and to
provide information to the site operator. Browser storage (localStorage and
sessionStorage) serves a similar purpose but is accessible only to the
website that created it.

---

## 3. Cookies we set

We set **one** cookie:

| Name | Purpose | Duration | Type |
|---|---|---|---|
| `refresh_token` | Authentication. Keeps you signed in by allowing the browser to obtain a new access token without re-entering your credentials. | 7 days | Strictly necessary |

**Technical details:**
- **HttpOnly** — cannot be read by JavaScript (protects against cross-site
  scripting attacks)
- **Secure** — transmitted only over HTTPS in production
- **SameSite=Strict** — not sent with cross-site requests (protects against
  cross-site request forgery)
- **Path** — restricted to `/api/auth` (not sent with other requests)
- **Cleared on logout** — the cookie is removed when you sign out

This cookie is **strictly necessary** for the Service to function. Without
it, you would need to sign in on every page load. Because it is strictly
necessary, consent is not required under the Privacy and Electronic
Communications Regulations (PECR).

---

## 4. Browser storage we use

In addition to the cookie above, we use your browser's built-in storage for
the following purposes:

### localStorage (persists until cleared)

| Key | Purpose | Category |
|---|---|---|
| Auth token | Stores your short-lived access token (15-minute expiry) so you remain signed in as you navigate the app. Removed on logout. | Strictly necessary |
| User profile | Stores your name, email, and role so the app can display them without making an API call on every page. Removed on logout. | Strictly necessary |
| Auth mode | Records whether the platform is using SSO or email/password authentication. | Strictly necessary |
| Book covers | Caches book cover image URLs to reduce external API calls. Limited to 500 entries, auto-expires after 7 days. Contains no personal data. | Performance |

### sessionStorage (cleared when you close the tab)

| Key | Purpose | Category |
|---|---|---|
| Class filter | Remembers your selected class filter within the current session. | Functional |
| Recently accessed students | Tracks up to 20 recently viewed student IDs for quick access. Contains IDs only, no names or personal data. | Functional |
| Priority list state | Tracks which students you have marked or hidden from the priority list during this session. | Functional |

All browser storage is cleared on logout. sessionStorage is also
automatically cleared when the browser tab is closed.

---

## 5. What we do NOT use

We want to be clear about what Tally does **not** do:

- **No analytics cookies** — we do not use Google Analytics, Matomo, or any
  similar analytics service
- **No advertising cookies** — we do not serve ads or use advertising
  networks
- **No tracking pixels** — we do not use Facebook Pixel, LinkedIn Insight
  Tag, or similar tracking technologies
- **No behavioural profiling** — we do not track your browsing behaviour
  across other websites
- **No third-party marketing cookies** — we do not share data with
  third-party advertisers

---

## 6. Third-party cookies

### Cloudflare

Our platform is hosted on Cloudflare's infrastructure. Cloudflare may set
its own cookies for security and performance purposes (such as bot detection
and DDoS protection). These are set by Cloudflare, not by Tally, and are
classified as strictly necessary. More information is available in
[Cloudflare's cookie policy](https://www.cloudflare.com/cookie-policy/).

### MyLogin (SSO only)

If your school uses MyLogin single sign-on, the MyLogin service may set its
own cookies during the sign-in process. These cookies are managed by MyLogin
(part of Wonde) and are subject to their own privacy and cookie policies.
Tally does not control or have access to these cookies.

---

## 7. Managing cookies

Because we use only strictly necessary cookies, there is no cookie consent
banner. You can delete cookies at any time through your browser settings,
but doing so will sign you out of the Service.

**To delete cookies in common browsers:**
- **Chrome:** Settings > Privacy and Security > Cookies > See all cookies
- **Safari:** Preferences > Privacy > Manage Website Data
- **Firefox:** Settings > Privacy & Security > Cookies and Site Data
- **Edge:** Settings > Cookies and site permissions > Cookies

---

## 8. Changes to this policy

We may update this Cookie Policy from time to time. We will notify
registered users of material changes by email. The "Last updated" date at
the top of this page indicates when the policy was last revised.

---

## 9. Contact us

If you have any questions about our use of cookies, please contact us:

| | |
|---|---|
| **Email** | sam@tallyreading.uk |
| **Data Protection Officer** | Sam Castillo (sam@tallyreading.uk) |
| **Postal address** | Scratch IT LTD, 247 Bishopsworth Road, Bristol, BS13 7LH |

For full details of how we handle personal data, please see our
[Privacy Policy](https://tallyreading.uk/privacy).
