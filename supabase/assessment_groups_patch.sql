-- Add question groups so different assessments draw from different pools
alter table question_bank add column if not exists question_group text default 'assessment-1';
alter table exams add column if not exists question_group text default 'assessment-1';

-- Tag existing questions as assessment-1
update question_bank set question_group = 'assessment-1' where question_group is null;
