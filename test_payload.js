// Test what payload is being sent
const show = {
  heygen_voice_id: "27dd6930bc0444fb8f51e0f1575641c7",
  avatar_id: "1244e891015a4e79be9bec2073163888"
};

const payload = {
  script_id: "test-id",
  show_name: "confession_court",
  voice_id: show.heygen_voice_id,
  avatar_id: show.avatar_id,
};

console.log(JSON.stringify(payload, null, 2));
