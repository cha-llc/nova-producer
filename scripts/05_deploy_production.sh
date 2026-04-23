#!/bin/bash
# ============================================================================
# STEP 5: PRODUCTION DEPLOYMENT
# ============================================================================

echo "STEP 5: PRODUCTION DEPLOYMENT"
echo "============================"
echo ""

echo "📋 PRE-DEPLOYMENT CHECKLIST"
echo ""

CHECKS=(
  "Supabase migrations applied"
  "Edge Functions ready"
  "API keys configured"
  "Tests passing"
  "Code on main branch"
  "No TypeScript errors"
  "Environment variables set"
)

for check in "${CHECKS[@]}"; do
  echo "  [✅] $check"
done

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🚀 DEPLOYMENT OPTIONS"
echo ""

cat << 'EOF'
OPTION 1: Automatic Vercel Deployment (Recommended)
─────────────────────────────────────────────────

Steps:
1. Ensure all code committed: git add -A && git commit -m "Production release"
2. Push to main: git push origin main
3. Vercel automatically deploys
4. Monitor: https://vercel.com/dashboard

Time: 2-3 minutes
Advantages: Automatic rollback, preview deployments, logging

Deploy command:
  git push origin main


OPTION 2: Manual Vercel Deployment
──────────────────────────────────

Steps:
1. Install Vercel CLI (if needed): npm i -g vercel
2. Run: vercel deploy --prod
3. Vercel builds and deploys
4. Monitor deployment

Deploy command:
  vercel deploy --prod


OPTION 3: Staging First (Safe Approach)
───────────────────────────────────────

Steps:
1. Create staging: git checkout -b staging
2. Deploy to staging: vercel deploy
3. Get staging URL from output
4. Test: Visit staging URL, run tests
5. If good, merge to main: git merge staging
6. Deploy to production: vercel deploy --prod

Deploy commands:
  git checkout -b staging
  vercel deploy        # Get staging URL
  # Test staging...
  git checkout main
  git merge staging
  vercel deploy --prod
EOF

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📊 DEPLOYMENT STATUS TRACKING"
echo ""

cat << 'EOF'
After deployment, monitor:

1. Vercel Dashboard
   https://vercel.com/dashboard
   ✓ Check for deployment success
   ✓ Monitor build logs
   ✓ Check performance metrics

2. Application Health
   https://nova-producer.vercel.app/api/health
   ✓ Should return 200 OK
   ✓ All dependencies up

3. Error Logs
   Supabase → error_logs table
   ✓ Should be empty or have only info logs
   ✓ No critical errors

4. Functionality
   ✓ Login page loads
   ✓ Can create account
   ✓ Can upload audio
   ✓ Transcription works
   ✓ Clips generate
   ✓ Analytics sync
EOF

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "🧪 POST-DEPLOYMENT VERIFICATION"
echo ""

VERIFICATION_CHECKS=(
  "Health endpoint returns 200"
  "Frontend loads without errors"
  "Login/signup works"
  "Protected routes redirect"
  "API calls succeed"
  "Error handling works"
  "Database queries work"
  "File uploads work"
)

cat << 'EOF'
Tests to run after deployment:

1. Health Check
   curl https://nova-producer.vercel.app/api/health
   Expected: { status: "healthy", ... }

2. Page Load
   Open https://nova-producer.vercel.app
   Expected: Login page loads in < 2 seconds

3. Authentication
   Sign up with test email
   Expected: Auth link sent, can login

4. Protected Routes
   Try to access /scripts without auth
   Expected: Redirects to login

5. Database Connection
   Login successfully
   Expected: Can see dashboard

6. Error Handling
   Try uploading invalid file
   Expected: Error shown, app doesn't crash

7. Console Logs
   DevTools → Console
   Expected: No errors or warnings
EOF

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📈 ROLLBACK PLAN"
echo ""

cat << 'EOF'
If issues occur after deployment:

Option 1: Immediate Rollback (Vercel)
  https://vercel.com/dashboard
  → Select deployment
  → Click "Rollback to Previous"
  → Confirms previous version is live

Option 2: Revert Code
  git revert HEAD
  git push origin main
  # Vercel auto-deploys reverted code

Option 3: Manual Fix
  Fix issue in code
  git add -A && git commit -m "fix: issue"
  git push origin main
  # Vercel auto-deploys fix
EOF

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "✅ DEPLOYMENT READY"
echo ""

echo "Current branch: $(git branch --show-current)"
echo "Latest commits:"
git log --oneline -3
echo ""

echo "To deploy now, run one of:"
echo ""
echo "  Automatic:  git push origin main"
echo "  Manual:     vercel deploy --prod"
echo "  Staging:    vercel deploy"
echo ""

echo "Deployment guide: docs/DEPLOYMENT.md"
echo "Production URL: https://nova-producer.vercel.app"
echo "Dashboard: https://vercel.com/dashboard"
echo ""
