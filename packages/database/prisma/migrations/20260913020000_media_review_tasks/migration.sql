ALTER TABLE task_runs ADD COLUMN rating INTEGER;
ALTER TABLE task_runs ADD CONSTRAINT task_rating_valid CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
ALTER TABLE tasks DROP CONSTRAINT task_type_valid;
ALTER TABLE tasks ADD CONSTRAINT task_type_valid CHECK ("taskType" IN ('standard','product_experience','image_preference','movie_review','music_review'));
ALTER TABLE tasks DROP CONSTRAINT task_rules;
ALTER TABLE tasks ADD CONSTRAINT task_rules CHECK ("rewardPoints" > 0 AND "dailyLimit" > 0 AND "totalLimit" > 0 AND verification IN ('code','manual','product_experience','image_preference','rating_review') AND ("endsAt" IS NULL OR "endsAt" > "startsAt"));
