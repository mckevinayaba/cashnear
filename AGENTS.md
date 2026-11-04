<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- vite.config.ts must never throw on missing Supabase env; only warn. Because root .env is git-ignored here (published builds never see it), vite.config.ts fills missing VITE_SUPABASE_* from committed cloud.public.json (public URL + publishable key only, owner-approved); real env always wins.
