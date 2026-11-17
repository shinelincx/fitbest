#!/bin/sh
set -eu

stage=$(mktemp -d /published/.release-XXXXXXXX)
trap 'rm -rf -- "$stage"; rm -f -- "$stage.next"' EXIT
cp -a /bundle/. "$stage/"
chmod 755 "$stage"
ln -s "${stage##*/}" "$stage.next"
previous=$(readlink /published/current || true)
mv -Tf -- "$stage.next" /published/current
trap - EXIT

case "$previous" in
  .release-[a-zA-Z0-9]*)
    case "$previous" in
      */*) ;;
      *) rm -rf -- "/published/$previous" ;;
    esac
    ;;
esac
