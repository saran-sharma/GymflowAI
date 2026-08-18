# GymFlow AI --- Login Page: Next Changes Plan

## Purpose

This document defines the **next changes for the GymFlow AI login
page**.

The current login UI is visually strong and should **not be redesigned
from scratch**. Keep the existing SLAM / GymFlow AI branding, dark
premium aesthetic, typography, gold accent, spacing, and overall visual
language.

The goal is to make the login experience feel **production-ready,
simple, trustworthy, and appropriate for Members, Trainers, and
Owners**.

------------------------------------------------------------------------

# 1. Current Login Page

The current page contains:

-   SLAM logo + GymFlow AI
-   "Train smarter. Perform better."
-   Email / Phone field
-   Password field
-   Forgot password
-   Sign in
-   Passkey button marked "Not available yet"
-   Apple login
-   Google login
-   "Contact your branch"

The visual design is good.

## Do NOT change

Keep:

-   Black / near-black background
-   SLAM branding
-   Gold primary accent
-   Premium editorial typography
-   Large "Train smarter. Perform better." hero
-   Rounded cards and inputs
-   Minimal iconography
-   Overall spacing and visual hierarchy

------------------------------------------------------------------------

# 2. Remove Unavailable Authentication Options

## Remove from the UI for now

### Passkey

Do NOT display:

> Sign in with a passkey\
> Not available yet

An unavailable feature makes the product look unfinished.

Passkey support can be added later when it is actually implemented.

### Apple / Google

OAuth is not active yet.

Therefore, **do not show Apple or Google login buttons as disabled/fake
functionality**.

For the current build, the login page should expose only authentication
methods that actually work.

OAuth can be introduced later without redesigning the entire page.

------------------------------------------------------------------------

# 3. Change the Initial Login Flow

Instead of showing email/phone + password simultaneously, use a
**two-step login flow**.

## Step 1 --- Identify the account

Show:

``` text
Welcome back.

Mobile number or email

[ Enter mobile number or email ]

[ Continue ]
```

Supporting both mobile number and email is important because:

-   Members may primarily identify themselves by their phone number.
-   Trainers and Owners may use email.
-   Existing accounts may already use either identifier.

Do not ask the user to select:

-   Member
-   Trainer
-   Owner

The authenticated account should determine the role.

------------------------------------------------------------------------

# 4. Step 2 --- Authenticate

After the identifier is submitted, show the appropriate authentication
screen.

Example:

``` text
Welcome back, Vikas.

SLAM Nagalkeni
Trainer

Password

[ • • • • • • • •    👁 ]

Forgot password?

[ Sign in ]
```

The role should be informational only.

The user does not choose their role.

------------------------------------------------------------------------

# 5. Role-Based Routing

After successful authentication:

``` text
Authenticated account
        |
        +---- Owner
        |       |
        |       └── Owner Dashboard
        |
        +---- Trainer
        |       |
        |       └── Trainer Home
        |
        └---- Member
                |
                └── Member Home
```

The backend/database should determine the user's role.

Do NOT create a role-selection screen.

The user should simply think:

> "I am logging into GymFlow."

GymFlow determines where they belong.

------------------------------------------------------------------------

# 6. Recommended First Screen

The first screen should look approximately like:

``` text
SLAM GymFlow AI

Train smarter.
Perform better.

Your fitness journey,
all in one place.


Welcome back.

MOBILE NUMBER OR EMAIL

[ Enter mobile number or email ]

[ Continue ]


Don't have an account?

Contact your SLAM branch
```

Keep the page visually spacious.

Do not add unnecessary marketing content.

------------------------------------------------------------------------

# 7. Mobile Number Experience

If the user enters a phone number:

``` text
Mobile number

🇮🇳 +91  [ 90000 00000 ]
```

Use the correct country formatting.

Do not force users to manually type a country code if the app already
knows the user's region.

For India, default to:

``` text
+91
```

but allow the international format if the product later expands to other
countries.

------------------------------------------------------------------------

# 8. Password Screen

Once the account is identified:

``` text
Welcome back, Aditya.

SLAM Nagalkeni

PASSWORD

[ • • • • • • • •    👁 ]

Forgot password?

[ Sign in ]
```

Requirements:

-   Password visibility toggle
-   Password manager compatibility
-   Paste should work
-   Keyboard navigation should work
-   Clear loading state after pressing Sign in
-   Prevent accidental multiple submissions
-   Show a useful generic error if authentication fails

Do not reveal whether:

