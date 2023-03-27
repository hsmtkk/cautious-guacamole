#!/bin/sh
for s in artifactregistry.googleapis.com cloudbuild.googleapis.com cloudfunctions.googleapis.com cloudresourcemanager.googleapis.com cloudscheduler.googleapis.com eventarc.googleapis.com iam.googleapis.com run.googleapis.com secretmanager.googleapis.com
do
    gcloud services enable $s
done
