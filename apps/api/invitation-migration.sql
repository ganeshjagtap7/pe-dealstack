-- Invitation System Migration
-- Enables firm admins to invite team members via email

-- 1. Create Invitation table
CREATE TABLE IF NOT EXISTS public."Invitation" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    "firmName" text NOT NULL,
    role text NOT NULL DEFAULT 'MEMBER',
    "invitedBy" uuid NOT NULL REFERENCES public."User"(id),
    status text NOT NULL DEFAULT 'PENDING',
    token text NOT NULL UNIQUE,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "acceptedAt" timestamp with time zone,

    -- Constraints
    CONSTRAINT check_invitation_status CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT check_invitation_role CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER'))
);

-- 2. Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_invitation_email ON public."Invitation"(email);
CREATE INDEX IF NOT EXISTS idx_invitation_firm ON public."Invitation"("firmName");
CREATE INDEX IF NOT EXISTS idx_invitation_token ON public."Invitation"(token);
CREATE INDEX IF NOT EXISTS idx_invitation_status ON public."Invitation"(status);
CREATE INDEX IF NOT EXISTS idx_invitation_invited_by ON public."Invitation"("invitedBy");

-- 3. Unique constraint - only one pending invitation per email per firm
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_invitation
ON public."Invitation"(email, "firmName")
WHERE status = 'PENDING';

-- 4. Function to auto-expire invitations (run periodically via cron or trigger)
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void AS $$
BEGIN
    UPDATE public."Invitation"
    SET status = 'EXPIRED'
    WHERE status = 'PENDING'
    AND "expiresAt" < now();
END;
$$ LANGUAGE plpgsql;

-- 5. Enable RLS (Row Level Security) for Invitation table
ALTER TABLE public."Invitation" ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Users can view invitations they sent
CREATE POLICY "Users can view their sent invitations"
ON public."Invitation"
FOR SELECT
USING (auth.uid() IN (
    SELECT "authId" FROM public."User" WHERE id = "invitedBy"
));

-- Users can view invitations for their email
CREATE POLICY "Users can view invitations sent to them"
ON public."Invitation"
FOR SELECT
USING (email = auth.email());

-- Users can create invitations (API validates firm membership)
CREATE POLICY "Authenticated users can create invitations"
ON public."Invitation"
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update invitations they sent (revoke)
CREATE POLICY "Users can update their sent invitations"
ON public."Invitation"
FOR UPDATE
USING (auth.uid() IN (
    SELECT "authId" FROM public."User" WHERE id = "invitedBy"
));

-- Verification queries (for testing):
-- SELECT * FROM public."Invitation" LIMIT 10;
-- SELECT * FROM public."Invitation" WHERE status = 'PENDING' AND "expiresAt" > now();
