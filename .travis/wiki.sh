#!/bin/sh -e

setup_git() {
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "Travis CI"
}

update_wiki() {
  rm -rf ioBroker.zigbee.wiki
  git clone https://${GH_TOKEN}@github.com/ioBroker/ioBroker.zigbee.wiki.git
  npm run docgen ioBroker.zigbee.wiki
  cd ioBroker.zigbee.wiki
  git add -A
  git diff-index --quiet HEAD || git commit -m "Travis CI: update wiki"
  git push origin
  cd ..
  rm -rf ioBroker.zigbee.wiki
}

# Only update wiki if on master branch and not pull request
if [ "$TRAVIS_BRANCH" = "master" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  echo "Updating wiki!"
  setup_git
  update_wiki
else
  echo "Not updating wiki, triggered by pull request or not on master branch"
fi