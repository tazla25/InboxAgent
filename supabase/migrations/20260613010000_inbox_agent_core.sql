CREATE TABLE public.email_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    provider text NOT NULL DEFAULT 'gmail',
    access_token text,
    refresh_token text NOT NULL,
    token_expiry timestamptz,
    is_active boolean DEFAULT true,
    plan text DEFAULT 'free',
    created_at timestamptz DEFAULT now()
);

-- Unique index constraint
CREATE UNIQUE INDEX email_accounts_user_id_email_idx ON public.email_accounts(user_id, email);

-- Performance index
CREATE INDEX email_accounts_user_id_idx ON public.email_accounts(user_id);

-- Security: RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email accounts"
    ON public.email_accounts
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email accounts"
    ON public.email_accounts
    FOR DELETE
    USING (auth.uid() = user_id);
