ALTER TABLE tasks DROP CONSTRAINT task_type_valid;
ALTER TABLE tasks ADD CONSTRAINT task_type_valid CHECK ("taskType" IN ('standard','product_experience','image_preference'));
ALTER TABLE tasks DROP CONSTRAINT task_rules;
ALTER TABLE tasks ADD CONSTRAINT task_rules CHECK ("rewardPoints" > 0 AND "dailyLimit" > 0 AND "totalLimit" > 0 AND verification IN ('code','manual','product_experience','image_preference') AND ("endsAt" IS NULL OR "endsAt" > "startsAt"));
