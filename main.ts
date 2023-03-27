import { Construct } from "constructs";
import { App, TerraformStack, TerraformAsset, AssetType, GcsBackend } from "cdktf";
import * as google from '@cdktf/provider-google';
import * as path from 'path';

const project = 'cautious-guacamole-381822';
const projectNumber = '932118107698';
const region = 'us-central1';
const repository = 'cautious-guacamole';

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new google.provider.GoogleProvider(this, 'google', {
        project,
        region,
    });

    new GcsBackend(this, {
        bucket: `backend-${project}`,
    });

    new google.cloudbuildTrigger.CloudbuildTrigger(this, 'buildTrigger', {
        filename: 'cloudbuild.yaml',
        github: {
            name: repository,
            owner: 'hsmtkk',
            push: {
                branch: '.*',
            },
        },
    });

    const assetBucket = new google.storageBucket.StorageBucket(this, 'assetBucket', {
        autoclass: {
            enabled: true,
        },
        forceDestroy: true,
        lifecycleRule: [{
            action: {
                type: 'Delete',
            },
            condition: {
                age: 1,
            },
        }],
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
                version: '1',
            }],
            serviceAccountEmail: weatherGetterRunner.email,
        },
    });

    const schedulerRunner = new google.serviceAccount.ServiceAccount(this, 'schedulerRunner', {
        accountId: 'scheduler-runner',
    });

    new google.projectIamMember.ProjectIamMember(this, 'allowSchedulerRunnerInvokeFunction', {
        member: `serviceAccount:${schedulerRunner.email}`,
        project,
        role: 'roles/run.invoker',
    });

    new google.cloudSchedulerJob.CloudSchedulerJob(this, 'scheduler', {
        name: 'scheduler',
        httpTarget: {
            oidcToken: {
                serviceAccountEmail: schedulerRunner.email,
            },
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

    const weatherTableSchema = [{
        'name': 'data',
        'type': 'STRING',
        'mode': 'NULLABLE',
        'description': 'the data',
    }]

    const weatherTable = new google.bigqueryTable.BigqueryTable(this, 'weatherTable', {
        datasetId: weatherDataset.datasetId,
        deletionProtection: false,
        tableId: 'weather_table',
        schema: JSON.stringify(weatherTableSchema),
    });

    new google.projectIamMember.ProjectIamMember(this, 'allowPubSubBigQuery', {
        member: `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
        project,
        role: 'roles/bigquery.admin',
    });

    new google.pubsubSubscription.PubsubSubscription(this, 'weatherTableSubscription', {
        bigqueryConfig: {
            table: `${project}.${weatherDataset.datasetId}.${weatherTable.tableId}`,
        },
        name: 'weather-table',
        topic: bigQueryQueue.name,
    });

  }
}

const app = new App();
new MyStack(app, "cautious-guacamole");
app.synth();
