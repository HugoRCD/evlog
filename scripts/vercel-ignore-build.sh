#!/bin/sh
# Vercel "Ignored Build Step" for one app: exit 0 skips the build, exit 1 builds.
# The changesets release branch is never previewed, so it never builds.
[ "$VERCEL_GIT_COMMIT_REF" = "changeset-release/main" ] && exit 0
[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1
git fetch --unshallow >/dev/null 2>&1
npx turbo query affected --packages "$1" --exit-code --base "$VERCEL_GIT_PREVIOUS_SHA" || exit 1
