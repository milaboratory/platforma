#!/bin/bash

# Hello curious developer! If you're wondering, "Why is it working locally but not in CI?" you've come to the right place.
# Here's the deal: In the CI environment, we launch our integration tests inside a Kubernetes Cluster, 
# and all assets reside in the following S3 bucket: milab-euce1-prod-data-s3-platforma-ci.
#
# To make it work in CI, just sync the needed assets. 
# Please bear in mind that the default assets S3 prefix (commonly referred to as a folder for simplicity) is /test-assets/.
# This may contain other folders and files needed for different tests.
# You can sync to a different prefix, but you will also need to change this value in ./helm/values.yaml located at the root of this repository.
# You can change just the keyPrefix and leave the id as it is in the helm values.
#
# This S3 bucket resides in the MiK8S AWS account, so don't forget your credentials. If, for some reason, you are struggling, seek aid from Vladimir Antropov.
#
# Excludes:
# - The script file itself (upload-assets-to-s3.sh)
# - All hidden files and directories (.*)

aws s3 cp --recursive ./ s3://milab-euce1-prod-data-s3-platforma-ci/test-assets/ \
   --exclude "upload-assets-to-s3.sh" \
   --exclude ".*"