-   the email exists
-   the phone exists
-   the password was correct
-   the account is disabled

Use a generic authentication failure message.

Example:

> Invalid email/mobile number or password.

This follows OWASP guidance to avoid account enumeration through
authentication error messages.

------------------------------------------------------------------------

# 9. Forgot Password

Forgot password should be fully designed even if backend implementation
comes slightly later.

## Screen 1

``` text
Reset your password

Enter the mobile number or email
linked to your GymFlow account.

[ Mobile / Email ]

[ Send reset code ]
```

## Response

Do not reveal whether the account exists.

Use:

> If an account matches those details, we'll send instructions to reset
> your password.

This prevents account enumeration.

## Verification

If OTP is implemented:

``` text
Verify your account

Enter the 6-digit code sent to
+91 ••••• 00000

[ _ _ _ _ _ _ ]

Resend code
```

## New Password

``` text
Create a new password

New password
[________________]

Confirm password
[________________]

[ Update password ]
```

After a successful reset:

``` text
Password updated.

Please sign in with your new password.

[ Back to sign in ]
```

Do not automatically log the user in after password reset.

------------------------------------------------------------------------

# 10. Future Authentication Roadmap

The login architecture should leave room for:

### V1

-   Email/mobile identifier
-   Password
-   Forgot password
-   Secure session
-   Role-based routing

### V1.5

-   OTP recovery
-   Optional MFA for Owners
-   Login/session security notifications

### V2

-   Passkeys
-   Apple OAuth
-   Google OAuth

Do not build the UI around future functionality before the functionality
exists.

------------------------------------------------------------------------

# 11. Passkeys --- Future

When passkeys become available, add:

``` text
[ Sign in with passkey ]
```

Do not show:

``` text
Not available yet
```

A passkey should only be displayed when the account/device is eligible.

Passkeys are a strong future option because they can use device
biometrics/PIN and provide phishing-resistant authentication when
implemented correctly.

------------------------------------------------------------------------

# 12. Owner / Trainer Security

GymFlow has three roles:

-   Owner
-   Trainer
-   Member

The Owner account has access to sensitive business information such as:

-   Payments
-   Outstanding balances
-   Branch performance
-   Member information
-   Trainer information
-   Operations
-   Alerts
-   Business rules

Therefore, authentication should not be treated equally for every role
forever.

Recommended future security model:

``` text
Member
Password / Passkey
        |
        ↓
Normal application access


Trainer
Password / Passkey
        |
        ↓
Normal application access


Owner
Password / Passkey
        |
        ↓
Additional MFA for sensitive operations
```

Do not implement unnecessary MFA friction for every member immediately.

------------------------------------------------------------------------

# 13. Login Security Requirements

The UI is only one part of the login feature.

The implementation should also include:

-   HTTPS/TLS only
-   Secure session handling
-   Login throttling
-   Protection against brute-force attempts
-   Protection against credential stuffing
-   Generic authentication errors
-   Secure password storage
-   Secure password reset tokens/codes
-   Expiring single-use reset tokens/codes
-   Authentication event logging
-   Session invalidation where appropriate
-   Re-authentication for sensitive account changes

These requirements should be implemented server-side and should not be
treated as UI-only features.

------------------------------------------------------------------------

# 14. Account Creation

Do NOT add a normal public:

> Create account

button.

GymFlow is a gym-managed platform.

The current model should remain:

``` text
Don't have an account?

Contact your SLAM branch
```

The branch/Owner/authorized staff can create or invite the
member/trainer account.

This also prevents random public registrations.

------------------------------------------------------------------------

# 15. Login Loading States

When the user presses Continue:

``` text
[ Checking account... ]
```

When signing in:

``` text
[ Signing in... ]
```

The button must be disabled during the request.

Do not allow repeated taps to create multiple requests.

------------------------------------------------------------------------

# 16. Login Error States

### Invalid credentials

``` text
Invalid email/mobile number or password.
```

### Network error

``` text
We couldn't reach GymFlow right now.

Check your connection and try again.
```

### Too many attempts

``` text
Too many attempts.

Please wait a few minutes before trying again.
```

### Account issue

Do not expose sensitive account-state details.

Instead:

``` text
We couldn't sign you in.

If you believe your account should be active,
contact your SLAM branch.
```

------------------------------------------------------------------------

# 17. Successful Login Transition

After authentication, use a short branded transition instead of
immediately jumping to the dashboard.

Example:

``` text
SLAM

Good morning, Aditya.

Let's get moving.
```

