import { Construct } from "constructs";
import { App, TerraformStack, TerraformAsset, AssetType } from "cdktf";
import * as google from '@cdktf/provider-google';
import * as path from 'path';

const project = 'cautious-guacamole-381604';
const region = 'us-central1';

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new google.provider.GoogleProvider(this, 'google', {
        project,
        region,
    });

    new google.cloudbuildTrigger.CloudbuildTrigger(this, 'buildTrigger', {
        filename: 'cloudbuild.yaml',
        github: {
            name: 'cautious-guacamole',
            owner: 'hsmtkk',
            push: {
                branch: '.*',
            },
        },
    });

    const assetBucket = new google.storageBucket.StorageBucket(this, 'assetBucket', {
        location: region,
        name: `asset-bucket-${project}`,
    });

    const transformerQueue = new google.pubsubTopic.PubsubTopic(this, 'transformerQueue', {
        name: 'transformer-queue',
    });

    const openWeatherSecret = new google.secretManagerSecret.SecretManagerSecret(this, 'openWeatherSecret', {
        secretId: 'open-weather-secret',
        replication: {
            automatic: true,
        },
    });

    new google.secretManagerSecretVersion.SecretManagerSecretVersion(this, 'openWeatherSecretVersion', {
        secret: openWeatherSecret.id,
        secretData: 'dummy',
    });

    const weatherGetterRunner = new google.serviceAccount.ServiceAccount(this, 'weatherGetterRunner', {
        accountId: 'weather-getter-runner',
    });

    new google.projectIamMember.ProjectIamMember(this, 'allowWeatherGetterRunnerAccessingSecret', {
        member: `serviceAccount:${weatherGetterRunner.email}`,
        project,
        role: 'roles/secretmanager.secretAccessor',
    });

    new google.projectIamMember.ProjectIamMember(this, 'allowWeatherGetterRunnerPublishingPubSub', {
        member: `serviceAccount:${weatherGetterRunner.email}`,
        project,
        role: 'roles/pubsub.publisher',        
    });

    const weatherGetterAsset = new TerraformAsset(this, 'weatherGetterAsset', {
        path: path.resolve('weathergetter'),
        type: AssetType.ARCHIVE,
    });

    const weatherGetterObject = new google.storageBucketObject.StorageBucketObject(this, 'weatherGetterObject', {
        bucket: assetBucket.name,
        name: weatherGetterAsset.assetHash,
        source: weatherGetterAsset.path,
    });

    const weatherGetter = new google.cloudfunctions2Function.Cloudfunctions2Function(this, 'weatherGetter', {
        buildConfig: {
            entryPoint: 'GetWeather',
            runtime: 'go120',
            source: {
                storageSource: {
                    bucket: assetBucket.name,
                    object: weatherGetterObject.name,
                },
            },
        },
        location: region,
        name: 'weather-getter',
        serviceConfig: {
            environmentVariables: {
                'CITY': 'Tokyo',
                'TRANSFORMER_QUEUE': transformerQueue.name,
            },
            minInstanceCount: 0,
            maxInstanceCount: 1,
            secretEnvironmentVariables: [{
                key: 'OPEN_WEATHER_API_KEY',
                projectId: project,
                secret: openWeatherSecret.secretId,
                version: '2',
            }],
            serviceAccountEmail: weatherGetterRunner.email,
        },
    });

    new google.cloudSchedulerJob.CloudSchedulerJob(this, 'scheduler', {
        name: 'scheduler',
        httpTarget: {
            uri: weatherGetter.serviceConfig.uri,
        },
        schedule: '* * * * *',
    });

    const transformerRunner = new google.serviceAccount.ServiceAccount(this, 'transformerRunner', {
        accountId: 'transformer-runner',
    });

    new google.projectIamMember.ProjectIamMember(this, 'allowTransformerRunnerPublishingPubSub', {
        member: `serviceAccount:${transformerRunner.email}`,
        project,
        role: 'roles/pubsub.publisher',        
    });

    const transformerAsset = new TerraformAsset(this, 'transformerAsset', {
        path: path.resolve('transformer'),
        type: AssetType.ARCHIVE,
    });

    const transformerObject = new google.storageBucketObject.StorageBucketObject(this, 'transformerObject', {
        bucket: assetBucket.name,
        name: transformerAsset.assetHash,
        source: transformerAsset.path,
    });

    const bigQueryQueue = new google.pubsubTopic.PubsubTopic(this, 'bigQueryQueue', {
        name: 'big-query-queue',
    });

    new google.cloudfunctions2Function.Cloudfunctions2Function(this, 'transformer', {
        buildConfig: {
            entryPoint: 'Transform',
            runtime: 'go120',
            source: {
                storageSource: {
                    bucket: assetBucket.name,
                    object: transformerObject.name,
                },
            },
        },
        eventTrigger: {
            eventType: 'google.cloud.pubsub.topic.v1.messagePublished',
            pubsubTopic: transformerQueue.id,
        },
        location: region,
        name: 'transformer',
        serviceConfig: {
            environmentVariables: {
                'BIG_QUERY_QUEUE': bigQueryQueue.name,
            },
            minInstanceCount: 0,
            maxInstanceCount: 1,
            serviceAccountEmail: transformerRunner.email,
        },
    });

    const weatherDataset = new google.bigqueryDataset.BigqueryDataset(this, 'weatherDataset', {
        datasetId: 'weather_dataset',
    });

    new google.bigqueryTable.BigqueryTable(this, 'weatherTable', {
        datasetId: weatherDataset.datasetId,
        tableId: 'weather_table',
    });

  }
}

const app = new App();
new MyStack(app, "cautious-guacamole");
app.synth();
