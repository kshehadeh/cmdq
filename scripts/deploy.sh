#! /bin/bash

# Check for required environment variables
if [ -z "$GIT_EMAIL" ]; then
  echo "GIT_EMAIL is not set. Please set GIT_EMAIL."
  exit 1
fi

if [ -z "$GIT_NAME" ]; then
  echo "GIT_NAME is not set. Please set GIT_NAME."
  exit 1
fi

if [ -z "$NPM_TOKEN" ]; then
  echo "NPM_TOKEN is not set. Please set NPM_TOKEN."
  exit 1
fi

if [ -z "$GITHUB_TOKEN" ]; then 
    echo "GITHUB_TOKEN is not set. Please set GITHUB_TOKEN."
    exit 1
fi

# Make sure we're on the master branch
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Not on master branch. Please switch to the master branch before deploying."
  exit 1
fi

# Setup the git config if not already setup
if [ -z "$(git config --global user.email)" ]; then
    echo "Setting github config user"
    git config --global user.email "${GIT_EMAIL}"
    git config --global user.name "${GIT_NAME}"  
    git remote set-url origin https://x-access-token:$GITHUB_TOKEN@github.com/kshehadeh/cmdq
fi

# Setup npmrc publish
npm config list | grep -q //registry.npmjs.org/:_authToken
result=$?
echo $result
if [ $result -ne 0 ]; then
    echo "Setting npm auth token"
    echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
fi

# Bump the version
npm run increment

# Build, and publish
npm install
npm run build
# npm publish --access public

# Commit the version bump
git add .
git commit -m "Bump version"
git push
