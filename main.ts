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
    });

    const asset = new TerraformAsset(this, 'asset', {
        path: path.resolve('function'),
        type: AssetType.ARCHIVE,
    });

    const assetBucket = new google.storageBucket.StorageBucket(this, 'assetBucket', {
        location: region,
        name: `asset-bucket-${project}`,
    });

    const assetObject = new google.storageBucketObject.StorageBucketObject(this, 'assetObject', {
        bucket: assetBucket.name,
        name: asset.assetHash,
        source: asset.path,
    });

    const transformQueue = new google.pubsubTopic.PubsubTopic(this, 'transformQueue', {
        name: 'transform-queue',
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

    const weatherGetterRunner = new google.serviceAccount.ServiceAccount(this, 'weatherGetRunner', {
        accountId: 'weather-get-runner',
    });

    const weatherGetter = new google.cloudfunctions2Function.Cloudfunctions2Function(this, 'weatherGetter', {
        buildConfig: {
            entryPoint: 'GetWeather',
            runtime: 'go120',
            source: {
                storageSource: {
                    bucket: assetBucket.name,
                    object: assetObject.name,
                },
            },
        },
        name: 'weather-getter',
        serviceConfig: {
            environmentVariables: {
                'TRANSFORM_QUEUE': transformQueue.name,
            },
            minInstanceCount: 0,
            maxInstanceCount: 1,
            serviceAccountEmail: weatherGetterRunner.email,
        },
    });

    new google.cloudSchedulerJob.CloudSchedulerJob(this, 'scheduler', {
        name: 'scheduler',
        httpTarget: {
            uri: weatherGetter.serviceConfig.uri,
        },
    });

    const transformerRunner = new google.serviceAccount.ServiceAccount(this, 'transformRunner', {
        accountId: 'transform-runner',
    });

    new google.cloudfunctions2Function.Cloudfunctions2Function(this, 'transformer', {
        buildConfig: {
            entryPoint: 'Transform',
            runtime: 'go120',
            source: {
                storageSource: {
                    bucket: assetBucket.name,
                    object: assetObject.name,
                },
            },
        },
        name: 'transformer',
        serviceConfig: {
            minInstanceCount: 0,
            maxInstanceCount: 1,
            serviceAccountEmail: transformerRunner.email,
        },
    });

    new google.pubsubTopic.PubsubTopic(this, 'bigQueryQueue', {
        name: 'big-query-queue',
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
