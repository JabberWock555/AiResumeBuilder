# Auth email templates

Supabase Auth sends these itself (through Resend as its SMTP server). Paste
each into **Authentication → Emails → Templates** in the Supabase dashboard:

| template in the dashboard | file | subject |
| --- | --- | --- |
| Confirm signup | `confirm.html` | Confirm your email |
| Reset password | `recovery.html` | Reset your password |
| Change email address | `email_change.html` | Confirm your new email |

Each link goes to `/auth/confirm` with a token hash, which works even when
the email is opened on a different device from the one that asked for it.
`{{ .SiteURL }}` is the **Site URL** under Authentication → URL Configuration:
set it to your app's address (`http://localhost:3000` in development).

Magic links and invites aren't used.