Then route to the correct home page.

This should be subtle and fast.

Do not turn it into a splash screen that delays the user.

------------------------------------------------------------------------

# 18. Greeting Should Be Dynamic

After login, the application can eventually use:

``` text
Good morning, Aditya.
```

``` text
Good afternoon, Aditya.
```

``` text
Good evening, Aditya.
```

This same greeting system will be reused on the Member, Trainer, and
Owner home pages.

------------------------------------------------------------------------

# 19. Final Login Screen Structure

Recommended V1:

``` text
┌─────────────────────────────────────┐

              SLAM
          GymFlow AI

       Train smarter.
       Perform better.

       Your fitness journey,
       all in one place.


       Welcome back.

       MOBILE NUMBER OR EMAIL

       ┌─────────────────────────────┐
       │ Enter mobile number or email│
       └─────────────────────────────┘

       ┌─────────────────────────────┐
       │          Continue            │
       └─────────────────────────────┘


       Don't have an account?

       Contact your SLAM branch

└─────────────────────────────────────┘
```

Then:

``` text
Identifier
    ↓
Account found
    ↓
Password
    ↓
Authentication
    ↓
Role detected
    ↓
Owner / Trainer / Member Home
```

------------------------------------------------------------------------

# 20. Important Product Decision

Do not over-engineer the login page.

The login page's job is:

1.  Identify the user.
2.  Authenticate the user securely.
3.  Establish a secure session.
4.  Determine the user's role.
5.  Send them to the correct GymFlow experience.

Everything else should stay out of the login screen.

------------------------------------------------------------------------

# 21. Implementation Instructions for Claude / LLM

When implementing this plan:

1.  Inspect the existing login page before changing it.
2.  Preserve the current visual design language.
3.  Do not redesign the entire authentication page.
4.  Remove unavailable Passkey UI.
5.  Remove Apple/Google UI until OAuth is actually functional.
6.  Change the first step to Mobile Number or Email.
7.  Implement a two-step authentication flow.
8.  Show password only after the identifier step.
9.  Add password visibility toggle.
10. Add Forgot Password flow UI.
11. Add loading states.
12. Add proper error states.
13. Keep "Contact your SLAM branch" instead of public registration.
14. Do not add role selection.
15. Route users according to the authenticated backend role.
16. Keep the implementation ready for future Passkeys/OAuth.
17. Do not create fake/demo authentication behavior that looks
    production-ready.
18. Keep the existing dark SLAM/GymFlow premium aesthetic.
19. Make the page responsive for mobile and desktop.
20. Do not change other Member, Trainer, or Owner screens as part of
    this task unless required for authentication routing.

------------------------------------------------------------------------

# 22. Acceptance Criteria

The login page is considered complete when:

-   [ ] Existing branding is preserved.
-   [ ] No unavailable authentication options are displayed.
-   [ ] User can enter mobile number or email.
-   [ ] User proceeds to password authentication.
-   [ ] Password visibility toggle works.
-   [ ] Continue/Sign in has loading states.
-   [ ] Failed authentication uses a generic message.
-   [ ] Forgot password flow is represented.
-   [ ] Password reset does not reveal whether an account exists.
-   [ ] No public account creation is exposed.
-   [ ] No Member/Trainer/Owner role selector exists.
-   [ ] Successful authentication routes based on backend role.
-   [ ] Member → Member Home.
-   [ ] Trainer → Trainer Home.
-   [ ] Owner → Owner Dashboard.
-   [ ] OAuth can be added later without redesigning the flow.
-   [ ] Passkeys can be added later without redesigning the flow.
-   [ ] UI remains consistent with existing GymFlow screens.
-   [ ] Authentication security is implemented server-side, not only
    visually.

------------------------------------------------------------------------

## Research Basis

The authentication recommendations in this plan are informed by current
OWASP authentication guidance, particularly around secure password
recovery, generic authentication responses, login throttling, MFA,
session security, password-manager compatibility, and avoiding account
enumeration.

OWASP recommends generic responses for login and password recovery so
attackers cannot easily determine whether an account exists. It also
recommends secure, single-use, expiring password-reset tokens/codes and
protections against excessive automated reset requests.

Sources:

-   OWASP Authentication Cheat Sheet
-   OWASP Forgot Password Cheat Sheet
-   OWASP Multifactor Authentication Cheat Sheet

The final implementation should still be reviewed against the
authentication provider's specific capabilities and the application's
backend architecture.
