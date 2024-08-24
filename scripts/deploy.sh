#! /bin/bash

# Make sure there's no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "There are uncommitted changes. Please commit or stash them before deploying."
  exit 1
fi

# Make sure we're on the master branch
if [ "$(git rev-parse --abbrev-ref HEAD)" != "master" ]; then
  echo "Not on master branch. Please switch to the master branch before deploying."
  exit 1
fi

# Make sure we're up to date with the remote
git pull --ff-only

# Bump the version
npm run increment

# Run tests, build, and publish
npm test
npm run build
npm publish --access public

# Commit the version bump
git add package.json
git commit -m "Bump version"
git push
