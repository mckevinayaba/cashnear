-- The pilot rail was seeded with a partner's name before any partner agreement
-- or fee confirmation exists. Until fee_verified is set, customers should not
-- be shown a name that implies an arrangement that does not exist yet.
-- Ops rename the rail (and set fee_verified) once a partner confirms.
UPDATE public.cash_rails
   SET label = 'Partner cash-out (pilot)'
 WHERE id = 'gotyme_flash'
   AND NOT fee_verified
   AND label = 'GoTyme via Flash';
