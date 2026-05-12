-- Change default availability from 'available' (true) to 'away' (false)
-- for both consultants and attorneys. New users start as away/offline;
-- they can toggle to available/online manually when ready.
alter table consultants alter column available set default false;
alter table attorneys  alter column available set default false;
