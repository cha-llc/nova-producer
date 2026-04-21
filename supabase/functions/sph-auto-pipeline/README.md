# sph-auto-pipeline v1
Full automated SPH pipeline: approve → HeyGen → social content → Socialblu schedule
Actions: start | continue
- start: called by sph-pipeline on approve — queues first HeyGen render, creates ai_episodes
- continue: called by nova-poll on video complete — generates social content, schedules, triggers next
