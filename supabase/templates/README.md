# KorTech auth email templates

Shared by every app on the Supabase **Dev** project. Paste into
Dashboard → Authentication → Emails → Templates.

| Template       | Subject              | File                |
| -------------- | -------------------- | ------------------- |
| Magic link     | Your sign-in code    | `magic_link.html`   |
| Confirm signup | Confirm your email   | `confirmation.html` |

Both show `{{ .Token }}` (the OTP). The confirmation template also keeps a quiet
`{{ .ConfirmationURL }}` link for apps that confirm sign-ups by link.
