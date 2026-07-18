-- Runs every Stage 1 security regression test in order. See README.md for
-- execution instructions and the environment-availability caveat.
\cd :dir
\i 001_customer_kyc_lockdown.sql
\i 002_operator_application_lockdown.sql
\i 003_operator_suspension.sql
\i 004_rls_helper_execute.sql
\i 005_audit_log_integrity.sql
\i 006_storage_provisioning.sql
\i 007_operator_reinstatement_governance.sql
