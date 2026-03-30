# Login Page Polish Design

**Date**: 2026-03-30
**Status**: Approved

## Summary

Two small polish changes to the login page: promote the SSO button above email/password when SSO is enabled, and fix cryptic error messages that expose internal Wonde IDs to teachers.

## Goals

- SSO is the primary login method for school staff — make it visually prominent
- Error messages should be human-readable with actionable next steps
- No internal identifiers (Wonde IDs) shown to end users

## Non-Goals

- Hiding email/password entirely when SSO is enabled (keep it as a fallback)
- Changing the SSO OAuth flow
- Changing any backend authentication logic

## Design

### 1. SSO Button Reorder

**File:** `src/components/Login.js` — `renderMultiTenantForm()`

When `ssoEnabled` is true, the layout changes from:

```
Email field
Password field
[Login] (filled primary)
Forgot password?
── or ──
[Sign in with MyLogin] (outlined)
```

To:

```
[Sign in with MyLogin] (filled primary)
"School staff — use your MyLogin account"
── or sign in with email ──
Email field (muted)
Password field (muted)
[Login] (outlined secondary)
Forgot password?
```

**Implementation details:**

- Move the SSO block (`ssoEnabled && (...)`) from after the form to before it
- SSO button gets the filled gradient style: `background: linear-gradient(135deg, #8AAD8A, #6B8E6B)`, white text, full height (52px)
- Add helper text below SSO button: `Typography` with `color: text.secondary`, `fontSize: 0.75rem`, `mb: 3`
- Divider text changes from `"or"` to `"or sign in with email"`
- Email/password `TextField` `InputProps.sx` get slightly smaller padding and lighter border (`rgba(139, 115, 85, 0.1)` instead of `0.15`)
- Login button becomes outlined: `variant="outlined"`, remove gradient background, add `borderColor: 'rgba(107, 142, 107, 0.3)'`, `color: 'primary.main'`, smaller height (44px)
- When `ssoEnabled` is false, the form renders unchanged (email/password with filled Login button, no SSO section)

### 2. Error Message Fix

**Files:** `src/contexts/AuthContext.js`, `src/routes/mylogin.js`

#### AuthContext.js — error message map (line ~148-155)

Replace two messages in the `reasonMessages` object:

| Reason | Current | New |
|--------|---------|-----|
| `no_school` | `Your account is not linked to a school.` | `Your account isn't linked to a school. Please contact your school administrator.` |
| `school_not_found` | `Your school has not been set up yet. (Wonde ID: ${schoolId}) Please contact your administrator.` | `Your school hasn't been set up on Tally Reading yet. Please ask your school administrator to get in touch with us.` |

Remove the `schoolId` variable extraction from the URL params (it's no longer used in the message).

#### mylogin.js — remove Wonde ID from redirect URL (line 206)

Change:
```js
return c.redirect(`/?auth=error&reason=school_not_found&school_id=${encodeURIComponent(wondeSchoolId)}`);
```

To:
```js
return c.redirect('/?auth=error&reason=school_not_found');
```

The Wonde school ID is already logged server-side at line 205 (`console.error`), so no diagnostic information is lost.

## Files Changed

| File | Change |
|------|--------|
| `src/components/Login.js` | Reorder SSO/email sections in `renderMultiTenantForm()` |
| `src/contexts/AuthContext.js` | Update `school_not_found` and `no_school` error messages, remove `schoolId` variable |
| `src/routes/mylogin.js` | Remove `school_id` query param from redirect URL |

## Testing

- Unit test: Login renders SSO button before email fields when `ssoEnabled` is true
- Unit test: Login renders email fields first when `ssoEnabled` is false (unchanged)
- Unit test: SSO button has filled style, Login button has outlined style when SSO enabled
- Manual test: Verify error messages display correctly for `school_not_found` and `no_school` cases
