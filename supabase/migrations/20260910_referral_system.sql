-- Migration: Referral System (Kode Undangan & Hadiah Kuota Klip)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_count INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bonus_credits INT DEFAULT 0;

-- Generate referral_code for existing users using first 8 chars of user_id
UPDATE public.profiles
SET referral_code = LOWER(SUBSTRING(user_id::text, 1, 8))
WHERE referral_code IS NULL;

-- Trigger to auto-assign referral_code for new profiles
CREATE OR REPLACE FUNCTION public.set_user_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := LOWER(SUBSTRING(NEW.user_id::text, 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_referral_code ON public.profiles;
CREATE TRIGGER trigger_set_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_user_referral_code();
