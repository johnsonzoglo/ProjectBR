ALTER TABLE tasks ADD COLUMN "surveyQuestions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE task_runs ADD COLUMN "surveyAnswers" JSONB;
ALTER TABLE reward_settings ADD COLUMN "minWithdrawalReferrals" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reward_settings ADD CONSTRAINT withdrawal_referral_minimum CHECK ("minWithdrawalReferrals" BETWEEN 0 AND 1000000);
ALTER TABLE tasks DROP CONSTRAINT task_type_valid;
ALTER TABLE tasks ADD CONSTRAINT task_type_valid CHECK ("taskType" IN ('standard','product_experience','image_preference','movie_review','music_review','survey'));
ALTER TABLE tasks DROP CONSTRAINT task_rules;
ALTER TABLE tasks ADD CONSTRAINT task_rules CHECK ("rewardPoints" > 0 AND "dailyLimit" > 0 AND "totalLimit" > 0 AND verification IN ('code','manual','product_experience','image_preference','rating_review','survey') AND ("endsAt" IS NULL OR "endsAt" > "startsAt"));
