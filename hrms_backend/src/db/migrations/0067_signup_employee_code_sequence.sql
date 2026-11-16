CREATE SEQUENCE platform.signup_employee_code_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1
  NO CYCLE;

SELECT setval(
  'platform.signup_employee_code_seq',
  COALESCE((
    SELECT MAX(substring(employee_code FROM 4)::bigint) + 1
    FROM core.users
    WHERE employee_code ~ '^ONB[0-9]{1,9}$'
  ), 1),
  false
);
