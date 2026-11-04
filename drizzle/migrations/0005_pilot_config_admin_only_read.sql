DROP POLICY IF EXISTS "Authenticated reads pilot config" ON public.pilot_configuration;
DROP POLICY IF EXISTS "Admins read pilot config" ON public.pilot_configuration;
CREATE POLICY "Admins read pilot config" ON public.pilot_configuration
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));