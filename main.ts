import { Construct } from "constructs";
import { App, TerraformStack, TerraformAsset, AssetType, GcsBackend } from "cdktf";
import * as google from '@cdktf/provider-google';
import * as path from 'path';

const project = 'cautious-guacamole-381822';
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
                'CITIES': 'Tokyo,Osaka,Fukuoka',
                'PROJECT_ID': project,
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

    const weatherDataset = new google.bigqueryDataset.BigqueryDataset(this, 'weatherDataset', {
        datasetId: 'weather_dataset',
    });    

    const weatherTableSchema = [
    {
        'name': 'longitude',
        'type': 'FLOAT64',
        'mode': 'NULLABLE',
        'description': 'longitude',
    },
    {
        'name': 'latitude',
        'type': 'FLOAT64',
        'mode': 'NULLABLE',
        'description': 'latitude',
    },
    {
        'name': 'weather_main',
        'type': 'STRING',
        'mode': 'NULLABLE',
        'description': 'weather main',
    },
    {
        'name': 'weather_description',
        'type': 'STRING',
        'mode': 'NULLABLE',
        'description': 'weather description',
    },
    {
        'name': 'temperature',
        'type': 'FLOAT64',
        'mode': 'NULLABLE',
        'description': 'temperature',
    },
    {
        'name': 'temperature_min',
        'type': 'FLOAT64',
        'mode': 'NULLABLE',
        'description': 'temperature_min',
    },
    {
        'name': 'temperature_max',
        'type': 'FLOAT64',
        'mode': 'NULLABLE',
        'description': 'temperature_max',
    },
    {
        'name': 'pressure',
        'type': 'INT64',
        'mode': 'NULLABLE',
        'description': 'pressure',
    },
    {
        'name': 'humidity',
        'type': 'INT64',
        'mode': 'NULLABLE',
        'description': 'humidity',
    },
    {
        'name': 'name',
        'type': 'STRING',
        'mode': 'NULLABLE',
        'description': 'name',
    },
]

    const weatherTable = new google.bigqueryTable.BigqueryTable(this, 'weatherTable', {
        datasetId: weatherDataset.datasetId,
        deletionProtection: false,
        tableId: 'weather_table',
        schema: JSON.stringify(weatherTableSchema),
    });

    const transformerRunner = new google.serviceAccount.ServiceAccount(this, 'transformerRunner', {
        accountId: 'transformer-runner',
    });

    new google.projectIamMember.ProjectIamMember(this, 'allowTransformerRunnerInsertBigQuery', {
        member: `serviceAccount:${transformerRunner.email}`,
        project,
        role: 'roles/bigquery.dataEditor',        
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
                'BIG_QUERY_DATASET': weatherDataset.datasetId,
                'BIG_QUERY_TABLE': weatherTable.tableId,
                'PROJECT_ID': project,
            },
            minInstanceCount: 0,
            maxInstanceCount: 1,
            serviceAccountEmail: transformerRunner.email,
        },
    });

  }
}

const app = new App();
new MyStack(app, "cautious-guacamole");
app.synth();
