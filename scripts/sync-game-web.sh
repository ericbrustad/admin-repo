#!/usr/bin/env bash
# scripts/sync-game-web.sh
# Replaces apps/game-web from SOURCE_BRANCH into BASE_BRANCH, merges other changes,
# pushes a branch, and (optionally) opens a PR.
# Defaults: BASE_BRANCH=copy, SOURCE_BRANCH=work, FOLDER=apps/game-web
set -Eeuo pipefail

BASE_BRANCH="${BASE_BRANCH:-copy}"
SOURCE_BRANCH="${SOURCE_BRANCH:-work}"
FOLDER="${FOLDER:-apps/game-web}"
OPEN_PR="${OPEN_PR:-1}"       # set to 0 to skip PR creation
REMOTE="${REMOTE:-origin}"

log() { printf "\n\033[1;34m[%s]\033[0m %s\n" "$(date +%H:%M:%S)" "$*"; }
die() { printf "\n\033[1;31m[ERROR]\033[0m %s\n\n" "$*" >&2; exit 1; }

# Parse simple flags: --base, --from, --folder, --no-pr
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_BRANCH="$2"; shift 2;;
    --from) SOURCE_BRANCH="$2"; shift 2;;
    --folder) FOLDER="$2"; shift 2;;
    --no-pr) OPEN_PR="0"; shift;;
    *) die "Unknown arg: $1";;
  esac

done

# Preflight
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Run inside a Git repo."
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

log "Fetching remotes..."
git fetch "$REMOTE" --prune

git show-ref --verify --quiet "refs/remotes/$REMOTE/$BASE_BRANCH" || die "Missing remote branch: $REMOTE/$BASE_BRANCH"
git show-ref --verify --quiet "refs/remotes/$REMOTE/$SOURCE_BRANCH" || die "Missing remote branch: $REMOTE/$SOURCE_BRANCH"

if ! git diff --quiet || ! git diff --cached --quiet; then
  die "You have uncommitted changes. Commit/stash them first."
fi

log "Checking out base branch: $BASE_BRANCH"
git switch "$BASE_BRANCH"
git pull --ff-only "$REMOTE" "$BASE_BRANCH"

BRANCH_NAME="chore/sync-$(echo "$FOLDER" | tr '/' '-')-from-${SOURCE_BRANCH}-$(date +%Y%m%d-%H%M%S)"
log "Creating work branch: $BRANCH_NAME"
git switch -c "$BRANCH_NAME"

log "Replacing $FOLDER with version from $REMOTE/$SOURCE_BRANCH (exact state)"
# Stage source version for all files under $FOLDER
git restore --source "$REMOTE/$SOURCE_BRANCH" --staged --worktree -- "$FOLDER" || true

# Remove any extra files that exist in current branch but not in source
# Build sorted lists and delete extras
TMP_A=$(mktemp); TMP_B=$(mktemp)
git ls-tree -r --name-only "$REMOTE/$SOURCE_BRANCH" -- "$FOLDER" | sort > "$TMP_A"
git ls-files "$FOLDER" | sort > "$TMP_B"
# files only in current branch:
comm -23 "$TMP_B" "$TMP_A" | while read -r extra; do
  [[ -n "$extra" ]] && git rm -f -- "$extra" || true
done
rm -f "$TMP_A" "$TMP_B"

git add -A -- "$FOLDER"

if git diff --cached --quiet; then
  log "No changes detected in $FOLDER vs source; continuing."
else
  git commit -m "chore(game-web): replace ${FOLDER} with version from ${SOURCE_BRANCH}
    
Visible note for Eric/Codex:
- This commit force-syncs ${FOLDER} from ${REMOTE}/${SOURCE_BRANCH}.
- Any files previously in ${FOLDER} but not in ${SOURCE_BRANCH} were removed."
fi

log "Merging other changes from $REMOTE/$SOURCE_BRANCH (outside $FOLDER) ..."
set +e
git merge --no-ff "$REMOTE/$SOURCE_BRANCH" -m "merge: bring repo changes from ${SOURCE_BRANCH} (keep ${FOLDER} from ${SOURCE_BRANCH} if conflicts)"
MERGE_RC=$?
set -e

# If there are conflicts under $FOLDER, prefer the SOURCE (theirs) for that path
if [[ $MERGE_RC -ne 0 ]]; then
  if git ls-files -u | grep -q "^.*$FOLDER"; then
    log "Conflicts detected in $FOLDER — taking version from $SOURCE_BRANCH"
    git checkout --theirs -- "$FOLDER" || true
    git add "$FOLDER" || true
  fi

  if ! git diff --name-only --diff-filter=U | grep -q .; then
    log "Finalizing merge after conflict resolution"
    git commit --no-edit || true
  else
    die "Unresolved merge conflicts remain. Resolve them, then run: git add -A && git commit"
  fi
fi

log "Pushing branch to $REMOTE"
git push -u "$REMOTE" HEAD || die "Push failed."

if [[ "$OPEN_PR" == "1" ]] && command -v gh >/dev/null 2>&1; then
  log "Opening PR via GitHub CLI"
  gh pr create --base "$BASE_BRANCH" --head "$BRANCH_NAME" \
    --title "Sync ${FOLDER} from ${SOURCE_BRANCH}; merge other changes" \
    --body "This PR was created by **scripts/sync-game-web.sh** for Codex.

**What it does**
- Replaces \`${FOLDER}\` with the exact content from \`${REMOTE}/${SOURCE_BRANCH}\`
- Merges other repository changes from \`${REMOTE}/${SOURCE_BRANCH}\` (outside \`${FOLDER}\`)
- If any conflicts inside \`${FOLDER}\` occurred, the PR keeps the **${SOURCE_BRANCH}** version

**Notes**
- Visible note per Eric's preference: Codex performed this sync via script.
- Review focus: files outside \`${FOLDER}\`."
else
  log "PR creation skipped (no gh or OPEN_PR=0). Create a PR from $BRANCH_NAME into $BASE_BRANCH in GitHub."
fi

log "Done. Branch: $BRANCH_NAME"
