#!/bin/bash
set -e

export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id --profile $AWS_PROFILE)
export AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key --profile $AWS_PROFILE)
export AWS_SESSION_TOKEN=$(aws configure get aws_session_token --profile $AWS_PROFILE)

npm run test:run -- $@
